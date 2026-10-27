/**
 * What `mutate --changed` is entitled to conclude from the mutations it selected.
 *
 * **The failure this exists for.** `--changed` intersects the registered mutation list with the
 * files you have touched, and when that intersection was empty it printed "nothing to check here"
 * and exited **0**. A verification that checked nothing reported success — the false pass this
 * repo's non-negotiable 1 is written against, arriving from the tool whose job is to find exactly
 * that class of defect in everything else.
 *
 * **Caught on 2026-09-24**: four new source files landed, no mutation named any of them, and the
 * gate stayed green — recorded as item 58 in `PLAN.md`, which is where the date comes from.
 *
 * It is not an edge case. Measured 2026-10-27 against `b819220`: `160` registered mutations name
 * `54` distinct files, while `src/` holds `121` `.ts` files — so most of the tree has no mutation
 * at all, and the empty intersection is the *common* outcome of touching it. Reproduce the three
 * figures rather than trusting them here:
 *
 *     node -e "const s=require('fs').readFileSync('src/cli/mutate.ts','utf8');
 *       const f=[...s.matchAll(/file:\s*'([^']+)'/g)].map(m=>m[1]);
 *       console.log(f.length,'mutations,',new Set(f).size,'distinct files')"
 *     find src -name '*.ts' | wc -l
 *
 * **Why the decision lives here and not in the CLI.** It was unreachable by any test while it sat
 * in `mutate.ts` among local, unexported values at the end of a 1300-line module — which is why a
 * false pass survived there unnoticed. A pure function over counts and file lists can be poisoned
 * and watched, and `tests/unit/mutation-scope.test.ts` does that.
 *
 * **This decides two outcomes, not three, and the naming says so.** The command has three: a suite
 * that killed its mutations (`0`), one that let some live (`1`), and a run that checked nothing
 * (`2`). Only the last is knowable here — whether any mutation was *selected* says nothing about
 * whether the suite *kills* it, and that answer arrives later, from the survivor count. So this
 * returns `proceed` or `could-not-check` and carries an exit code only for the latter. An earlier
 * version returned `{ type: 'pass', exitCode: 0 }` for the proceed case with a comment saying the
 * caller would override it; the caller discarded it instead, leaving a function that announced a
 * pass having verified nothing. That is the original defect in a new place, so the vocabulary here
 * refuses to express it.
 */

/**
 * Why nothing could be checked. Two reasons, because a person fixes them differently: register a
 * mutation for the file you touched, or touch a file.
 */
export type NoScopeReason = 'no-mutation-covers-the-changes' | 'nothing-has-changed';

export type MutationScopeDecision =
  | { kind: 'proceed' }
  /** Nothing was measured. Exit 2 — "could not check", which is NOT a pass. */
  | { kind: 'could-not-check'; reason: NoScopeReason; exitCode: 2 };

export interface MutationScopeInput {
  /** Mutations whose file you touched. */
  selectedCount: number;
  /** Mutations registered in total, for the proportion. */
  totalCount: number;
  /** Every file the working tree reports as changed, tracked or not. */
  touchedFiles: readonly string[];
  /** The subset of those a selected mutation names. */
  coveredFiles: readonly string[];
}

export interface MutationScopeResult {
  decision: MutationScopeDecision;
  /** What the operator is told. Multi-line; printed verbatim. */
  message: string;
}

export function describeScope(input: MutationScopeInput): MutationScopeResult {
  const { selectedCount, totalCount, touchedFiles, coveredFiles } = input;

  if (touchedFiles.length === 0) {
    return {
      decision: { kind: 'could-not-check', reason: 'nothing-has-changed', exitCode: 2 },
      message:
        'The working tree reports no changed files, so --changed selected nothing. ' +
        'Nothing was checked, which is not the same as nothing being wrong: ' +
        'run `npm run mutate` without --changed to score the whole set.',
    };
  }

  if (selectedCount === 0) {
    return {
      decision: {
        kind: 'could-not-check',
        reason: 'no-mutation-covers-the-changes',
        exitCode: 2,
      },
      message:
        `None of the ${totalCount} registered mutation(s) names any of the ` +
        `${touchedFiles.length} file(s) you changed, so nothing was checked. ` +
        `This is NOT a pass — it is a gap in the mutation set.\n` +
        `${listOf(touchedFiles)}\n` +
        `To check these, register a mutation against one of them in src/cli/mutate.ts; ` +
        `to score what the set does cover, run \`npm run mutate\` without --changed.`,
    };
  }

  /**
   * Both counts, each named for what it is.
   *
   * The line this replaces read `across ${coveredFiles.length} touched file(s)`, printing the size
   * of the intersection under the label of the input: touch six files, have one covered, and it
   * said "across 1 touched file(s)". A reader checking whether their change was covered was shown
   * a number that could not tell them, and the number that could was never printed. Naming both is
   * the whole fix; the uncovered list below is what makes it actionable.
   */
  const uncovered = touchedFiles.filter((file) => !coveredFiles.includes(file));
  const gap =
    uncovered.length === 0
      ? ''
      : `\nNo mutation covers the other ${uncovered.length} of them, so this run says nothing ` +
        `about ${uncovered.length === 1 ? 'it' : 'them'}:\n${listOf(uncovered)}`;

  return {
    decision: { kind: 'proceed' },
    message:
      `Scoped to --changed: ${selectedCount} of ${totalCount} mutation(s), covering ` +
      `${coveredFiles.length} of the ${touchedFiles.length} file(s) you changed:\n` +
      `${listOf(coveredFiles)}${gap}`,
  };
}

function listOf(files: readonly string[]): string {
  return files.map((file) => `  - ${file}`).join('\n');
}
