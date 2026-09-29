import type { Mutation } from './mutation-compare.js';

/**
 * What the suite that already exists does not catch, handed to the role before it writes.
 *
 * The gate scores a coder's file against a mutation set **after** it is written, which
 * makes the number a verdict and nothing else. The same measurement taken first is
 * direction: these are the rules the existing tests do not defend, so this is where a new
 * test is worth writing.
 *
 * This was proven by accident and by hand. `integration-coder`'s first run chose its own
 * targets and killed 8 of 14. I then read the survivors out of the comparator, wrote them
 * into the task as plain sentences, and the second run killed 11 of 14 with **fewer**
 * tests — 23 against 34. The information was worth three mutations and a third of the
 * suite size, and the only reason the role did not have it is that nobody passed it on.
 *
 * It also removes the thing that made that second number unusable as evidence. A score
 * improves because a person hand-fed the answer is a contaminated experiment; a score
 * improves because the harness routinely reports existing coverage is a capability, and
 * the next run measures the role rather than my typing.
 *
 * **Phrased as behaviour, never as mutations.** A survivor's `breaks` field already says
 * what rule goes unguarded — "a lab marked pending is refused with 409 rather than
 * started" — and that is a sentence a lead would say after reading coverage. Naming the
 * mutation instead would teach the role to satisfy the instrument rather than the seam,
 * and the instrument would then be measuring itself.
 */

/**
 * The rules a scored suite left alive, read back out of the comparator's own output.
 *
 * Parsed rather than recomputed. The comparator mutates a real checkout and restores it,
 * and that restore is the part with teeth — a run interrupted mid-file leaves a source
 * broken, and a source left broken is indistinguishable from a suite that caught the
 * mutation. Reimplementing the loop here to avoid parsing would mean owning that hazard
 * twice, so the tested path stays the only one that touches a subject's files.
 *
 * `--suite` alone prints one block, which is what a briefing run asks for. Were a second
 * given, `survived:` lines from both would be collected, which is why the caller does not
 * pass one.
 */
export function parseSurvivors(output: string): string[] {
  const found: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*survived:\s*(.+?)\s*$/.exec(line);
    const rule = match?.[1];
    if (rule !== undefined && rule !== '' && !found.includes(rule)) found.push(rule);
  }
  return found;
}

export interface CoverageGap {
  /** The suite that already holds this seam. */
  baseline: string;
  /** Rules the baseline leaves undefended, as the mutation set words them. */
  undefended: string[];
  /** How many of the set it does catch, so the briefing is not only bad news. */
  killed: number;
  total: number;
}

/** The gap a survivor list describes, given the whole set it was scored against. */
export function coverageGap(
  baseline: string,
  mutations: readonly Mutation[],
  survivors: readonly string[],
): CoverageGap {
  // Matched on `breaks`, which is the only field a survivor line carries back and also
  // the only one phrased for a person. An entry the set no longer contains is dropped
  // rather than passed through: a stale survivor would send the role at a rule that is
  // not there any more, and it would find nothing and believe the fault was its own.
  const known = new Set(mutations.map((mutation) => mutation.breaks));
  const undefended = survivors.filter((survivor) => known.has(survivor));
  return {
    baseline,
    undefended,
    killed: mutations.length - undefended.length,
    total: mutations.length,
  };
}

/**
 * The briefing section, or empty when there is nothing useful to say.
 *
 * Empty in two cases and for opposite reasons. No survivors means the existing suite
 * catches everything the set knows about, so there is no direction to give and claiming
 * otherwise would invent work. No mutation set means nothing was measured, and a briefing
 * that says "no known gaps" when nothing looked is the failure this repository keeps
 * meeting — a verification that cannot fail reporting as checked.
 */
export function briefCoverage(gap: CoverageGap | null): string {
  if (gap === null || gap.undefended.length === 0) return '';

  return [
    '# What the existing tests do not catch',
    '',
    `\`${gap.baseline}\` already covers this seam. Measured against a mutation set written`,
    `from the source, it defends ${gap.killed} of ${gap.total} rules and leaves these undefended:`,
    '',
    ...gap.undefended.map((rule) => `- ${rule}`),
    '',
    'Each is a rule the product implements and nothing currently notices breaking. They are',
    'where a new test is worth most — not because a tool said so, but because a change to any',
    'of them would ship. Cover what your task asks for, and prefer these where the two meet.',
    '',
    '**If one cannot be reached, say so and show why rather than writing a test that pretends',
    'to cover it.** One of these turned out to be unreachable from any input the seam takes,',
    'and saying so was worth more than a test would have been.',
    '',
  ].join('\n');
}
