import { test, expect } from '@playwright/test';
import { describeScope, type MutationScopeInput } from '../../src/quality/mutation-scope.js';

/**
 * Does `mutate --changed` admit when it checked nothing?
 *
 * The defect these are written against exited 0 on an empty intersection, so the first thing each
 * case asserts is the decision, not the wording. Every case also pins the *other* answer: a test
 * that only checked the could-not-check path would pass against an implementation that refused
 * every input, which is the neighbouring claim this repo keeps catching. Verified by poisoning the
 * module four ways — body throwing, body emptied, always could-not-check, and the original defect
 * restored — and all four turn this file red.
 */
const base: MutationScopeInput = {
  selectedCount: 10,
  totalCount: 160,
  touchedFiles: ['src/file1.ts', 'src/file2.ts'],
  coveredFiles: ['src/file1.ts', 'src/file2.ts'],
};

test.describe('describeScope', () => {
  test('refuses to pass when no mutation covers any changed file', () => {
    const result = describeScope({ ...base, selectedCount: 0, coveredFiles: [] });

    expect(
      result.decision,
      'an empty intersection measured nothing, so it cannot be a pass',
    ).toEqual({ kind: 'could-not-check', reason: 'no-mutation-covers-the-changes', exitCode: 2 });
    expect(result.message, 'says so in words, not only in the exit code').toContain('NOT a pass');
    expect(result.message, 'names the files it could not check').toContain('- src/file2.ts');
  });

  test('distinguishes a clean tree from an uncovered change', () => {
    const result = describeScope({
      selectedCount: 0,
      totalCount: 160,
      touchedFiles: [],
      coveredFiles: [],
    });

    expect(result.decision, 'still not a pass, but a different thing to fix').toEqual({
      kind: 'could-not-check',
      reason: 'nothing-has-changed',
      exitCode: 2,
    });
    expect(result.message, 'the reason a person can act on').toContain('no changed files');
  });

  test('proceeds when every changed file is covered, and claims nothing more', () => {
    const result = describeScope(base);

    expect(result.decision, 'mutations were selected, so the run goes ahead').toEqual({
      kind: 'proceed',
    });
    expect(result.message).toContain('10 of 160 mutation(s)');
    expect(result.message, 'both counts, each named for what it is').toContain(
      'covering 2 of the 2 file(s) you changed',
    );
    expect(result.message, 'nothing is uncovered, so no gap is reported').not.toContain(
      'No mutation covers the other',
    );
  });

  test('reports the covered count and the touched count as different numbers', () => {
    /**
     * The second defect in the same four lines. The old line printed the intersection's size
     * labelled "touched file(s)", so one covered file out of three touched read as "across 1
     * touched file(s)" — the number a reader wanted was absent and the one shown was mislabelled.
     * This asserts both numbers appear with their own names, which is the assertion the first
     * version of this test file got wrong: it pinned `across 1 touched file(s)` and called it
     * "should report covered file count", locking the bug in behind a passing test.
     */
    const result = describeScope({
      ...base,
      selectedCount: 5,
      touchedFiles: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
      coveredFiles: ['src/file1.ts'],
    });

    expect(result.decision).toEqual({ kind: 'proceed' });
    expect(result.message, 'covered and touched are both stated, and are not the same').toContain(
      'covering 1 of the 3 file(s) you changed',
    );
    expect(result.message, 'the mislabelled phrasing is gone').not.toContain('across 1 touched');
    expect(result.message, 'the uncovered remainder is counted').toContain(
      'No mutation covers the other 2 of them',
    );
    expect(result.message, 'and named, so the gap is actionable').toContain('- src/file2.ts');
    expect(result.message).toContain('- src/file3.ts');
  });
});
