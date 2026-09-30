import '../env.js';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  PROCESS_FAULTS,
  applyProcessFault,
  reportFaults,
  summariseFaults,
  type FaultOutcome,
} from '../qe/process-fault.js';

const exec = promisify(execFile);

/**
 * `npm run subject-fault-check -- --entry <file> --suite <command…>`
 *
 * Does a subject's own test notice the process it spawns failing?
 *
 * `fault-check` answers this for an app spec and its server, through a fixture the app
 * cooperates with. A subject we do not own has no such hook — its integration test
 * spawns the real entry point and talks to it — so the entry point is broken instead,
 * and the suite is required to fail.
 *
 * The suite must be green before anything is injected. A red suite fails under every
 * fault and would report a perfect score, which is the same trap `mutation-compare`
 * refuses and for the same reason.
 */

const argv = process.argv.slice(2);

function flag(name: string): string | undefined {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

/** `--suite` swallows everything after it: it is a command line, not one word. */
function rest(name: string): string[] {
  const at = argv.indexOf(name);
  if (at === -1) return [];
  const out: string[] = [];
  for (let i = at + 1; i < argv.length; i += 1) {
    const value = argv[i] ?? '';
    if (value === '--entry' || value === '--repo') break;
    out.push(value);
  }
  return out;
}

const entry = flag('--entry');
const repo = flag('--repo') ?? '.';
const suite = rest('--suite');

if (entry === undefined || suite.length === 0) {
  console.error('Usage: subject-fault-check --entry <file> [--repo <path>] --suite <command…>');
  console.error('');
  console.error('  --entry  the process the suite spawns, relative to the repo under test');
  console.error('  --repo   the checkout to break, relative to the working directory');
  console.error('  --suite  the command that runs the suite, as argv');
  process.exit(2);
}

const root = resolve(repo);
const entryPath = resolve(root, entry);

type SuiteResult = 'passed' | 'failed' | 'hung';

/**
 * Runs the suite once, and will not wait forever.
 *
 * The first version had no timeout, and a live run proved why that was not merely untidy.
 * A suite that spawns the app and waits for it to listen never returns when the app is
 * made to exit immediately — so the check blocked on its first fault, and because the
 * restore lives in a `finally` that the blocked loop never reached, **the subject's entry
 * point sat broken on disk** while nothing moved. The hazard this command exists to avoid
 * was created by the command itself.
 *
 * `hung` is kept apart from `failed`. Both mean the suite did not notice, but a suite that
 * hangs burns a whole run and tells a person nothing, while one that fails has done its
 * job. Folding them together would report the worse outcome as the good one.
 */
async function runSuite(limitMs: number): Promise<SuiteResult> {
  try {
    await exec(suite[0] ?? '', suite.slice(1), {
      cwd: root,
      windowsHide: true,
      maxBuffer: 1 << 26,
      timeout: limitMs,
      killSignal: 'SIGKILL',
      // A shell for anything but this process's own node, and the deprecation warning is
      // the lesser evil. I removed it to silence that warning and broke every subject
      // whose runner is an npm binary: on Windows `npx` is a .cmd shim, and
      // `execFile('npx')` without a shell fails with ENOENT. Measured both ways rather
      // than reasoned about — shell=false ENOENT, shell=true fine.
      //
      // The cost of the warning is that arguments are concatenated rather than escaped.
      // What is concatenated here is a runner the subject declared in its own config and
      // the paths of test files in its own tree, so there is no untrusted string in it.
      shell: (suite[0] ?? '') !== process.execPath,
    });
    return 'passed';
  } catch (error) {
    // `killed` is how Node reports its own timeout, and it is the only way to tell a
    // suite that was stopped from one that decided.
    return (error as { killed?: boolean }).killed === true ? 'hung' : 'failed';
  }
}

let original: string;
try {
  original = readFileSync(entryPath, 'utf8');
} catch (error) {
  console.error(`Cannot read the entry point ${entry}: ${(error as Error).message}`);
  process.exit(2);
}

// Green first, or every number below is a lie in the flattering direction. The baseline
// also times the suite, which is what makes a fault run's limit a measurement rather than
// a guess — no fixed number could suit both a suite of milliseconds and one of minutes.
console.error(`Baseline: ${suite.join(' ')}`);
const startedAt = Date.now();
const baseline = await runSuite(15 * 60_000);
if (baseline !== 'passed') {
  console.error(
    baseline === 'hung'
      ? 'The suite did not finish within fifteen minutes before any fault was injected.'
      : 'The suite fails before any fault is injected. Fix that first: a red suite fails under ' +
          'every fault and would report a perfect score.',
  );
  process.exit(2);
}
// Three times the green run, and never under a minute. A broken process should make a
// suite fail sooner than a working one, not later; a run that takes three times as long
// is waiting for something that will not arrive.
const limitMs = Math.max(60_000, (Date.now() - startedAt) * 3);
console.error(`  green in ${Math.round((Date.now() - startedAt) / 1000)}s`);
console.error(`  a faulted run gets ${Math.round(limitMs / 1000)}s before it counts as hung\n`);

const outcomes: FaultOutcome[] = [];
try {
  for (const fault of PROCESS_FAULTS) {
    writeFileSync(entryPath, applyProcessFault(original, fault), 'utf8');
    const result = await runSuite(limitMs);
    // Failing is the result being asked for: it noticed. Hanging is not noticing, and is
    // reported as its own thing — a suite that waits forever for a process that will never
    // arrive costs a whole run and tells nobody anything.
    outcomes.push({ ...fault, noticed: result === 'failed', hung: result === 'hung' });
    const verdict = result === 'failed' ? 'noticed' : result === 'hung' ? 'HUNG' : 'SURVIVED';
    console.error(`  ${verdict} — ${fault.name}`);
  }
} finally {
  // Always, on every path. An entry point left broken is indistinguishable from a
  // subject that was broken to begin with, and it would be found by someone else later.
  writeFileSync(entryPath, original, 'utf8');
}

const restored = readFileSync(entryPath, 'utf8') === original;
if (!restored)
  console.error(`\n${entry} could not be restored — check it before doing anything else.`);

const summary = summariseFaults(outcomes);
console.error('');
for (const line of reportFaults(summary)) console.error(line);

process.exit(summary.survived.length > 0 || !restored ? 1 : 0);
