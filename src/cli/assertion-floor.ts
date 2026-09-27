import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  analyzeAssertionFloor,
  FLOOR_BLIND_SPOTS,
  formatFloorFindings,
  type FloorReport,
} from '../quality/assertion-floor.js';

/**
 * The assertion floor, as a command the post-run gate can run on a subject's changed tests.
 *
 * Exit codes are part of the contract and the gate reads them:
 *   0 — every file was read and holds at least one assertion the code can falsify
 *   1 — a test is below the floor; the findings name which and why
 *   2 — a file was not read at all, or holds no test declaration. Not a pass: a file nothing
 *       could check is the shape that reports as clean.
 */

const argv = process.argv.slice(2);
let assertions: string | undefined;
const roots: string[] = [];

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i] as string;
  if (arg === '--assertions') {
    assertions = argv[i + 1];
    i += 1;
  } else if (arg.startsWith('--assertions=')) {
    assertions = arg.slice('--assertions='.length);
  } else {
    roots.push(arg);
  }
}

if (roots.length === 0) {
  console.error('Usage: assertion-floor [--assertions <the stack’s import line>] <test file>...');
  process.exit(2);
}

const reports: { file: string; report: FloorReport }[] = [];
let unread = 0;
let failed = 0;

for (const root of roots) {
  const file = resolve(root);
  const source = await readFile(file, 'utf8').catch(() => null);
  if (source === null) {
    console.error(`No such file: ${root}`);
    process.exit(2);
  }

  const report = analyzeAssertionFloor(source, assertions === undefined ? {} : { assertions });
  if (report.findings.length > 0) failed += report.findings.length;
  if (report.tests === 0) unread += 1;
  reports.push({ file: root, report });
  console.log(formatFloorFindings(root, report));
}

const tests = reports.reduce((sum, { report }) => sum + report.tests, 0);
const skipped = reports.reduce((sum, { report }) => sum + report.skipped, 0);
const count = reports.reduce((sum, { report }) => sum + report.assertions, 0);
console.log(
  `\n${reports.length} file(s), ${tests} test(s), ${count} assertion(s), ${failed} finding(s)` +
    (skipped === 0 ? '.' : `; ${skipped} skipped declaration(s) not judged.`),
);

// Said on every run, pass or fail: this is a floor, and the reader is owed the list of
// things it did not look at rather than the impression that silence means reviewed.
console.log('\nNot checked here:');
for (const gap of FLOOR_BLIND_SPOTS) console.log(`  · ${gap}`);
if (unread > 0) {
  console.log(
    `\n${unread} file(s) held no test this could judge — every declaration in them is ` +
      'skipped, or none is a form this reads. That is not a pass: nothing was checked.',
  );
}

process.exit(unread > 0 ? 2 : failed > 0 ? 1 : 0);
