import { test, expect } from '@playwright/test';
import {
  behaviourFiles,
  briefly,
  declaredFix,
  faultEvidence,
  formatReplay,
  isInertPath,
  isTestPath,
  rankCandidates,
  replayScore,
  splitCommitFiles,
  verdictFor,
  type HistoricCommit,
  type ReplayResult,
} from '../../src/qe/bug-replay.js';

/**
 * The instrument whose faults are not ours.
 *
 * Every mutation score in this repository grades a suite against one author's model of what
 * breaks, and `docs/mutation-evals.md` names that the biggest thing wrong with the number. A fix
 * commit from the subject's own history is a fault nobody here invented, so these are the rules
 * that decide what gets reverted, what gets kept, and what a run is allowed to claim.
 *
 * The git mechanics need a real repository and live in `tests/integration/bug-replay.int.test.ts`.
 */

const commit = (over: Partial<HistoricCommit> = {}): HistoricCommit => ({
  sha: 'abc1234',
  subject: 'feat: something',
  files: ['src/thing.js'],
  churn: 10,
  ...over,
});

test.describe('telling the product from its tests', () => {
  test('should recognise a test by its directory', () => {
    expect(
      isTestPath('test/unit/rate-limit.test.mjs'),
      'a path under test/ is test code, and reverting it would delete the suite being measured',
    ).toBe(true);
    expect(isTestPath('tests/api.js'), 'tests/ as well as test/ — both are in the wild').toBe(true);
  });

  test('should recognise a test by its filename when it sits beside the source', () => {
    // Both coder subjects are covered only because both shapes are, and they differ: one keeps
    // tests in `test/`, the other writes `src/app/x.spec.ts` next to the component.
    expect(
      isTestPath('src/app/conversation-storage.spec.ts'),
      'a .spec. file under src/ is still a test, and missing it would revert coursera-rag’s Angular specs',
    ).toBe(true);
    expect(isTestPath('src/app/chat.store.spec.ts'), 'the same for a store spec').toBe(true);
  });

  test('should not mistake the product for a test because of a word in its name', () => {
    // `latest`, `contest`, `attestation`: a substring match on "test" would revert a suite's
    // worth of product code and the run would prove nothing.
    expect(isTestPath('server/latest-index.js'), 'latest contains test').toBe(false);
    expect(isTestPath('src/attestation.ts')).toBe(false);
  });

  test('should keep every test out of the revert list', () => {
    const split = splitCommitFiles([
      'server/rag.js',
      'test/unit/streaming.test.mjs',
      'src/app/chat.store.spec.ts',
    ]);
    expect(
      split.source,
      'only the product is reverted — a fix commit carries its own regression test, and reverting that would remove the one test most likely to catch it',
    ).toEqual(['server/rag.js']);
    expect(split.tests).toEqual(['test/unit/streaming.test.mjs', 'src/app/chat.store.spec.ts']);
  });
});

test.describe('what cannot make a suite fail', () => {
  test('should treat documentation and lockfiles as inert', () => {
    // A fix commit edits the README in the same breath. Counting a markdown revert as a replay
    // would fill the undefended column with commits that were never measurable.
    for (const path of ['README.md', 'docs/guide.rst', 'package-lock.json', 'public/logo.svg']) {
      expect(isInertPath(path), `${path} cannot change behaviour`).toBe(true);
    }
  });

  test('should never touch a .env of any variant', () => {
    /**
     * Two reasons, and the second outranks the first. A tracked `.env.sample` is a template, so
     * reverting it cannot change what the product does — the file the application reads is the
     * untracked `.env` beside it. And CLAUDE.md rule 6 makes a `.env` a person's file, which a
     * command writing into somebody else's checkout must not be the place that reasons about.
     * `coursera-rag` has two commits touching `.env.sample`.
     */
    expect(isInertPath('.env.sample')).toBe(true);
    expect(isInertPath('.env.example')).toBe(true);
    expect(isInertPath('.env')).toBe(true);
    expect(isInertPath('config/.env.local')).toBe(true);
    expect(isInertPath('src/environment.ts'), 'but not a file that merely reads like one').toBe(
      false,
    );
  });

  test('should leave a commit with nothing but inert changes with nothing to revert', () => {
    expect(behaviourFiles(['README.md', 'test/unit/x.test.mjs'])).toEqual([]);
  });

  test('should still call an unknown extension behaviour', () => {
    // The direction that fails loudly. A source file misread as inert is silently excluded and
    // the score quietly stops covering it; a doc misread as source produces a visible junk
    // finding, which somebody fixes.
    expect(
      isInertPath('server/handler.kt'),
      'assumed to be behaviour until something says so',
    ).toBe(false);
  });
});

test.describe('which commits are worth a suite run', () => {
  test('should take the author at their word about a fix', () => {
    expect(
      declaredFix(commit({ subject: 'fix(ui): header overlap' })),
      'a conventional-commit prefix is the author saying so, which is coursera-rag’s whole history',
    ).toBe(true);
    expect(
      declaredFix(commit({ subject: 'Bug fixes, added e2e tests' })),
      'and prose counts too — mcpa writes it that way, and refusing prose would see no fixes there at all',
    ).toBe(true);
    expect(
      declaredFix(commit({ subject: 'feat(rag): reranking' })),
      'a feature is not a declared fix; treating one as a fix would fill the ranking with ordinary work',
    ).toBe(false);
  });

  test('should rank a declared fix above a small unrelated change', () => {
    /**
     * The ordering bug this file exists to pin, found on the first live run against `mcpa`: a
     * commit editing `daily-commit.bat` outranked one whose subject reads "Bug fixes, added e2e
     * tests", because both scored two signals and the tie went to the smaller diff. Counting
     * signals treats "18 lines changed" as evidence of a fault, which it is not — it is evidence
     * the replay will be cheap.
     */
    const batch = commit({
      sha: 'bat0001',
      subject: 'Update daily-commit.bat',
      files: ['x.bat'],
      churn: 18,
    });
    const fix = commit({
      sha: 'fix0001',
      subject: 'Bug fixes, added e2e tests as there were plenty of issues',
      files: Array.from({ length: 70 }, (_, i) => `src/f${i}.js`).concat(['e2e/a.spec.js']),
      churn: 4000,
    });

    expect(
      rankCandidates([batch, fix]).map((entry) => entry.commit.sha),
      'no amount of cheapness may promote a commit over one with more reason to be a real fault',
    ).toEqual(['fix0001', 'bat0001']);
  });

  test('should use size only to break a tie between equally likely faults', () => {
    const big = commit({
      sha: 'big0001',
      subject: 'fix: a',
      files: ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js', 't/a.test.js'],
    });
    const small = commit({ sha: 'sml0001', subject: 'fix: b', files: ['src/a.js', 't/a.test.js'] });

    expect(
      rankCandidates([big, small]).map((entry) => entry.commit.sha),
      'both are declared fixes carrying tests, so the cheaper answer comes first',
    ).toEqual(['sml0001', 'big0001']);
  });

  test('should keep fault evidence and cost apart', () => {
    expect(
      faultEvidence(commit({ subject: 'fix: x', files: ['src/a.js', 'test/a.test.js'] })),
    ).toBe(2);
    expect(
      faultEvidence(commit({ subject: 'chore: tidy', files: ['src/a.js'], churn: 3 })),
      'tiny and cheap is not evidence of a fault',
    ).toBe(0);
  });

  test('should drop a commit with nothing revertable', () => {
    expect(
      rankCandidates([commit({ files: ['README.md'] })]),
      'a documentation commit is not a candidate, because reverting it asks the suite nothing',
    ).toEqual([]);
  });
});

test.describe('what a replay is allowed to claim', () => {
  test('should read a green suite as the fault going unnoticed', () => {
    expect(verdictFor('passed'), 'the fault came back and nothing said so').toBe('undefended');
    expect(verdictFor('failed'), 'the suite noticed').toBe('defended');
  });

  test('should never read an unstartable suite as detection', () => {
    // The trap every check in this repository has to clear. A suite that could not run did not
    // notice anything, and scoring it as a catch is how a measurement becomes reassurance.
    expect(verdictFor('unstartable')).toBe('suite-would-not-start');
  });

  test('should keep the unmeasurable out of the denominator', () => {
    const results: ReplayResult[] = [
      { sha: 'a', subject: 'fix: a', verdict: 'defended', reverted: ['a.js'], kept: [] },
      { sha: 'b', subject: 'fix: b', verdict: 'undefended', reverted: ['b.js'], kept: [] },
      { sha: 'c', subject: 'fix: c', verdict: 'would-not-revert', reverted: ['c.js'], kept: [] },
      {
        sha: 'd',
        subject: 'fix: d',
        verdict: 'suite-would-not-start',
        reverted: ['d.js'],
        kept: [],
      },
    ];

    expect(
      replayScore(results),
      'a replay that could not be performed is not one the suite failed',
    ).toEqual({ defended: 1, undefended: 1, measured: 2, unmeasured: 2 });
  });

  test('should refuse to print a score when nothing was measured', () => {
    /**
     * The number that must never read as 0% or 100%. Seven of the ten commits tried on
     * `coursera-rag` would not reverse-apply, and on `mcpa` it was three of three — so this is the
     * normal case, not an edge, and a run that reported `0/0 defended` would be read as a clean
     * bill of health.
     */
    const said = formatReplay([
      { sha: 'a', subject: 'fix: a', verdict: 'would-not-revert', reverted: ['a.js'], kept: [] },
    ]).join('\n');

    expect(said, 'it must say outright that there is no score').toContain('no score');
    expect(said, 'and why that is not the same as a pass').toContain('not one the suite failed');
    expect(said, 'and must not print a fraction that could be mistaken for one').not.toMatch(
      /\d+\/\d+ real changes defended/,
    );
  });

  test('should put the undefended faults first and in full', () => {
    // The only output here worth acting on: a real fault that can come back in silence. A reader
    // under time pressure must not have to find it among the reassurances.
    const said = formatReplay([
      { sha: 'good123', subject: 'fix: caught', verdict: 'defended', reverted: ['a.js'], kept: [] },
      {
        sha: 'bad1234',
        subject: 'fix: missed',
        verdict: 'undefended',
        reverted: ['server/rag.js'],
        kept: ['test/unit/x.test.mjs'],
      },
    ]).join('\n');

    expect(said.indexOf('bad1234'), 'the finding comes before the reassurance').toBeLessThan(
      said.indexOf('good123'),
    );
    expect(said, 'with the files, so it can be reproduced').toContain('server/rag.js');
    expect(said, 'and what was kept, so a misclassification is visible').toContain(
      'test/unit/x.test.mjs',
    );
  });

  test('should say when a commit carried no test of its own', () => {
    // Worth printing rather than leaving blank: a fix with no regression test is a different
    // situation from one whose regression test did not catch the revert.
    const said = formatReplay([
      { sha: 'bad1234', subject: 'fix: x', verdict: 'undefended', reverted: ['a.js'], kept: [] },
    ]).join('\n');
    expect(said).toContain('no test file was in this commit');
  });

  test('should say nothing was measured rather than nothing was wrong', () => {
    expect(formatReplay([]).join(' ')).toContain('nothing was measured');
  });
});

test.describe('a file list a person can read', () => {
  test('should count the tail rather than print it', () => {
    /**
     * `mcpa` commits its generated quiz results, so one commit names seventy files and the
     * candidate listing for it filled a screen with `quiz_1787420680582.json`. The point of
     * printing what will be reverted is that a misclassification is visible at a glance, and that
     * stops working the moment the glance is impossible.
     */
    const many = Array.from({ length: 70 }, (_, i) => `data/q${i}.json`);
    const said = briefly(many);

    expect(said, 'the first few are shown').toContain('data/q0.json');
    expect(said, 'and the rest are counted').toContain('and 64 more');
    expect(said.length, 'the whole point is that it fits on a line').toBeLessThan(200);
  });

  test('should print a short list whole', () => {
    expect(briefly(['a.js', 'b.js'])).toBe('a.js, b.js');
  });
});
