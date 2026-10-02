import '../env.js';
import { readFileSync } from 'node:fs';
import { auditKnownDefects, reportKnownDefects } from '../qe/known-defect.js';

/**
 * `npm run known-defect-check -- --pattern <regexp> <test-file>…`
 *
 * How many of a run's tests are marked as expected to fail, and whether each one names the
 * defect it is standing in for.
 *
 * A gate step rather than a thing a person remembers to run, because the slot it audits exists
 * precisely where the pressure to cheat is highest: a role whose suite is red and whose gate
 * will fail for it. See `src/qe/known-defect.ts` for what the slot is and what it cost to
 * learn that it was missing.
 */

const argv = process.argv.slice(2);

function flag(name: string): string | undefined {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

const pattern = flag('--pattern');
const files = argv.filter((arg, index) => {
  if (arg.startsWith('--')) return false;
  return argv[index - 1] !== '--pattern';
});

if (files.length === 0) {
  console.error('Usage: known-defect-check --pattern <regexp> <test-file>…');
  console.error('');
  console.error("  --pattern  the stack's knownDefectPattern; omitted means it declares none");
  process.exit(2);
}

const read: { path: string; source: string }[] = [];
for (const path of files) {
  try {
    read.push({ path, source: readFileSync(path, 'utf8') });
  } catch (error) {
    // Not skipped. A file the check cannot open is a file it cannot clear, and reporting a
    // clean count over files it never read is the failure this whole area keeps producing.
    console.error(`Cannot read ${path}: ${(error as Error).message}`);
    process.exit(2);
  }
}

const audit = auditKnownDefects(read, pattern);
const lines = reportKnownDefects(audit);
if (lines.length === 0) {
  console.error(`No test marked as expected to fail, across ${read.length} file(s).`);
} else {
  for (const line of lines) console.error(line);
}

process.exit(audit.problems.length > 0 ? 1 : 0);
