import { spawnSync } from 'node:child_process';
import { closeSync, openSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  behaviourFiles,
  briefly,
  formatReplay,
  rankCandidates,
  splitCommitFiles,
  verdictFor,
  type HistoricCommit,
  type ReplayResult,
  type TestPaths,
} from '../qe/bug-replay.js';
import { needsShell } from '../qe/subject-runner.js';

/**
 * Replay real fixed bugs from a subject's own history.
 *
 *   npm run bug-replay -- --repo ../coursera-rag --candidates
 *   npm run bug-replay -- --repo ../coursera-rag --commit a091804 \
 *     --suite npx vitest run test/unit/streaming.test.mjs
 *
 * Reverses a commit's **source** changes while leaving every test at HEAD, then runs the suite. A
 * suite that goes red noticed the behaviour being undone; one that stays green did not, and for a
 * fix commit that means the defect can come back in silence. The reasoning is in
 * `src/qe/bug-replay.ts`.
 *
 * **This writes into the subject's checkout, so it refuses more than it runs.** It will not start
 * unless the checkout is a git repository with nothing uncommitted on the paths it means to touch,
 * it restores in a `finally` and once more at the end, and it verifies the restore rather than
 * assuming it. A source left reverted is indistinguishable from a suite that caught the fault,
 * which is the failure mode `mutation-compare` already carries a warning about — and the one that
 * actually bit `subject-fault-check`.
 */

interface Args {
  repo: string;
  suite: string[];
  commits: string[];
  candidates: boolean;
  limit: number;
  help: boolean;
}

const KNOWN_FLAGS = new Set(['--repo', '--suite', '--commit', '--candidates', '--limit', '--help']);

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    repo: '.',
    suite: [],
    commits: [],
    candidates: false,
    limit: 15,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--help') args.help = true;
    else if (arg === '--candidates') args.candidates = true;
    else if (arg === '--repo' || arg === '--limit' || arg === '--commit') {
      const value = argv[i + 1];
      if (value !== undefined && !KNOWN_FLAGS.has(value)) {
        if (arg === '--repo') args.repo = value;
        else if (arg === '--limit') args.limit = Number.parseInt(value, 10) || args.limit;
        // Repeatable, so several commits can be replayed in one pass without re-reading history.
        else args.commits.push(value);
        i += 1;
      }
    } else if (arg === '--suite') {
      // Swallows everything up to the next flag of *this* command: a suite command has flags of
      // its own, and `npx vitest run --reporter dot` is the normal shape.
      const rest: string[] = [];
      let j = i + 1;
      while (j < argv.length && !KNOWN_FLAGS.has(argv[j] as string)) {
        rest.push(argv[j] as string);
        j += 1;
      }
      args.suite = rest;
      i = j - 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.candidates && args.suite.length === 0)) {
  console.error('Usage: bug-replay --repo <path> [--candidates] [--commit <sha>…] --suite <cmd…>');
  console.error('');
  console.error('  --repo        the subject checkout to replay history from');
  console.error('  --candidates  rank commits worth replaying and run no suite at all');
  console.error('  --commit      a commit to replay; repeatable. Omitted, the top candidates run');
  console.error('  --limit       how many commits of history to read (default 15)');
  console.error('  --suite       the command that runs the suite, as argv');
  process.exit(2);
}

/** Windows short names expanded before any child sees the path — see `mutation-compare.ts`. */
function canonical(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

const repo = canonical(resolve(args.repo));

function git(...argv: string[]): { ok: boolean; out: string } {
  const result = spawnSync('git', argv, {
    cwd: repo,
    encoding: 'utf8',
    windowsHide: true,
    // A history listing with --numstat over a repo that commits generated data runs to
    // megabytes, and the default 1 MB ceiling truncates it into a shorter, wrong answer.
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd(),
  };
}

function refuse(message: string): never {
  console.error(message);
  process.exit(2);
}

if (!git('rev-parse', '--git-dir').ok) {
  refuse(
    `${repo} is not a git checkout, so it has no history to replay. This instrument needs the ` +
      "subject's own commits — that is the whole reason its faults are not ours.",
  );
}

/**
 * History, as `--numstat` so churn is read rather than guessed.
 *
 * Merges are excluded: reversing a merge's combined diff is a different operation from reversing a
 * change, and one that will usually not apply — so it would fill the unmeasurable column without
 * ever being able to answer anything.
 */
function history(limit: number): HistoricCommit[] {
  const log = git(
    'log',
    `--max-count=${limit}`,
    '--no-merges',
    '--numstat',
    '--format=%x00%H%x00%s',
  );
  if (!log.ok) refuse(`could not read history from ${repo}:\n${log.out}`);
  const commits: HistoricCommit[] = [];
  let current: HistoricCommit | null = null;
  for (const line of log.out.split('\n')) {
    if (line.startsWith('\0')) {
      const [, sha, subject] = line.split('\0');
      current = { sha: (sha ?? '').slice(0, 7), subject: subject ?? '', files: [], churn: 0 };
      commits.push(current);
      continue;
    }
    if (current === null || line.trim() === '') continue;
    const [added, removed, path] = line.split('\t');
    if (path === undefined) continue;
    current.files.push(path);
    // A binary file reports `-` for both, which parses as NaN. Counted as no churn rather than
    // poisoning the total, since size is only a ranking signal.
    current.churn +=
      (Number.parseInt(added ?? '', 10) || 0) + (Number.parseInt(removed ?? '', 10) || 0);
  }
  return commits;
}

/**
 * A subject's own idea of where its tests live, when it has one.
 *
 * Left empty here rather than reaching into a subject's `app.config.ts`: `src/` must not import from
 * `apps/`, which is a layout rule in CLAUDE.md. The defaults in `isTestPath` cover both coder
 * subjects, and the command prints what it classified as which before touching anything, so a
 * misread is visible rather than silent.
 */
const testPaths: TestPaths = {};

const commits = history(args.limit);
const ranked = rankCandidates(commits, testPaths);

if (args.candidates) {
  console.log(`Commits worth replaying, from the last ${commits.length} in ${args.repo}:\n`);
  for (const entry of ranked) {
    console.log(`  ${entry.commit.sha} ${entry.commit.subject}`);
    for (const signal of entry.signals) console.log(`      · ${signal}`);
    const split = splitCommitFiles(entry.commit.files, testPaths);
    console.log(`      would revert: ${briefly(behaviourFiles(entry.commit.files, testPaths))}`);
    if (split.tests.length > 0) {
      console.log(`      would keep:   ${briefly(split.tests)}`);
    }
  }
  console.log(
    '\nThese are signals, not a classification. The ranking decides which commits are worth a ' +
      'suite run; it does not decide what any of them meant.',
  );
  process.exit(0);
}

const chosen =
  args.commits.length > 0
    ? args.commits.map((sha) => {
        const found = commits.find(
          (commit) => commit.sha.startsWith(sha) || sha.startsWith(commit.sha),
        );
        if (found === undefined) {
          refuse(
            `${sha} is not among the last ${args.limit} commits of ${args.repo}. Raise --limit, or ` +
              'check the sha — a replay of a commit that was not read would have no file list.',
          );
        }
        return found;
      })
    : ranked.slice(0, 3).map((entry) => entry.commit);

if (chosen.length === 0) {
  refuse(
    `No commit in the last ${args.limit} changes anything whose revert could affect behaviour. ` +
      'Nothing was measured, which is not the same as a suite that caught everything.',
  );
}

type Outcome = 'passed' | 'failed' | 'unstartable';

function runSuite(): { outcome: Outcome; output: string } {
  const [executable, ...rest] = args.suite;
  const result = spawnSync(executable as string, rest, {
    cwd: repo,
    encoding: 'utf8',
    windowsHide: true,
    shell: needsShell(executable as string),
    // A verbose suite can print more than the 1 MB default, and a truncated run reports as a
    // crash — which would read as the fault being caught.
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const code = (result.error as { code?: string } | undefined)?.code;
  if (code === 'ENOENT' || code === 'EACCES' || code === 'EINVAL') {
    return { outcome: 'unstartable', output: output === '' ? String(result.error) : output };
  }
  return { outcome: result.status === 0 ? 'passed' : 'failed', output };
}

function tail(output: string): void {
  for (const line of output.split('\n').slice(-10)) console.error(`      ${line}`);
}

/**
 * Nothing uncommitted anywhere in the checkout.
 *
 * Stricter than it needs to be and deliberately so. The restore is `git checkout -- <paths>`, which
 * discards whatever is there, so a dirty target path would mean destroying somebody's work — and a
 * person's uncommitted changes are not this command's to weigh. Refusing the whole checkout rather
 * than only the target paths also means the refusal cannot be wrong about which paths a later
 * commit in the list will touch.
 */
const dirty = git('status', '--porcelain');
if (!dirty.ok) refuse(`could not read the status of ${repo}:\n${dirty.out}`);
if (dirty.out !== '') {
  refuse(
    `${args.repo} has uncommitted changes, and this command restores by discarding what it wrote. ` +
      'Commit or stash them first — losing a person’s work to a measurement is not a trade this ' +
      `makes.\n${dirty.out}`,
  );
}

/**
 * The baseline, and the three refusals the comparator learned the hard way.
 *
 * A red suite reports every revert as caught, an unstartable one does the same, and an unstable one
 * is worse than both because it looks fine. All three would turn this instrument into a generator
 * of reassurance.
 */
const baseline = runSuite();
if (baseline.outcome !== 'passed') {
  console.error(
    `The suite ${baseline.outcome === 'unstartable' ? 'could not be started' : 'fails'} before ` +
      'anything was reverted, so every replay would report the fault as caught. Its output:',
  );
  tail(baseline.output);
  process.exit(2);
}
const confirm = runSuite();
if (confirm.outcome !== 'passed') {
  console.error(
    'The suite is unstable: it passed once and then did not. A flaky test catches a reverted fix ' +
      'by chance, so every verdict below would be noise. The second run’s output:',
  );
  tail(confirm.output);
  process.exit(2);
}

/**
 * Put the named paths back exactly as HEAD has them.
 *
 * **Two halves, because the first version only had one and left a subject's checkout dirty.**
 * `git checkout --` restores a file the reverse patch modified or deleted, and it cannot touch one
 * the patch *created* — which happens whenever the commit being replayed deleted a file, since
 * reversing that brings it back. `mcpa`'s `b4491a6` did exactly this on the first live run: git
 * answered `pathspec … did not match any file(s) known to git`, the restore half-happened, and the
 * end-of-run check refused the whole result. It was caught only because that check exists.
 *
 * `git clean` is destructive and scoped here to the paths just written, which is safe for a reason
 * that is worth stating: the command refuses to start unless `git status --porcelain` is **empty**,
 * and that includes untracked files. So an untracked file on a reverted path at this point was
 * created by this process, and there is nothing of anyone else's to lose.
 *
 * **The checkout names HEAD on purpose.** `git apply --3way` stages the blobs it merges, so the
 * index holds the reverted content — and a bare `git checkout -- <paths>`, which restores the
 * worktree *from the index*, would faithfully restore the mutation. The subject would be left
 * broken by the one line written to repair it.
 *
 * Called immediately after each commit rather than once at the end: the next commit's patch is
 * applied to this tree, and applying it over a still-reverted file would measure a combination
 * nobody chose.
 */
function restore(paths: readonly string[]): void {
  const checkedOut = git('checkout', 'HEAD', '--', ...paths);
  const cleaned = git('clean', '-f', '--', ...paths);
  if (!cleaned.ok) {
    console.error(`  could not clean ${briefly(paths)}:\n${cleaned.out}`);
  }
  // Reported after the clean, not instead of it: `checkout` fails for a path git does not know,
  // which is precisely the case `clean` handles, so the two must both run before anything is said.
  const left = git('status', '--porcelain', '--', ...paths);
  if (left.ok && left.out === '') return;
  console.error(
    `  could not restore ${briefly(paths)}:\n${checkedOut.out}\n${left.out}`.replace(/\n+/g, '\n'),
  );
}

const results: ReplayResult[] = [];
const touched = new Set<string>();

for (const commit of chosen) {
  const split = splitCommitFiles(commit.files, testPaths);
  const toRevert = behaviourFiles(commit.files, testPaths);
  const base: Omit<ReplayResult, 'verdict'> = {
    sha: commit.sha,
    subject: commit.subject,
    reverted: toRevert,
    kept: split.tests,
  };

  if (toRevert.length === 0) {
    results.push({
      ...base,
      verdict: 'nothing-to-revert',
      why: 'every file it touched is a test, documentation or a lockfile',
    });
    continue;
  }

  console.error(`\n${commit.sha} ${commit.subject}`);
  console.error(`  reverting: ${briefly(toRevert)}`);
  console.error(
    `  keeping at HEAD: ${split.tests.length === 0 ? '(this commit carried no test file)' : briefly(split.tests)}`,
  );

  /**
   * Reverse the commit's diff for those paths only.
   *
   * `git show <sha> -- <paths>` then `git apply -R`, rather than `git revert`, for two reasons: it
   * touches only the paths named, so the tests stay exactly as HEAD has them, and it **fails
   * cleanly** when a later commit has changed the same lines. That failure is the honest answer —
   * the fault cannot be reintroduced as it was, so nothing was measured — and `git revert` would
   * instead leave conflict markers in the tree.
   *
   * **The diff goes to a file, never through this process.** It was piped through `spawnSync`'s
   * `stdout` first, and the default `maxBuffer` is 1 MB: `mcpa` commits a Jupyter notebook, so one
   * commit's diff is 7.5 MB, and all three replays in the first live run came back
   * `would-not-revert — its diff could not be read`. The honest-looking verdict was a harness
   * limit wearing a finding's clothes, which is this repository's recurring failure and was caught
   * here only because the reason was too vague to believe. Writing straight to a descriptor has no
   * ceiling at all.
   *
   * **`--3way`, which is the difference between an instrument and a curiosity.** A plain reverse
   * apply failed on every one of the six commits tried across both subjects — "a later commit
   * changed the same lines" — because a fix worth replaying is usually several commits back and
   * a plain apply needs its context lines intact. Measured 2026-10-05 on `a091804`: plain refuses,
   * three-way applies all three files cleanly, because it merges against the blobs the patch names
   * rather than matching text. A genuine conflict still exits non-zero and is still reported as
   * unmeasurable, so nothing is claimed that was not reintroduced.
   */
  const patchFile = join(tmpdir(), `bug-replay-${commit.sha}-${process.pid}.patch`);
  let readable = false;
  const sink = openSync(patchFile, 'w');
  try {
    const shown = spawnSync('git', ['show', commit.sha, '--', ...toRevert], {
      cwd: repo,
      stdio: ['ignore', sink, 'pipe'],
      windowsHide: true,
    });
    readable = shown.status === 0;
    if (!readable) {
      const reason = `${shown.stderr ?? ''}`.trim();
      results.push({
        ...base,
        verdict: 'would-not-revert',
        why: `git show exited ${shown.status}${reason === '' ? '' : `: ${reason}`}`,
      });
    }
  } finally {
    closeSync(sink);
  }
  if (!readable) {
    rmSync(patchFile, { force: true });
    continue;
  }

  /**
   * Recorded as touched **before** the apply, not after it.
   *
   * A failing `--3way` is not a no-op: it applies what it can and leaves conflict markers in the
   * rest, so the files are modified and the index is staged whether it succeeded or not. The first
   * version added these afterwards and returned early on failure, so a conflicted apply was never
   * restored and never verified — and the run printed `restored and verified clean on 3 file(s)`
   * over a `coursera-rag` checkout holding a `UU` conflict and two staged files. **It reported
   * success while leaving the subject broken**, which is worse than either half of that alone and
   * is precisely the confusion this command's own header warns about.
   */
  for (const file of toRevert) touched.add(file);

  const applied = spawnSync('git', ['apply', '-R', '--3way', patchFile], {
    cwd: repo,
    encoding: 'utf8',
    windowsHide: true,
  });
  rmSync(patchFile, { force: true });
  if (applied.status !== 0) {
    results.push({
      ...base,
      verdict: 'would-not-revert',
      why:
        'the reverse patch does not apply — a later commit changed the same lines, so this fault ' +
        'cannot be reintroduced as it was',
    });
    // A partial apply with conflict markers in it, which must go back before the next commit's
    // patch lands on top of it.
    restore(toRevert);
    continue;
  }

  try {
    const run = runSuite();
    const verdict = verdictFor(run.outcome);
    results.push({
      ...base,
      verdict,
      ...(verdict === 'suite-would-not-start'
        ? {
            why:
              'with the change reverted the suite could not start, so it was never asked whether ' +
              'it noticed',
          }
        : {}),
    });
    console.error(`  → ${verdict}`);
  } finally {
    restore(toRevert);
  }
}

/**
 * Verified, not assumed.
 *
 * A source left reverted reads exactly like a suite that caught the fault, so the restore is
 * checked against git rather than trusted — the same reasoning that put a second restore pass at
 * the end of `mutation-compare`, and the thing whose absence left a subject's entry point mutated
 * on disk once already.
 */
if (touched.size > 0) {
  const after = git('status', '--porcelain', '--', ...touched);
  if (!after.ok || after.out !== '') {
    console.error(
      `\nThe checkout was NOT left as it was found. Fix this before reading anything above — a ` +
        `reverted source is indistinguishable from a suite that caught the fault.\n${after.out}`,
    );
    for (const line of formatReplay(results)) console.log(line);
    process.exit(2);
  }
  console.error(`\n${args.repo} restored and verified clean on ${touched.size} file(s).`);
}

console.log('');
for (const line of formatReplay(results)) console.log(line);

// An undefended real fault is the finding, and the only thing here worth failing on. Everything
// else — including a replay that could not be performed — is reported and does not fail, because a
// check that cannot go green is one people learn to ignore.
process.exit(results.some((result) => result.verdict === 'undefended') ? 1 : 0);
