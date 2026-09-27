/**
 * The definition of ready, checked before a run starts.
 *
 * A run that begins without its inputs does one of two things, both bad: it invents
 * what is missing — a design nobody approved, a charter nobody chose — or it spends its
 * budget discovering that it cannot start. Either way the gap was upstream, and the
 * run is the wrong place to find it. So a run that is not ready does not start; it
 * names the missing input and who should have produced it.
 *
 * Mechanical checks only: a file exists, a design parses and lists cases, a charter has
 * its headings, a run that tests something names the app and environment. Whether a
 * design is any good is not decided here. See `docs/agent-workflows.md`.
 */

export interface RunRequest {
  role: string;
  task: string;
  /** From `--app`. */
  app?: string;
  /** From `--env`. */
  environment?: string;
  /** From `--design`. */
  design?: string;
}

export type DesignReading = { kind: string; cases: number } | { problems: string[] };

export interface ReadinessContext {
  exists(path: string): boolean;
  readDesign(path: string): DesignReading;
  /**
   * Resolves a path the way the *subject* names it, when the run tests code this
   * repository does not contain.
   *
   * A unit-coder run points at a module, and for an external subject that module is
   * `src/services/x.js` — a path that does not exist here and never will. Without this the
   * run is refused with "nothing named to test" while the task names its target precisely.
   * Resolution belongs to the caller, which knows the subject's root; this module stays a
   * function of its inputs.
   */
  existsInSubject?(path: string): boolean;
}

/**
 * Roles whose work runs against a deployment. An api-coder is one: its specs reach a
 * server just as an e2e-coder's do, and the environment decides which one.
 */
const NEEDS_A_TARGET = new Set([
  'e2e-coder',
  'api-coder',
  'exploratory-tester',
  'testability-reviewer',
]);
const IMPLEMENTS_A_DESIGN = new Set(['e2e-coder', 'api-coder']);
const TESTS_NAMED_CODE = new Set(['unit-coder', 'integration-coder']);

const REPO_PATH =
  /(?:^|[\s`'"(])((?:\.\/)?(?:src|apps|tests|artifacts|reports|test-results)[\\/][^\s`'"),;]+)/g;

/** Repository paths a task mentions, in the order it mentions them. */
export function pathsNamedIn(task: string): string[] {
  return [...task.matchAll(REPO_PATH)].map((match) =>
    (match[1] ?? '').replace(/^\.\//, '').replace(/[.:]+$/, ''),
  );
}

function designProblem(request: RunRequest, context: ReadinessContext): string | null {
  const path = request.design;
  if (path === undefined) {
    return `no design: ${request.role} implements a test design. Run test-planner first, then pass --design apps/<app>/designs/<feature>.md`;
  }
  if (!context.exists(path)) return `design ${path} does not exist`;
  const reading = context.readDesign(path);
  if ('problems' in reading) {
    return `design ${path} is not a valid report: ${reading.problems.join('; ')}`;
  }
  if (reading.kind !== 'test-design') {
    return `design ${path} is a ${reading.kind} report, not a test design`;
  }
  if (reading.cases === 0) return `design ${path} lists no cases, so there is nothing to implement`;
  return null;
}

export function readinessProblems(request: RunRequest, context: ReadinessContext): string[] {
  const problems: string[] = [];
  const named = pathsNamedIn(request.task).filter(
    (path) => context.exists(path) || (context.existsInSubject?.(path) ?? false),
  );

  if (
    NEEDS_A_TARGET.has(request.role) &&
    (request.app === undefined || request.environment === undefined)
  ) {
    problems.push(
      `no target: ${request.role} needs --app <registered app> --env <local|test|prod> — its specs, browser and shell all point where those resolve`,
    );
  }

  if (IMPLEMENTS_A_DESIGN.has(request.role)) {
    const problem = designProblem(request, context);
    if (problem !== null) problems.push(problem);
  }

  if (TESTS_NAMED_CODE.has(request.role)) {
    if (request.design !== undefined) {
      const problem = designProblem(request, context);
      if (problem !== null) problems.push(problem);
    } else if (!named.some((path) => path.startsWith('src/') || path.startsWith('apps/'))) {
      problems.push(
        `nothing named to test: ${request.role} needs the module path in the task (src/...) or a --design`,
      );
    }
  }

  if (request.role === 'test-planner' && request.app === undefined && named.length === 0) {
    problems.push(
      'no evidence to design from: name a scan, a source path or session notes in the task, or pass --app',
    );
  }

  if (request.role === 'exploratory-tester') {
    if (!/^\s*explore\b/im.test(request.task) || !/\btimebox\b/i.test(request.task)) {
      problems.push(
        'no charter: the task must carry at least "Explore <target>" and "Timebox <minutes>" lines',
      );
    }
  }

  if (request.role === 'failure-investigator' && named.length === 0) {
    problems.push(
      'nothing to reproduce from: name the failing run’s gate record, results file, trace or capture in the task',
    );
  }

  return problems;
}

/**
 * Whether a design may describe code that has since changed. A warning, not a refusal —
 * decided on 2026-09-14. `changedSince` is the app's files changed since the design's
 * commit, or null when git could not compare.
 */
export function stalenessWarning(
  design: string,
  commit: string | undefined,
  changedSince: string[] | null,
): string | null {
  if (commit === undefined) {
    return `design ${design} records no commit, so whether the app changed since it was written is unknown`;
  }
  if (changedSince === null) {
    return `design ${design} was written against ${commit}, which git cannot compare with HEAD`;
  }
  if (changedSince.length === 0) return null;
  const shown = changedSince.slice(0, 5).join(', ');
  const more = changedSince.length > 5 ? ` and ${changedSince.length - 5} more` : '';
  return `design ${design} was written against ${commit}; the app has changed since (${shown}${more}) — check the design still describes it`;
}
