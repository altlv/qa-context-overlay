import type { RoleFamily } from '../agents/roles.js';
import { PLAYWRIGHT_CLI, TSX_CLI } from '../tool-paths.js';
import type { Environment } from './exploration-policy.js';

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
  /** Arguments for `node`: a script path, then its arguments. */
  args: string[];
  /** Added to the environment the step runs in. */
  env: Record<string, string>;
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
}): GatePlan {
  const changed = input.changed.map(posix);
  const steps: GateStep[] = [];
  const problems: string[] = [];
  const notRun: string[] = [];
  const targetEnv: Record<string, string> =
    input.environment === null ? {} : { TEST_ENV: input.environment };

  if (input.family === 'coding' && input.role !== 'testability-reviewer') {
    const specs = changed.filter((path) => SPEC.test(path));
    if (specs.length === 0) {
      notRun.push('no spec file changed, so there was nothing for the coding gate to check');
    } else {
      steps.push({
        name: 'assert-quality',
        args: [TSX, 'src/cli/assert-quality.ts', ...specs],
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
          args: [TSX, 'src/cli/fault-check.ts', ...appSpecs],
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
        args: [TSX, 'src/cli/check-report.ts', design],
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
    args: [TSX, 'src/cli/check-report.ts', posix(input.report)],
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
