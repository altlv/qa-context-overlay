import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { PLAYWRIGHT_CLI } from '../tool-paths.js';
import {
  describeSensitivity,
  exportedFunctions,
  breakExport,
  summariseSensitivity,
  type BreakKind,
  type ExportSensitivity,
} from '../quality/test-sensitivity.js';

/**
 * `npm run test-sensitivity -- <module>` — break each exported function in turn and see whether the suite
 * notices.
 *
 * The routine this mechanises was run by hand fifteen times in a day and found five tests that
 * passed while the thing they named was broken. It needs no mutation set and no run history, which
 * is why it can be pointed at a module nobody has prepared.
 *
 * **It edits a tracked source file, so the safety is the feature.** The original bytes are held in
 * memory, restored in a `finally`, and then **verified byte-for-byte**; a mismatch is shouted
 * about rather than reported quietly. It also refuses to start when the file has uncommitted
 * changes, so that even a hard kill leaves nothing worse than a file `git checkout` can recover —
 * and the person running it has not lost work they had not committed.
 */

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const target = process.argv[2];
if (target === undefined || target.startsWith('--')) {
  console.error(
    'Usage: npm run test-sensitivity -- <module.ts> [--export <name>] [--tests <path>]\n' +
      '\n' +
      'Replaces each exported function body with a throw, then with nothing, running the tests\n' +
      'between each. An export the suite does not notice breaking is reported, with which of the\n' +
      'two it failed to notice.\n' +
      '\n' +
      'Refuses to run on a file with uncommitted changes: it rewrites the file and must be able to\n' +
      'promise you get it back.',
  );
  process.exit(2);
}

const modulePath = resolve(target);
const only = flag('--export');

/** Uncommitted changes would be at risk, and nothing here is worth that. */
const dirty = spawnSync('git', ['status', '--porcelain', '--', modulePath], { encoding: 'utf8' });
if (dirty.status !== 0) {
  console.error(`Could not ask git about ${target}: ${dirty.stderr.trim()}`);
  process.exit(2);
}
if (dirty.stdout.trim() !== '') {
  console.error(
    `${target} has uncommitted changes. This command rewrites the file, and refuses to do that\n` +
      'while there is work in it that a restore could lose. Commit or stash first.',
  );
  process.exit(2);
}

const original = readFileSync(modulePath, 'utf8');
const names = only === undefined ? exportedFunctions(original) : [only];
if (names.length === 0) {
  console.error(
    `No exported function declarations found in ${target}. An exported arrow constant is not\n` +
      'matched — see `exportedFunctions` for why — so this is "nothing to measure", not "clean".',
  );
  process.exit(2);
}

/**
 * Which test files to run.
 *
 * The files that import this module, found by its basename. A heuristic, and it is printed so a
 * reader can see what was actually run: scoping to the importers is what makes this cheap enough
 * to use, and a module whose importers are missed would be reported as unreached when the truth is
 * that its tests were never run.
 */
const stem = basename(modulePath).replace(/\.ts$/, '');
const importers = spawnSync('git', ['grep', '-l', '--', `${stem}.js`, '--', 'tests/'], {
  encoding: 'utf8',
});
const testPaths =
  flag('--tests') !== undefined
    ? [flag('--tests')!]
    : importers.stdout.split('\n').filter((line) => line.trim() !== '');

if (testPaths.length === 0) {
  console.error(
    `No test file under tests/ imports ${stem}.js. Nothing would be measured, so nothing is run —\n` +
      'which is itself the finding: this module has no tests of its own.',
  );
  process.exit(1);
}

console.error(`Poisoning ${names.length} export(s) in ${target}.`);
console.error(`Running: ${testPaths.join(' ')}\n`);

/** True when the suite failed, which is what "the tests noticed" means here. */
function suiteNoticed(): boolean {
  const run = spawnSync(
    process.execPath,
    [PLAYWRIGHT_CLI, 'test', ...testPaths, '--reporter=line'],
    { encoding: 'utf8' },
  );
  return run.status !== 0;
}

const verdicts: ExportSensitivity[] = [];
try {
  for (const name of names) {
    const outcome: Record<BreakKind, boolean | null> = { throw: null, empty: null };
    let skipped: string | null = null;

    for (const kind of ['throw', 'empty'] as const) {
      const poisoned = breakExport(original, name, kind);
      if (poisoned === null) {
        skipped = `its body could not be located, so neither poison was applied`;
        break;
      }
      writeFileSync(modulePath, poisoned, 'utf8');
      outcome[kind] = suiteNoticed();
    }
    writeFileSync(modulePath, original, 'utf8');

    verdicts.push({
      name,
      reached: outcome.throw ?? false,
      returnMattered: outcome.empty ?? false,
      skipped,
    });
    console.error(`  ${describeSensitivity(verdicts[verdicts.length - 1]!)}`);
  }
} finally {
  // Restored and then checked. A tool that rewrites a tracked file has one obligation above all
  // the others, and "I restored it" is a claim like any other.
  writeFileSync(modulePath, original, 'utf8');
  if (readFileSync(modulePath, 'utf8') !== original) {
    console.error(
      `\nTHE FILE WAS NOT RESTORED: ${target} does not match what it was. Recover it with\n` +
        `  git checkout -- ${target}`,
    );
    process.exit(3);
  }
}

console.error('');
for (const line of summariseSensitivity(verdicts)) console.log(line);

const unnoticed = verdicts.filter(
  (verdict) => verdict.skipped === null && (!verdict.reached || !verdict.returnMattered),
);
process.exit(unnoticed.length === 0 ? 0 : 1);
