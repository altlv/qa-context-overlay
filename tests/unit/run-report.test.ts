import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findReport, unparsedReport } from '../../src/qe/run-report.js';

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

test.describe('saying why a report could not be read', () => {
  /**
   * Measured 2026-10-10. The runner printed **"No report file found under artifacts/run/ or
   * reports/"** for a run whose report was sitting at exactly that path and merely had no
   * frontmatter — and then wrote its own closing message over the top of it. Seven findings
   * including three majors, replaced by a summary of themselves.
   *
   * A false cause is worse than a vague one: it sends the next person looking for a missing file
   * instead of a malformed one. This is the same failure item 48 fixed for a truncated run, in a
   * different branch.
   *
   * The companion measurement, and the reason the empty case is named separately below:
   * **7 of the 29 reports this harness had kept were 0-byte files.**
   */

  const runDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'qco-unparsed-'));
    mkdirSync(join(dir, 'artifacts', 'run'), { recursive: true });
    return dir;
  };
  const at = (dir: string): string => join(dir, 'artifacts', 'run', 'report.md');

  test('should name the file and the reason when it will not parse', () => {
    const dir = runDir();
    writeFileSync(at(dir), '# Findings\n\nThe cart does not add anything.\n', 'utf8');

    const rejected = unparsedReport(dir);

    expect(rejected?.relative, 'a person has to be told where to read the findings').toBe(
      'artifacts/run/report.md',
    );
    expect(rejected?.why ?? '', 'and what was actually wrong with it').toMatch(/frontmatter/i);
  });

  test('should call an empty file empty rather than malformed', () => {
    // Different failures with different fixes — one is a budget that stopped the run, the other is
    // a format the session got wrong — and 7 of 29 kept reports were this one.
    const dir = runDir();
    writeFileSync(at(dir), '   \n', 'utf8');

    expect(unparsedReport(dir)?.why).toBe('the file is empty');
  });

  test('should stay silent about a report that parses', () => {
    const dir = runDir();
    // The file's own fixture, so "parses" means the same thing here as it does for `findReport`
    // above. Hand-rolling a second one is how a test ends up asserting against its own typo —
    // the first attempt here omitted `evidence` and the function was right to reject it.
    writeFileSync(at(dir), validReport(), 'utf8');

    expect(
      unparsedReport(dir),
      'a readable report is findReport’s business, not this function’s',
    ).toBeNull();
  });

  test('should say nothing when the session wrote no file at all', () => {
    // A run cut short before writing anything is a third failure again, and reporting it as a
    // malformed file would blame the session for the budget.
    expect(unparsedReport(runDir())).toBeNull();
  });
});

test.describe('where the runner is allowed to put its fallback', () => {
  /**
   * A test of the call site, because the call site is what destroyed a session's report.
   *
   * `role.ts` builds this path inline, so there is no seam to call — the same situation as the
   * observer hook's registration, and `repo-hygiene.test.ts` already checks claims this way. What
   * must hold is narrow: the agent's closing message is not a report and must never be given a
   * report's name, and a run with nothing to say must not leave a 0-byte file behind.
   */

  const flat = readFileSync('src/cli/role.ts', 'utf8').split(String.fromCharCode(10)).join(' ');

  test('should keep the closing message out of report.md', () => {
    expect(
      flat.includes("wrote === null ? FALLBACK_NAME : 'report.md'"),
      'the fallback lands beside the session’s file, never on it',
    ).toBe(true);
    expect(
      flat.includes("outPath === undefined ? join(worktree, runDir, 'report.md')"),
      'the unconditional report.md path is the 2026-10-10 defect',
    ).toBe(false);
  });

  test('should write nothing when there is nothing to write', () => {
    expect(
      flat.includes("if (reportBody.trim() === '')"),
      'an empty file is a claim that a report exists — 7 of 29 kept reports were 0 bytes',
    ).toBe(true);
  });
});
