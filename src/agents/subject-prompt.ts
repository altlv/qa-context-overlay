import type { TestStack } from '../qe/test-stack.js';

/**
 * What replaces this repository's stack sections when a run's work lands in a subject's own
 * checkout.
 *
 * `CONVENTIONS` and `TEST_LEVELS` describe *this* repository's Playwright: its fixture
 * imports, its selector ladder, its `tests/unit/*.test.ts` layout, its `npx playwright test`
 * commands. Injected into a run against a subject that uses `node:test`, they are worse than
 * noise — they name the wrong runner, the wrong directory and the wrong import, so a role
 * follows them and writes a file the subject cannot even run. That is exactly what happened
 * the first time `unit-coder` was pointed at one.
 *
 * The plan states the acceptance test in those terms: the composed prompt for such a run
 * carries no Playwright instruction and no `tests/unit` path. So these are *replacements*,
 * matched on the exported constants themselves, not an override block appended underneath
 * instructions that would still be read as authoritative.
 */

export interface SubjectRun {
  /** The app's registered name. */
  app: string;
  /** The subject's repository, absolute. `git` reports paths against it. */
  repo: string;
  stack: TestStack;
}

export function subjectConventions(subject: SubjectRun): string {
  const { stack } = subject;
  return `
Repository conventions — the subject's, not this harness's.

You are working in ${subject.app}, a repository of its own at ${subject.repo}. The run has a
worktree of that checkout, and every path you write is relative to it. Nothing below comes
from this harness: ${stack.runner} runs the tests here.

- Tests live in \`${stack.testsDir}/\`, and a test file is \`${stack.testFilePattern}\`.
- The module system is ${stack.moduleSystem}. Assertions come from:
  \`${stack.assertions}\`
- One file: \`${stack.runOne}<file>\`. Everything: \`${stack.runAll}\`.
- Read \`${stack.exemplar}\` before writing anything. It is the house style of the suite you
  are adding to, and matching it matters more than any preference of your own.
- Never edit the subject's own checkout. Your worktree is the only place your work belongs,
  and a change outside it is refused rather than reported.
`.trim();
}

export function subjectLevels(subject: SubjectRun): string {
  const { stack } = subject;
  return `
Test levels, in the subject's terms.

- unit — pure logic with no I/O, in \`${stack.testsDir}/\`, run by ${stack.runner}.
- Anything needing a process, a file, or a running server is not this level. Say so, rather
  than doubling the world to reach it.

There is no browser in this run and no page to drive, whatever the sections above say. If a
check can only be made through one, it belongs to a different role.
`.trim();
}
