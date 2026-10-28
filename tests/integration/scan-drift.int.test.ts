import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TSX_CLI } from '../../src/tool-paths.js';
import type { PageScan, ScannedElement } from '../../src/tools/page-scanner.js';

/**
 * The two scan-history commands, driven as a person drives them.
 *
 * **Run through `execFileSync` with an argument array, never a shell string.** The first version
 * of this file interpolated paths into `execSync('npm run scan-drift -- ' + a + ' ' + b)`, and
 * this repository's own checkout lives under `C:\Users\PC User\`. The space split one argument
 * into two, so every case in the file failed on an unrelated ENOENT, and the CLI's refusal went to
 * stderr where the assertions were not looking. An argument array cannot be re-split, which is the
 * only fix that stays fixed.
 *
 * Exit codes are the contract here: 0 compared and clean, 1 compared and the page moved, 2 could
 * not compare. The last is the one worth driving end to end — it is unreachable from the diff
 * itself, so only a real run through the CLI proves a missing file does not report as drift.
 */

/**
 * `node <tsx's entry point> src/cli/<script>.ts`, the way `cli.int.test.ts` already does it.
 *
 * Not `npm run`: on Windows the `.cmd` shim cannot be spawned without a shell, and a shell would
 * mean concatenating arguments back into a string — the very thing that broke the first version of
 * this file. This path takes an argument array all the way down.
 */
const TSX = TSX_CLI;

const control = (suggested: string): ScannedElement =>
  ({ tag: 'button', type: null, role: 'button', suggested }) as unknown as ScannedElement;

/** A scan in the shape `npm run scan` writes, which is the only shape these commands accept. */
function writeScan(path: string, over: Partial<PageScan> & { scannedAt?: string } = {}): string {
  const scan = {
    url: 'http://example.com',
    title: 'Example',
    scannedAt: '2026-10-01T10:00:00.000Z',
    interactive: [],
    endpoints: [],
    testability: [],
    ...over,
  };
  writeFileSync(path, JSON.stringify({ stack: {}, scan, dictionary: [] }), 'utf8');
  return path;
}

interface Run {
  status: number;
  out: string;
}

/**
 * Runs a CLI to completion and reports its exit code. A non-zero exit is data, not an error.
 *
 * A failure to *spawn* throws instead, because it is a broken harness rather than a failing
 * command. The first version of this helper folded it into `status: -1` with empty output, so
 * eleven tests reported as assertion failures when nothing had run at all.
 */
function run(script: string, args: string[]): Run {
  const result = spawnSync(process.execPath, [TSX, join('src', 'cli', `${script}.ts`), ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error !== undefined) {
    throw new Error(`could not spawn ${script} (${result.error.message}) — the harness is broken`);
  }
  return { status: result.status ?? -1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

let dir: string;

test.beforeEach(() => {
  // A fresh temp directory per test: these commands write a `history/` beside the scan, and a
  // shared directory would let one case's archive become another's baseline.
  dir = mkdtempSync(join(tmpdir(), 'qco-scan-drift-'));
});

test.describe('scan-drift', () => {
  test('exits 0 and says so when the surface has not moved', () => {
    const before = writeScan(join(dir, 'before.json'), { interactive: [control('#save')] });
    const after = writeScan(join(dir, 'after.json'), { interactive: [control('#save')] });

    const result = run('scan-drift', [after, '--against', before]);

    expect(result.status, `expected 0, got ${result.status}: ${result.out}`).toBe(0);
    expect(result.out).toContain('No drift');
  });

  test('exits 1 and names what moved', () => {
    const before = writeScan(join(dir, 'before.json'), { interactive: [control('#cancel')] });
    const after = writeScan(join(dir, 'after.json'), { interactive: [control('#submit')] });

    const result = run('scan-drift', [after, '--against', before]);

    expect(result.status, `expected 1, got ${result.status}: ${result.out}`).toBe(1);
    expect(result.out).toContain('Controls that appeared');
    expect(result.out).toContain('#submit');
    expect(result.out).toContain('Controls that disappeared');
    expect(result.out).toContain('#cancel');
  });

  test('exits 2 — not 1 — when a scan cannot be read', () => {
    // The distinction this command exists for: exit 1 would report drift nobody measured.
    const after = writeScan(join(dir, 'after.json'));

    const result = run('scan-drift', [after, '--against', join(dir, 'absent.json')]);

    expect(result.status, `a missing baseline is "could not compare": ${result.out}`).toBe(2);
    expect(result.out).toContain('Could not compare');
    expect(result.out, 'and is explicitly neither verdict').toContain(
      'neither a pass nor a finding',
    );
  });

  test('exits 2 on the older scan format, naming the format', () => {
    const bare = join(dir, 'old.json');
    writeFileSync(
      bare,
      JSON.stringify({ url: 'http://x', interactive: [], endpoints: [], testability: [] }),
      'utf8',
    );
    const after = writeScan(join(dir, 'after.json'));

    const result = run('scan-drift', [after, '--against', bare]);

    expect(result.status, `expected 2, got ${result.status}: ${result.out}`).toBe(2);
    expect(result.out).toContain('older bare-PageScan');
  });

  test('exits 2 when there is no history to compare against', () => {
    const after = writeScan(join(dir, 'after.json'));

    const result = run('scan-drift', [after]);

    expect(result.status, `a first scan has no baseline: ${result.out}`).toBe(2);
    expect(result.out, 'and is told how to start one').toContain('archive-scan');
  });

  test('with no --against, compares against the newest archived scan', () => {
    // The whole point of the history: archive two, and the newer one is the baseline.
    const scan = join(dir, 'page.json');
    writeScan(scan, { scannedAt: '2026-10-01T10:00:00.000Z', interactive: [control('#old')] });
    expect(run('archive-scan', [scan]).status).toBe(0);
    writeScan(scan, { scannedAt: '2026-10-02T10:00:00.000Z', interactive: [control('#mid')] });
    expect(run('archive-scan', [scan]).status).toBe(0);

    // Now the live scan differs from the NEWER archive only.
    writeScan(scan, { scannedAt: '2026-10-03T10:00:00.000Z', interactive: [control('#new')] });
    const result = run('scan-drift', [scan]);

    expect(result.status, `expected drift against the newest archive: ${result.out}`).toBe(1);
    expect(result.out, 'the baseline is the 02nd, not the 01st').toContain('2026-10-02');
    expect(result.out).toContain('#new');
    expect(result.out).toContain('#mid');
    expect(result.out, 'the older archive is not the baseline').not.toContain('#old');
  });
});

test.describe('archive-scan', () => {
  test('names the archive from the scan time, not the clock', () => {
    const scan = writeScan(join(dir, 'page.json'), { scannedAt: '2026-10-01T10:00:00.000Z' });

    const result = run('archive-scan', [scan]);

    expect(result.status, result.out).toBe(0);
    expect(readdirSync(join(dir, 'history')), 'the scan time is the name').toEqual([
      '2026-10-01T10-00-00-000Z.json',
    ]);
  });

  test('archiving the same scan twice leaves one entry', () => {
    const scan = writeScan(join(dir, 'page.json'), { scannedAt: '2026-10-01T10:00:00.000Z' });

    expect(run('archive-scan', [scan]).status).toBe(0);
    const second = run('archive-scan', [scan]);

    expect(second.status, second.out).toBe(0);
    expect(second.out).toContain('already archived');
    expect(readdirSync(join(dir, 'history')), 'one scan is one entry').toHaveLength(1);
  });

  test('leaves the original scan where it was', () => {
    const scan = writeScan(join(dir, 'page.json'));

    expect(run('archive-scan', [scan]).status).toBe(0);

    expect(readdirSync(dir).includes('page.json'), 'a copy, never a move').toBe(true);
  });

  test('exits 2 when the file is not a scan, and writes no history', () => {
    const notScan = join(dir, 'notes.json');
    writeFileSync(notScan, '{"hello":"world"}', 'utf8');

    const result = run('archive-scan', [notScan]);

    expect(result.status, `expected 2, got ${result.status}: ${result.out}`).toBe(2);
    expect(result.out).toContain('not usable');
    // A refused scan must leave the tree exactly as it found it.
    expect(readdirSync(dir), 'no history directory was created').toEqual(['notes.json']);
  });

  test('keeps the newest 20 and drops what ages out', () => {
    /**
     * The pruning path, which nothing covered: `prune` has its own tests in `run-history`, but
     * nothing proved this command passes it the right directory or acts on what it returns. 22
     * scans go in, each with its own scan time, and the two oldest must be gone.
     */
    const scan = join(dir, 'page.json');
    for (let day = 1; day <= 22; day += 1) {
      const stamp = `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`;
      writeScan(scan, { scannedAt: stamp });
      expect(run('archive-scan', [scan]).status, `archiving day ${day}`).toBe(0);
    }

    const kept = readdirSync(join(dir, 'history')).sort();

    expect(kept, 'twenty kept, not twenty-two').toHaveLength(20);
    expect(kept[0], 'the oldest two aged out').toBe('2026-10-03T10-00-00-000Z.json');
    expect(kept.at(-1), 'the newest is still there').toBe('2026-10-22T10-00-00-000Z.json');
  });

  test('exits 2 when the scan carries no usable time, rather than naming it from now', () => {
    const scan = join(dir, 'page.json');
    mkdirSync(join(dir, 'untouched'), { recursive: true });
    writeFileSync(
      scan,
      JSON.stringify({ scan: { interactive: [], endpoints: [], testability: [] } }),
      'utf8',
    );

    const result = run('archive-scan', [scan]);

    expect(result.status, `expected 2, got ${result.status}: ${result.out}`).toBe(2);
    expect(result.out).toContain('scannedAt');
  });
});
