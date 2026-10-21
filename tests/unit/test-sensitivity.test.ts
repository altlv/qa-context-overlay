import { test, expect } from '@playwright/test';
import {
  describeSensitivity,
  exportedFunctions,
  breakExport,
  summariseSensitivity,
} from '../../src/quality/test-sensitivity.js';

/**
 * The instrument that asks whether a test can fail for the reason it claims.
 *
 * Built after five tests in one week passed while the thing they named was broken — an unreachable
 * branch whose neighbour was tested, a focus probe tested through the classifier that consumes its
 * boolean, a score whose needles no report could contain, a guard scoped to a population that
 * excluded the broken case, and a live probe that drove a hand-written imitation of the hook it
 * claimed to verify.
 *
 * The body-finding is where this can lie, so that is what most of these tests are about: a poison
 * landing in the wrong place would report a whole module as untested on the strength of an edit
 * nobody can see.
 */

test.describe('finding what a module exports', () => {
  test('should list exported function declarations in source order', () => {
    const source = [
      'export function first(a: string): string {',
      '  return a;',
      '}',
      'function notExported() {}',
      'export async function second(): Promise<void> {}',
    ].join('\n');

    expect(exportedFunctions(source), 'declarations only, and in the order they appear').toEqual([
      'first',
      'second',
    ]);
  });

  test('should not pretend an exported arrow is covered', () => {
    /**
     * An exported `const f = () => …` is deliberately not matched: an arrow body may be an
     * expression rather than a block, and a regex that tried both would mangle one. Reporting it
     * as "nothing to measure" is honest; silently scoring it as clean would not be.
     */
    expect(exportedFunctions('export const f = () => 1;\n')).toEqual([]);
  });
});

test.describe('replacing a body without landing in the wrong place', () => {
  const module = [
    '/** A doc comment with a brace { in it. */',
    'export function target(input: string): string {',
    '  const brace = "a } in a string";',
    '  // another } in a comment',
    '  if (input === brace) {',
    '    return `a } in a template`;',
    '  }',
    '  return input;',
    '}',
    '',
    'export function after(): number {',
    '  return 42;',
    '}',
  ].join('\n');

  test('should count braces past strings, comments and templates', () => {
    const poisoned = breakExport(module, 'target', 'throw')!;

    expect(poisoned, 'the throw replaces the body').toContain(
      'poisoned: nothing should reach this',
    );
    expect(
      poisoned,
      'and the function after it is untouched — a miscounted brace would have eaten it',
    ).toContain('export function after(): number {\n  return 42;\n}');
    expect(poisoned, 'the old body is gone').not.toContain('a } in a string');
  });

  test('should leave the rest of the module byte-identical', () => {
    const poisoned = breakExport(module, 'after', 'empty')!;

    expect(
      poisoned.slice(0, poisoned.indexOf('export function after')),
      'everything before the target is exactly as it was',
    ).toBe(module.slice(0, module.indexOf('export function after')));
  });

  test('should refuse rather than guess when the body cannot be found', () => {
    // Null is the whole safety property: a best-effort edit would report a module as untested on
    // the strength of a change nobody can see.
    expect(breakExport(module, 'missing', 'throw')).toBeNull();
  });

  test('should produce a body that returns undefined for the empty poison', () => {
    const poisoned = breakExport(module, 'after', 'empty')!;

    expect(poisoned, 'no throw — this poison asks a different question').not.toContain('throw');
    expect(poisoned).toContain('poisoned: returns undefined');
  });
});

test.describe('what a verdict means', () => {
  const verdict = (over: Partial<Parameters<typeof describeSensitivity>[0]> = {}) =>
    describeSensitivity({ name: 'f', reached: true, returnMattered: true, skipped: null, ...over });

  test('should name an unreached export as unreached, not as uncovered', () => {
    expect(
      verdict({ reached: false }),
      'this is the branch that was dead code for a commit',
    ).toContain('INSENSITIVE — no test that ran reaches it');
  });

  test('should name the neighbour case, which is the one worth having', () => {
    /**
     * Reached but return-ignored: something calls it and asserts about something else. No single
     * mutation shows this, which is why there are two.
     */
    expect(verdict({ returnMattered: false })).toContain('INSENSITIVE to its return value');
    expect(verdict({ returnMattered: false }), 'and it says what that shape is').toContain(
      'asserting a neighbour',
    );
  });

  test('should call a covered export covered only when both poisons were noticed', () => {
    expect(verdict()).toContain('covered');
  });

  test('should never let a skipped export read as a clean one', () => {
    // The distinction this repository has already got wrong once, in a different tool: an empty
    // report file that read as a report which existed.
    const skipped = verdict({ skipped: 'its body could not be located' });

    expect(skipped).toContain('NOT MEASURED');
    expect(skipped, 'and never the word that would let it pass for a result').not.toContain(
      'covered',
    );
  });
});

test.describe('the summary a person reads', () => {
  test('should separate the three outcomes and shout about what was not measured', () => {
    const lines = summariseSensitivity([
      { name: 'a', reached: true, returnMattered: true, skipped: null },
      { name: 'b', reached: false, returnMattered: false, skipped: null },
      { name: 'c', reached: true, returnMattered: false, skipped: null },
      { name: 'd', reached: false, returnMattered: false, skipped: 'body not found' },
    ]).join(' ');

    expect(lines, 'three measured, not four — the skipped one is not a result').toContain(
      '3 export(s) measured',
    );
    expect(lines).toContain('1 insensitive (never reached)');
    expect(lines).toContain('1 insensitive to its return value');
    expect(lines, 'and the unmeasured one is named, with what it is not').toContain(
      'NOT clean results',
    );
  });
});

test.describe('a return type is not a body', () => {
  /**
   * The bug this instrument shipped with, caught by hand-checking its first real finding.
   *
   * `crawl.ts` has exports whose return type is an inline object type, and prettier puts its
   * closing brace in column zero:
   *
   *     export function parseSitemap(xml: string): {
   *       urls: string[];
   *       isIndex: boolean;
   *     } {
   *
   * Taking the first brace replaced the **type annotation**, which strips away to nothing at
   * runtime, so the function kept working and the tool reported "no test depends on what it
   * returns" for three exports whose tests assert precisely that. It produced three false findings
   * on its first unprepared module and only a hand-check caught them — the same failure the tool
   * exists to catch, one level up.
   */

  const withObjectReturn = [
    'export function parseSitemap(xml: string): {',
    '  urls: string[];',
    '  isIndex: boolean;',
    '} {',
    '  const urls = [xml];',
    '  return { urls, isIndex: false };',
    '}',
  ].join('\n');

  test('should replace the body, not the object return type', () => {
    const poisoned = breakExport(withObjectReturn, 'parseSitemap', 'empty')!;

    expect(poisoned, 'the return type has to survive, or nothing was actually broken').toContain(
      'isIndex: boolean;',
    );
    expect(poisoned, 'and the body has to be gone').not.toContain(
      'return { urls, isIndex: false }',
    );
  });

  test('should handle a generic return type with braces inside it', () => {
    const generic = [
      'export function f(a: string): Promise<{ b: string }> {',
      '  return Promise.resolve({ b: a });',
      '}',
    ].join('\n');

    const poisoned = breakExport(generic, 'f', 'throw')!;

    expect(poisoned, 'the signature is untouched').toContain('Promise<{ b: string }>');
    expect(poisoned, 'the body is replaced').not.toContain('Promise.resolve');
  });

  test('should still handle a plain return type', () => {
    // The case that worked before and must keep working: no type braces at all.
    const plain = 'export function f(): string {\n  return "x";\n}';

    expect(breakExport(plain, 'f', 'empty')!).not.toContain('return "x"');
  });
});
