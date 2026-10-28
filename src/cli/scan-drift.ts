import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  countDrift,
  describeDrift,
  pickBaseline,
  readScanPayload,
  scanDrift,
} from '../quality/scan-drift.js';
import type { PageScan } from '../tools/page-scanner.js';

/**
 * `npm run scan-drift -- <scan.json> [--against <baseline.json>]`
 *
 * Exit codes follow the convention the rest of this repo uses, and the middle one is why this
 * command exists at all: **0** compared and found nothing, **1** compared and the page moved,
 * **2** could not compare. Exit 2 must never be reachable from a completed comparison, and a
 * comparison that could not happen must never exit 1 — reporting drift nobody measured sends a
 * reader hunting a change that did not occur. `src/cli/a11y.ts` and `src/quality/mutation-scope.ts`
 * are the precedents.
 *
 * With no `--against`, the baseline is the newest scan in `<scan's directory>/history/`, which is
 * where `npm run archive-scan` puts them.
 */

const CANNOT_COMPARE = 2;
const DRIFT_FOUND = 1;

function usage(): never {
  console.error('usage: npm run scan-drift -- <scan.json> [--against <baseline.json>]');
  console.error('  with no --against, compares against the newest scan in <dir>/history/');
  console.error('  exit 0 no drift · 1 drift found · 2 could not compare');
  process.exit(CANNOT_COMPARE);
}

function cannotCompare(reason: string): never {
  console.error(`Could not compare: ${reason}.`);
  console.error('Nothing was measured, so this is neither a pass nor a finding.');
  process.exit(CANNOT_COMPARE);
}

/** One scan from a path, or a refusal naming the path — never a half-read scan. */
async function loadScan(path: string, role: string): Promise<PageScan> {
  const raw = await readFile(path, 'utf8').catch(() => null);
  if (raw === null) cannotCompare(`the ${role} scan ${path} could not be read`);
  const read = readScanPayload(raw);
  if (read.kind === 'not-usable')
    cannotCompare(`the ${role} scan ${path} is unusable — ${read.reason}`);
  return read.scan;
}

/**
 * The baseline when none was named: the newest archived scan beside the one given.
 *
 * An empty or missing history is a refusal, not an absence of drift. The first run against a page
 * has nothing to compare with, and saying "no drift" there would be a claim about a comparison
 * that could not be attempted.
 */
async function baselineFor(scanPath: string): Promise<string> {
  const historyDir = join(dirname(scanPath), 'history');
  const names = await readdir(historyDir).catch(() => null);
  if (names === null) {
    cannotCompare(
      `there is no history directory at ${historyDir}, so there is no baseline to compare ` +
        'against — run `npm run archive-scan -- <scan.json>` after a scan to start one',
    );
  }
  const newest = pickBaseline(names);
  if (newest === null) {
    cannotCompare(
      `${historyDir} holds no archived scan, so there is no baseline — archive one with ` +
        '`npm run archive-scan -- <scan.json>`',
    );
  }
  return join(historyDir, newest);
}

const args = process.argv.slice(2);
const againstAt = args.indexOf('--against');
const positional = againstAt === -1 ? args : args.slice(0, againstAt);
const scanPath = positional[0];
if (scanPath === undefined) usage();
if (againstAt !== -1 && args[againstAt + 1] === undefined) usage();

const baselinePath =
  againstAt === -1 ? await baselineFor(scanPath) : (args[againstAt + 1] as string);

const before = await loadScan(baselinePath, 'baseline');
const after = await loadScan(scanPath, 'current');

console.log(`baseline: ${baselinePath}`);
console.log(`current:  ${scanPath}`);
console.log('');

const outcome = scanDrift(before, after);

if (outcome.kind === 'no-drift') {
  console.log('No drift: the two scans describe the same surface.');
  process.exit(0);
}

// `could-not-compare` is unreachable from scanDrift itself — every refusal is raised above, where
// the path that caused it is known. Handled rather than assumed away, so the union stays honest.
if (outcome.kind === 'could-not-compare') cannotCompare(outcome.reason);

console.log(describeDrift(outcome.result));
console.log('');
console.log(
  `${countDrift(outcome.result)} change(s) found. Artefacts derived from the baseline scan — ` +
    'generated test ideas, session context, spec selectors — may describe a page that has moved.',
);
process.exit(DRIFT_FOUND);
