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
 *
 * **And part of the set is never said out loud.** Everything above describes a briefing
 * that is worth giving and that we go on giving; it also means the gate scores a suite
 * against the set the role was briefed from, which is marking the answer we handed over.
 * `holdout` entries are filtered out here and scored like any other, so one number says
 * what a role does when told and the other says what it does when not. The role is never
 * shown the split, the count, or that a split exists — being told a holdout exists is
 * enough to change what a capable agent writes.
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

/**
 * The gap a survivor list describes, given the whole set it was scored against.
 *
 * **Null when there is no set**, which is not a formality. The first live wiring passed a
 * module namespace where an array was wanted, so the set read as empty; every survivor
 * was then dropped by the staleness rule below, and the run printed "defends every rule
 * the set knows — no gap to point at" about a suite that leaves ten of fourteen alive.
 *
 * A measurement that fails must not be indistinguishable from a measurement that came
 * back clean. Returning null forces the caller to tell those apart, where an empty gap
 * let it report the flattering one.
 */
export function coverageGap(
  baseline: string,
  mutations: readonly Mutation[],
  survivors: readonly string[],
): CoverageGap | null {
  if (mutations.length === 0) return null;
  // The holdout half is dropped before anything else, so no count, no total and no rule
  // name reaching the role can be derived from it. Filtering later — at the point the
  // sentences are rendered — would still have leaked the size of the set through `total`,
  // and a role that knows the set has fourteen rules and hears nine knows to look for five.
  const briefed = mutations.filter((mutation) => mutation.holdout !== true);
  if (briefed.length === 0) return null;
  // Matched on `breaks`, which is the only field a survivor line carries back and also
  // the only one phrased for a person. An entry the set no longer contains is dropped
  // rather than passed through: a stale survivor would send the role at a rule that is
  // not there any more, and it would find nothing and believe the fault was its own. A
  // holdout survivor is dropped by exactly the same rule, which is why it must not be in
  // `briefed` — not by a second rule that could be removed without this one noticing.
  const known = new Set(briefed.map((mutation) => mutation.breaks));
  const undefended = survivors.filter((survivor) => known.has(survivor));
  return {
    baseline,
    undefended,
    killed: briefed.length - undefended.length,
    total: briefed.length,
  };
}

/**
 * How much of the holdout is doing any work, for a person tuning the split.
 *
 * A holdout the baseline suite already kills carries no information: it would never have
 * appeared as a survivor, so briefing could not have mentioned it, so holding it back
 * changed nothing. Only holdouts the baseline leaves **alive** distinguish a role that
 * found the gap from a role that was told where it was.
 *
 * So a set can be split correctly and still measure nothing, and the split looks fine from
 * the outside — five of fourteen held back, all five already covered. This is the number
 * that says so. Not a check and not a gate: which rules go in the holdout is a judgement
 * about the seam, and it is made by a person who can see this.
 */
export function holdoutPower(
  mutations: readonly Mutation[],
  baselineSurvivors: readonly string[],
): { live: number; total: number } | null {
  const holdout = mutations.filter((mutation) => mutation.holdout === true);
  if (holdout.length === 0) return null;
  const alive = new Set(baselineSurvivors);
  return { live: holdout.filter((entry) => alive.has(entry.breaks)).length, total: holdout.length };
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
