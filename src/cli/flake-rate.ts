import '../env.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { flakeRates, reportRates, type RunReport } from '../qe/flake-rate.js';

/**
 * `npm run flake-rate`
 *
 * How often each test has been unreliable, across the runs in `artifacts/runs/`.
 *
 * The release gate already reports flakes within one run. This is the question it cannot answer:
 * how often, and is it getting better. Nothing could answer it before, because nothing archived
 * runs — two were on disk, both from one day in September, against a `KEEP` of twenty.
 */

const RUNS_DIR = 'artifacts/runs';

/** Every test in a Playwright JSON report, with the status of each attempt. */
function testsIn(raw: string): { title: string; statuses: string[] }[] | null {
  let parsed: unknown;
  try {
    // The same byte-order-mark tolerance that `archive-results` carries, for the same reason: a
    // report re-saved by a Windows editor would otherwise read as corrupt.
    // Compared by code point rather than matched by a regular expression. Writing the escape
    // kept producing the literal character in the source, which eslint refuses as irregular
    // whitespace — and one attempt to strip it left `/^/`, a pattern that removes nothing while
    // the comment above went on claiming the tolerance. This form cannot be wrong that way.
    const body = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  const out: { title: string; statuses: string[] }[] = [];
  // Suites nest, so this walks rather than assuming a depth. An explicit stack because the
  // shape is a tree and recursion here would need a named function for no gain.
  const stack: unknown[] = [...((parsed as { suites?: unknown[] }).suites ?? [])];
  while (stack.length > 0) {
    const suite = stack.pop() as {
      title?: string;
      suites?: unknown[];
      specs?: { title?: string; tests?: { results?: { status?: string }[] }[] }[];
    };
    for (const nested of suite.suites ?? []) stack.push(nested);
    for (const spec of suite.specs ?? []) {
      const statuses: string[] = [];
      for (const entry of spec.tests ?? []) {
        for (const result of entry.results ?? []) {
          if (typeof result.status === 'string') statuses.push(result.status);
        }
      }
      // A spec with no results is not a passing spec; it is a spec this reader did not
      // understand, and dropping it silently would make the denominator a lie.
      if (statuses.length > 0) out.push({ title: spec.title ?? '(untitled)', statuses });
    }
  }
  return out;
}

const names = await readdir(RUNS_DIR).catch(() => null);
if (names === null) {
  for (const line of reportRates([], [])) console.log(line);
  process.exit(0);
}

// Oldest first, which `flakeRates` depends on for `lastSeen`. The archive names files after the
// run's own start time, so sorting the names sorts the runs.
const reports: RunReport[] = [];
let unreadable = 0;
for (const name of names.filter((file) => file.endsWith('.json')).sort()) {
  const raw = await readFile(join(RUNS_DIR, name), 'utf8').catch(() => null);
  const tests = raw === null ? null : testsIn(raw);
  if (tests === null) {
    unreadable += 1;
    continue;
  }
  reports.push({ name, tests });
}

for (const line of reportRates(reports, flakeRates(reports))) console.log(line);
if (unreadable > 0) {
  // Counted, never skipped. A report this could not parse is a run missing from the
  // denominator, which makes every rate above lower than the truth.
  console.log(`\n${unreadable} archived run(s) could not be read, so every rate above is a floor.`);
}
