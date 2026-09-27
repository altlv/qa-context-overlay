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
  /**
   * The level this run works at, from the role's name, or null for a role that does not work at
   * one of the four test levels.
   *
   * Carried beside the stack because the level decides what the stack *means*. The same `test/`
   * directory and the same `node --test` are a different job at unit level and at integration
   * level, and a block that describes only the first tells an integration coder that the thing
   * it exists to do is out of scope — which is what it did while it was a constant written for
   * the unit PoC.
   */
  level: SubjectLevel | null;
}

export type SubjectLevel = 'unit' | 'integration' | 'api' | 'e2e';

/**
 * The level a role works at, read from its name.
 *
 * The four coders are named for their level, which is where that fact already lives: a second
 * table listing the same four names against the same four levels would be the copy that drifts,
 * and `tests/unit/compose.test.ts` holds this one to the roles that actually exist.
 */
export function levelOfRole(role: string): SubjectLevel | null {
  const match = /^(unit|integration|api|e2e)-coder$/.exec(role);
  return match === null ? null : (match[1] as SubjectLevel);
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

/**
 * The subject's levels, in the subject's terms, for the level this run works at.
 *
 * Written for unit and integration — the two levels this pair of PoCs runs. api and e2e get one
 * line each saying what the level is and are otherwise left to the subject's own suite: neither
 * has been composed into a run, and inventing their method from this side of the fence would be
 * untested advice in a prompt. A role that works at no level gets no level at all, rather than
 * the unit one, which is what it used to get.
 */
export function subjectLevels(subject: SubjectRun): string {
  const { stack, level } = subject;

  if (level === null) {
    return `
Test levels, in the subject's terms.

This role does not work at one of the four test levels, so none is defined here. ${stack.runner} is what runs a test in this subject, and the repository conventions above say where they live.
`.trim();
  }

  const definition: Record<SubjectLevel, string> = {
    unit: 'unit — pure logic with no I/O. Input to output and nothing to stand up, so a rule can be pinned on its own.',
    integration:
      'integration — modules wired together through their real entry points: a spawned process, the actual filesystem, real exit codes. The risk is between the components, so exercise the real entry point rather than importing around it.',
    api: "api — the subject's own HTTP surface: a request, a response, a status code.",
    e2e: 'e2e — the subject through a real browser.',
  };

  const boundary: Record<SubjectLevel, string> = {
    unit: 'Anything needing a process, a file, or a running server is not this level. Say so rather than doubling the world to reach it.',
    integration: 'A browser is not this level: nothing here drives a page.',
    api: 'Reaching a route by importing its handler is a unit test of that handler, not this level.',
    e2e: 'The real browser is the boundary here, so use whatever this subject uses to drive one.',
  };

  // True for three of the four levels and a lie for the fourth, so it is written rather than
  // repeated. An e2e run told there is no browser is being told its own job is out of scope.
  const browser =
    level === 'e2e'
      ? ''
      : `

There is no browser in this run and no page to drive, whatever the sections above say. If a check can only be made through one, it belongs to a different role.`;

  return `
Test levels, in the subject's terms.

- ${definition[level]}
- ${boundary[level]}${browser}
`.trim();
}
