import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { archiveName, prune } from '../qe/run-history.js';

/**
 * Copies the run that wrote `artifacts/results.json` into `artifacts/runs/`, and keeps
 * the newest twenty of them.
 *
 * The fixed path is the contract: the release gate and `npm run plan:facts` both read
 * that exact file, so a harness that moved or rewrote it to keep a history would break
 * both at once. This copies — never moves — and leaves `artifacts/results.json` exactly
 * as it found it.
 *
 * Nothing runs this automatically. The history it builds is therefore a floor: the runs
 * somebody archived, not every run that happened. The line printed at the end says so
 * out loud, because a floor mistaken for a census is worse than no history at all.
 */

const RESULTS_FILE = 'artifacts/results.json';
const RUNS_DIR = 'artifacts/runs';

/** Archived runs to keep. The fixed results file is not in this count and is never pruned. */
const KEEP = 20;

const BLIND_SPOT =
  'note: nothing runs this automatically — the history is a floor: it holds the runs ' +
  'somebody archived, not every run that happened.';

/**
 * The run's own start time, or null when the report does not carry a usable one.
 *
 * An unreadable report is the same refusal as a missing stamp: the alternative is a name
 * taken from the current time, which would claim a run happened now when it did not.
 */
function startTimeOf(raw: string): string | null {
  let parsed: unknown;
  try {
    // A byte-order mark is not part of JSON, so a report re-saved by a Windows editor or
    // by PowerShell 5.1's `Set-Content -Encoding utf8` would otherwise read as corrupt.
    // Playwright writes none, so this only rescues a file that is otherwise ours.
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  const startTime = (parsed as { stats?: { startTime?: unknown } }).stats?.startTime;
  if (typeof startTime !== 'string' || Number.isNaN(Date.parse(startTime))) return null;
  return startTime;
}

async function fileExists(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => null);
  return info !== null;
}

async function main(): Promise<number> {
  const raw = await readFile(RESULTS_FILE, 'utf8').catch(() => null);
  if (raw === null) {
    console.error(
      `${RESULTS_FILE} is missing or unreadable — nothing was archived. ` +
        'Run `npm test` first, so that there is a run to archive.',
    );
    return 2;
  }

  const startedAt = startTimeOf(raw);
  if (startedAt === null) {
    console.error(
      `${RESULTS_FILE} has no usable stats.startTime, so there is no run start time to name ` +
        'the archive after. Refusing to fall back to the current time: a name from the clock ' +
        'would claim this run happened when it did not.',
    );
    return 2;
  }

  const dest = join(RUNS_DIR, archiveName(startedAt));

  if (await fileExists(dest)) {
    // R1 in practice: the same report archived twice is the same run, and rewriting the
    // file would risk replacing the record of a run that already happened. Nothing was
    // added, so nothing has aged out — and a run that archives nothing deletes nothing.
    console.log(`already archived ${dest} — not rewriting it`);
    console.log(BLIND_SPOT);
    return 0;
  }

  // Created only on the path that writes something, so a missing results file leaves the
  // tree exactly as it found it. A copy, never a rename: the gate reads the fixed path,
  // and archiving must not be able to take it away.
  await mkdir(RUNS_DIR, { recursive: true });
  await copyFile(RESULTS_FILE, dest);
  console.log(`archived ${RESULTS_FILE} -> ${dest}`);

  // readdir also returns whatever a human has dropped in the directory. prune() hands
  // back only the archive names it recognised, and only those are ever deleted.
  const { remove } = prune(await readdir(RUNS_DIR), KEEP);
  for (const name of remove) {
    const path = join(RUNS_DIR, name);
    try {
      await rm(path);
      console.log(`removed ${path}`);
    } catch (error) {
      // The archive itself succeeded, so a file that resists deletion is reported rather
      // than allowed to fail the run that already did its job.
      console.error(`could not remove ${path}: ${String(error)}`);
    }
  }
  if (remove.length === 0) {
    console.log(`removed nothing — ${KEEP} or fewer archived runs were on disk`);
  }
  console.log(BLIND_SPOT);
  return 0;
}

process.exitCode = await main();
