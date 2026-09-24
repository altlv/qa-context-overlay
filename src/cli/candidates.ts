import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { analyzeCandidates, formatCandidates, type Candidate } from '../quality/candidates.js';

/**
 * Which exported units are unit-test candidates, and which are not.
 *
 * Usage:
 *   npm run candidates -- <path>            a file or a directory of source
 *   npm run candidates -- src --tests test  where the tests that might name them live
 *
 * Advisory by design: it exits 0 whatever it finds. It maps the ground, and the decision
 * to test, to move the check up a level, or to leave it alone is the reader's.
 */

const SOURCE = /\.[cm]?[jt]s$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]s$/;
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

async function collect(root: string, wanted: (name: string) => boolean): Promise<string[]> {
  const info = await stat(root).catch(() => null);
  if (info === null) return [];
  if (info.isFile()) return wanted(root) ? [root] : [];

  const entries = await readdir(root, { withFileTypes: true });
  const found = await Promise.all(
    entries
      .filter((entry) => !SKIP.has(entry.name))
      .map((entry) => {
        const full = join(root, entry.name);
        if (entry.isDirectory()) return collect(full, wanted);
        return Promise.resolve(wanted(entry.name) ? [full] : []);
      }),
  );
  return found.flat();
}

const argv = process.argv.slice(2);
const testsFlag = argv.indexOf('--tests');
const testRoots = testsFlag >= 0 ? [argv[testsFlag + 1] ?? ''] : ['test', 'tests'];
const roots = argv.filter((arg, i) => !arg.startsWith('--') && i !== testsFlag + 1);

const sources = (
  await Promise.all(
    (roots.length > 0 ? roots : ['src']).map((root) =>
      collect(resolve(root), (name) => SOURCE.test(name) && !TEST_FILE.test(name)),
    ),
  )
)
  .flat()
  .sort();

const testSources = (
  await Promise.all(
    testRoots.map(async (root) => {
      const files = await collect(resolve(root), (name) => TEST_FILE.test(name));
      return Promise.all(files.map((file) => readFile(file, 'utf8')));
    }),
  )
)
  .flat()
  .filter((text) => text.length > 0);

if (sources.length === 0) {
  console.error('No source files found. Name a file or a directory.');
  process.exit(2);
}

const all: Candidate[] = [];
for (const file of sources) {
  const candidates = analyzeCandidates(await readFile(file, 'utf8'), testSources);
  if (candidates.length === 0) continue;
  all.push(...candidates);
  console.log(formatCandidates(file, candidates));
  console.log('');
}

const unit = all.filter((c) => c.kind === 'unit');
const unreferenced = unit.filter((c) => !c.referenced);
const count = (kind: Candidate['kind']) => all.filter((c) => c.kind === kind).length;

console.log(
  `${sources.length} source file(s), ${all.length} exported unit(s): ` +
    `${unit.length} unit, ${count('needs-control')} needs-control, ${count('not-unit')} not-unit, ` +
    `${count('unknown')} unknown.`,
);
console.log(
  `${unreferenced.length} unit candidate(s) are not named in any test file:\n` +
    (unreferenced.map((c) => `  ${c.name}`).join('\n') || '  (none)'),
);
console.log(
  '\nA "unit" line means nothing in that body reaches outside it. It does not mean the code\n' +
    'is correct, nor that a test naming it asserts anything. I/O reached through a helper is\n' +
    'invisible here, and so is anything injected at runtime — read the body before trusting\n' +
    'the label.',
);
