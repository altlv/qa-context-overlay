/**
 * How often a test has been unreliable, across archived runs.
 *
 * The release gate reports flakes **within one run** — "a test that needs a retry is not yet
 * evidence" — and that is the right thing to say at the moment of judging. It cannot answer the
 * question that decides whether anything is improving: how often does this test flake, and is it
 * getting better or worse.
 *
 * Nothing answered that, and the gap compounded. The mutation comparator refuses a suite that
 * fails on a second run, which catches an unstable suite cheaply — but **two green runs do not
 * certify stability**, and a test that flakes one time in twenty passes both and goes on
 * randomising every mutation score. A rate is the only thing that can see that test, and a rate
 * needs a history.
 *
 * Pure on purpose: nothing here reads a directory, a file or a clock. The caller supplies the
 * reports and this decides what they mean, which is the same split `run-history.ts` uses and for
 * the same reason — the decisions are testable without a filesystem.
 */

/** One archived Playwright JSON report, reduced to what a rate needs. */
export interface RunReport {
  /** Where it came from, for naming a run in output. */
  name: string;
  /** Every test the run executed, with the statuses of each of its attempts. */
  tests: { title: string; statuses: string[] }[];
}

export interface TestRate {
  title: string;
  /** Runs in which this test appeared at all. */
  runs: number;
  /** Runs in which it needed a retry to pass, or failed outright. */
  unreliable: number;
  /** `unreliable / runs`, 0..1. */
  rate: number;
  /** The most recent run in which it was unreliable, for asking what changed then. */
  lastSeen: string | null;
}

/**
 * Whether one test's attempts in one run were unreliable.
 *
 * A test that passed first time is reliable in that run. One that failed and then passed is a
 * flake. One that only failed is a failure — counted here too, because this measures *whether
 * the test can be trusted*, and a test that fails is not evidence either. Keeping them apart
 * would need a reason to treat a consistent failure as more trustworthy than an inconsistent
 * one, and there is none.
 *
 * A test that was skipped contributes nothing: it neither ran nor refused to.
 */
export function unreliableInRun(statuses: readonly string[]): boolean {
  const ran = statuses.filter((status) => status !== 'skipped');
  if (ran.length === 0) return false;
  return !(ran.length === 1 && ran[0] === 'passed');
}

/**
 * A rate per test, worst first, from the reports given.
 *
 * Sorted by rate and then by how many runs it is based on, so a test that failed once in one run
 * does not outrank one that fails half the time across twenty. A reader acting on the top of this
 * list should be acting on the best-evidenced problem, not the noisiest.
 */
export function flakeRates(reports: readonly RunReport[]): TestRate[] {
  const seen = new Map<string, { runs: number; unreliable: number; lastSeen: string | null }>();

  for (const report of reports) {
    for (const test of report.tests) {
      const entry = seen.get(test.title) ?? { runs: 0, unreliable: 0, lastSeen: null };
      entry.runs += 1;
      if (unreliableInRun(test.statuses)) {
        entry.unreliable += 1;
        // Reports arrive oldest-first from the caller, so the last write wins and this ends up
        // being the most recent. Stated because an unsorted caller would quietly break it.
        entry.lastSeen = report.name;
      }
      seen.set(test.title, entry);
    }
  }

  return [...seen.entries()]
    .map(([title, entry]) => ({
      title,
      runs: entry.runs,
      unreliable: entry.unreliable,
      rate: entry.unreliable / entry.runs,
      lastSeen: entry.lastSeen,
    }))
    .filter((entry) => entry.unreliable > 0)
    .sort((a, b) => b.rate - a.rate || b.runs - a.runs || a.title.localeCompare(b.title));
}

/**
 * What a person reads, including when there is nothing to say.
 *
 * **The sample size is printed first and always.** A rate over two runs is not a rate, and the
 * archive held exactly two runs for a fortnight — so the most likely wrong use of this command is
 * believing a number computed from almost nothing. Saying the denominator before the figures is
 * the cheapest guard against that, and it is the same reasoning as a scan declaring what it could
 * not see.
 */
export function reportRates(reports: readonly RunReport[], rates: readonly TestRate[]): string[] {
  if (reports.length === 0) {
    return [
      'No archived runs, so there is no flake rate to compute — not a clean bill.',
      'CI archives every run; run `npm test` locally to archive one.',
    ];
  }

  const lines = [`Flake rate over ${reports.length} archived run(s).`];
  if (reports.length < 5) {
    lines.push(
      `  ${reports.length} run(s) is too few to call a rate. Treat anything below as a hint that` +
        ' something is worth watching, never as a measurement.',
    );
  }
  lines.push('');

  if (rates.length === 0) {
    lines.push(
      'No test was unreliable in any archived run.',
      'That is not a promise of stability: a test that flakes one time in twenty is invisible' +
        ` in ${reports.length} run(s), and it is exactly the test that randomises a mutation score.`,
    );
    return lines;
  }

  lines.push('Worst first. `unreliable` means it needed a retry, or failed outright:');
  for (const rate of rates) {
    lines.push(
      `  ${(rate.rate * 100).toFixed(0).padStart(3)}%  ${rate.unreliable}/${rate.runs}  ${rate.title}`,
      `${' '.repeat(16)}last seen in ${rate.lastSeen ?? 'an unnamed run'}`,
    );
  }
  return lines;
}
