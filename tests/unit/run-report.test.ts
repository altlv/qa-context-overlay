import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findReport } from '../../src/qe/run-report.js';

/**
 * The shapes here are the ones live runs actually produced. Two of them passed a gate
 * they should have failed, or failed one they should have passed, which is why this
 * exists at all.
 */

function validReport(summary = 'Something specific is wrong here.'): string {
  return `---
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
    summary: ${summary}
    basis: Internal consistency — two views disagree.
not_covered:
  - mobile viewports
---

Body.
`;
}

/** What a role writes when it files its report and signs off with prose. */
const CHAT_SUMMARY = `## Session complete

Explored the thing. Two defects found and reported.

Report: \`reports/whatever.md\` (passes check-report clean).
`;

/**
 * The nastiest one. A summary that opens with partial frontmatter parses far enough to
 * be accepted as a report and then fails on the fields it never carried, so the run is
 * reported as producing a broken report when its real report was clean.
 */
const PARTIAL_FRONTMATTER = `---
report: exploratory-session
target: https://example.test
date: 2026-09-20
author: exploratory-tester
confidence: high
evidence:
  direct: 24
  inferred: 1
  claimed: 1
---

# Exploratory session

**Report:** \`reports/exploratory-2026-09-20.md\` — 0 errors, 0 warnings.
`;

let work: string;

test.beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'run-report-'));
});

test.afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function write(relative: string, body: string, minutesAgo = 0): string {
  const path = join(work, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body, 'utf8');
  if (minutesAgo > 0) {
    const when = new Date(Date.now() - minutesAgo * 60_000);
    utimesSync(path, when, when);
  }
  return path;
}

test.describe('finding the report a run actually wrote', () => {
  test('should find nothing when the run wrote no report file', () => {
    expect(
      findReport(work),
      'with no file, the caller must fall back to the final message rather than guess',
    ).toBeNull();
  });

  test('should prefer the conventional path', () => {
    write('artifacts/run/report.md', validReport('the conventional one'));
    write('reports/other.md', validReport('the other one'));

    const found = findReport(work);
    expect(found?.relative, 'artifacts/run/report.md is the convention and wins').toBe(
      'artifacts/run/report.md',
    );
  });

  test('should find a report the role filed under reports/', () => {
    // The live case: the role wrote its report to reports/ and signed off with prose.
    write('reports/eprimer-exploratory-2026-09-20.md', validReport());

    const found = findReport(work);
    expect(
      found,
      'a report under reports/ must be found, or the gate checks the prose',
    ).not.toBeNull();
    expect(found?.relative).toBe('reports/eprimer-exploratory-2026-09-20.md');
  });

  test('should ignore a chat summary that carries no frontmatter', () => {
    write('artifacts/run/report.md', CHAT_SUMMARY);
    write('reports/real.md', validReport());

    expect(
      findReport(work)?.relative,
      'a summary at the conventional path must not outrank a real report elsewhere',
    ).toBe('reports/real.md');
  });

  test('should ignore a summary whose partial frontmatter parses but carries no findings', () => {
    // This one failed the gate for missing `findings` and `not_covered` while the real
    // report passed check-report with zero errors.
    write('artifacts/run/report.md', PARTIAL_FRONTMATTER);
    write('reports/real.md', validReport());

    expect(
      findReport(work)?.relative,
      'a frontmatter stub is not a report, however far it parses',
    ).toBe('reports/real.md');
  });

  test('should take the newest when a directory holds more than one report', () => {
    write('reports/older.md', validReport('The older run left this report behind.'), 30);
    write('reports/newer.md', validReport('The newer run wrote this one last.'));

    const found = findReport(work);
    expect(
      found?.relative,
      'a reused worktree carries an earlier run’s reports beside its own',
    ).toBe('reports/newer.md');
    expect(found?.because).toContain('newest');
  });

  test('should say why the file it chose won', () => {
    write('reports/only.md', validReport());
    expect(
      findReport(work)?.because,
      'a person reading the run log needs to know which file was gated and why',
    ).toContain('reports/');
  });
});
