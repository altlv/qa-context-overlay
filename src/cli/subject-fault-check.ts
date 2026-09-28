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

async function runSuite(): Promise<boolean> {
  try {
    // No shell. Node concatenates rather than escapes arguments when one is used, which
    // it now warns about by name, and a suite command is argv we already hold correctly.
    await exec(suite[0] ?? '', suite.slice(1), {
      cwd: root,
      windowsHide: true,
      maxBuffer: 1 << 26,
    });
    return true;
  } catch {
    return false;
  }
}

let original: string;
try {
  original = readFileSync(entryPath, 'utf8');
} catch (error) {
  console.error(`Cannot read the entry point ${entry}: ${(error as Error).message}`);
  process.exit(2);
}

// Green first, or every number below is a lie in the flattering direction.
console.error(`Baseline: ${suite.join(' ')}`);
if (!(await runSuite())) {
  console.error(
    'The suite fails before any fault is injected. Fix that first: a red suite fails under ' +
      'every fault and would report a perfect score.',
  );
  process.exit(2);
}
console.error('  green\n');

const outcomes: FaultOutcome[] = [];
try {
  for (const fault of PROCESS_FAULTS) {
    writeFileSync(entryPath, applyProcessFault(original, fault), 'utf8');
    const passed = await runSuite();
    // The suite failing is the result being asked for: it noticed.
    outcomes.push({ ...fault, noticed: !passed });
    console.error(`  ${!passed ? 'noticed' : 'SURVIVED'} — ${fault.name}`);
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
