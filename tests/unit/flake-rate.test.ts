import { test, expect } from '@playwright/test';
import {
  flakeRates,
  reportRates,
  unreliableInRun,
  type RunReport,
} from '../../src/qe/flake-rate.js';

/**
 * The release gate reports flakes **within one run**, which is the right thing to say while
 * judging. This answers what it cannot: how often, and is it getting better.
 *
 * Nothing could answer that before, because nothing archived runs — two sat on disk, both from
 * one day in September, against a `KEEP` of twenty. So the rate is new and the history it reads
 * is still a floor, which is the first thing the report prints.
 */

const run = (name: string, tests: Record<string, string[]>): RunReport => ({
  name,
  tests: Object.entries(tests).map(([title, statuses]) => ({ title, statuses })),
});

test.describe('whether one run was unreliable', () => {
  test('should call a first-time pass reliable', () => {
    expect(unreliableInRun(['passed'])).toBe(false);
  });

  test('should call a retry unreliable', () => {
    expect(
      unreliableInRun(['failed', 'passed']),
      'a test that needed a retry is not evidence',
    ).toBe(true);
  });

  test('should count an outright failure too', () => {
    // Deliberate. This measures whether a test can be trusted, and keeping a consistent failure
    // apart would need a reason to treat it as more trustworthy than an inconsistent one.
    expect(unreliableInRun(['failed'])).toBe(true);
  });

  test('should ignore a skipped test entirely', () => {
    expect(unreliableInRun(['skipped']), 'it neither ran nor refused to').toBe(false);
    expect(unreliableInRun([]), 'and a test with no attempts recorded is not a failure').toBe(
      false,
    );
  });
});

test.describe('a rate across runs', () => {
  const reports = [
    run('r1', { steady: ['passed'], shaky: ['failed', 'passed'], broken: ['failed'] }),
    run('r2', { steady: ['passed'], shaky: ['passed'], broken: ['failed'] }),
    run('r3', { steady: ['passed'], shaky: ['passed'], broken: ['failed'] }),
  ];

  test('should divide unreliable runs by runs the test appeared in', () => {
    const rates = flakeRates(reports);
    expect(rates.map((entry) => [entry.title, entry.unreliable, entry.runs])).toEqual([
      ['broken', 3, 3],
      ['shaky', 1, 3],
    ]);
    expect(rates[1]?.rate, 'one run in three').toBeCloseTo(1 / 3);
  });

  test('should leave out a test that was never unreliable', () => {
    expect(
      flakeRates(reports).map((entry) => entry.title),
      'a clean test in a list of problems is noise',
    ).not.toContain('steady');
  });

  test('should name the most recent run a test was unreliable in', () => {
    // What makes the number actionable: the next question is always "what changed then".
    expect(flakeRates(reports).find((entry) => entry.title === 'shaky')?.lastSeen).toBe('r1');
  });

  test('should rank a well-evidenced problem above a noisier one', () => {
    // Half of twenty outranks one of one, which has the higher rate and almost no evidence.
    const many = Array.from({ length: 20 }, (_, index) =>
      run(`r${index}`, { often: index % 2 === 0 ? ['failed'] : ['passed'] }),
    );
    const rates = flakeRates([...many, run('once', { rare: ['failed'] })]);
    expect(rates.map((entry) => entry.title)).toEqual(['rare', 'often']);
    expect(
      rates[0]?.runs,
      'the 100% entry rests on a single run, which is why the report says the sample size first',
    ).toBe(1);
  });
});

test.describe('what the report refuses to imply', () => {
  test('should say there is no rate rather than a clean bill when nothing is archived', () => {
    const lines = reportRates([], []).join('\n');
    expect(lines, 'no history is not stability').toContain('not a clean bill');
  });

  test('should warn that a handful of runs is not a rate', () => {
    const lines = reportRates([run('r1', { a: ['passed'] })], []).join('\n');
    expect(lines, 'the denominator comes before the figures').toContain('too few to call a rate');
  });

  test('should refuse to call a quiet archive a promise of stability', () => {
    // The case that matters most, because it is the flattering one: every archived run green,
    // and a one-in-twenty flake invisible in all of them.
    const lines = reportRates(
      [run('r1', { a: ['passed'] }), run('r2', { a: ['passed'] })],
      [],
    ).join('\n');
    expect(lines).toContain('No test was unreliable');
    expect(lines, 'and must immediately say what that does not mean').toContain(
      'not a promise of stability',
    );
  });
});
