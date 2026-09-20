import { test, expect } from '@playwright/test';
import { auditReport, parseReport, type Report } from '../../src/qe/report.js';

function report(over: Partial<Report> = {}): Report {
  return {
    report: 'testability',
    target: 'apps/x',
    date: '2026-09-09',
    author: 'tester',
    confidence: 'high',
    evidence: { direct: 1, inferred: 0, claimed: 0 },
    findings: [
      {
        id: 'F1',
        severity: 'major',
        evidence: 'direct',
        summary: 'Something specific is wrong here.',
        basis: 'Internal consistency',
      },
    ],
    not_covered: ['mobile'],
    not_run: [],
    cases: [],
    coverage_candidates: [],
    ...over,
  };
}

const VALID_DOC = `---
report: bug
target: apps/todo-fixture
date: 2026-09-09
author: investigator
confidence: medium
evidence:
  direct: 1
  inferred: 0
  claimed: 0
findings:
  - id: F1
    severity: major
    evidence: direct
    summary: The create endpoint returns 200 but does not persist.
    basis: Claims — the API documents 201 on create.
not_covered:
  - concurrency
not_run: []
---

Body goes here.
`;

test.describe('report parsing', () => {
  test('should parse a well-formed report and return its body', () => {
    const parsed = parseReport(VALID_DOC);
    expect(parsed.ok, 'a valid report failed to parse — the format is unusable').toBe(true);
    if (parsed.ok) {
      expect(parsed.report.report).toBe('bug');
      expect(parsed.body.trim()).toBe('Body goes here.');
    }
  });

  test('should reject a document with no frontmatter', () => {
    const parsed = parseReport('# Just markdown\n');
    expect(parsed.ok).toBe(false);
  });

  test('should reject an unknown report type', () => {
    const parsed = parseReport(VALID_DOC.replace('report: bug', 'report: horoscope'));
    expect(parsed.ok).toBe(false);
  });

  test('should reject a malformed date', () => {
    const parsed = parseReport(VALID_DOC.replace('2026-09-09', '9th Sept'));
    expect(parsed.ok).toBe(false);
  });

  test('should tolerate a UTF-8 BOM before the frontmatter', () => {
    expect(parseReport(`\uFEFF${VALID_DOC}`).ok).toBe(true);
  });
});

test.describe('report audit', () => {
  test('should accept an honest report', () => {
    expect(auditReport(report())).toEqual([]);
  });

  test('should reject a blocker that rests on inference', () => {
    const problems = auditReport(
      report({
        findings: [
          {
            id: 'F1',
            severity: 'blocker',
            evidence: 'inferred',
            summary: 'Probably breaks under load.',
            basis: 'reasoning',
          },
        ],
      }),
    );
    expect(problems.some((p) => p.level === 'error' && p.message.includes('blocker'))).toBe(true);
  });

  test('should reject claimed evidence on anything but a question', () => {
    const problems = auditReport(
      report({
        evidence: { direct: 0, inferred: 0, claimed: 1 },
        findings: [
          {
            id: 'F1',
            severity: 'major',
            evidence: 'claimed',
            summary: 'A developer said this is safe.',
            basis: 'hearsay',
          },
        ],
      }),
    );
    expect(problems.some((p) => p.level === 'error' && p.message.includes('claimed'))).toBe(true);
  });

  test('should allow claimed evidence when filed as a question', () => {
    const problems = auditReport(
      report({
        evidence: { direct: 0, inferred: 0, claimed: 1 },
        findings: [
          {
            id: 'F1',
            severity: 'question',
            evidence: 'claimed',
            summary: 'Unclear whether retries are idempotent.',
          },
        ],
      }),
    );
    expect(problems.filter((p) => p.level === 'error')).toEqual([]);
  });

  test('should reject a PASS verdict built on claimed evidence', () => {
    const problems = auditReport(
      report({
        verdict: 'PASS',
        evidence: { direct: 1, inferred: 0, claimed: 1 },
        findings: [
          {
            id: 'F1',
            severity: 'question',
            evidence: 'claimed',
            summary: 'Someone asserted this works.',
          },
        ],
      }),
    );
    expect(problems.some((p) => p.level === 'error' && p.message.includes('PASS'))).toBe(true);
  });

  test('should warn when not_covered is empty — that claims total coverage', () => {
    const problems = auditReport(report({ not_covered: [] }));
    expect(problems.some((p) => p.message.includes('not_covered'))).toBe(true);
  });

  test('should warn when a finding names no basis', () => {
    const problems = auditReport(
      report({
        findings: [
          { id: 'F1', severity: 'minor', evidence: 'direct', summary: 'Something is off here.' },
        ],
      }),
    );
    expect(problems.some((p) => p.message.includes('basis'))).toBe(true);
  });
});

test.describe('a session is checked as a session', () => {
  const charter = {
    explore: 'the cart and checkout flow',
    resources: 'a seeded account, desktop Chrome',
    to_discover: 'where totals and stock disagree',
    timebox: '45 minutes',
    lenses: ['a first-time buyer', 'a keyboard-only shopper', 'a phone-sized screen'],
    constraint: 'without touching the admin panel',
  };

  const preflight = {
    position: 'checked at 1280, 768 and 375 wide; the basket summary wraps under 400',
    state: 'empty, one item, and the out-of-stock error all rendered',
    zoom: 'legible at 200%; nothing clipped at 50%',
    keyboard: 'tab reaches every control; focus ring visible throughout',
    contrast: 'body text passes; the muted stock note is borderline at 4.2:1',
    document_head: 'title, charset and viewport present; favicon 404s',
  };

  const session = (over: Partial<Report> = {}): Report =>
    report({
      report: 'exploratory-session',
      charter,
      preflight,
      findings: [
        {
          id: 'O1',
          severity: 'observation',
          evidence: 'direct',
          summary: 'The mini-cart total updated only after a reload.',
        },
        {
          id: 'Q1',
          severity: 'question',
          evidence: 'claimed',
          summary: 'Is the stock count meant to include reserved items?',
        },
      ],
      evidence: { direct: 1, inferred: 0, claimed: 1 },
      coverage_candidates: ['O1'],
      ...over,
    });

  const messages = (over: Partial<Report> = {}): string =>
    auditReport(session(over))
      .map((problem) => `${problem.level}: ${problem.message}`)
      .join('\n');

  test('should accept a session that brought a charter, an observation and a question', () => {
    expect(
      auditReport(session()).filter((problem) => problem.level === 'error'),
      'a well-formed session must pass cleanly, or the rules below are just noise',
    ).toEqual([]);
  });

  test('should refuse a session with no charter', () => {
    // "No charter is ad-hoc clicking with better branding." Without one, "no issues
    // found" cannot be read — it is coverage evidence for an unstated scope.
    const problems = auditReport(session({ charter: undefined }));

    expect(
      problems.some((problem) => problem.level === 'error' && problem.message.includes('charter')),
      'an uncharted session reports coverage nobody can size',
    ).toBe(true);
  });

  test('should refuse a defect claim with no oracle, where elsewhere it only warns', () => {
    // The skill: "name the oracle for every defect claim". A session is exactly where
    // there is no spec to fall back on, so this is an error here and a warning in a
    // testability report.
    const unsupported = {
      id: 'D1',
      severity: 'major' as const,
      evidence: 'direct' as const,
      summary: 'The total is wrong on the summary page.',
    };

    expect(
      messages({ findings: [unsupported], evidence: { direct: 1, inferred: 0, claimed: 0 } }),
      'in a session an unsupported defect claim is the failure mode, not an untidy edge',
    ).toContain('error: D1: no basis given');
    expect(
      auditReport(report({ findings: [unsupported] }))
        .map((problem) => problem.level)
        .join(),
      'outside a session the same gap stays a warning — there the spec can settle it',
    ).not.toContain('error');
  });

  test('should refuse an observation that rests on anything but direct evidence', () => {
    // An observation is something you watched happen. One that is merely inferred is a
    // conclusion wearing an observation's label, which is the confusion this severity
    // exists to prevent.
    expect(
      messages({
        findings: [
          {
            id: 'O9',
            severity: 'observation',
            evidence: 'inferred',
            summary: 'The service probably retries twice before failing.',
          },
        ],
        evidence: { direct: 0, inferred: 1, claimed: 0 },
      }),
      'letting an inferred observation through reopens the gap between seeing and concluding',
    ).toContain('error: O9: an observation is something you saw');
  });

  test('should warn when a session recorded no observations, only conclusions', () => {
    expect(
      messages({
        findings: [
          {
            id: 'Q1',
            severity: 'question',
            evidence: 'claimed',
            summary: 'Is the stock count meant to include reserved items?',
          },
        ],
        evidence: { direct: 0, inferred: 0, claimed: 1 },
      }),
      'a session that wrote nothing down before judging probably judged too early',
    ).toContain('No observations recorded');
  });

  test('should warn when a session raised no questions at all', () => {
    expect(
      messages({
        findings: [
          {
            id: 'O1',
            severity: 'observation',
            evidence: 'direct',
            summary: 'The mini-cart total updated only after a reload.',
          },
        ],
        evidence: { direct: 1, inferred: 0, claimed: 0 },
      }),
      'a session with no questions in it is a session that did not explore',
    ).toContain('No questions raised');
  });

  test('should refuse a charter that names no lenses', () => {
    const { lenses, ...bare } = charter;
    void lenses;

    expect(
      messages({ charter: bare }),
      'a session that names no lens has not decided how it will look, and defaults to one viewpoint',
    ).toContain('no lenses');
  });

  test('should refuse a charter held to a single lens', () => {
    // The defect this rule exists for: two eprimer sessions on 2026-09-20 each held
    // "a careful first-time user" for the whole run, and between them missed every
    // seeded bug in responsiveness, keyboard access, contrast and document head.
    expect(
      messages({ charter: { ...charter, lenses: ['a careful first-time user'] } }),
      'one persona for a whole session is a blindfold, and it must not pass as focus',
    ).toContain('only one lens');
  });

  test('should refuse a session that never declared its pre-flight sweep', () => {
    // The role has always said to run this before the charter. Saying so was not
    // enough: both eprimer runs skipped it and both passed the gate.
    expect(
      messages({ preflight: undefined }),
      'a gate that checks shape but never method cannot tell a swept page from an unswept one',
    ).toContain('No preflight block');
  });

  test('should warn when nothing was proposed for permanent coverage', () => {
    expect(
      messages({ coverage_candidates: [] }),
      'empty is sometimes the honest answer, and it should be a stated one rather than a silence',
    ).toContain('coverage_candidates is empty');
  });

  test('should leave other report kinds alone', () => {
    // The session rules must not leak. A testability report has no charter and no
    // observations by design, and firing on it would teach everyone to ignore them.
    expect(
      auditReport(report({ report: 'testability' }))
        .map((problem) => problem.message)
        .join('\n'),
      'a rule that fires on every document is a rule nobody reads',
    ).not.toMatch(/charter|No questions raised|coverage_candidates/);
  });
});
