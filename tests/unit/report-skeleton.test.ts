import { test, expect } from '@playwright/test';
import { auditReport, parseReport } from '../../src/qe/report.js';
import { reportSkeleton } from '../../src/qe/report-skeleton.js';

/**
 * The skeleton's whole value is that it passes the gate, so the test is the gate.
 *
 * **What it is for.** Sessions get the schema wrong because they write it from memory. Measured
 * across the reports this harness has kept: 29 total, 19 parse, 3 are prose, 7 are empty files.
 * And on 2026-10-11 the first session told to report early did write a file at ~230 seconds — with
 * `charter` as a prose block where the schema wants an object, `preflight` as a list of
 * `{check, status, note}` where it wants six named keys, `unknowns` as strings, and `report`,
 * `target`, `date`, `author`, `confidence` and `evidence` missing. Sixteen errors. The
 * webtestingcourse session had *read* `docs/report-format.md` and still produced a different
 * shape: a description of a schema is not a schema.
 *
 * So this asserts the only property that matters — **`auditReport` returns no error** — rather
 * than asserting the text of fields, which would be a copy of the generator written twice. If the
 * format gains a required field, this fails, which is correct: the skeleton is wrong the moment the
 * schema moves.
 */

const input = {
  target: 'https://shop.polymer-project.org (test)',
  author: 'exploratory-tester',
  date: '2026-10-11',
};

test.describe('the empty report a session can start from', () => {
  test('should pass the gate with no errors', () => {
    const parsed = parseReport(reportSkeleton(input));
    expect(parsed.ok, 'a skeleton that does not parse is the bug it exists to prevent').toBe(true);
    if (!parsed.ok) return;

    const errors = auditReport(parsed.report).filter((problem) => problem.level === 'error');

    expect(
      errors.map((problem) => problem.message),
      'every required block is something a session knows before it explores, so none may be absent',
    ).toEqual([]);
  });

  test('should still warn about what it has not done', () => {
    /**
     * The other half, and the reason this is not just "make the gate shut up". A skeleton is an
     * empty report, and the gate should say so: no observations, no questions. A skeleton that drew
     * no warnings would be one that had claimed to have explored.
     */
    const parsed = parseReport(reportSkeleton(input));
    if (!parsed.ok) throw new Error('skeleton must parse');

    const warnings = auditReport(parsed.report).filter((problem) => problem.level === 'warning');

    expect(
      warnings.length,
      'an empty report that looks complete would be worse than no skeleton at all',
    ).toBeGreaterThan(0);
  });

  test('should carry the charter the caller was given', () => {
    const written = reportSkeleton({ ...input, explore: 'the cart', timebox: '7 minutes' });

    expect(written, 'the charter the operator wrote, not one the skeleton invented').toContain(
      'explore: the cart',
    );
    expect(written).toContain('timebox: 7 minutes');
  });

  test('should mark what it does not know rather than inventing it', () => {
    // A skeleton that filled `to_discover` with something plausible would be a charter nobody
    // chose, and the session would inherit it without noticing.
    const written = reportSkeleton(input);

    expect(written, 'the placeholder has to be unmistakable in a finished report').toContain(
      'TODO — replace before this report is read as finished',
    );
  });

  test('should declare every coverage dimension as a gap rather than omitting one', () => {
    /**
     * The failure this guards is specific and the format says it outright: an unmentioned
     * dimension reads afterwards as one that was fine. A skeleton that left `security` out would
     * be a session silently claiming to have looked.
     */
    const written = reportSkeleton(input);

    for (const dimension of [
      'rules',
      'inputs',
      'state',
      'data',
      'accessibility',
      'platform',
      'content',
      'performance',
      'security',
      'techniques',
    ]) {
      expect(written, `${dimension} must be accounted for, even as a gap`).toContain(
        `${dimension}:`,
      );
    }
  });
});
