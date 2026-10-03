import { test, expect } from '@playwright/test';
import { auditKnownDefects } from '../../src/qe/known-defect.js';
import { controlSignature, normaliseName, stateKey } from '../../src/qe/state-model.js';
import { coverageGap, holdoutPower } from '../../src/qe/coverage-briefing.js';
import { newSurvivors, summarise } from '../../src/qe/mutation-compare.js';
import { selectorBlindSpots, parseAriaSnapshot } from '../../src/tools/aria.js';
import { reportFrames } from '../../src/tools/frames.js';

/**
 * Can each instrument produce the **opposite** answer?
 *
 * Every other test here asks whether a measurement is right. These ask something weaker and,
 * on the evidence, more urgent: whether the thing doing the measuring is capable of disagreeing
 * with itself at all. An instrument that can only ever return one verdict reports that verdict
 * confidently, and nothing downstream can tell it from a finding.
 *
 * Written because five mistakes of exactly that shape were made in a single session on
 * 2026-10-02, and only one was caught by a mechanism rather than by going back and re-checking:
 *
 * - a `Candidate` wrapper passed where a `Fingerprint` was wanted, which collapses every
 *   signature to four pipe characters, makes **any** two state keys equal, and produced a
 *   retracted finding that polymer-shop's pages were told apart by URL alone
 * - a light-DOM-only `querySelectorAll` standing in for the shadow-piercing sweep the harness
 *   actually uses, which reported a Web Components storefront as invisible to it
 * - a substring match against a JSON blob standing in for a selector match
 * - a write to an already-destroyed stream standing in for a write still draining, which nearly
 *   recorded a real crash as nonexistent
 * - a `sed` range that could not contain the section it was used to prove absent
 *
 * `PLAN.md` carries the rule — before believing a measurement, check the instrument can produce
 * the opposite result. This file is that rule as a mechanism rather than a resolution, and it is
 * the same idea as `gate-poison.ts`, which proves each gate step can fail, generalised to the
 * measurements the gate is built on.
 *
 * **A test here failing means an instrument has gone blind**, not that a page or a subject
 * changed. New measurement helpers belong here on the day they are written.
 */

test.describe('a state key must be able to differ', () => {
  const control = (over: Record<string, unknown> = {}) =>
    ({ tag: 'button', role: 'button', name: 'Pay', type: null, fieldName: null, ...over }) as never;

  test('should distinguish two screens at the same URL', () => {
    /**
     * **The same URL on purpose.** The first version of this test used two different URLs, and
     * `stateKey` begins with the URL — so it passed while `controlSignature` was deliberately
     * poisoned to return `||||`, which is the exact bug it was written to catch. A liveness test
     * that cannot fail for its own case is the thing this file exists to prevent, and it took
     * poisoning the instrument to notice.
     *
     * One URL and different controls is also the real case: a modal opening, a menu expanding,
     * a drawer sliding in. Those are the states the signature half is the only thing that can
     * tell apart.
     */
    const closed = stateKey({ url: 'http://x/a', fingerprints: [control()] } as never);
    const open = stateKey({
      url: 'http://x/a',
      fingerprints: [control(), control({ name: 'Cancel' })],
    } as never);
    expect(
      closed,
      'a key that cannot differ within one URL makes every screen one screen',
    ).not.toBe(open);
  });

  test('should produce a signature with content in it, not a row of separators', () => {
    const signature = controlSignature(control());
    expect(signature, 'the fields must actually arrive').toContain('button');
    expect(
      signature.replace(/\|/g, ''),
      'four pipes and nothing else is what a wrong-shaped input looks like',
    ).not.toBe('');
  });

  test('should keep a name that distinguishes and drop one that only counts', () => {
    // Both directions, because normalising too hard hides screens and that is the worse error.
    expect(normaliseName('Shopping cart: 0 items')).toBe(normaliseName('Shopping cart: 12 items'));
    expect(normaliseName('Add to cart'), 'two different controls must not fold into one').not.toBe(
      normaliseName('Remove from cart'),
    );
  });
});

test.describe('a coverage briefing must be able to say both things', () => {
  const set = [
    { file: 'a.js', find: 'a', replace: 'b', breaks: 'rule one' },
    { file: 'a.js', find: 'c', replace: 'd', breaks: 'rule two' },
  ];

  test('should report a gap when there is one and none when there is not', () => {
    expect(coverageGap('t', set, ['rule one'])?.undefended, 'a gap must be reportable').toEqual([
      'rule one',
    ]);
    expect(coverageGap('t', set, [])?.undefended, 'and so must its absence').toEqual([]);
  });

  test('should tell a failed measurement from a clean one', () => {
    // The live bug this encodes: a module namespace passed where an array was wanted read as an
    // empty set, and a suite leaving ten of fourteen alive was reported as defending everything.
    expect(
      coverageGap('t', [], ['rule one']),
      'nothing measured must not read as nothing wrong',
    ).toBeNull();
  });

  test('should rate a holdout as both working and useless', () => {
    const split = [...set, { ...set[0]!, breaks: 'held', holdout: true }];
    expect(holdoutPower(split, ['held'])).toEqual({ live: 1, total: 1 });
    expect(
      holdoutPower(split, ['rule one']),
      'a holdout can measure nothing, and must say so',
    ).toEqual({ live: 0, total: 1 });
  });
});

test.describe('a mutation score must be able to move', () => {
  const outcome = (breaks: string, killed: boolean) =>
    ({ file: 'a.js', find: 'a', replace: 'b', breaks, killed }) as never;

  test('should count a kill and a survival differently', () => {
    expect(summarise([outcome('one', true), outcome('two', false)])).toEqual({
      killed: 1,
      total: 2,
      survivors: ['two'],
    });
  });

  test('should detect a weakening and also its absence', () => {
    expect(newSurvivors(['a'], ['a', 'b']), 'a regression must be findable').toEqual(['b']);
    expect(newSurvivors(['a', 'b'], ['a']), 'and a improvement must not read as one').toEqual([]);
  });
});

test.describe('the page-reading instruments must be able to find and to miss', () => {
  test('should report a blind spot and also report none', () => {
    const widget = { role: 'option', name: 'One', states: [], text: null, depth: 0 };
    expect(selectorBlindSpots([], [widget]), 'something must be findable').toHaveLength(1);
    expect(
      selectorBlindSpots([{ role: 'option', name: 'One' }], [widget]),
      'and an agreement must not read as a gap',
    ).toHaveLength(0);
  });

  test('should parse a real node and refuse a line it cannot read', () => {
    expect(
      parseAriaSnapshot('- button "Pay"').nodes,
      'the parser must actually parse',
    ).toHaveLength(1);
    expect(
      parseAriaSnapshot('- !!! nonsense').unparsed,
      'and must count what it could not, never discard it',
    ).toBe(1);
  });

  test('should tell an unread frame from an empty one', () => {
    const base = { selector: "frameLocator('#f')", addressable: true, url: 'http://x/f' };
    const empty = { ...base, widgets: [], announcements: [], unreadable: 0, failure: null };
    const unread = { ...base, widgets: [], announcements: [], unreadable: 0, failure: 'timed out' };
    expect(reportFrames([unread]).join('\n'), 'an unread frame must say so').toContain(
      'COULD NOT READ',
    );
    expect(
      reportFrames([empty]).join('\n'),
      'and an empty one must not claim a failure it did not have',
    ).not.toContain('COULD NOT READ');
  });

  test('should refuse an unnamed known-defect marker and accept a named one', () => {
    const pattern = '\\b(?:it|test)\\.fails\\s*\\(';
    expect(
      auditKnownDefects([{ path: 'a.test.mjs', source: "it.fails('x', () => {});" }], pattern)
        .problems,
      'the audit must be able to refuse',
    ).toHaveLength(1);
    expect(
      auditKnownDefects(
        [{ path: 'a.test.mjs', source: "// KNOWN: broken\nit.fails('x', () => {});" }],
        pattern,
      ).problems,
      'and must be able to pass, or it is a step people route around',
    ).toHaveLength(0);
  });
});
