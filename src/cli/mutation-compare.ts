import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  anchorProblems,
  applyMutation,
  formatCompare,
  newSurvivors,
  parseCompareArgs,
  readMutations,
  summarise,
  type Mutation,
  type MutationOutcome,
  type SuiteOutcome,
} from '../qe/mutation-compare.js';

/**
 * Run a named mutation set against a named suite and say what each mutation proves.
 *
 *   npm run mutation-compare -- --mutations apps/mcpa/mutations/labs.ts \
 *     --repo ../mcpa-training-bot --suite node --test test/labs-routes.test.js
 *
 *   ... --against node --test test/labs-routes.agent.test.js
 *
 * The point is the second form: applying the same mutations to two suites tells you whether the
 * second is weaker than the first. `survivors(after)` must be a subset of `survivors(before)`, so
 * a change that quietly stops testing a rule is refused by a command rather than by a reader
 * noticing.
 *
 * `--mutations` names a module whose only export is the list (or a `.json` file holding it). It is
 * imported, so it must do nothing at import time — which is exactly why `src/cli/mutate.ts`'s own
 * list cannot be used here: importing that file starts a mutation run of this repository.
 */

const argv = process.argv.slice(2);
const args = parseCompareArgs(argv);

if (args.help || args.mutations === null || args.suite.length === 0) {
  console.error(
    'Usage: mutation-compare --mutations <module|json> [--repo <path>] --suite <command…> ' +
      '[--against <command…>]',
  );
  console.error('');
  console.error('  --mutations  a module exporting the mutation list, or a .json file holding it');
  console.error('  --repo       the checkout to mutate, relative to the working directory');
  console.error('  --suite      the command that runs the suite, as argv');
  console.error('  --against    a second suite, to require survivors(against) ⊆ survivors(suite)');
  process.exit(2);
}

/**
 * The repository, with Windows short names expanded before any child sees it.
 *
 * A short 8.3 path handed to a spawned process as `cwd` breaks its own relative resolution: node
 * reports `Could not find 'test/rule.test.js'` for a file that is right there, so every mutation
 * scores as caught and the run reads as a perfect result. Handoff item 41 met the same mismatch in
 * git's output and normalised it the same way.
 */
function canonical(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

const repo = canonical(resolve(args.repo));

async function loadMutations(path: string): Promise<{ mutations: Mutation[]; problems: string[] }> {
  const absolute = resolve(path);
  let value: unknown;
  try {
    value = absolute.endsWith('.json')
      ? JSON.parse(readFileSync(absolute, 'utf8'))
      : await import(pathToFileURL(absolute).href).then(
          (module) =>
            (module as { MUTATIONS?: unknown; default?: unknown }).MUTATIONS ??
            (module as { default?: unknown }).default,
        );
  } catch (error) {
    return {
      mutations: [],
      problems: [
        `the mutation set could not be read: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  return readMutations(value);
}

/**
 * A suite that could not be started is not a suite that failed.
 *
 * The child's output is kept, not discarded: a baseline that goes red says only that something is
 * wrong, and the reader then has to reproduce the run by hand to find out what. The same reasoning
 * as the release gate printing the tail of the suite it refused.
 */
function runSuite(command: readonly string[]): { outcome: SuiteOutcome; output: string } {
  const [executable, ...rest] = command;
  const result = spawnSync(executable as string, rest, {
    cwd: repo,
    encoding: 'utf8',
    windowsHide: true,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const errorCode = (result.error as { code?: string } | undefined)?.code;
  if (errorCode === 'ENOENT' || errorCode === 'EACCES' || errorCode === 'EINVAL') {
    return { outcome: 'unstartable', output: output === '' ? String(result.error) : output };
  }
  return { outcome: result.status === 0 ? 'passed' : 'failed', output };
}

function reportTail(output: string): void {
  for (const line of output.split('\n').slice(-12)) console.error(`      ${line}`);
}

if (args.mutations === null) process.exit(2);
const loaded = await loadMutations(args.mutations);
if (loaded.problems.length > 0) {
  console.error('The mutation set is not usable:');
  for (const problem of loaded.problems) console.error(`  ✗ ${problem}`);
  process.exit(2);
}
const mutations = loaded.mutations;
if (mutations.length === 0) {
  console.error(
    'The mutation set is empty. A score over no mutations is a perfect score of nothing, ' +
      'which is the failure this tool exists to catch.',
  );
  process.exit(2);
}

const structural = anchorProblems(mutations);
if (structural.length > 0) {
  console.error(`${structural.length} mutation(s) cannot be applied as written:`);
  for (const problem of structural) console.error(`  ✗ ${problem}`);
  process.exit(2);
}

/**
 * Every mutation applied to one suite. The baseline runs first and refuses the score when it is
 * red: a suite that already fails reports every mutation as caught.
 */
function score(command: readonly string[], label: string): MutationOutcome[] | null {
  const baseline = runSuite(command);
  if (baseline.outcome === 'unstartable') {
    console.error(
      `The suite command could not be started (${command.join(' ')}). Refusing to report a score — ` +
        'every mutation would look caught while nothing ran.',
    );
    reportTail(baseline.output);
    return null;
  }
  if (baseline.outcome === 'failed') {
    console.error(
      `The suite fails before any mutation (${command.join(' ')}). Fix that first: a suite that is ` +
        'already red reports every mutation as caught. Its output:',
    );
    reportTail(baseline.output);
    return null;
  }

  const outcomes: MutationOutcome[] = [];
  for (const mutation of mutations) {
    const path = resolve(repo, mutation.file);
    const original = readFileSync(path, 'utf8');
    const mutated = applyMutation(original, mutation);
    if (mutated === null) {
      console.error(
        `  ✗ ${mutation.file}: the anchor for "${mutation.breaks}" does not resolve to exactly one ` +
          'place in the file. Refusing to score a rule that was never applied.',
      );
      return null;
    }
    let killed = false;
    try {
      writeFileSync(path, mutated, 'utf8');
      killed = runSuite(command).outcome === 'failed';
    } finally {
      writeFileSync(path, original, 'utf8');
    }
    outcomes.push({ ...mutation, killed });
  }
  console.log(formatCompare(label, outcomes));
  return outcomes;
}

const before = score(args.suite, 'survivors (suite)');
if (before === null) process.exit(2);

let weakened: string[] = [];
if (args.against !== null && args.against.length > 0) {
  const after = score(args.against, 'survivors (against)');
  if (after === null) process.exit(2);
  weakened = newSurvivors(summarise(before).survivors, summarise(after).survivors);
  if (weakened.length > 0) {
    console.error(
      `\nThe second suite is weaker: ${weakened.length} mutation(s) the first suite kills and it ` +
        'does not. A change may never leave the suite weaker than it found it.',
    );
    for (const name of weakened) console.error(`  ✗ ${name}`);
  } else {
    console.log(
      '\nThe second suite is not weaker: every mutation it survives was already survived.',
    );
  }
}

// Once more at the end, because a run interrupted mid-file leaves a source mutated and a source
// left mutated is indistinguishable from a suite that caught the mutation.
let unrestored = 0;
for (const mutation of mutations) {
  const path = resolve(repo, mutation.file);
  try {
    readFileSync(path, 'utf8');
  } catch {
    unrestored += 1;
  }
}

const { killed, total, survivors } = summarise(before);
console.log(
  `\nComparator: ${killed}/${total} killed by the suite, ${survivors.length} survivor(s).`,
);
if (args.against !== null) console.log(`Strength delta: ${weakened.length} new survivor(s).`);
if (unrestored > 0) console.error(`${unrestored} file(s) could not be read back after restoring.`);

// Two questions, two verdicts, and conflating them made this unusable as a gate step.
//
// With `--against` the question is the one this command exists for — did a change leave the
// suite weaker — and `weakened` answers it. Survivors are information alongside it, not a
// failure: no real suite kills every mutation, and measured here the subject's own
// hand-written suite leaves 10 of 14 alive. Exiting 1 on that would make the step
// permanently red, and a check that cannot go green is one people learn to ignore — the
// same reasoning `external` carries in the app contract.
//
// Without `--against` there is no before and after, so the only claim available is
// completeness, and a survivor is the finding.
process.exit((args.against === null ? survivors.length > 0 : weakened.length > 0) ? 1 : 0);
