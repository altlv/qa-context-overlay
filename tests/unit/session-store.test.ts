import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { harvestSession, indexLine, keepsakes, sessionHome } from '../../src/qe/session-store.js';

let root: string;
let worktree: string;

test.beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'session-root-'));
  worktree = mkdtempSync(join(tmpdir(), 'session-tree-'));
});

test.afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(worktree, { recursive: true, force: true });
});

function inTree(relative: string, body = 'x'): void {
  const path = join(worktree, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body, 'utf8');
}

const RUN_DIR = 'artifacts/run';

test.describe('where a session lives once its worktree is gone', () => {
  test('should file a session under its app and role', () => {
    expect(sessionHome('academybugs', 'exploratory-tester', '2026-09-20T17-21-03')).toBe(
      'sessions/academybugs/exploratory-tester-2026-09-20T17-21-03',
    );
  });

  test('should still give a targetless run a findable home', () => {
    // A run with no --app produced evidence too, and inventing an app name for it
    // would make it unfindable.
    expect(sessionHome(null, 'test-planner', '2026-09-20T09-00-00')).toContain('no-target');
  });

  test('should keep the report and the gate record, and say when they are absent', async () => {
    const harvested = await harvestSession({
      repoRoot: root,
      worktree,
      runDir: RUN_DIR,
      app: 'academybugs',
      role: 'exploratory-tester',
      stamp: 'stamp',
    });

    expect(
      harvested.missing,
      'an absent report must be named, because silence about a gap reads as a pass',
    ).toContain('report.md');
    expect(harvested.missing).toContain('gate.json');
  });

  test('should carry the report, notes, summary and gate record out of the worktree', async () => {
    inTree(`${RUN_DIR}/report.md`, '---\nreport: bug\n---\n');
    inTree(`${RUN_DIR}/session-notes.md`, '12:05 typed something');
    inTree(`${RUN_DIR}/summary.md`, '## Session complete');
    inTree(`${RUN_DIR}/gate.json`, '{}');

    const harvested = await harvestSession({
      repoRoot: root,
      worktree,
      runDir: RUN_DIR,
      app: 'academybugs',
      role: 'exploratory-tester',
      stamp: 'stamp',
    });

    expect(harvested.copied).toEqual(
      expect.arrayContaining(['report.md', 'session-notes.md', 'summary.md', 'gate.json']),
    );
    expect(harvested.missing, 'nothing expected was absent').toEqual([]);
    expect(readdirSync(join(root, harvested.home))).toContain('session-notes.md');
  });

  test('should rescue screenshots a role dropped at the top of the worktree', async () => {
    // Two live runs wrote their screenshots beside the worktree root rather than under
    // the run directory. The gate listed them as "files changed" and nothing kept them,
    // so they died with the worktree.
    inTree('01-desktop-initial.png', 'png bytes');
    inTree('02-mobile-375.png', 'png bytes');
    inTree('notes.txt', 'not an image, not rescued');

    const harvested = await harvestSession({
      repoRoot: root,
      worktree,
      runDir: RUN_DIR,
      app: 'eprimer',
      role: 'exploratory-tester',
      stamp: 'stamp',
    });

    expect(harvested.copied).toEqual(
      expect.arrayContaining(['shots/01-desktop-initial.png', 'shots/02-mobile-375.png']),
    );
    expect(
      harvested.copied.some((name) => name.includes('notes.txt')),
      'only images and logs are rescued; everything else is the worktree’s business',
    ).toBe(false);
  });

  test('should leave the worktree untouched, because it is still the run’s own record', async () => {
    inTree(`${RUN_DIR}/report.md`, '---\nreport: bug\n---\n');

    await harvestSession({
      repoRoot: root,
      worktree,
      runDir: RUN_DIR,
      app: 'eprimer',
      role: 'exploratory-tester',
      stamp: 'stamp',
    });

    expect(
      readdirSync(join(worktree, RUN_DIR)),
      'harvest copies; a harvest that emptied the worktree would change what is being reviewed',
    ).toContain('report.md');
  });

  test('should name the run directory an investigation actually used', () => {
    // A testing role reusing another run's worktree writes beside it, not over it.
    const paths = keepsakes('artifacts/investigation-2026-09-20').map((item) => item.from);
    expect(paths.some((path) => path.includes('investigation-2026-09-20'))).toBe(true);
  });
});

test.describe('the session index', () => {
  test('should carry what a person scans for', () => {
    const line = indexLine({
      stamp: '2026-09-20T17-21-03',
      role: 'exploratory-tester',
      app: 'academybugs',
      environment: 'test',
      defects: 18,
      gate: 'FAIL',
      costUsd: 7.7141,
      home: 'sessions/academybugs/exploratory-tester-2026-09-20T17-21-03',
    });

    expect(line).toContain('academybugs/test');
    expect(line).toContain('18 defect(s)');
    expect(line).toContain('gate FAIL');
    expect(line).toContain('$7.7141');
  });

  test('should say "no report" rather than zero when none could be parsed', () => {
    // Zero defects and no report are different facts, and printing 0 for both would
    // record a run that produced nothing as a clean one.
    const line = indexLine({
      stamp: 's',
      role: 'exploratory-tester',
      app: null,
      environment: null,
      defects: null,
      gate: 'FAIL',
      costUsd: 0,
      home: 'sessions/no-target/x',
    });

    expect(line).toContain('no report');
    expect(line).not.toContain('0 defect(s)');
  });
});

test.describe('the report is kept wherever the role filed it', () => {
  test('should keep a report filed under reports/ rather than reporting it missing', async () => {
    // The first version of harvest looked only at artifacts/run/report.md, so it said
    // "report.md missing" while the report sat two directories away. Live runs file it
    // under reports/<app>-<date>.md as often as at the conventional path.
    inTree(
      'reports/exploratory-academybugs-2026-09-20.md',
      `---
report: exploratory-session
target: https://example.test
date: 2026-09-20
author: exploratory-tester
confidence: high
evidence:
  direct: 1
  inferred: 0
  claimed: 0
findings:
  - id: F1
    severity: major
    evidence: direct
    summary: The total does not match the sum of its parts.
    basis: Arithmetic.
not_covered:
  - mobile
---

Body.
`,
    );

    const harvested = await harvestSession({
      repoRoot: root,
      worktree,
      runDir: RUN_DIR,
      app: 'academybugs',
      role: 'exploratory-tester',
      stamp: 'stamp',
    });

    expect(
      harvested.copied,
      'a session that loses its report has kept nothing that matters',
    ).toContain('report.md');
    expect(
      harvested.missing,
      'and it must stop claiming the report is missing once it has been found',
    ).not.toContain('report.md');
  });

  test('should still report a genuinely absent report as missing', () => {
    // The fallback must not become a way of never admitting the report is gone.
    expect(
      keepsakes(RUN_DIR).find((item) => item.as === 'report.md')?.expected,
      'the report is the one file whose absence is always worth saying out loud',
    ).toBe(true);
  });
});
