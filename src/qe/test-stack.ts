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
