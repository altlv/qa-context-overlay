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

/**
 * The changed paths that are test files under this stack.
 *
 * A literal suffix is enough for the patterns a stack declares — `*.test.js`, or a path
 * pattern ending in `.spec.ts`. Anything more elaborate belongs in the config as a plain
 * suffix rather than as a glob dialect this would have to reimplement.
 */
export function subjectTests(stack: TestStack, paths: readonly string[]): string[] {
  const lastSegment = stack.testFilePattern.slice(stack.testFilePattern.lastIndexOf('/') + 1);
  const suffix = lastSegment.replace(/^\*/, '');
  return paths.filter((path) => path.replace(/\\/g, '/').endsWith(suffix));
}
