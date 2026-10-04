/**
 * Does the suite notice a **real** bug coming back?
 *
 * Every mutation score in this repository measures a suite against one author's model of what
 * breaks. `docs/mutation-evals.md` says so in its first consideration and names this the
 * highest-value gap: a hand-written set only contains mutations somebody thought of, so a suite
 * can score 14/14 and be blind to the whole category nobody imagined. The set and the thing it
 * grades share an author, which is the one bias no amount of care inside the set removes.
 *
 * A subject's git history does not share that author. A fix commit is a fault the product
 * actually had, introduced by whoever wrote it, for reasons nobody here invented. So:
 *
 * 1. Take a commit.
 * 2. Reverse **only its source changes**, leaving every test at HEAD.
 * 3. Run the suite.
 *
 * A suite that goes red noticed the behaviour being undone. A suite that stays green did not —
 * and for a fix commit that means the defect it fixed can come back without anything saying so.
 *
 * **Why the tests must stay at HEAD.** A fix commit normally carries its own regression test, so
 * reverting the commit whole would remove the one test most likely to catch it and the run would
 * prove nothing. Keeping the tests and reverting the source is the only split that asks a real
 * question, and it is also the shape of the thing being feared: the fix is lost, the tests are not.
 *
 * ## What this is not
 *
 * It is not a judgement about whether a commit was a fix. The measurement works on any commit —
 * "would anything notice this change being undone" is worth knowing either way — and the ranking
 * below exists only to spend suite runs on the commits most likely to be interesting. Nothing
 * here decides what a commit *meant*.
 *
 * It is also not a score out of the number of commits tried. A revert that will not apply, or one
 * that stops the suite starting, measured nothing, and those are counted apart rather than folded
 * into a denominator — the same rule the comparator follows, and the failure this repository keeps
 * meeting when it does not.
 */

/** What git reports about one commit, before anything is reverted. */
export interface HistoricCommit {
  sha: string;
  subject: string;
  files: string[];
  /** Lines added plus removed, from `--numstat`. Size is a signal, never a verdict. */
  churn: number;
}

/**
 * How a path is recognised as a test rather than as the product.
 *
 * A subject declares its own in `testStack` (`testsDir`, `testFilePattern`), and this takes them
 * when they are given. The defaults are not a guess at a convention so much as the two shapes that
 * are observable in a path: a directory whose name is about testing, and a filename with a
 * `.test.`/`.spec.` infix. Both of the coder subjects are covered by them — `test/unit/x.test.mjs`
 * on one and `src/app/x.spec.ts` on the other — which is the point, since those two put their tests
 * in different places.
 */
export interface TestPaths {
  /** Directory segments that mean "this is test code", lowercased. */
  dirs?: string[];
  /** Filename infixes that mean the same, lowercased. */
  infixes?: string[];
}

const DEFAULT_DIRS = ['test', 'tests', 'spec', 'specs', '__tests__', 'e2e'];
const DEFAULT_INFIXES = ['.test.', '.spec.'];

/**
 * Whether a path is test code.
 *
 * Deliberately generous in **this** direction. A source file misread as a test is reverted-and-kept
 * — no, worse: it is *not* reverted, so the fault is only half introduced and the suite may stay
 * green for a reason that has nothing to do with the suite. A test file misread as source gets
 * reverted, which removes a test and makes the run meaningless in the other direction.
 *
 * There is no safe side, so the rule is kept narrow and literal instead of clever, and the command
 * prints both lists before it touches anything. A person reading "reverting: server/rag.js;
 * keeping: test/unit/streaming.test.mjs" can see a misclassification in a second; a person reading
 * a score cannot.
 */
export function isTestPath(path: string, paths: TestPaths = {}): boolean {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  const dirs = paths.dirs ?? DEFAULT_DIRS;
  const infixes = paths.infixes ?? DEFAULT_INFIXES;
  const segments = lower.split('/');
  const file = segments.at(-1) ?? '';
  if (segments.slice(0, -1).some((segment) => dirs.includes(segment))) return true;
  return infixes.some((infix) => file.includes(infix));
}

export interface SplitFiles {
  /** What will be reverted. */
  source: string[];
  /** What will be left exactly as HEAD has it. */
  tests: string[];
}

export function splitCommitFiles(files: readonly string[], paths: TestPaths = {}): SplitFiles {
  const source: string[] = [];
  const tests: string[] = [];
  for (const file of files) (isTestPath(file, paths) ? tests : source).push(file);
  return { source, tests };
}

/**
 * Paths whose change is not the product's behaviour.
 *
 * A fix commit usually edits the README in the same breath, and reverting a markdown file cannot
 * make a suite fail — so a commit whose only non-test change is documentation would be scored as
 * **undefended** and the number would quietly fill up with commits that were never measurable.
 * That is the same error as counting a revert that would not apply.
 *
 * Judged by extension, because that is the observable thing. A `.md`, a `.txt`, a lockfile and an
 * image are not behaviour; everything else is assumed to be until something says otherwise, which
 * is the direction that fails loudly rather than silently.
 */
/**
 * `.ipynb` is the judgement call in this list, and it earned its place by producing a worthless
 * finding on the first live run: `mcpa`'s `b4491a6` reverted two study notebooks, the suite
 * naturally did not care, and the result was reported as a **real change nothing notices** —
 * perfectly true and of no use to anybody. A findings list is only read while everything in it is
 * worth reading.
 *
 * The cost of being wrong here is stated rather than hidden: a subject whose product *is* a
 * notebook would have those changes silently excluded, and would need this entry removed.
 */
const INERT = [
  '.md',
  '.markdown',
  '.txt',
  '.rst',
  '.ipynb',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
];
const INERT_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.gitignore'];

/**
 * Never reverted, and the stronger reason is not about behaviour.
 *
 * A subject tracks a template — `.env.sample`, `.env.example` — and reverting one cannot change
 * what the product does, because the file the application actually reads is the untracked `.env`
 * beside it. So it belongs with the inert paths on the merits. It is listed apart because the
 * second reason outranks the first: CLAUDE.md rule 6 makes a `.env` and its variants a person's
 * file, and a command that writes into somebody else's checkout must not be the one place that
 * reasons about which variant is safe to overwrite.
 *
 * `coursera-rag` put this to the test immediately — two of its commits touch `.env.sample`.
 */
const NEVER_TOUCH = /(^|\/)\.env($|\.)/;

export function isInertPath(path: string): boolean {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  const file = lower.split('/').at(-1) ?? '';
  if (NEVER_TOUCH.test(lower)) return true;
  if (INERT_FILES.includes(file)) return true;
  return INERT.some((extension) => lower.endsWith(extension));
}

/** The source files whose revert could actually change what the product does. */
export function behaviourFiles(files: readonly string[], paths: TestPaths = {}): string[] {
  return splitCommitFiles(files, paths).source.filter((file) => !isInertPath(file));
}

/**
 * Observable reasons a commit is worth a suite run, each named so a reader can disagree.
 *
 * **Not a classifier, and that distinction is why this is a list of signals rather than a
 * boolean.** Item 4 shipped a list of plausible web structures and the user was right to reject
 * it; naming commits "fixes" from their vocabulary would be the same move. These are facts about
 * the commit, reported individually, and the thing they rank is *which commits to spend a suite run
 * on* — never what the commit was.
 *
 * **The signals answer two different questions and are not interchangeable**, which the first
 * version of this got wrong by counting them. Run against `mcpa` it ranked a commit editing
 * `daily-commit.bat` *above* one whose subject reads "Bug fixes, added e2e tests": both scored two
 * signals, and the tie went to the smaller diff. Two signals speak to whether a commit is a **fix**
 * — its author's label, and behaviour changing alongside tests. Two speak only to whether it is
 * **cheap and clean to replay** — few files, small diff. Treating "18 lines changed" as equal
 * evidence to "its author called it a fix" is how a batch file reached the top of a list of bugs.
 *
 * `fix:` in the subject is a **declaration by its author**, not a reading of what the commit did —
 * the person who wrote the change marked it as a fix, the way an author marks a region
 * `role=status`. That is why it is allowed to be decisive here while a guess from the diff's shape
 * would not be.
 */
export function fixSignals(commit: HistoricCommit, paths: TestPaths = {}): string[] {
  const signals: string[] = [];
  const split = splitCommitFiles(commit.files, paths);
  const behaviour = behaviourFiles(commit.files, paths);
  if (declaredFix(commit)) signals.push('its author called it a fix');
  if (behaviour.length > 0 && split.tests.length > 0) {
    signals.push(
      'changes behaviour and tests together — the shape of a fix with a regression test',
    );
  }
  if (behaviour.length > 0 && behaviour.length <= 3) {
    signals.push(`touches ${behaviour.length} behaviour file(s) — small enough to be one fault`);
  }
  if (commit.churn > 0 && commit.churn <= 120) {
    signals.push(`${commit.churn} lines changed`);
  }
  return signals;
}

/** The author's own label. A declaration about their commit, never an inference about it. */
export function declaredFix(commit: HistoricCommit): boolean {
  return /\b(fix|fixes|fixed|bug|bugs|regression|hotfix|patch|broken|revert)\b/i.test(
    commit.subject,
  );
}

/**
 * How likely this commit is to be a real fault, from the two signals that speak to that.
 *
 * Kept apart from the two that speak to cost, so the ordering below cannot trade one for the
 * other. `mcpa` is the reason: its commits are enormous, so every cost signal is absent on exactly
 * the commits whose messages say "Bug fixes".
 */
export function faultEvidence(commit: HistoricCommit, paths: TestPaths = {}): number {
  const split = splitCommitFiles(commit.files, paths);
  const behaviour = behaviourFiles(commit.files, paths);
  return (declaredFix(commit) ? 1 : 0) + (behaviour.length > 0 && split.tests.length > 0 ? 1 : 0);
}

/**
 * Candidates, likeliest fault first — and cost used only to break a tie.
 *
 * Lexicographic on purpose, rather than a weighted total. A score would let enough cheapness
 * outvote the evidence that a commit is a fault at all, which is exactly the trade that put
 * `daily-commit.bat` at the top of `mcpa`'s list. Here no amount of smallness promotes a commit
 * over one with more reason to be a real fault; smallness only decides which of two equally likely
 * faults is replayed first, because that one costs less to answer.
 */
export function rankCandidates(
  commits: readonly HistoricCommit[],
  paths: TestPaths = {},
): { commit: HistoricCommit; signals: string[] }[] {
  const size = (commit: HistoricCommit): number => behaviourFiles(commit.files, paths).length;
  return commits
    .map((commit) => ({ commit, signals: fixSignals(commit, paths) }))
    .filter((entry) => size(entry.commit) > 0)
    .sort(
      (a, b) =>
        faultEvidence(b.commit, paths) - faultEvidence(a.commit, paths) ||
        size(a.commit) - size(b.commit) ||
        a.commit.churn - b.commit.churn,
    );
}

/**
 * A file list a person can read, with the rest counted rather than printed.
 *
 * `mcpa` committed its generated quiz results, so one of its commits names seventy files and the
 * candidate listing for it ran to a full screen of `quiz_1787420680582.json`. A list nobody can
 * read is the same as no list: the point of printing what will be reverted is that a
 * misclassification is visible at a glance, and that only works while the glance is possible.
 */
export function briefly(files: readonly string[], most = 6): string {
  if (files.length <= most) return files.join(', ');
  return `${files.slice(0, most).join(', ')} … and ${files.length - most} more`;
}

/**
 * What one replay established.
 *
 * Five outcomes and not two, because the three that are not an answer must not be able to read as
 * one. `undefended` is the finding; `defended` is the reassurance; the rest say the run measured
 * nothing and why.
 */
export type ReplayVerdict =
  'defended' | 'undefended' | 'would-not-revert' | 'suite-would-not-start' | 'nothing-to-revert';

export interface ReplayResult {
  sha: string;
  subject: string;
  verdict: ReplayVerdict;
  /** The files that were reverted, or would have been. */
  reverted: string[];
  /** The test files deliberately left at HEAD. */
  kept: string[];
  /** For the verdicts that are not an answer: what stopped it being one. */
  why?: string;
}

export function verdictFor(outcome: 'passed' | 'failed' | 'unstartable'): ReplayVerdict {
  if (outcome === 'unstartable') return 'suite-would-not-start';
  return outcome === 'failed' ? 'defended' : 'undefended';
}

/**
 * The score, with the unmeasured kept out of the denominator.
 *
 * `defended / (defended + undefended)`. A replay that could not be performed is not a replay the
 * suite failed, and averaging it in either direction would produce a number that moves when the
 * subject's history gets harder to revert rather than when its tests get better or worse.
 */
export function replayScore(results: readonly ReplayResult[]): {
  defended: number;
  undefended: number;
  measured: number;
  unmeasured: number;
} {
  const defended = results.filter((result) => result.verdict === 'defended').length;
  const undefended = results.filter((result) => result.verdict === 'undefended').length;
  return {
    defended,
    undefended,
    measured: defended + undefended,
    unmeasured: results.length - defended - undefended,
  };
}

/**
 * The lines a person reads.
 *
 * Undefended commits first and in full, because each one is a real fault that can return in
 * silence — which is the only output here worth acting on. A reader under time pressure must not
 * have to find them among the reassurances.
 */
export function formatReplay(results: readonly ReplayResult[]): string[] {
  if (results.length === 0) {
    return ['No commit was replayed, so nothing was measured.'];
  }
  const score = replayScore(results);
  const lines: string[] = [];

  const undefended = results.filter((result) => result.verdict === 'undefended');
  if (undefended.length > 0) {
    lines.push(`${undefended.length} real change(s) nothing at HEAD notices being undone:`);
    for (const result of undefended) {
      lines.push(`  ✗ ${result.sha} ${result.subject}`);
      lines.push(`      reverted ${briefly(result.reverted)}`);
      lines.push(
        `      kept at HEAD: ${result.kept.length === 0 ? 'no test file was in this commit' : briefly(result.kept)}`,
      );
    }
  }

  const defended = results.filter((result) => result.verdict === 'defended');
  if (defended.length > 0) {
    lines.push(`${defended.length} change(s) the suite caught being undone:`);
    for (const result of defended) lines.push(`  ✓ ${result.sha} ${result.subject}`);
  }

  const unmeasured = results.filter(
    (result) => result.verdict !== 'defended' && result.verdict !== 'undefended',
  );
  if (unmeasured.length > 0) {
    lines.push(`${unmeasured.length} replay(s) measured nothing:`);
    for (const result of unmeasured) {
      lines.push(`  · ${result.sha} ${result.verdict} — ${result.why ?? 'no reason recorded'}`);
    }
  }

  lines.push('');
  if (score.measured === 0) {
    // The number that must never be printed as 0% or as 100%. Nothing was measured.
    lines.push(
      `Replay: 0 of ${results.length} commit(s) could be measured, so there is no score. ` +
        'A replay that could not be performed is not one the suite failed.',
    );
  } else {
    lines.push(
      `Replay: ${score.defended}/${score.measured} real changes defended` +
        `${score.unmeasured > 0 ? `, ${score.unmeasured} not measurable and excluded` : ''}.`,
    );
    lines.push(
      'These faults were authored by the subject, not by this repository — which is the one ' +
        'thing a hand-written mutation set can never claim about itself.',
    );
  }
  return lines;
}
