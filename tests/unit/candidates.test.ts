import { test, expect } from '@playwright/test';
import { analyzeCandidates, formatCandidates } from '../../src/quality/candidates.js';

/**
 * The candidate classifier answers the question that comes before every other check in
 * this repo: which exported units hold behaviour a unit test could pin. The checks matter
 * more than usual here, because the output is a label an agent will act on — a pure method
 * called `not-unit` gets excluded with the class it sits on, which is the exact mistake
 * that left `indexMarkdown` untested in the first real run.
 *
 * The last test pins a limitation rather than a feature. If someone later "fixes" the
 * classifier to follow calls one level down, that test should fail and force the
 * conversation, because the label would then be making a promise it cannot keep.
 */

/** Name and verdict only — the whole classification, not one field of it. */
function shape(source: string, testSources: string[] = []): string[] {
  return analyzeCandidates(source, testSources).map((c) => `${c.name}:${c.kind}`);
}

test.describe('classifying unit test candidates', () => {
  test('calls an exported function that reaches nothing a unit candidate', () => {
    expect(shape('function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };')).toEqual([
      'add:unit',
    ]);
  });

  test('says a function that reads a file is not unit territory', () => {
    const source = [
      "const fs = require('fs');",
      'function load(p) {',
      "  return fs.readFileSync(p, 'utf8');",
      '}',
      'module.exports = { load };',
    ].join('\n');

    // Called `unit`, this would send an agent off to double the filesystem.
    expect(shape(source)).toEqual(['load:not-unit']);
  });

  test('says a function that reads the clock needs control rather than exclusion', () => {
    // The clock does not disqualify a unit — it makes an uncontrolled assertion fail
    // tomorrow. Excluding it would lose real coverage; ignoring it would ship flake.
    expect(
      shape(
        'function stamp() {\n  return new Date().toISOString();\n}\nmodule.exports = { stamp };',
      ),
    ).toEqual(['stamp:needs-control']);
  });

  test('says a function that exits the process is not unit territory', () => {
    expect(
      shape('function bail(code) {\n  process.exit(code);\n}\nmodule.exports = { bail };'),
    ).toEqual(['bail:not-unit']);
  });

  test('ignores a signal that appears only in a comment', () => {
    const source = [
      '// fs.readFileSync is named in this comment and nowhere else.',
      'function double(x) {',
      '  return x * 2;',
      '}',
      'module.exports = { double };',
    ].join('\n');

    // A docblock describing what a module does is not a filesystem call. Without
    // masking, every module that documents its own I/O reports as not-unit.
    expect(shape(source)).toEqual(['double:unit']);
  });

  test('ignores a signal that appears only inside a string', () => {
    const source = [
      'function label() {',
      "  return 'call fetch(url) to get the data';",
      '}',
      'module.exports = { label };',
    ].join('\n');

    expect(shape(source)).toEqual(['label:unit']);
  });

  test('finds every name in a CommonJS export object, including class methods', () => {
    const source = [
      'function alpha() {',
      '  return 1;',
      '}',
      'class Store {',
      '  constructor(root) {',
      '    this.root = root;',
      '  }',
      '  save() {',
      "    fs.writeFileSync(this.root, 'x');",
      '  }',
      '  split(content) {',
      "    return content.split('\\n');",
      '  }',
      '}',
      'module.exports = { alpha, Store };',
    ].join('\n');

    expect(shape(source)).toEqual([
      'alpha:unit',
      'Store:not-unit',
      'Store.constructor:unit',
      'Store.save:not-unit',
      'Store.split:unit',
    ]);
  });

  test('finds named ESM exports', () => {
    const source = [
      'export function parse(text) {',
      '  return text.trim();',
      '}',
      'export const size = (n) => n + 1;',
      'export class Box {',
      '  open() {',
      '    return true;',
      '  }',
      '}',
    ].join('\n');

    expect(shape(source)).toEqual(['parse:unit', 'size:unit', 'Box:unit', 'Box.open:unit']);
  });

  test('does not condemn a pure method because a sibling method does I/O', () => {
    const source = [
      'class Index {',
      '  build() {',
      '    return this.rows();',
      '  }',
      '  rows() {',
      "    return fs.readFileSync('rows.json', 'utf8');",
      '  }',
      '}',
      'module.exports = { Index };',
    ].join('\n');

    // The real failure this prevents: excluding the whole class because one method
    // touches disk, and losing the pure methods beside it.
    expect(shape(source)).toEqual(['Index:not-unit', 'Index.build:unit', 'Index.rows:not-unit']);
  });

  test('reports an exported name it cannot find a declaration for as unknown, not as a verdict', () => {
    // A re-export, a computed name or a value assembled at runtime. Guessing either way
    // would be wrong half the time and confident all of it.
    expect(shape('const value = 42;\nmodule.exports = { mystery: value };')).toEqual([
      'mystery:unknown',
    ]);
  });

  test('marks a symbol a test source names, and leaves the rest unmarked', () => {
    const source = [
      'function add(a, b) {',
      '  return a + b;',
      '}',
      'function unused(x) {',
      '  return x;',
      '}',
      'module.exports = { add, unused };',
    ].join('\n');

    const candidates = analyzeCandidates(source, [
      'test("add", () => { assert.equal(add(1, 2), 3); });',
    ]);
    expect(candidates.map((c) => `${c.name}:${c.referenced}`)).toEqual([
      'add:true',
      'unused:false',
    ]);
  });

  test('finds nothing in a file that exports nothing', () => {
    expect(shape('function helper() {\n  return 1;\n}\n')).toEqual([]);
  });

  test('prints the verdict, the line and the signal that decided it', () => {
    const printed = formatCandidates('src/store.js', [
      {
        name: 'save',
        kind: 'not-unit',
        line: 12,
        signals: [{ kind: 'io', why: 'touches the filesystem', line: 13 }],
        referenced: false,
        detail: 'touches the filesystem',
      },
    ]);

    // Messages on each: with six assertions on one string, a bare failure says
    // "expected substring not found" and leaves the reader to find which part went missing.
    expect(printed, 'the verdict is the first thing a reader scans for').toContain('not-unit');
    expect(printed, 'without the unit name the line is unusable').toContain('save');
    expect(printed, 'the source line is how the unit is found again').toContain('line 12');
    expect(printed, 'the deciding signal has to be visible, not inferred').toContain('io@13');
    expect(printed, 'naming the unreferenced candidates is the actionable half').toContain(
      'not named in any test',
    );
    expect(printed, 'the summary is what tells a reader whether to keep reading').toContain(
      '1 exported unit(s): 0 unit, 0 needs-control, 1 not-unit, 0 unknown',
    );
  });

  test('calls a method whose I/O lives one call away a unit, because it cannot follow the call', () => {
    const source = [
      'class Index {',
      '  build() {',
      '    return this.rows();',
      '  }',
      '  rows() {',
      "    return fs.readFileSync('rows.json', 'utf8');",
      '  }',
      '}',
      'module.exports = { Index };',
    ].join('\n');

    // Deliberately the classifier's blind spot, and the reason its output is a floor
    // rather than a verdict: reach is decided from the symbol's own body, so a pure
    // wrapper around an I/O call is indistinguishable from pure logic.
    const build = analyzeCandidates(source).find((c) => c.name === 'Index.build');
    expect(build?.kind).toBe('unit');
  });
});
