import '../env.js';
import { chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { apps } from '../../apps/registry.js';
import { targetFor } from '../../apps/targets.js';
import { AgentAuthError, runAgent } from '../agents/client.js';
import type { AgentRunOptions } from '../agents/client.js';
import { Budget, DEFAULT_LIMITS } from '../agents/budget.js';
import { composeRoles, composeSystemPrompt } from '../agents/compose.js';
import { budgetForTier, resolveModel } from '../agents/models.js';
import { describeBudget, describeSpend } from '../agents/budget-line.js';
import { levelOfRole } from '../agents/subject-prompt.js';
import { BROWSER_ACCESS, WALL_CLOCK_SECONDS, families, roles } from '../agents/roles.js';
import { BROWSER_MCP_SERVER, browserMcpConfig, browserToolsFor } from '../qe/browser-tools.js';
import type { SnapshotMode } from '../qe/browser-tools.js';
import { launchChromium } from '../qe/browser-launch.js';
import { parseConsoleLog, reportConsole, summariseConsole } from '../qe/console-log.js';
import { browserGuard, movesThePage } from '../qe/browser-guard.js';
import type { BrowserGuard, GuardDecision } from '../qe/browser-guard.js';
import { activePage, describeTransition, pageObserver } from '../qe/observer.js';
import type { Observer } from '../qe/observer.js';
import { sessionBriefing } from '../qe/session-briefing.js';
import { describePatience, runWithPatience } from '../qe/patience.js';
import { briefCoverage, coverageGap, parseSurvivors } from '../qe/coverage-briefing.js';
import { readMutations } from '../qe/mutation-compare.js';
import { pathToFileURL } from 'node:url';
import { TSX_CLI } from '../tool-paths.js';
import { formatActionPlan, planActions } from '../qe/driver.js';
import { ideasFor } from '../qe/test-ideas.js';
import { ENVIRONMENTS, policyFor } from '../qe/exploration-policy.js';
import { fileToolGuard } from '../qe/file-guard.js';
import { readinessProblems, stalenessWarning } from '../qe/readiness.js';
import { parseReport } from '../qe/report.js';
import { gatePassed, investigationCommand, planGate, type GateRecord } from '../qe/run-gate.js';
import { acquireLock, lockPathFor, releaseLock } from '../qe/run-lock.js';
import { findReport } from '../qe/run-report.js';
import { resolveRunTarget } from '../qe/run-target.js';
import { harvestSession, indexLine, noteInIndex } from '../qe/session-store.js';
import { ToolLedger } from '../qe/tool-ledger.js';
import {
  committedAt,
  createRunWorktree,
  freePort,
  headCommit,
  isRunWorktree,
  lockfileProblem,
  worktreeChanges,
} from '../qe/run-worktree.js';
import { shellGuard } from '../qe/shell-guard.js';
import { needsShell } from '../qe/subject-runner.js';
import { guardHook, observerHook } from '../qe/tool-hook.js';
import { reportSkillUse, searchable, skillUse } from '../qe/skill-use.js';
import { skillFile } from '../agents/compose.js';
import { clockHook } from '../qe/session-clock.js';
import { NetworkRecorder } from '../capture/network.js';
import { formatProbe, probePage } from '../tools/probe.js';

/**
 * Runs one named role against a task, as `docs/agent-workflows.md` specifies.
 *
 * The run works in its own git worktree at a named base commit: refused if it is not
 * ready, one run per target at a time, every tool call guarded and confined to the
 * worktree, a post-run gate on the worktree's diff, and a failure handed to a person to
 * investigate rather than overridden or retried. The work comes back uncommitted, in the
 * worktree, for a person to review and bring in.
 *
 * A command-line entry point, and like `src/cli/targets.ts` it reads the app registry.
 * The decisions it makes live in `src/qe/`, which does not.
 */

const exec = promisify(execFile);
const repoRoot = process.cwd();
const [, , name, ...rest] = process.argv;

function flag(named: string): string | undefined {
  const at = rest.indexOf(named);
  return at === -1 ? undefined : rest[at + 1];
}

function refuse(reason: string, detail: string[] = []): never {
  console.error(reason);
  for (const line of detail) console.error(`  ✗ ${line}`);
  process.exit(2);
}

// Set once a worktree exists and its evidence can be copied out. Read by the early
// SIGINT handler, which must not exit synchronously past an async harvest.
let harvestArmed = false;

const outPath = flag('--out');
const appArg = flag('--app');
const envArg = flag('--env');
const designPath = flag('--design');
const reusePath = flag('--worktree');
// Every tool response carries a full accessibility tree by default, which is the
// single largest cost in a browser session on a real page. `none` keeps the explicit
// browser_snapshot tool and stops paying for a tree nobody asked for.
const snapshots: SnapshotMode = flag('--snapshots') === 'none' ? 'none' : 'full';
// Hand the agent the map instead of making it buy one: the scanner produces graded
// selectors, ambiguity and unlabelled inputs for no tokens.
const prescan = rest.includes('--scan');
// Every check that can refuse a run, and nothing that costs anything: no worktree, no
// browser, no agent. Also what the refusal tests use, so a check that fails to refuse
// ends in exit 0 instead of a paid run.
const preflight = rest.includes('--preflight');

/** Everything before the first flag. */
const firstFlag = rest.findIndex((argument) => argument.startsWith('--'));
const task = (firstFlag === -1 ? rest : rest.slice(0, firstFlag)).join(' ').trim();

if (name === undefined || task === '') {
  console.error(
    'usage: npm run role -- <role> "<task>" [--app <app> --env <env>] [--design <path>] [--worktree <path>] [--out <path>] [--scan] [--preflight]',
  );
  console.error(`  roles: ${Object.keys(roles).join(', ')}`);
  console.error(`  apps:  ${apps.map((app) => app.name).join(', ')}`);
  console.error(`  --env  ${ENVIRONMENTS.join(' | ')} — there is no default`);
  process.exit(2);
}

// Narrowed once, because the closures below lose the guard's narrowing of argv.
const roleName: string = name;
const role = roles[roleName];
const family = families[name];
if (role === undefined || family === undefined) {
  refuse(`Unknown role "${name}". Available: ${Object.keys(roles).join(', ')}`);
}

// ── Ports for servers the harness starts, before any target resolves ─────────────
// The target's base URL follows the port, so the server, the browser and the specs all
// agree — and no run can meet a server another run left behind. A port already set in
// the environment is a deliberate choice and stands.
for (const app of apps) {
  for (const config of Object.values(app.environments)) {
    const portEnv = config?.webServer?.portEnv;
    if (portEnv !== undefined && process.env[portEnv] === undefined) {
      process.env[portEnv] = String(await freePort());
    }
  }
}

// ── Ready? ────────────────────────────────────────────────────────────────────────

// The `--worktree` reuse check moved below the subject resolution: a run's worktree belongs
// to the repository the run tests, so whether a path is one of ours cannot be answered
// before knowing which repository that is.
const workRoot = reusePath === undefined ? repoRoot : resolve(reusePath);

const resolved = resolveRunTarget(
  { app: appArg, env: envArg },
  {
    apps: apps.map((app) => app.name),
    lookup: (app, environment) => {
      const target = targetFor(app, environment);
      return target === undefined
        ? undefined
        : { baseURL: target.baseURL, extraHosts: target.app.extraHosts ?? [] };
    },
  },
);
const runTarget = resolved.target;

/**
 * The repository's main checkout — not whichever worktree this process happens to run in.
 *
 * A subject recorded as a sibling path is a sibling of the *repository*, so resolving it
 * against a worktree one level deeper finds nothing and readiness then refuses a task that
 * named its target exactly. `--git-common-dir` answers with the main checkout's `.git` from
 * any worktree, and with this checkout's own from the repository itself, so one call covers
 * both. Falling back to `repoRoot` keeps a non-git checkout usable.
 */
async function mainCheckout(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await exec('git', ['-C', repoRoot, 'rev-parse', '--git-common-dir']);
    return dirname(resolve(repoRoot, stdout.trim()));
  } catch {
    return repoRoot;
  }
}

// The subject's own checkout, when this run tests code the harness does not contain.
// A named path is written the way the *subject* names it — `src/services/x.js`, relative to
// its repository root — so it resolves there. Resolving against `sourceRoot` instead
// produced `src/src/services/x.js`, and the path was reported as missing while the task
// named it exactly.
const subjectConfig =
  runTarget === null ? undefined : apps.find((app) => app.name === runTarget.app);
const subjectRepo =
  subjectConfig?.sourceRepo !== undefined
    ? resolve(await mainCheckout(repoRoot), subjectConfig.sourceRepo)
    : null;

// Which repository the run's worktree comes from. A subject is a repository of its own, so
// branching the harness would confine the agent to a worktree that does not contain the code
// it was asked to test, and the file guard would refuse every write that mattered.
const runRepo = subjectRepo ?? repoRoot;

// The stack facts a subject run composes its prompt from, when the app declares them. Absent
// for a run in this repository, which keeps its own conventions and level table. The level comes
// from the role's name: the same subject stack means a different job to a unit coder and to an
// integration coder, and the composed level block has to say which one this run is.
const subjectRun =
  subjectConfig?.testStack !== undefined && subjectRepo !== null
    ? {
        app: subjectConfig.name,
        repo: subjectRepo,
        stack: subjectConfig.testStack,
        level: levelOfRole(name),
      }
    : undefined;

if (reusePath !== undefined) {
  if (family !== 'testing') {
    refuse(
      `Only a testing role may run in another run's worktree — "${name}" can edit, and would change the evidence.`,
    );
  }
  if (!(await isRunWorktree(runRepo, reusePath))) {
    refuse(`--worktree ${reusePath} is not one of ${runRepo}'s run worktrees.`);
  }
}

// A dirty subject makes the exercise meaningless: the work comes back as a diff against the
// subject's HEAD, and uncommitted work there would be credited to the run.
if (runRepo !== repoRoot) {
  const dirty = await worktreeChanges(runRepo);
  if (dirty.length > 0) {
    refuse(
      'the subject checkout has uncommitted work, so the run diff would not be its own:',
      dirty.slice(0, 10),
    );
  }
}

const notReady = [
  ...resolved.problems,
  ...readinessProblems(
    { role: name, task, app: appArg, environment: envArg, design: designPath },
    {
      exists: (path) => existsSync(resolve(workRoot, path)),
      existsInSubject: (path) => subjectRepo !== null && existsSync(resolve(subjectRepo, path)),
      // The subject already says where its source lives; the readiness rule used to
      // accept only this repository's roots and so could never be satisfied by a subject
      // keeping its code anywhere but `src`.
      ...(subjectConfig?.sourceRoot === undefined
        ? {}
        : { subjectSourceRoot: subjectConfig.sourceRoot }),
      readDesign: (path) => {
        const parsed = parseReport(readFileSync(resolve(workRoot, path), 'utf8'));
        return parsed.ok
          ? { kind: parsed.report.report, cases: parsed.report.cases.length }
          : { problems: parsed.problems.map((problem) => problem.message) };
      },
    },
  ),
];

// `base` is the commit the run's worktree is checked out at, in the repository the run works
// in — the subject's own HEAD when the work lands there.
const base = reusePath === undefined ? await headCommit(runRepo) : await headCommit(workRoot);
if (reusePath === undefined) {
  // A design lives in this repository even when the work happens in a subject's worktree, so
  // whether it is committed is a question about this repository, not about the subject.
  const designBase = await headCommit(repoRoot);
  if (designPath !== undefined && !(await committedAt(repoRoot, designBase, designPath))) {
    notReady.push(
      `design ${designPath} is not committed — a run works from committed code, and an uncommitted file never reaches the worktree`,
    );
  }
  // The linked modules belong to the run repository, so the lockfile to compare is its own.
  const lockfile = await lockfileProblem(runRepo, base);
  if (lockfile !== null) notReady.push(lockfile);
}
if (notReady.length > 0) refuse(`"${name}" is not ready to start — missing upstream:`, notReady);

// A design can outlive the code it describes. Warned, not refused.
if (designPath !== undefined && runTarget !== null && existsSync(resolve(workRoot, designPath))) {
  const parsed = parseReport(readFileSync(resolve(workRoot, designPath), 'utf8'));
  const commit = parsed.ok ? parsed.report.commit : undefined;
  let changedSince: string[] | null = null;
  if (commit !== undefined) {
    try {
      const { stdout } = await exec(
        'git',
        ['-C', repoRoot, 'diff', '--name-only', commit, base, '--', `apps/${runTarget.app}`],
        { windowsHide: true },
      );
      changedSince = stdout.split(/\r?\n/).filter((line) => line.trim() !== '');
    } catch {
      changedSince = null;
    }
  }
  const warning = stalenessWarning(designPath, commit, changedSince);
  if (warning !== null) console.error(`WARNING: ${warning}`);
}

// ── One run per target ────────────────────────────────────────────────────────────

if (runTarget !== null) {
  const lockPath = join(repoRoot, lockPathFor(runTarget.app, runTarget.environment));
  const lock = acquireLock(
    { pid: process.pid, role: name, startedAt: new Date().toISOString() },
    lockPath,
  );
  if (!lock.take) {
    refuse(
      `${runTarget.app}/${runTarget.environment} is in use by ${lock.heldBy.role} (pid ${lock.heldBy.pid}, since ${lock.heldBy.startedAt}). ` +
        'Two runs writing to one deployment meet each other’s data. Wait, or point at another target.',
    );
  }
  if (lock.replacedStale !== null) {
    console.error(
      `Replaced a lock left by a run that is no longer alive: ${lock.replacedStale.role} (pid ${lock.replacedStale.pid}).`,
    );
  }
  process.on('exit', () => releaseLock(process.pid, lockPath));
  // Stands aside once there is a worktree worth harvesting: a synchronous exit here
  // would beat the async copy that saves the session's notes. Until then there is
  // nothing to save and stopping immediately is right.
  process.on('SIGINT', () => {
    if (!harvestArmed) process.exit(130);
  });
}

if (preflight) {
  console.error(
    `Preflight: "${name}" is ready` +
      (runTarget === null ? '' : ` against ${runTarget.app}/${runTarget.environment}`) +
      ` at ${base.slice(0, 7)}. Stopped before the worktree and the agent.`,
  );
  process.exit(0);
}

// ── The worktree ──────────────────────────────────────────────────────────────────

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const worktree =
  reusePath === undefined
    ? await createRunWorktree(runRepo, `${name}-${stamp}`, base)
    : resolve(reusePath);
console.error(
  `${reusePath === undefined ? 'Created' : 'Reusing'} worktree ${worktree} at ${base.slice(0, 7)}`,
);

// ── Keep the evidence, whatever happens to the run ────────────────────────────────
//
// Harvesting only at the end of the happy path keeps nothing from the runs that most
// need keeping. Every loss so far came from a run that was killed mid-session or that
// threw before it finished: the notes were being appended live inside the worktree,
// the worktree was later removed, and the session was gone. A crash is exactly when a
// person wants the log.
//
// So this is armed as soon as there is a worktree, runs on the way out however the run
// ends, and is safe to call more than once — the later call simply copies more.
const runDirForHarvest =
  reusePath === undefined ? 'artifacts/run' : `artifacts/investigation-${stamp}`;
let keptAlready = false;
async function keepEvidence(why: string): Promise<void> {
  try {
    const kept = await harvestSession({
      repoRoot,
      worktree,
      runDir: runDirForHarvest,
      app: runTarget?.app ?? null,
      role: roleName,
      stamp,
    });
    if (!keptAlready) {
      console.error(`\nSession kept in ${kept.home} (${why}) — ${kept.copied.length} item(s).`);
      keptAlready = true;
    }
  } catch {
    // Never let saving the evidence be the thing that fails the run.
  }
}

// Signals first: this is the path a person takes when they stop a run by hand, and the
// one that lost the most. The handler is async, so it must not call process.exit()
// before the copy finishes.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void keepEvidence(`stopped by ${signal}`).then(() => process.exit(130));
  });
}
harvestArmed = true;
process.on('uncaughtException', (error) => {
  console.error(`\nUncaught: ${error instanceof Error ? error.message : String(error)}`);
  void keepEvidence('the run threw').then(() => process.exit(1));
});

// ── Preparing the worktree, when the subject says it needs it ─────────────────────
//
// A worktree holds what git tracks and nothing else. `mcpa`'s protocol labs are
// TypeScript projects whose `build/` is gitignored, so its own `test/labs-routes.test.js`
// passes 11 of 11 in the prepared checkout and is red in a bare worktree.
//
// Red is the dangerous state, not merely the inconvenient one: **a red suite reports
// every mutation as caught.** A run judged in an unprepared worktree does not fail
// honestly — it scores perfectly and means nothing. So a failing step ends the run here,
// before an agent spends anything, rather than being noted and passed over.
const prepareSteps = subjectConfig?.prepare ?? [];
if (prepareSteps.length > 0 && reusePath === undefined) {
  console.error(`Preparing the worktree — ${prepareSteps.length} step(s) the subject declares:`);
  for (const step of prepareSteps) {
    const at = resolve(worktree, step.in);
    if (!existsSync(at)) {
      refuse(`prepare step names ${step.in}, which does not exist in the worktree`);
    }
    try {
      await exec(step.run, [], { cwd: at, shell: true, windowsHide: true, maxBuffer: 1 << 26 });
      console.error(`  ✓ ${step.in}: ${step.run}`);
    } catch (error) {
      const out = error as { stdout?: string; stderr?: string };
      for (const line of `${out.stdout ?? ''}${out.stderr ?? ''}`.trim().split('\n').slice(-12)) {
        console.error(`      ${line}`);
      }
      refuse(
        `prepare step failed in ${step.in}: ${step.run}\n` +
          "  The subject's own suite would be red, and a red suite reports every mutation as caught.",
      );
    }
  }
}

// ── A report to edit, rather than one to invent ───────────────────────────────────
//
// `integration-coder` filed prose twice running and failed the gate both times, against
// an OUTPUT block that says "Its very first characters must be `---` on its own line,
// opening the YAML frontmatter. No preamble, no greeting, no summary before it." It could
// not be more explicit, so a third sentence was never the fix: prose in a role prompt is a
// suggestion, and this repository has said as much since the preflight block.
//
// Filling a template is a different task from producing one from a specification, and the
// second is where a good summary keeps arriving in the wrong shape.
//
// **The skeleton must fail until it is filled**, which is the whole design constraint. A
// template that parsed would turn a loud gate failure into a silent pass, and that is
// worse than the problem — so every required value is left empty, and `check-report`
// refuses it exactly as it refuses prose. Untouched, the run fails as it does today; the
// only thing changed is how much work it takes to get it right.
const reportSkeleton = join(worktree, 'artifacts', 'run', 'report.md');
if (families[name] === 'coding' && !existsSync(reportSkeleton)) {
  await mkdir(dirname(reportSkeleton), { recursive: true });
  await writeFile(
    reportSkeleton,
    [
      '---',
      'report: # one of: test-design | bug | testability | flake | gate | triage',
      'target: # what you tested — a module path, a seam, a URL',
      `date: ${new Date().toISOString().slice(0, 10)}`,
      `author: ${name}`,
      'confidence: # high | medium | low',
      'evidence:',
      '  direct: 0 # observed: a test result, a captured response, a file:line',
      '  inferred: 0',
      '  claimed: 0',
      'findings: []',
      'not_covered: [] # required, and an empty list claims complete coverage',
      '---',
      '',
      '<!-- The gate reads this file, not your reply. Replace every empty value above:',
      '     it is deliberately invalid until you do, so an untouched skeleton fails. -->',
      '',
    ].join('\n'),
    'utf8',
  );
  console.error(
    `Report skeleton at ${runDirForHarvest}/report.md — fill it; it is invalid as it stands.`,
  );
}

// ── The browser, when the role looks at running software and has somewhere to look ─

let browser: {
  mcpServers: NonNullable<AgentRunOptions['mcpServers']>;
  tools: string[];
  briefing: string;
  guard: BrowserGuard;
  observer: Observer;
} | null = null;

const access = BROWSER_ACCESS[name];
if (access !== undefined && runTarget !== null) {
  const policy = policyFor(runTarget.environment);

  let map = '';
  let actions = '';
  if (prescan) {
    process.stderr.write(`Scanning ${runTarget.baseURL} before the session… `);
    const scanBrowser = await launchChromium();
    const chrome = scanBrowser.browser;
    if (scanBrowser.note !== null) console.error(`  WARNING: ${scanBrowser.note}`);
    const page = await chrome.newPage();
    const network = NetworkRecorder.attach(page, { captureBodies: policy.captureBodies });
    try {
      await page.goto(runTarget.baseURL, { waitUntil: 'domcontentloaded' });
      const probe = await probePage(page, network, {});
      map = formatProbe(probe);
      // The same scan, read a second way. A session was previously handed the map and
      // left to work out what to try from it, every time, at model prices — while the
      // generators that answer exactly that ran only in a separate CLI nothing in a run
      // called. Costs one more pass over an object already in memory.
      const plan = planActions({
        ideas: ideasFor({ scan: probe.scan, dictionary: probe.dictionary }),
        scan: probe.scan,
        policy,
      });
      actions = formatActionPlan(plan, runTarget.environment);
      process.stderr.write(
        `${map.split('\n').length} lines, ${plan.candidates.length} candidate action(s), ` +
          `${plan.skipped.length} refused by policy, 0 tokens spent\n`,
      );
    } finally {
      await chrome.close();
    }
  }

  // One browser, two clients. This run launches Chromium with a debugging port and
  // hands the endpoint to MCP, so the agent drives it and the harness reads it — which
  // is the only arrangement in which `maxStates` can be enforced on what actually
  // happened rather than on what the model said happened. A role that only observes
  // gets no state model because it cannot change state; its ceiling is its tool list.
  const cdpPort = await freePort();
  const cdpEndpoint = `http://127.0.0.1:${cdpPort}`;
  const launched = await launchChromium({ args: [`--remote-debugging-port=${cdpPort}`] });
  const driven = launched.browser;
  if (launched.note !== null) console.error(`  WARNING: ${launched.note}`);
  const eyes = await chromium.connectOverCDP(cdpEndpoint);
  const observer = pageObserver(() => activePage(eyes));
  // Closing in this order matters: the observer connection first, so tearing it down
  // cannot race MCP's own shutdown against a browser that is already gone.
  process.on('exit', () => {
    void eyes.close().then(() => driven.close());
  });

  browser = {
    mcpServers: {
      [BROWSER_MCP_SERVER]: browserMcpConfig(
        policy,
        runTarget.origins,
        join(worktree, 'artifacts', 'browser'),
        snapshots,
        cdpEndpoint,
      ),
    },
    tools: browserToolsFor(policy, access),
    briefing: sessionBriefing({ target: runTarget.baseURL, policy, access, map, actions }),
    guard: browserGuard(policy, observer),
    observer,
  };
  console.error(
    `Browser: ${runTarget.app}/${runTarget.environment} at ${runTarget.baseURL} — ${browser.tools.length} of the ` +
      `MCP server’s tools granted (role ceiling: ${access}, snapshots: ${snapshots})` +
      (policy.allowWrites && access === 'full' ? '' : ', read-only'),
  );
  console.error(
    `  shared browser on ${cdpEndpoint} — enforcing ${browser.guard.enforcing().join(' · ')}`,
  );
} else if (access !== undefined) {
  console.error(`No --app/--env given, so ${name} runs without a browser.`);
}

// A role declares how many turns and how much wall clock its work takes, written for
// sonnet; the tier scales turns and spend. An operator setting AGENT_MAX_TURNS,
// AGENT_MAX_USD or AGENT_TIMEOUT_MS is asking deliberately and still wins.
const chosen = resolveModel();
if (chosen.warning !== null) console.error(`WARNING: ${chosen.warning}`);

const declaredTurns = role.maxTurns ?? DEFAULT_LIMITS.maxTurns;
const scaled = budgetForTier(
  chosen.tier,
  declaredTurns,
  DEFAULT_LIMITS.maxUsd,
  WALL_CLOCK_SECONDS[name] ?? DEFAULT_LIMITS.timeoutMs / 1000,
);
const override = (variable: string): boolean => (process.env[variable]?.trim() ?? '') !== '';
const budget = Budget.fromEnv({
  ...(override('AGENT_MAX_TURNS') ? {} : { maxTurns: scaled.maxTurns }),
  ...(override('AGENT_MAX_USD') ? {} : { maxUsd: scaled.maxUsd }),
  ...(override('AGENT_TIMEOUT_MS') ? {} : { timeoutMs: scaled.timeoutMs }),
});
// The line is built by `describeBudget`, which is pure and tested: printed inline it needed a paid
// run to observe, and a real defect lived in that blind spot — an operator's AGENT_TIMEOUT_MS
// replaced this role's declared wall clock while the text still read as the role's own budget.
console.error(
  describeBudget({
    role: name,
    modelId: chosen.id,
    tier: chosen.tier,
    declaredTurns,
    declaredSeconds: WALL_CLOCK_SECONDS[name] ?? DEFAULT_LIMITS.timeoutMs / 1000,
    maxTurns: budget.limits.maxTurns,
    maxUsd: budget.limits.maxUsd,
    timeoutSeconds: budget.limits.timeoutMs / 1000,
    measuringSpendOnly: budget.measuringSpendOnly(),
    overrodeTurns: override('AGENT_MAX_TURNS'),
    overrodeUsd: override('AGENT_MAX_USD'),
    overrodeTimeout: override('AGENT_TIMEOUT_MS'),
  }),
);

// ── The guarded agent loop, inside the worktree ───────────────────────────────────

const targetLine =
  runTarget === null
    ? ''
    : `# Where this run points\n\n${runTarget.app} in ${runTarget.environment}, at ${runTarget.baseURL}. Run specs with TEST_ENV=${runTarget.environment}.\n\n`;
const design =
  designPath === undefined
    ? ''
    : `# Design for this run\n\n_From ${designPath}. Implement its cases by id and cite the ids in your report._\n\n${readFileSync(resolve(workRoot, designPath), 'utf8')}\n\n`;
/**
 * What the existing suite for this seam does not catch, measured before the role writes.
 *
 * The gate scores a coder's file against the same set afterwards, which makes that number
 * a verdict. Taken first it is direction, and the difference was measured: choosing its
 * own targets the role killed 8 of 14, and handed the survivors as sentences it killed 11
 * of 14 with 23 tests instead of 34.
 *
 * It costs a full pass of the baseline suite — fourteen runs of it for `mcpa` — before the
 * agent starts, and that is the honest price of the role not beginning blind. Any failure
 * here leaves the briefing empty rather than stopping the run: a missing paragraph costs
 * some of the role's aim, while a refusal costs the whole session.
 */
let coverage = '';
if (subjectConfig?.mutations !== undefined && families[name] === 'coding') {
  const { set, baseline } = subjectConfig.mutations;
  console.error(
    `Measuring what ${baseline} already catches, to say where a test is worth writing…`,
  );
  try {
    const scored = await exec(
      process.execPath,
      [
        TSX_CLI,
        resolve(repoRoot, 'src/cli/mutation-compare.ts'),
        '--mutations',
        resolve(repoRoot, set),
        '--repo',
        '.',
        '--suite',
        ...subjectConfig.testStack!.runOne.trim().split(/\s+/).filter(Boolean),
        baseline,
      ],
      { cwd: worktree, windowsHide: true, maxBuffer: 1 << 26 },
    ).catch((error: { stdout?: string; stderr?: string }) => error);
    // The module exports its list under a name; a namespace object is not an array, and
    // passing one read as an empty set, dropped every survivor as stale, and reported a
    // suite leaving ten of fourteen alive as defending everything.
    const loaded = (await import(pathToFileURL(resolve(repoRoot, set)).href)) as {
      MUTATIONS?: unknown;
      default?: unknown;
    };
    const { mutations } = readMutations(loaded.MUTATIONS ?? loaded.default);
    const survivors = parseSurvivors(`${scored.stdout ?? ''}${scored.stderr ?? ''}`);
    const gap = coverageGap(baseline, mutations, survivors);
    coverage = briefCoverage(gap);
    console.error(
      gap === null
        ? `  could not read ${set} — no briefing, and no claim that there is nothing to say.`
        : gap.undefended.length === 0
          ? `  ${baseline} defends all ${gap.total} rules the set knows — no gap to point at.`
          : `  ${gap.undefended.length} of ${gap.total} rule(s) undefended; the role is told which.`,
    );
  } catch (error) {
    console.error(`  could not measure it (${(error as Error).message}) — briefing without it.`);
  }
}

const prompt = `${browser === null ? '' : `${browser.briefing}\n\n`}# Where you work\n\nYour working directory is a git worktree of this repository at ${base.slice(0, 7)}. Every file you read or write stays inside it.\n\n${targetLine}${design}${coverage}${task}`;

const shell = shellGuard({
  environment: runTarget?.environment ?? null,
  hosts: runTarget?.hosts ?? [],
});
const files = fileToolGuard(worktree);
const allow: GuardDecision = { allowed: true, reason: 'no guard applies' };
// Every tool call already passes through here on its way to being allowed or refused.
// Recording it costs nothing and replaces the only evidence we had about a session's
// method — the session's own prose about itself.
const ledger = new ToolLedger(role.skills ?? []);
const decide = (toolName: string, input: Record<string, unknown>): GuardDecision => {
  if (toolName === 'Bash') {
    return shell.check(typeof input.command === 'string' ? input.command : '');
  }
  const fileDecision = files.check(toolName, input);
  if (fileDecision !== null) return fileDecision;
  return browser === null ? allow : browser.guard.check(toolName, input);
};
const check = (toolName: string, input: Record<string, unknown>): GuardDecision => {
  const decision = decide(toolName, input);
  ledger.record(toolName, input, decision.allowed, decision.reason);
  return decision;
};

let result;
try {
  result = await runAgent({
    prompt,
    systemPrompt: composeSystemPrompt(role, undefined, subjectRun),
    allowedTools: [...(role.tools ?? []), ...(browser?.tools ?? [])],
    ...(browser === null ? {} : { mcpServers: browser.mcpServers }),
    // Every role, composed the same way, so a coder that finds a gap mid-run can call
    // test-planner and the planner arrives with its skills. Only roles holding the
    // `Agent` tool can reach these — enforced in tests/unit/roles.test.ts. A delegated
    // planner inherits the subject's stack too, or it would design in the wrong shape.
    agents: composeRoles(roles, undefined, subjectRun),
    hooks: {
      // Fires once per resolved batch, before the next model request. Two measured
      // sessions stopped at 13 minutes of 45 on timestamps they invented; this is the
      // only channel that can hand them a number they did not make up.
      PostToolBatch: [
        clockHook(() => {
          const spent = budget.spent();
          return {
            elapsedMs: spent.elapsedMs,
            timeboxMs: budget.limits.timeoutMs,
            turns: spent.turns,
            maxTurns: budget.limits.maxTurns,
            costUsd: spent.costUsd,
            ...(browser === null
              ? {}
              : {
                  actions: browser.guard.spent(),
                  maxActions: policyFor(runTarget!.environment).maxActions,
                }),
          };
        }),
      ],
      PreToolUse: [
        guardHook(check, (toolName, reason) => console.error(`  refused ${toolName}: ${reason}`)),
      ],
      // Only where a browser exists. Registering an observer with nothing to observe
      // would spend a hook on every tool call to reach a `null` page and count a miss,
      // which would then report the state count as a floor for a run that never had a
      // browser — a caveat that is not merely useless but actively misleading.
      ...(browser === null
        ? {}
        : {
            PostToolUse: [
              observerHook(async () => {
                const transition = await browser!.observer.observe();
                const moved = transition === null ? null : describeTransition(transition);
                if (moved !== null) console.error(`  page: ${moved}`);
              }, movesThePage),
            ],
          }),
    },
    model: chosen.id,
    budget,
    cwd: worktree,
  });
} catch (error) {
  if (error instanceof AgentAuthError) refuse(error.message);
  throw error;
}

// The console, with our own refusals taken out of it. Across four earlier runs the
// harness recorded 120 console errors of which 116 were its own origin guard, which is
// why no session ever found the channel worth watching.
if (browser !== null) {
  try {
    const shots = join(worktree, 'artifacts', 'browser');
    const logs = (await readdir(shots)).filter((file) => file.startsWith('console-'));
    const entries = (
      await Promise.all(logs.map((file) => readFile(join(shots, file), 'utf8')))
    ).flatMap((text) => parseConsoleLog(text));
    console.error('');
    for (const line of reportConsole(summariseConsole(entries))) console.error(line);
  } catch {
    // No console capture is not a failure. Saying nothing about it would be.
    console.error('\nConsole: not captured for this run.');
  }
}

// What it actually used, before anything else is said about what it did.
await mkdir(join(worktree, runDirForHarvest), { recursive: true });
await writeFile(join(worktree, runDirForHarvest, 'tool-use.jsonl'), ledger.asJsonl(), 'utf8');
console.error('');
for (const line of ledger.report()) console.error(line);

// And whether the skills it was handed changed anything. Delivery is guaranteed —
// the runner inlines them — so the only open question is use, and use leaves no tool
// call behind. What it leaves is the method a finding names.
try {
  const written = await findReport(worktree);
  if (written !== null) {
    const text = readFileSync(written.path, 'utf8');
    const parsed = parseReport(text);
    const prose = searchable(parsed.ok ? parsed.report : { findings: [] }, text);
    const uses = skillUse(role.skills ?? [], prose, (skill) =>
      readFileSync(join(repoRoot, skillFile(skill)), 'utf8'),
    );
    const lines = reportSkillUse(uses);
    if (lines.length > 0) {
      console.error('');
      for (const line of lines) console.error(line);
    }
  }
} catch {
  // A measurement of our own investment must never be what ends a run. The session's
  // work is already kept by this point and the gate has its report.
}

// The agent is done and its notes exist. Keep them now, before the gate runs — the
// gate spawns test commands that can hang or throw, and a session's log must not
// depend on what happens after the session.
await keepEvidence('the session finished');

const spent = budget.spent();
console.error(
  `\n${name}: ` +
    describeSpend({
      turns: spent.turns,
      costUsd: spent.costUsd,
      elapsedMs: spent.elapsedMs,
      stoppedBy: result.stoppedBy,
    }),
);
// The point of measuring rather than capping: a session that was cut off and one that
// found little look the same in a report. Said out loud so the number gets recorded
// against the session's quality rather than noticed later.
if (budget.measuringSpendOnly()) {
  const reference = budget.limits.maxUsd;
  const ratio = reference > 0 ? spent.costUsd / reference : 0;
  console.error(
    `  Spend was measured, not capped: $${spent.costUsd.toFixed(4)} ` +
      `(${ratio.toFixed(2)}× the $${reference.toFixed(2)} reference). ` +
      'Nothing stopped this run for cost — judge the session on its findings, then decide what it was worth.',
  );
}
if (result.stoppedBy !== null) {
  console.error('The run hit a budget limit. Its report is partial; the gate still runs.');
}
// Printed beside the turns and the dollars because it is the same kind of fact: what
// the session actually spent. A session that clicked forty times around one screen and
// one that crossed fifteen cost the same in tokens and are not the same session.
if (browser !== null) {
  for (const line of browser.observer.summary()) console.error(`  ${line}`);
  // Named for what it is. Navigation is deliberately not an action against `maxActions`
  // — a GET changes nothing on the server — but on a subject explored mainly through
  // URLs this number is a small fraction of what the session did, and a bare "actions
  // spent" reads as the whole of it. One session reported 62 steps of its own where
  // this counter stood at 9, and neither figure was wrong.
  console.error(
    `  State-changing actions: ${browser.guard.spent()} of ${policyFor(runTarget!.environment).maxActions}` +
      ' (clicks, typing, key presses and dialogs — navigation is not counted against the ceiling)',
  );
}

// ── Post-run gate on the worktree's diff ──────────────────────────────────────────

// The report is always written, so the gate has something to check and a person has
// something to read. An investigation in a reused worktree writes beside the run's own.
const runDir = reusePath === undefined ? 'artifacts/run' : `artifacts/investigation-${stamp}`;
await mkdir(join(worktree, runDir), { recursive: true });

// Find the report the run wrote before falling back to what it said. Writing the
// final chat message to `--out` and gating that made the verdict depend on where a
// role happened to put its prose — see src/qe/run-report.ts for the three live runs
// that failed a gate their real report passed cleanly.
const wrote = findReport(worktree);
const reportBody =
  wrote === null ? result.text : await readFile(wrote.path, 'utf8').catch(() => result.text);
if (wrote === null) {
  console.error(
    `No report file found under artifacts/run/ or reports/ — gating the final message instead. ` +
      `A role that writes its report to a file gets that file gated; this one did not.`,
  );
} else {
  console.error(
    `Report found at ${wrote.relative} (${wrote.because}) — gating that, not the reply.`,
  );
}

const reportPath =
  outPath === undefined ? join(worktree, runDir, 'report.md') : resolve(repoRoot, outPath);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, reportBody, 'utf8');
// The run's own transcript is kept beside it either way: when the report came from a
// file, the final message is the summary a person reads first, and losing it to make
// room for the report would throw away the part written for them.
if (wrote !== null && result.text.trim() !== '') {
  await writeFile(join(worktree, runDir, 'summary.md'), result.text, 'utf8');
}
console.error(`Report written to ${reportPath}`);

// The run's own scoreboard, printed where a person will actually see it. Reading the
// severity split, the evidence split and the cost together is what makes a session
// judgeable: findings alone say nothing about what they rest on, and cost alone says
// nothing about what it bought.
const parsedReport = parseReport(reportBody);
if (parsedReport.ok) {
  const findings = parsedReport.report.findings;
  const count = (severity: string): number =>
    findings.filter((finding) => finding.severity === severity).length;
  const defects = count('blocker') + count('major') + count('minor');
  const { direct, inferred, claimed } = parsedReport.report.evidence;
  const row = (label: string, value: string): string => `  ${label.padEnd(24)}${value}`;
  console.error('\nSession summary');
  console.error(row('Blocker', String(count('blocker'))));
  console.error(row('Major', String(count('major'))));
  console.error(row('Minor', String(count('minor'))));
  console.error(row('Defect claims', String(defects)));
  console.error(row('Observations', String(count('observation'))));
  console.error(row('Questions', String(count('question'))));
  console.error(row('Evidence d/i/c', `${direct} / ${inferred} / ${claimed}`));
  console.error(
    row(
      'Cost',
      `$${spent.costUsd.toFixed(4)}` +
        (budget.measuringSpendOnly()
          ? ` (${(spent.costUsd / budget.limits.maxUsd).toFixed(2)}× reference)`
          : '') +
        `, ${spent.turns} turns, ${Math.round(spent.elapsedMs / 1000)}s`,
    ),
  );
}

// Everything changed in the worktree is the run's: nobody else works there.
const changed = await worktreeChanges(worktree);
const plan = planGate({
  role: name,
  family,
  changed,
  report: reportPath,
  environment: runTarget?.environment ?? null,
  runDir,
  // The subject's stack, when the work landed in a subject: the gate then checks the changed
  // tests with the subject's own runner, where before it reported nothing to check at all.
  ...(subjectConfig?.testStack === undefined ? {} : { testStack: subjectConfig.testStack }),
  // A subject run's worktree is a worktree of the subject, so the gate's own script paths do
  // not exist in it and every script-shaped step failed before it looked at the work. The
  // harness's scripts come from this checkout in that case; when the worktree is this
  // repository, the worktree's own copy is what runs.
  ...(subjectRepo === null ? {} : { harnessRoot: repoRoot }),
  // Only when the subject declares one. Without it the gate can say a test passes and
  // asserts, and nothing about whether it would notice a fault.
  ...(subjectConfig?.mutations === undefined ? {} : { mutations: subjectConfig.mutations }),
  ...(subjectConfig?.entryPoint === undefined ? {} : { entryPoint: subjectConfig.entryPoint }),
});

console.error(`\nPost-run gate — ${changed.length} file(s) changed in the worktree:`);
for (const path of changed) console.error(`    ${path}`);

const record: GateRecord = {
  role: name,
  app: runTarget?.app ?? null,
  environment: runTarget?.environment ?? null,
  report: reportPath,
  changed,
  steps: [],
  problems: plan.problems,
  notRun: plan.notRun,
  evidence: [
    reportPath,
    `${runDir}/results.json`,
    `${runDir}/test-results`,
    'artifacts/results-fault.json',
    'artifacts/fault-check/test-results',
  ],
};

// Steps run in sequence and nothing bounded them, so one that hung blocked every step
// behind it indefinitely — `mutation strength` and `report` were never reached on
// 2026-09-29, not because they were skipped but because nothing after a stuck step can
// run. The agent's wall clock stops before the gate starts, so the gate had no limit of
// any kind.
//
// A duration limit was the first fix and the wrong measure: it asks how long a step took
// when the question is whether anything is still happening. `runWithPatience` watches for
// silence instead, so a long step that is narrating its progress runs as long as it needs
// and a quiet one is named as waiting rather than killed as slow.
for (const problem of plan.problems) console.error(`  ✗ ${problem}`);
for (const step of plan.steps) {
  // A step names its own command only when a subject declared a runner; everything
  // harness-side runs under this process's node, which is what `args` is written for.
  const run = await runWithPatience(step.command ?? process.execPath, step.args, {
    cwd: worktree,
    env: { ...process.env, ...step.env },
    // A declared runner is usually an npm-installed binary, which on Windows is a .cmd
    // shim that CreateProcess cannot start directly. See `needsShell`.
    shell: step.command !== undefined && needsShell(step.command),
  });
  // A passing step used to record nothing, which threw away the only copy of whatever it
  // measured. `mutation strength` passed having scored a suite at 11 of 14 against a
  // baseline's 4, and the number was gone — it had to be produced again by hand, from a
  // step that had just produced it. A check whose value is a verdict loses nothing by
  // passing quietly; a check whose value is a measurement loses all of it.
  record.steps.push({
    name: step.name,
    passed: run.outcome === 'passed',
    output: run.output.slice(-30),
  });
  console.error(`  ${describePatience(step.name, run)}`);
  if (run.outcome !== 'passed') {
    for (const line of run.output.slice(-15)) console.error(`      ${line}`);
  }
}
for (const skipped of plan.notRun) console.error(`  · not run: ${skipped}`);

const recordPath = `${runDir}/gate.json`;
await writeFile(join(worktree, recordPath), JSON.stringify(record, null, 2), 'utf8');

const passed = gatePassed(record) && result.stoppedBy === null;

// ── Carry the evidence out of the worktree ────────────────────────────────────────
// Everything above was written inside the worktree — the thing a person is told to
// delete once they have taken what they want. Harvest first, then tell them it is
// safe to remove, and on a failure keep the worktree as well.
const harvest = await harvestSession({
  repoRoot,
  worktree,
  runDir,
  app: runTarget?.app ?? null,
  role: name,
  stamp,
});
console.error(`\nSession kept in ${harvest.home} — ${harvest.copied.length} item(s).`);
for (const gap of harvest.missing) console.error(`  · not kept: ${gap}`);
await noteInIndex(
  repoRoot,
  indexLine({
    stamp,
    role: name,
    app: runTarget?.app ?? null,
    environment: runTarget?.environment ?? null,
    defects: parsedReport.ok
      ? parsedReport.report.findings.filter((finding) =>
          ['blocker', 'major', 'minor'].includes(finding.severity),
        ).length
      : null,
    gate: passed ? 'PASS' : 'FAIL',
    costUsd: spent.costUsd,
    home: harvest.home,
  }),
);
if (passed) {
  console.error(
    `\nGate: PASS — the run's work is uncommitted in ${worktree}. Nothing has been committed or merged.\n` +
      `  Review it:   git -C "${worktree}" status  and  git -C "${worktree}" diff\n` +
      `  Bring it in yourself when it is right. git refuses a plain \`git worktree remove\` while that work is\n` +
      `  still there, which protects it; once it is in, discard the rest: git worktree remove --force "${worktree}"`,
  );
} else {
  console.error(
    `\nGate: FAIL — stopped, recorded in ${join(worktree, recordPath)}. Nothing retries, nothing is overridden, and the worktree is kept as evidence.`,
  );
  const next = investigationCommand(record, recordPath, worktree);
  if (next !== null) {
    console.error(
      'A failure is a finding. Prove its cause before anything runs again — you start it:',
    );
    console.error(`  ${next}`);
  }
}
process.exit(passed ? 0 : 1);
