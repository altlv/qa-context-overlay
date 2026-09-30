import { join } from 'node:path';
import type { RoleFamily } from '../agents/roles.js';
import { PLAYWRIGHT_CLI, TSX_CLI } from '../tool-paths.js';
import type { Environment } from './exploration-policy.js';
import { subjectTests, type TestStack } from './test-stack.js';

/**
 * The checks the runner makes after an agent finishes, on what the run changed.
 *
 * Before this, `role.ts` returned whatever the agent said and suggested running
 * `check-report`. Every quality check a role was told to run was a promise the agent
 * made about itself. The agent's report that its checks passed is claimed evidence;
 * these are direct. See `docs/agent-workflows.md`.
 *
 * A failed gate is not overridden and not retried. It is a finding, handed to
 * `failure-investigator` with its evidence, which must prove the cause — decided on
 * 2026-09-14.
 */

export interface GateStep {
  name: string;
  /**
   * What to run. Absent means this process's own `node`, which is what every
   * harness-side step wants: `args` then names a script path and its arguments.
   *
   * Present only when a subject declares a runner of its own. `TestStack` collects
   * `runner`, `runAll` and `runOne` precisely so a subject's runner is never assumed,
   * and this field is what lets the gate honour that — before it, the subject step was
   * built as `['--test', file]` and executed as `node --test <file>` whatever the stack
   * said. Harmless while the only declared stack was `node --test`, and silently wrong
   * for the first subject to declare vitest or jest: the step would either fail a run
   * that did nothing wrong, or pass without running a thing.
   */
  command?: string;
  /** Arguments for `command`, or for `node` when there is none. */
  args: string[];
  /** Added to the environment the step runs in. */
  env: Record<string, string>;
}

/**
 * A subject's `runOne` as an argv, with the file appended.
 *
 * Declared as a command line because that is how a person writes it in a config and how
 * the coder role's prompt shows it — `node --test `, `npx vitest run `. Splitting on
 * whitespace is enough for that, and a runner needing a quoted argument should be given
 * a wrapper script rather than a quoting dialect parsed here.
 */
function runOneArgv(
  runOne: string,
  ...files: string[]
): { command: string; args: string[]; all: string[] } {
  const parts = runOne
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '');
  const command = parts[0] ?? process.execPath;
  const args = [...parts.slice(1), ...files];
  // `all` is the same thing as one command line, for a flag that takes a command rather
  // than running one — `mutation-compare --suite node --test <file>`.
  //
  // Variadic on purpose, and it was not. Callers used to map this over each changed file
  // and flatten, which repeats the whole runner once per file: five changed tests became
  // `npx vitest run a npx vitest run b npx vitest run c …`, and the step refused it as a
  // suite that fails before any fault. It worked for two live runs because each changed
  // exactly one test file — the arity was the bug, and one file hid it.
  return { command, args, all: [command, ...args] };
}

export interface GatePlan {
  steps: GateStep[];
  /** Failures decided without running anything. */
  problems: string[];
  /** Checks that apply and were not run, said out loud. */
  notRun: string[];
}

// Resolved paths, not paths relative to the working directory: the gate runs inside a
// run worktree, which has no node_modules of its own.
const TSX = TSX_CLI;
const PLAYWRIGHT = PLAYWRIGHT_CLI;

const SPEC = /\.(?:spec|test)\.ts$/;
const APP_SPEC = /^apps\/[^/]+\/tests\/.+\.spec\.ts$/;
const DESIGN = /^apps\/[^/]+\/designs\/.+\.md$/;

const posix = (path: string): string => path.replace(/\\/g, '/');

export function planGate(input: {
  role: string;
  family: RoleFamily;
  changed: string[];
  report: string;
  /** The run's environment. Every spec the gate runs, runs there. */
  environment: Environment | null;
  /** This run's own folder, so the gate never writes over another run's results. */
  runDir: string;
  /**
   * The subject's own test stack, when the run's work landed in a subject. Absent means this
   * repository's Playwright, which is what the spec-shaped steps below assume.
   */
  testStack?: TestStack;
  /**
   * The checkout holding this harness's own `src/cli` scripts, when the run's worktree is a
   * worktree of a subject.
   *
   * Every script-shaped step below names a path relative to this repository, and a subject
   * run's worktree does not contain it. The step then died at `ERR_MODULE_NOT_FOUND` before
   * the agent's work was looked at, so the run was failed by the harness's own path rather
   * than by anything a role did — reproduced from the subject worktree at
   * `mcpa-training-bot-runs/c8d7549` on 2026-09-24.
   *
   * Absent means the worktree *is* this repository, where the worktree's own copy is the one
   * that must run: a run may have changed the checker it is judged by.
   */
  harnessRoot?: string;
  /**
   * The subject's mutation set and the suite new work is held against, when it declares
   * one. Absent means the gate can say a test passes and asserts, and nothing about
   * whether it would notice a fault.
   */
  mutations?: { set: string; baseline: string };
  /**
   * The process the subject's tests spawn, when it declares one. Without it the gate
   * cannot ask whether a green suite would survive the application not starting.
   */
  entryPoint?: string;
}): GatePlan {
  const changed = input.changed.map(posix);
  const script = (path: string): string =>
    input.harnessRoot === undefined ? path : posix(join(input.harnessRoot, path));
  const steps: GateStep[] = [];
  const problems: string[] = [];
  const notRun: string[] = [];
  const targetEnv: Record<string, string> =
    input.environment === null ? {} : { TEST_ENV: input.environment };

  if (input.family === 'coding' && input.role !== 'testability-reviewer') {
    const specs = changed.filter((path) => SPEC.test(path));

    // A subject's tests are not specs. The run's worktree *is* a worktree of the subject, so
    // the changed paths are relative to it and the subject's own runner applies. Before this,
    // the gate reported nothing to check for every subject that does not use Playwright —
    // which is every subject we do not own.
    const subjectFiles =
      input.testStack === undefined ? [] : subjectTests(input.testStack, changed);
    for (const file of subjectFiles) {
      // The stack's own runner, not this process's node. See GateStep.command.
      const run = runOneArgv(input.testStack?.runOne ?? '', file);
      steps.push({
        name: `changed test passes: ${file}`,
        command: run.command,
        args: run.args,
        env: {},
      });
    }

    if (subjectFiles.length > 0 && input.testStack !== undefined) {
      // The runner proves the tests pass; this proves they assert something. `assert-quality`
      // reads Playwright specs, so before it, a `node:test` file could wrap every assertion in
      // a conditional — or assert nothing — and clear the gate on both halves. The stack's own
      // import line is passed rather than assumed, so a subject that asserts through another
      // name is still read.
      steps.push({
        name: 'assertion floor',
        args: [
          TSX,
          script('src/cli/assertion-floor.ts'),
          '--assertions',
          input.testStack.assertions,
          ...subjectFiles,
        ],
        env: {},
      });

      // Would it notice a fault? Nothing above answers that. The runner proves the tests
      // pass and the floor proves they assert, and a suite asserting on values it computed
      // for itself clears both — the floor says so about itself in as many words.
      //
      // Held against the subject's own suite for that seam rather than a threshold, so the
      // bar is what already exists. Measured on mcpa: the hand-written suite kills 4 of 14
      // and the agent's file kills 8, while surviving one mutation the hand-written suite
      // catches. Twice as strong and weaker in one place — a regression no other step here
      // can see.
      // Would the suite notice there being no application at all? The mutation set asks
      // whether a rule being wrong is caught; this asks the cruder question underneath
      // it, and a suite that fails the crude one was never testing the wiring.
      if (input.entryPoint !== undefined) {
        steps.push({
          name: 'tests notice the process failing',
          args: [
            TSX,
            script('src/cli/subject-fault-check.ts'),
            '--entry',
            input.entryPoint,
            '--repo',
            '.',
            '--suite',
            ...runOneArgv(input.testStack.runOne, ...subjectFiles).all,
          ],
          env: {},
        });
      }

      if (input.mutations !== undefined) {
        steps.push({
          name: `mutation strength against ${input.mutations.baseline}`,
          args: [
            TSX,
            script('src/cli/mutation-compare.ts'),
            '--mutations',
            script(input.mutations.set),
            '--repo',
            '.',
            '--suite',
            ...runOneArgv(input.testStack.runOne, input.mutations.baseline).all,
            '--against',
            ...runOneArgv(input.testStack.runOne, ...subjectFiles).all,
          ],
          env: {},
        });
      }
    }

    if (specs.length === 0 && subjectFiles.length === 0) {
      notRun.push(
        input.testStack === undefined
          ? 'no spec file changed, so there was nothing for the coding gate to check'
          : `no test file changed, so there was nothing for the coding gate to check — this subject's tests match ${input.testStack.testFilePattern}`,
      );
    } else if (specs.length > 0) {
      steps.push({
        name: 'assert-quality',
        args: [TSX, script('src/cli/assert-quality.ts'), ...specs],
        env: {},
      });
      steps.push({
        name: 'changed specs pass',
        args: [PLAYWRIGHT, 'test', ...specs, '--output', `${input.runDir}/test-results`],
        env: {
          ...targetEnv,
          HARNESS_RESULTS_FILE: `${input.runDir}/results.json`,
          PLAYWRIGHT_HTML_OUTPUT_DIR: `${input.runDir}/report`,
        },
      });
      const appSpecs = specs.filter((path) => APP_SPEC.test(path));
      if (appSpecs.length > 0) {
        steps.push({
          name: 'fault check',
          args: [TSX, script('src/cli/fault-check.ts'), ...appSpecs],
          env: targetEnv,
        });
      } else {
        notRun.push('fault check: no app spec changed — it applies to specs under apps/*/tests');
      }
    }
  }

  if (input.role === 'test-planner') {
    const designs = changed.filter((path) => DESIGN.test(path));
    if (designs.length === 0) {
      problems.push('test-planner wrote no design file under apps/<app>/designs/');
    }
    for (const design of designs) {
      steps.push({
        name: `design ${design}`,
        args: [TSX, script('src/cli/check-report.ts'), design],
        env: {},
      });
    }
  }

  // A session's notes used to be listed here as not enforced. They are now checked by
  // the same `check-report` step every role runs, because the session rules live in
  // `auditReport` and fire on `report: exploratory-session` — a charter, an oracle
  // named for every defect claim, observations and questions kept apart from both. No
  // extra gate step: one command, one place the rules live.

  steps.push({
    name: 'report',
    args: [TSX, script('src/cli/check-report.ts'), posix(input.report)],
    env: {},
  });
  return { steps, problems, notRun };
}

/** What a gate did, written beside the run's report so an investigation can start from it. */
export interface GateRecord {
  role: string;
  app: string | null;
  environment: Environment | null;
  report: string;
  /** Every file the run was counted as changing, including any a person edited meanwhile. */
  changed: string[];
  steps: { name: string; passed: boolean; output: string[] }[];
  problems: string[];
  notRun: string[];
  /** Where the proof lives: results, traces, captures. */
  evidence: string[];
}

export function gatePassed(record: GateRecord): boolean {
  return record.problems.length === 0 && record.steps.every((step) => step.passed);
}

/**
 * The next command after a failed gate, or null when it passed.
 *
 * A failure is not overridden and not retried; it is a finding. The investigator is
 * asked to prove the cause, because "flaky" asserted without a measured rate is a
 * claim — and a claim is how a test-design mistake or a product defect gets waved on.
 */
export function investigationCommand(
  record: GateRecord,
  recordPath: string,
  worktree?: string,
): string | null {
  if (gatePassed(record)) return null;
  const target =
    record.app !== null && record.environment !== null
      ? ` --app ${record.app} --env ${record.environment}`
      : '';
  // The failing specs and their evidence exist only in the failed run's worktree.
  const place = worktree === undefined ? '' : ` --worktree "${posix(worktree)}"`;
  return (
    `npm run role -- failure-investigator "Localise the post-run gate failure recorded in ${posix(recordPath)}. ` +
    'Prove the cause with evidence: a test-design error, app behaviour with the oracle named, or flake with a measured rate."' +
    target +
    place
  );
}

/** Paths from `git status --porcelain -uall`, renames resolved to their new name. */
export function dirtyPaths(porcelain: string): string[] {
  return porcelain
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const path = line.slice(3);
      const renamed = path.split(' -> ').at(-1) ?? path;
      return posix(renamed.replace(/^"|"$/g, ''));
    });
}
