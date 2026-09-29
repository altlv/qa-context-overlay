import { test, expect } from '@playwright/test';
import { briefCoverage, coverageGap, parseSurvivors } from '../../src/qe/coverage-briefing.js';

/**
 * The gate scores a coder's file against a mutation set after it is written, which makes
 * the number a verdict. The same measurement taken first is direction.
 *
 * Proven by hand: integration-coder chose its own targets and killed 8 of 14; told the
 * survivors as plain sentences it killed 11 of 14 with 23 tests instead of 34. The
 * information was worth three mutations and a third of the suite size, and the only
 * reason the role lacked it is that nobody passed it on.
 */

const set = [
  {
    file: 'src/routes/labs.js',
    find: 'a',
    replace: 'b',
    breaks: 'a pending lab is refused with 409',
  },
  { file: 'src/routes/labs.js', find: 'c', replace: 'd', breaks: 'the transcript is capped' },
  {
    file: 'src/routes/labs.js',
    find: 'e',
    replace: 'f',
    breaks: 'a dead stdio session is refused',
  },
];

test.describe('the gap in what already exists', () => {
  test('should count what the baseline defends, not only what it misses', () => {
    const gap = coverageGap('test/labs-routes.test.js', set, ['the transcript is capped']);
    expect(gap.killed, 'a briefing that is only bad news reads as a complaint, not direction').toBe(
      2,
    );
    expect(gap.total).toBe(3);
    expect(gap.undefended).toEqual(['the transcript is capped']);
  });

  test('should drop a survivor the set no longer contains', () => {
    // A stale line would send the role at a rule that is not there, and it would find
    // nothing and conclude the fault was its own.
    const gap = coverageGap('t.js', set, ['a rule deleted last week']);
    expect(gap.undefended, 'a survivor with no mutation behind it is not evidence').toEqual([]);
  });
});

test.describe('what the role is told', () => {
  test('should name each undefended rule as behaviour', () => {
    const text = briefCoverage(
      coverageGap('test/labs-routes.test.js', set, ['the transcript is capped']),
    );
    expect(text).toContain('- the transcript is capped');
    expect(text, 'the baseline must be named, or "existing tests" means nothing').toContain(
      'test/labs-routes.test.js',
    );
  });

  test('should never mention mutations, so the role serves the seam not the instrument', () => {
    // Naming the mutation would teach it to satisfy the measurement, and the measurement
    // would then be measuring itself.
    const text = briefCoverage(coverageGap('t.js', set, ['the transcript is capped']));
    expect(
      text.toLowerCase(),
      'a role told which mutations survive learns to satisfy the instrument, and the instrument is then measuring itself',
    ).not.toContain('mutant');
    expect(text.toLowerCase()).not.toContain('survivor');
  });

  test('should invite a reachability answer instead of a pretend test', () => {
    // One of the six named by hand turned out unreachable from any input the seam takes,
    // and saying so was worth more than a test would have been.
    const text = briefCoverage(coverageGap('t.js', set, ['a pending lab is refused with 409']));
    expect(text).toContain('cannot be reached');
  });

  test('should say nothing when the baseline catches everything', () => {
    expect(
      briefCoverage(coverageGap('t.js', set, [])),
      'inventing work is worse than silence',
    ).toBe('');
  });

  test('should say nothing when nothing was measured', () => {
    // "No known gaps" when nothing looked is a verification that cannot fail reporting
    // as checked — the failure this repository keeps meeting.
    expect(briefCoverage(null)).toBe('');
  });
});

test.describe('reading the comparator back', () => {
  // Parsed rather than recomputed: the comparator mutates a real checkout and restores
  // it, and reimplementing that loop here would mean owning the restore hazard twice.
  const output = [
    'survivors (suite): 4/14 killed',
    '  survived: a message must declare jsonrpc 2.0',
    '  survived: the transcript is capped at MAX_LOG_ENTRIES',
    '',
    'Comparator: 4/14 killed by the suite, 10 survivor(s).',
  ].join('\n');

  test('should take every rule the suite left alive', () => {
    expect(
      parseSurvivors(output),
      'a survivor missed here is a gap the role is never told about',
    ).toEqual([
      'a message must declare jsonrpc 2.0',
      'the transcript is capped at MAX_LOG_ENTRIES',
    ]);
  });

  test('should not mistake the summary lines for survivors', () => {
    expect(parseSurvivors(output).some((rule) => rule.includes('killed'))).toBe(false);
  });

  test('should find nothing in output that scored nothing', () => {
    // A failed measurement must brief nothing rather than invent a clean bill of health.
    expect(parseSurvivors('The suite fails before any mutation.')).toEqual([]);
  });
});
