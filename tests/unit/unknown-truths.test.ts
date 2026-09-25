import { test, expect } from '@playwright/test';
import { auditReport, unknownSchema, type Report } from '../../src/qe/report.js';
import { exploratoryTester } from '../../src/agents/roles/exploratory-tester.js';

/**
 * A thing that is true, that the session could not find out.
 *
 * The schema already carried two kinds of absence and this is neither: `not_covered`
 * is "I chose not to look there", `not_run` is "a check that should have run did not".
 * An unknown truth is the third — I looked, there is an answer, and I cannot reach it.
 *
 * Real sessions wrote these into their closing prose, where nothing could count them:
 * "Whether the +$100 reaches payment: cannot test, forbidden." "HONEST LIMIT: my
 * environment blocks that host regardless, so I CANNOT say it 404s for real users."
 */

const session = (unknowns: Report['unknowns']): Report => ({
  report: 'exploratory-session',
  target: 'https://example.test',
  date: '2026-09-25',
  author: 'exploratory-tester',
  confidence: 'high',
  evidence: { direct: 1, inferred: 0, claimed: 0 },
  findings: [],
  not_covered: ['mobile'],
  not_run: [],
  unknowns,
  cases: [],
  coverage_candidates: [],
});

const errors = (report: Report): string[] =>
  auditReport(report)
    .filter((problem) => problem.level === 'error')
    .map((problem) => problem.message);

test.describe('the unknowns section', () => {
  test('should require all three parts, because two of them close nothing', () => {
    const whole = {
      what: 'Whether the surplus survives into the payment total.',
      why: 'Checkout is forbidden by the charter.',
      settled_by: 'A run with payment authorisation.',
    };
    expect(unknownSchema.safeParse(whole).success).toBe(true);
    // "I do not know" is not a finding. "I do not know, and here is what would tell
    // us" is the next session's charter.
    const { settled_by, ...missing } = whole;
    expect(settled_by).toBeTruthy();
    expect(unknownSchema.safeParse(missing).success).toBe(false);
  });

  test('should reject an empty list for a session, as an error not a warning', () => {
    // An empty list claims the run reached every answer that exists. That is almost
    // never true and never checkable from the outside.
    expect(errors(session([]))).toContainEqual(
      expect.stringContaining('claims the session reached every answer'),
    );
  });

  test('should stop complaining once the session says what it could not reach', () => {
    // Narrowed to this rule on purpose: the fixture is minimal and trips the charter,
    // coverage and preflight rules too, which belong to other tests.
    const named = errors(
      session([
        {
          what: 'Whether the phantom surplus survives into the payment total.',
          why: 'Checkout is forbidden by the charter.',
          settled_by: 'A run with payment authorisation, or the order record.',
        },
      ]),
    );
    expect(named.filter((message) => message.includes('reached every answer'))).toEqual([]);
  });
});

test.describe('what the role is told about it', () => {
  test('should separate a wall hit from a choice made', () => {
    const prompt = exploratoryTester.prompt as string;
    expect(prompt).toContain('Name the unknown truths');
    expect(prompt).toContain('an unknown truth is a wall you hit');
  });

  test('should say why a model is worse at this than a person', () => {
    // A human who does not know says so, because being caught guessing costs more.
    // A model asserts it confidently or drops it — and a report that never mentions a
    // question reads exactly like a report that answered it.
    const prompt = exploratoryTester.prompt as string;
    expect(prompt).toMatch(/worse at this than a person/i);
    expect(prompt).toContain('reads exactly like a report that answered it');
  });

  test('should demand what would settle it, not just an admission', () => {
    expect(exploratoryTester.prompt as string).toContain('what would settle it');
  });
});
