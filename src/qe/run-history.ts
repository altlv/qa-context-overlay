/**
 * The names an archived run is allowed to have, and which of them survive a prune.
 *
 * Pure on purpose: nothing here reads a directory, a file, or a clock. `archive-results`
 * does the I/O. Every decision that can delete a file is therefore a decision a unit
 * test can pin down without touching disk — and the rules below (R1 to R6) each exist
 * because a plausible-looking simplification gets it wrong.
 */

/**
 * The only shape `archiveName` can produce, and so the only shape `prune` treats as one
 * of ours. `toISOString()` always writes exactly three fractional digits and a trailing
 * `Z`; a looser pattern would recognise names we could never have written.
 */
const ARCHIVE_NAME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/;

export interface Pruned {
  keep: string[];
  remove: string[];
}

/**
 * The one name for a moment in time.
 *
 * R2: Windows forbids a colon in a filename, and an ISO stamp carries two. The
 * millisecond dot goes the same way so the whole stamp reads as a single filename:
 * `2026-09-19T07:30:15.386Z` becomes `2026-09-19T07-30-15-386Z.json`.
 */
function nameFor(time: number): string {
  return `${new Date(time).toISOString().replace(/[:.]/g, '-')}.json`;
}

/**
 * The instant a name encodes, or null when the name is not one this module would write.
 *
 * Null is the safe answer: `prune` deletes what it recognises, so a name it cannot read
 * has to drop out of the conversation entirely rather than be guessed at (R6).
 */
function timeOf(name: string): number | null {
  const match = ARCHIVE_NAME.exec(name);
  if (match === null) return null;
  // Number(undefined) is NaN, so a missing capture cannot slip through as a valid date.
  const at = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
    Number(match[7]),
  );
  if (Number.isNaN(at)) return null;
  // The shape is not enough. `2026-13-45T...` matches the pattern and rolls over to a
  // real date, and Date.UTC reads a two-digit year as 19xx. Re-deriving the name
  // refuses both: if we would not have written it, it is not ours to delete.
  return nameFor(at) === name ? at : null;
}

/**
 * Filename for one archived run, derived from WHEN THE RUN HAPPENED.
 *
 * R1: the stamp comes from the run's own start time, which is passed in. It is never
 * `Date.now()`. Archiving the same results file twice has to produce the same name, or
 * one run becomes two entries and any later count of the history counts it twice.
 */
export function archiveName(startedAtIso: string): string {
  const at = Date.parse(startedAtIso);
  if (Number.isNaN(at)) {
    throw new Error(`archiveName needs an ISO timestamp, received "${startedAtIso}"`);
  }
  // Two spellings of one instant (`+02:00`, or no milliseconds at all) collapse to a
  // single name, which is what makes the R1 guarantee hold for the file on disk too.
  return nameFor(at);
}

/**
 * Which archived filenames survive, newest first.
 *
 * R3: the ordering comes from the timestamp encoded in the name, never from file
 * metadata. A copy to another directory does not preserve mtime, so an mtime-sorted
 * history would quietly call a copied old run the newest one.
 *
 * `keep` and `remove` are both returned newest first. A name that is not one of ours
 * appears in neither list: it is not ours to delete (R6), and it is not part of the
 * history being counted (R4).
 */
export function prune(existing: string[], keepCount: number): Pruned {
  const dated: { name: string; at: number }[] = [];
  for (const name of existing) {
    const at = timeOf(name);
    if (at !== null) dated.push({ name, at });
  }
  dated.sort((a, b) => b.at - a.at);

  // R5: zero or negative means "keep nothing", not "keep all but the last few", which is
  // what a bare slice() does with a negative count. A count that is not a number at all
  // (NaN, Infinity) is treated the same way rather than reaching that slice().
  const wanted = Number.isFinite(keepCount) ? Math.max(0, Math.trunc(keepCount)) : 0;

  // R4 falls out of this: a count at or above the number recognised keeps every one of
  // them and leaves `remove` empty.
  return {
    keep: dated.slice(0, wanted).map((entry) => entry.name),
    remove: dated.slice(wanted).map((entry) => entry.name),
  };
}
