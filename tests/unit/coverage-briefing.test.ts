import { test, expect } from '@playwright/test';
import { briefCoverage, coverageGap } from '../../src/qe/coverage-briefing.js';

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
