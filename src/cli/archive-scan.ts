import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { archiveName, prune } from '../qe/run-history.js';
import { readScanPayload } from '../quality/scan-drift.js';

/**
 * `npm run archive-scan -- <scan.json>` — copy a scan into `<its directory>/history/`, keeping the
 * newest twenty, so that two scans of the same page can be compared.
 *
 * A sibling of `src/cli/archive-results.ts` and deliberately so: same copy-never-move rule, same
 * `archiveName`/`prune` helpers, same refusal to name a file from the clock. The rules those
 * encode are explained there and hold for the same reasons here.
 *
 * **The name comes from the scan's own `scannedAt`, never `Date.now()`.** Archiving the same scan
 * twice has to produce the same filename, or one scan becomes two entries in the history and the
 * baseline picked for a drift run is an artefact of how often somebody ran this command.
 *
 * Exit codes: **0** archived (or already present), **2** could not archive. Nothing here can
 * "fail" in the sense of a finding, so there is no exit 1.
 */

const KEEP = 20;
const CANNOT_ARCHIVE = 2;

function cannotArchive(reason: string): never {
  console.error(`Could not archive: ${reason}.`);
  process.exit(CANNOT_ARCHIVE);
}

const scanPath = process.argv[2];
if (scanPath === undefined) {
  console.error('usage: npm run archive-scan -- <scan.json>');
  console.error(`  copies it to <dir>/history/, keeping the newest ${KEEP}`);
  process.exit(CANNOT_ARCHIVE);
}

const raw = await readFile(scanPath, 'utf8').catch(() => null);
if (raw === null) cannotArchive(`${scanPath} could not be read`);

// The same reader the drift command uses, so the two agree on what counts as a scan. A file this
// refuses would archive into a history that `scan-drift` would then refuse to read.
const read = readScanPayload(raw);
if (read.kind === 'not-usable') cannotArchive(`${scanPath} is not usable — ${read.reason}`);

const scannedAt = read.scan.scannedAt;
if (typeof scannedAt !== 'string' || Number.isNaN(Date.parse(scannedAt))) {
  cannotArchive(
    `${scanPath} carries no usable scannedAt, so there is no scan time to name the archive ` +
      'after. Refusing to fall back to the current time: a name from the clock would claim this ' +
      'scan happened when it did not',
  );
}

const historyDir = join(dirname(scanPath), 'history');
const dest = join(historyDir, archiveName(scannedAt));

if ((await stat(dest).catch(() => null)) !== null) {
  // The same scan archived twice is one scan. Rewriting would risk replacing a good record with
  // a worse one, and nothing was added, so nothing has aged out.
  console.log(`already archived at ${dest} — not rewriting it`);
  process.exit(0);
}

// Created only on the path that writes something, so a refused scan leaves the tree untouched.
await mkdir(historyDir, { recursive: true });
await copyFile(scanPath, dest);
console.log(`archived ${scanPath} -> ${dest}`);

// readdir also returns whatever a person has dropped in the directory; prune hands back only the
// names it recognises, and only those are ever deleted.
const { remove } = prune(await readdir(historyDir), KEEP);
for (const name of remove) {
  const path = join(historyDir, name);
  try {
    await rm(path);
    console.log(`removed ${path}`);
  } catch (error) {
    // The archive itself succeeded. A file that resists deletion is reported rather than allowed
    // to fail the run that already did its job.
    console.error(`could not remove ${path}: ${String(error)}`);
  }
}
if (remove.length === 0) console.log(`removed nothing — ${KEEP} or fewer archived scans on disk`);
