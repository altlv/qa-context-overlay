/**
 * How a subject's tests are written and run.
 *
 * Declared here rather than beside the app contract, because `src/` never imports from
 * `apps/`: the app contract consumes the harness, not the other way round. A subject's
 * config imports this the same way it already imports the exploration policy, and a coder
 * role's prompt is built from it instead of from this repository's Playwright.
 *
 * Every field is a fact a role would otherwise have to guess, read out of a config file, or
 * — worse — assume. Assuming is what made `unit-coder` unable to produce one valid file for a
 * subject that uses `node:test`: the prompt named the wrong runner, the wrong test directory,
 * and the wrong import.
 */
export interface TestStack {
  /** What runs them: `node --test`, `vitest`, `jest`, `npx playwright test`. */
  runner: string;
  /** The command that runs the whole suite. */
  runAll: string;
  /** The command that runs one file, with the file path appended. */
  runOne: string;
  /** Where tests live, relative to the subject's repository root, without a trailing slash. */
  testsDir: string;
  /** What marks a file as a test, for the gate and the source map. */
  testFilePattern: string;
  /** `commonjs` | `esm` | `typescript` — how a test file imports what it needs. */
  moduleSystem: string;
  /** One line showing how assertions are obtained, as the subject writes it. */
  assertions: string;
  /** One test file to read as the house style, relative to the subject's repository root. */
  exemplar: string;
  /**
   * How this runner records a test that **correctly fails because the subject is broken**.
   *
   * Without this there is nowhere to put the most valuable thing a coder run produces. On
   * 2026-09-27 `integration-coder` wrote 34 tests against `mcpa` and 33 passed; the one that
   * failed had found a real crash — a write past the 64 KiB pipe buffer stays queued, the
   * stop destroys the pipe under it, and the unhandled stream error ends the process serving
   * quiz, exam and chat. The agent even located the boundary from the route's own ceiling
   * being one byte short of the buffer.
   *
   * **The gate failed that run**, correctly by its own rule, because a test that does not
   * pass does not pass. So the run that found the defect and the run that wrote a broken
   * test are the same colour, and the strongest possible outcome is punished. The alternative
   * the role is left with is to delete the test or assert the broken behaviour as correct,
   * both of which non-negotiable 4 forbids.
   *
   * The marker is the runner's own — `test.fail(true, reason)` in Playwright,
   * `it.fails(…)` in vitest, `{ todo: 'reason' }` in `node:test` — and so it is **declared,
   * never assumed**, which is the lesson of every other field here. The test is written as
   * it *should* pass.
   *
   * **The idioms are not equivalent, and an earlier version of this comment claimed they were.**
   * It said the runner flags a marked test loudly if the subject is ever fixed. Measured on
   * 2026-10-03:
   *
   * - vitest's `it.fails` and Playwright's `test.fail` *assert* the failure, so a test that
   *   starts passing is reported as a failure. The claim holds.
   * - `node:test`'s `todo` does not. The body runs and a failure keeps the suite green, which is
   *   what the slot needs — but a todo that **passes** produces no complaint at all and exit 0.
   *   So for a `node:test` subject a fixed defect leaves a marker behind silently.
   *
   * What notices it there is not the runner but `known-defect-check`, which prints the count on
   * every gate run and says a green suite holding markers is not a green suite. That is the only
   * reason a stale marker stays visible on such a subject, and it is worth knowing which of the
   * two is doing the work.
   *
   * Absent means this stack has no such idiom, and a role must leave the suite red and say
   * why in its report rather than inventing one.
   */
  knownDefect?: string;
  /**
   * The same marker as a regular expression source, so the gate can count them.
   *
   * Two fields that must agree are a drift risk, and the answer is not to trust them: a unit
   * test beside every registered subject asserts that this pattern matches that subject's own
   * declared `knownDefect` idiom. If one is edited without the other, that test fails.
   *
   * Counted rather than forbidden. A green suite holding three of these is not a green suite,
   * and the gate says the number out loud for exactly the reason the mutation briefing reports
   * a failed measurement differently from a clean one.
   */
  knownDefectPattern?: string;
}

/** `\` to `/`, so a path git spells the Windows way compares to a pattern written the other. */
function posix(value: string): string {
  return value.split('\\').join('/');
}

const SPECIAL = /[.+^${}()|[\]\\]/g;
const ANY_DIRS = '\u0000d\u0000';
const ANY = '\u0000a\u0000';

/**
 * The subset of glob a stack may declare, as a regular expression.
 *
 * `**` matches any run of directories, `*` any run of characters inside one segment, and
 * everything else is literal. The two wildcards are parked on placeholders so that `**` is
 * never rewritten a second time by the `*` substitution; NUL is the sentinel because a
 * declared pattern cannot contain one, which no printable sentinel could promise.
 */
function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .replace(SPECIAL, '\\$&')
    // `**/` before `**`, so the slash it owns travels with it and is not left required.
    .split('**/')
    .join(ANY_DIRS)
    .split('**')
    .join(ANY)
    .split('*')
    .join('[^/]*')
    .split(ANY_DIRS)
    .join('(?:.*/)?')
    .split(ANY)
    .join('.*');
  return new RegExp(`^${source}$`);
}

/**
 * The changed paths that are test files under this stack.
 *
 * **The pattern is matched whole.** An earlier version kept only its last segment and threw
 * the directories away, which stays quiet until a subject declares a pattern whose
 * discrimination lives in its path. A pattern of `tests/` then `**` then `/*.js` reduced to
 * the suffix `.js`, and so matched every changed JavaScript file in the repository, source
 * included — the gate would run `src/index.js` as a test and fail a run that had done nothing
 * wrong.
 *
 * That is the exact failure the tests beside this warn about in their own words, and they
 * missed it because every pattern they exercised discriminates on its last segment. A matcher
 * earns its place over a suffix precisely because the cost is asymmetric: too narrow and the
 * gate reports nothing to check, too wide and it fails honest work.
 *
 * A pattern with no slash is matched against the basename, so `*.test.js` still means "a test
 * file anywhere" — which is how every stack so far writes it.
 */
export function subjectTests(stack: TestStack, paths: readonly string[]): string[] {
  const declared = posix(stack.testFilePattern);
  const matches = patternToRegExp(declared.includes('/') ? declared : `**/${declared}`);
  return paths.filter((path) => matches.test(posix(path)));
}
