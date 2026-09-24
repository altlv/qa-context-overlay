import { test, expect } from '@playwright/test';
import {
  buildRepoMap,
  extractSpecifiers,
  formatRepoMap,
  isLocalSpecifier,
  parseSurveyArgs,
  resolveSpecifier,
  scopeOf,
  type SourceFile,
} from '../../src/quality/repomap.js';

/**
 * The repo map is what an agent reads instead of the tree, so a wrong edge sends a test to
 * the wrong file and a missing one hides the caller a change puts at risk.
 *
 * Four tests here are regressions from building it, each of which produced confident wrong
 * output rather than an error: an absent flag swallowing the path argument, quotes inside a
 * regex literal read as string delimiters, leading `..` dropped in path normalisation, and
 * a whitespace capture reported as an import. They are kept because the failure mode is
 * silence, and silence is what a green suite cannot catch.
 */

function file(path: string, text: string): SourceFile {
  return { path, text };
}

/** An `exists` over a set of paths, so resolution can be tested without a filesystem. */
function onDisk(paths: string[]): (path: string) => boolean {
  const known = new Set(paths);
  return (path) => known.has(path);
}

test.describe('extracting imports', () => {
  test('finds every form of local import', () => {
    const source = [
      "const a = require('./a');",
      "import b from './b.js';",
      "import './c.css';",
      "export { d } from './d.js';",
      "const e = await import('./e.js');",
    ].join('\n');

    // Sorted because the order specifiers come back in is an implementation detail — the
    // map sorts its own edges — and asserting it would fail the first time the patterns
    // are reorganised, for no behavioural reason.
    expect(extractSpecifiers(source).sort()).toEqual([
      './a',
      './b.js',
      './c.css',
      './d.js',
      './e.js',
    ]);
  });

  test('ignores an import that is only commented out', () => {
    const source = [
      "// const gone = require('./gone');",
      '/*',
      "import alsoGone from './also-gone.js';",
      '*/',
      "const kept = require('./kept');",
    ].join('\n');

    // A commented-out import reported as an edge is how a map grows a dependency that
    // does not exist, and how a reader stops trusting the rest of it.
    expect(extractSpecifiers(source)).toEqual(['./kept']);
  });

  test('invents no import from the quote characters inside a regex literal', () => {
    const source = [
      'const PATTERN = /[\'"]([^\'"]+)[\'"]/g;',
      "const real = require('./real');",
      'const WIDER = /\\bimport\\s+from\\s*[\'"]([^\'"]+)[\'"]/g;',
    ].join('\n');

    // The masker reads a quote as a string delimiter, and a regex literal is full of them.
    // Before this was bounded, everything after such a line was read as string content and
    // the file produced garbage for itself. A specifier never contains whitespace either.
    expect(extractSpecifiers(source)).toEqual(['./real']);
  });

  test('separates a local specifier from a package', () => {
    expect([
      isLocalSpecifier('./a'),
      isLocalSpecifier('../b'),
      isLocalSpecifier('node:fs'),
      isLocalSpecifier('@playwright/test'),
    ]).toEqual([true, true, false, false]);
  });
});

test.describe('resolving a specifier', () => {
  test('resolves an extensionless specifier to the file on disk', () => {
    expect(resolveSpecifier('src/a.ts', './b', onDisk(['src/b.ts']))).toBe('src/b.ts');
  });

  test('swaps a .js specifier for the .ts source beside it', () => {
    // NodeNext ESM: this repo imports './assertions.js' from a .ts file. Without the swap,
    // every internal edge in the harness's own source would report as broken.
    expect(
      resolveSpecifier(
        'src/quality/a.ts',
        './assertions.js',
        onDisk(['src/quality/assertions.ts']),
      ),
    ).toBe('src/quality/assertions.ts');
  });

  test('returns null when nothing on disk matches', () => {
    expect(resolveSpecifier('src/a.ts', './ghost', onDisk(['src/b.ts']))).toBeNull();
  });

  test('resolves a leading .. rather than dropping it', () => {
    // Regression: normalise popped '..' off an empty stack, so a specifier climbing out of
    // the scanned root pointed at a file that was never there.
    expect(
      resolveSpecifier('src/cli/a.ts', '../../apps/registry.js', onDisk(['apps/registry.ts'])),
    ).toBe('apps/registry.ts');
  });
});

test.describe('building the map', () => {
  test('records an edge and the reverse edge', () => {
    const map = buildRepoMap(
      [
        file('src/a.ts', "import { x } from './b.js';\nexport const y = x;"),
        file('src/b.ts', 'export const x = 1;'),
      ],
      [],
    );

    const a = map.files.find((f) => f.path === 'src/a.ts');
    const b = map.files.find((f) => f.path === 'src/b.ts');
    expect(a?.imports, 'the dependency has to be recorded forwards').toEqual(['src/b.ts']);
    expect(b?.importedBy, 'and backwards, or a change cannot find its callers').toEqual([
      'src/a.ts',
    ]);
  });

  test('distinguishes a test that imports a file from one that only names it', () => {
    const map = buildRepoMap(
      [file('src/store.ts', 'export const store = 1;')],
      [
        file('tests/store.test.ts', "import { store } from '../src/store.js';"),
        file('tests/notes.test.ts', '// the store module is exercised elsewhere'),
      ],
    );

    const store = map.files[0];
    expect(store?.testedBy, 'an import is the evidence').toEqual(['tests/store.test.ts']);
    expect(store?.mentionedBy, 'a mention is weaker and must be labelled as such').toEqual([
      'tests/notes.test.ts',
    ]);
  });

  test('lists a file no test points at as a gap', () => {
    const map = buildRepoMap([file('src/orphan.ts', 'export const x = 1;')], []);

    expect(map.gaps.map((gap) => gap.path)).toEqual(['src/orphan.ts']);
  });

  test('separates an import of a real file outside the roots from a broken path', () => {
    const map = buildRepoMap(
      [file('src/a.ts', "require('./outside');\nrequire('./missing');")],
      [],
      onDisk(['src/outside.ts']),
    );

    // Both came back as "resolved to nothing" before, which reported three real
    // cross-directory imports in this repo's own source as broken links.
    expect(map.files[0]?.outside, 'a real file outside the scanned roots').toEqual(['./outside']);
    expect(map.files[0]?.unresolved, 'a path that points at nothing at all').toEqual(['./missing']);
  });
});

test.describe('scoping to a change', () => {
  test('returns the changed files with one hop in each direction', () => {
    const map = buildRepoMap(
      [
        file('src/caller.ts', "import './middle.js';"),
        file('src/middle.ts', "import './callee.js';\nexport const m = 1;"),
        file('src/callee.ts', 'export const c = 1;'),
        file('src/unrelated.ts', 'export const u = 1;'),
      ],
      [],
    );

    const scope = scopeOf(map, ['src/middle.ts']);
    expect(scope.changed, 'the work itself').toEqual(['src/middle.ts']);
    expect(scope.callers, 'who a change puts at risk').toEqual(['src/caller.ts']);
    expect(scope.callees, 'what it depends on').toEqual(['src/callee.ts']);
  });

  test('prints the scope header and the limits of the graph', () => {
    const map = buildRepoMap([file('src/a.ts', "import './b.js';"), file('src/b.ts', '')], []);
    const printed = formatRepoMap(map, scopeOf(map, ['src/a.ts']));

    expect(printed, 'the reader has to know what was scoped').toContain('Scope: 1 changed');
    expect(printed, 'a graph read as a call graph is worse than no graph').toContain(
      'Imports are not calls',
    );
  });
});

test.describe('parsing the survey arguments', () => {
  test('keeps a path when no flag precedes it', () => {
    // Regression, and the worst kind: `indexOf` returns -1 for an absent flag, and
    // -1 + 1 = 0 marked the first path as consumed, so `survey <path>` mapped the current
    // directory and reported success.
    const parsed = parseSurveyArgs(['src/quality']);
    expect(parsed.roots).toEqual(['src/quality']);
  });

  test('reads each flag and leaves the paths alone', () => {
    const parsed = parseSurveyArgs([
      'src',
      '--tests',
      'tests',
      '--changed',
      'main',
      '--save',
      'm.json',
    ]);

    expect(parsed, 'every flag has to land somewhere').toEqual({
      roots: ['src'],
      tests: 'tests',
      changed: 'main',
      save: 'm.json',
    });
  });

  test('reports the flags as absent when they are absent', () => {
    expect(parseSurveyArgs(['src'])).toEqual({
      roots: ['src'],
      tests: null,
      changed: null,
      save: null,
    });
  });
});
