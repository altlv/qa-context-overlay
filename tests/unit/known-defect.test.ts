import { test, expect } from '@playwright/test';
import coursera from '../../apps/coursera-rag/app.config.js';
import mcpa from '../../apps/mcpa/app.config.js';
import {
  auditKnownDefects,
  patternMatchesIdiom,
  reportKnownDefects,
} from '../../src/qe/known-defect.js';

/**
 * The gate's rule — a test that does not pass does not pass — makes two opposite outcomes the
 * same colour. Measured on `mcpa`: 34 tests, 33 passing, and the failing one had found a real
 * crash the subject's own suite never covered. The run was failed for its best result.
 *
 * So a stack may declare the marker its own runner uses. These tests cover the half that
 * matters more than the slot: that the slot cannot be used to switch a test off quietly.
 */

const file = (source: string, path = 'test/a.test.mjs') => ({ path, source });
const VITEST = '\\b(?:it|test)\\.fails\\s*\\(';

test.describe('counting the tests a run marked as expected to fail', () => {
  test('should accept a marker that names the defect', () => {
    const audit = auditKnownDefects(
      [
        file(`
        // KNOWN: a message at the route's own ceiling kills the process on stop
        it.fails('delivers a message at the size limit', async () => {});
        it('delivers a smaller one', async () => {});
      `),
      ],
      VITEST,
    );
    expect(audit.markers).toBe(1);
    expect(audit.problems, 'a named defect is the honest use of the slot').toEqual([]);
  });

  test('should refuse a marker that names nothing', () => {
    // Without this the slot is simply a way to make a red test green, which non-negotiable 4
    // forbids and which nothing else in the gate could tell from honest use.
    const audit = auditKnownDefects(
      [file("it.fails('delivers a message', async () => {});")],
      VITEST,
    );
    expect(audit.problems, 'an unnamed marker must be refused, not counted').toHaveLength(1);
    expect(
      audit.problems[0],
      'and the refusal must say why, to the person reading a red gate',
    ).toContain('switched off to go green');
  });

  test('should say the count out loud even when every marker is named', () => {
    // A green suite holding three of these is not a green suite. A step that reported nothing
    // would hide exactly what it was added to surface.
    const audit = auditKnownDefects(
      [
        file(`
        // KNOWN: one
        it.fails('a', async () => {});
        // KNOWN: two
        it.fails('b', async () => {});
      `),
      ],
      VITEST,
    );
    expect(audit.problems).toEqual([]);
    expect(reportKnownDefects(audit).join('\n'), 'the number is the point').toContain(
      '2 known defect(s) recorded, which is not the same as green',
    );
  });

  test('should add nothing where a run used the slot not at all', () => {
    const audit = auditKnownDefects([file("it('a', async () => {});")], VITEST);
    expect(audit.markers).toBe(0);
    expect(reportKnownDefects(audit), 'no markers, no noise').toEqual([]);
  });

  test('should count nothing where the stack declares no idiom', () => {
    // Not a guess at a dialect. A stack that has not said how it records a known defect has
    // no known defects to find, and a role is told to leave the suite red instead.
    const audit = auditKnownDefects([file("it.fails('a', async () => {});")], undefined);
    expect(audit.markers, 'a dialect nobody declared is not searched for').toBe(0);
    expect(audit.problems, 'and nothing is refused for a slot the stack does not offer').toEqual(
      [],
    );
  });

  test('should report a pattern that does not compile as a harness fault', () => {
    // The dangerous reading is "no markers found". The stack said it has an idiom, so a
    // failure to look for it must not come back as a clean bill.
    const audit = auditKnownDefects([file("it.fails('a', async () => {});")], '([a-z');
    expect(audit.problems.join(' '), 'said as a harness fault, not as a clean count').toContain(
      'could not be counted at all',
    );
  });

  test('should attribute each count to its own file', () => {
    const audit = auditKnownDefects(
      [
        file('// KNOWN: x\nit.fails("a", async () => {});', 'test/one.test.mjs'),
        file('it("b", async () => {});', 'test/two.test.mjs'),
      ],
      VITEST,
    );
    expect(
      audit.perFile.map((entry) => [entry.path, entry.markers]),
      'a count nobody can place is a count nobody acts on',
    ).toEqual([
      ['test/one.test.mjs', 1],
      ['test/two.test.mjs', 0],
    ]);
  });
});

test.describe('the two fields a stack declares about its marker', () => {
  /**
   * The idiom is prose for the role's prompt; the pattern is what the gate counts with. Two
   * fields that must agree are a drift risk, and the answer is to check rather than trust —
   * a pattern matching nothing in its own idiom would count zero markers for ever and report
   * a clean bill it never measured.
   */
  for (const config of [mcpa, coursera]) {
    test(`should agree with each other for ${config.name}`, () => {
      const stack = config.testStack;
      expect(stack, `${config.name} declares a test stack`).toBeDefined();
      const { knownDefect, knownDefectPattern } = stack!;
      expect(
        knownDefect === undefined,
        'a stack declares both halves of the marker or neither',
      ).toBe(knownDefectPattern === undefined);
      if (knownDefect === undefined || knownDefectPattern === undefined) return;
      expect(
        patternMatchesIdiom(knownDefectPattern, knownDefect),
        `${config.name}'s knownDefectPattern must match its own knownDefect idiom — ` +
          'editing one without the other would silence the audit',
      ).toBe(true);
      expect(
        /KNOWN:/.test(knownDefect),
        'the idiom must show the role where the defect name goes, or the audit refuses every use',
      ).toBe(true);
    });
  }
});
