import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  buildRepoMap,
  formatRepoMap,
  parseSurveyArgs,
  scopeOf,
  type SourceFile,
} from '../quality/repomap.js';

/**
 * Map the repository under test before writing anything for it.
 *
 * Usage:
 *   npm run survey -- <path>                  a file or directory of source
 *   npm run survey -- src --tests tests       where the tests live
 *   npm run survey -- src --changed main      only what changed, plus its neighbours
 *   npm run survey -- src --save map.json     write the map for something else to read
 *
 * Read-only, and advisory: it exits 0 whatever it finds. Scoping to a change is what makes
 * it an opening move rather than a reference — the whole tree does not fit in a context,
 * and one hop around the diff does.
 */

const SOURCE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.ai']);

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
const parsed = parseSurveyArgs(argv);

const sourceRoots = parsed.roots.length > 0 ? parsed.roots : ['src'];
const testRoots = parsed.tests ? [parsed.tests] : ['test', 'tests'];

async function readAll(paths: string[]): Promise<SourceFile[]> {
  const base = process.cwd();
  return Promise.all(
    paths.map(async (path) => ({
      path: relative(base, path).split('\\').join('/'),
      text: await readFile(path, 'utf8'),
    })),
  );
}

const sourcePaths = (
  await Promise.all(
    sourceRoots.map((root) =>
      collect(resolve(root), (name) => SOURCE.test(name) && !TEST_FILE.test(name)),
    ),
  )
)
  .flat()
  .sort();

if (sourcePaths.length === 0) {
  console.error('No source files found. Name a file or a directory.');
  process.exit(2);
}

const sources = await readAll(sourcePaths);
const tests = await readAll(
  (await Promise.all(testRoots.map((root) => collect(resolve(root), (n) => TEST_FILE.test(n)))))
    .flat()
    .sort(),
);

// The third argument lets the map tell "a real file outside these roots" from "a path that
// points at nothing", which are different findings and were being reported as one.
const map = buildRepoMap(sources, tests, (path) => existsSync(resolve(path)));

/** The paths git reports for one invocation, one per line. */
function gitLines(args: string[]): string[] {
  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const ref = parsed.changed;
let changed: string[] | null = null;
if (ref !== null) {
  try {
    // `git diff <ref>` covers the working tree too, so uncommitted work is in scope. It
    // does not list untracked files, and a brand-new file is exactly what new functionality
    // looks like — without the second call, scoping a new feature came back empty while
    // four files sat changed in front of it.
    changed = [
      ...gitLines(['diff', '--name-only', ref]),
      ...gitLines(['ls-files', '--others', '--exclude-standard']),
    ];
  } catch (error) {
    console.error(
      `Could not diff against "${ref}": ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error('Falling back to the whole map.');
  }
}

if (changed !== null) {
  const inScope = changed.filter((path) => map.files.some((file) => file.path === path));
  if (inScope.length === 0) {
    console.log(
      `Nothing in the mapped source changed against "${ref}" (${changed.length} path(s) changed overall).`,
    );
  }
  console.log(formatRepoMap(map, scopeOf(map, inScope)));
} else {
  console.log(formatRepoMap(map));
}

const save = parsed.save;
if (save !== null) {
  await mkdir(dirname(resolve(save)), { recursive: true });
  await writeFile(resolve(save), JSON.stringify(map, null, 2), 'utf8');
  console.log(`\nMap written to ${save}.`);
}
