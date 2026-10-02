/**
 * A test that correctly fails because the subject is broken, and where that fact is allowed
 * to live.
 *
 * The gate's rule is that a test which does not pass does not pass, and it is right. But it
 * makes two opposite outcomes the same colour: a run that wrote a broken test, and a run that
 * found a real defect. Measured on `mcpa`, 2026-09-27 — `integration-coder` wrote 34 tests, 33
 * passed, and **the one that failed was the valuable one.** It had found a crash the subject's
 * own 11-of-11 suite never covered, and located the boundary from the route's own ceiling
 * being one byte short of the pipe buffer. The gate failed that run.
 *
 * With nowhere to record the finding, a role's only remaining moves are to delete the test or
 * to assert the broken behaviour as though it were correct, and non-negotiable 4 forbids both.
 * So a stack may declare the marker its own runner uses — `test.fail` in Playwright,
 * `it.fails` in vitest, `{ todo }` in `node:test` — the test is written as it *should* pass,
 * and the runner flags it loudly if the subject is ever fixed.
 *
 * **The slot is also the obvious way to cheat**, which is why nothing here is optional. A
 * marker is permitted only where the defect is named, and the count is always reported: a
 * green suite holding three markers is not a green suite, and a step that quietly accepted
 * them would be worse than the red it replaced.
 */

/** A marker must carry one of these, naming what is broken, on its own line or beside it. */
const NAMED = /\bKNOWN:[ \t]*\S/g;

export interface MarkerAudit {
  /** Markers found, per file, in the order the files were given. */
  perFile: { path: string; markers: number; named: number }[];
  markers: number;
  named: number;
  /** Why the gate should refuse, or empty when the markers are all accounted for. */
  problems: string[];
}

function count(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

/**
 * Whether a declared pattern and a declared idiom describe the same marker.
 *
 * Exported because the check that matters is per subject: a test asserts this holds for every
 * registered stack, so the two fields cannot drift apart silently. A pattern that matches
 * nothing in its own idiom would make the audit below count zero markers for ever and report
 * a clean bill it never measured — the failure mode this repository keeps meeting.
 */
export function patternMatchesIdiom(pattern: string, idiom: string): boolean {
  try {
    return new RegExp(pattern).test(idiom);
  } catch {
    return false;
  }
}

/**
 * The markers in a run's changed test files, and whether each is accounted for.
 *
 * `pattern` is the stack's own `knownDefectPattern`. Absent means the stack declares no idiom,
 * so there is nothing to count and nothing to permit — the audit returns no problems and no
 * markers rather than guessing at a dialect.
 */
export function auditKnownDefects(
  files: readonly { path: string; source: string }[],
  pattern: string | undefined,
): MarkerAudit {
  if (pattern === undefined || pattern === '') {
    return { perFile: [], markers: 0, named: 0, problems: [] };
  }
  let marker: RegExp;
  try {
    marker = new RegExp(pattern, 'g');
  } catch {
    // A pattern that does not compile must not read as "no markers found". The stack said it
    // has an idiom, so failing to look for it is a harness fault, reported as one.
    return {
      perFile: [],
      markers: 0,
      named: 0,
      problems: [
        `the stack's knownDefectPattern is not a valid regular expression (${pattern}), so ` +
          'known-defect markers could not be counted at all',
      ],
    };
  }

  const perFile = files.map((file) => ({
    path: file.path,
    markers: count(file.source, marker),
    named: count(file.source, NAMED),
  }));
  const markers = perFile.reduce((sum, file) => sum + file.markers, 0);
  const named = perFile.reduce((sum, file) => sum + file.named, 0);

  const problems: string[] = [];
  for (const file of perFile) {
    if (file.markers > file.named) {
      problems.push(
        `${file.path}: ${file.markers} test(s) marked as expected to fail and ${file.named} ` +
          'naming a defect. Each one must carry a `KNOWN: <what is broken>` comment, because a ' +
          'marker without one is indistinguishable from a test switched off to go green.',
      );
    }
  }
  return { perFile, markers, named, problems };
}

/**
 * What a person reads. Never silent when there are markers.
 *
 * Returns an empty array when there are none, so a run that used the slot not at all adds no
 * noise — and a line for every run that did, whether or not it passed the audit.
 */
export function reportKnownDefects(audit: MarkerAudit): string[] {
  if (audit.markers === 0) return audit.problems;
  const lines = [
    `${audit.markers} test(s) are marked as expected to fail — the suite is green with ` +
      `${audit.markers} known defect(s) recorded, which is not the same as green:`,
  ];
  for (const file of audit.perFile) {
    if (file.markers > 0) lines.push(`  ${file.path}: ${file.markers}`);
  }
  return [...lines, ...audit.problems];
}
