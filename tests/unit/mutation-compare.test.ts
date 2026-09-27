import { test, expect } from '@playwright/test';
import {
  anchorProblem,
  anchorProblems,
  applyMutation,
  newSurvivors,
  parseCompareArgs,
  readMutations,
  summarise,
  type Mutation,
} from '../../src/qe/mutation-compare.js';

/**
 * The comparator decides whether a mutation was applied at all, whether a suite is weaker than the
 * one before it, and how a command line is split. Each rule is tested in both directions, because
 * a comparator that reports a perfect score over mutations it never applied is worse than none.
 */

const mutation = (over: Partial<Mutation> = {}): Mutation => ({
  file: 'src/rule.js',
  find: 'score > 10',
  replace: 'score >= 10',
  breaks: 'the boundary counts as high',
  ...over,
});

test.describe('applying a mutation', () => {
  test('should apply an anchor that resolves to exactly one place', () => {
    expect(applyMutation('if (score > 10) return 1;', mutation())).toBe(
      'if (score >= 10) return 1;',
    );
  });

  test('should refuse an anchor that resolves to several places', () => {
    // `String.replace` takes the first, so the mutation lands somewhere other than the rule and
    // the score reports a rule as checked that nothing checked.
    expect(
      applyMutation('score > 10; score > 10;', mutation()),
      'an anchor matching twice is applied to the wrong place, silently',
    ).toBeNull();
  });

  test('should refuse an anchor that resolves to nothing', () => {
    expect(
      applyMutation('if (score > 9) return 1;', mutation()),
      'a rotted anchor reported as a survivor would be blamed on the suite',
    ).toBeNull();
  });
});

test.describe('what makes a mutation unusable', () => {
  test('should name the problem rather than run it', () => {
    expect(anchorProblem(mutation({ breaks: '  ' }))).toContain('no rule');
    expect(anchorProblem(mutation({ find: '' }))).toContain('empty anchor');
    expect(
      anchorProblem(mutation({ replace: 'score > 10' })),
      'replacing an anchor with itself can never fail a suite',
    ).toContain('itself');
    expect(anchorProblem(mutation())).toBeNull();
  });

  test('should report every problem with the file it is in', () => {
    const problems = anchorProblems([mutation(), mutation({ breaks: '' })]);
    expect(problems, 'a usable mutation must not be reported').toHaveLength(1);
    expect(problems[0]).toContain('src/rule.js');
  });
});

test.describe('the strength delta', () => {
  test('should report a mutation the second suite stopped catching', () => {
    expect(
      newSurvivors(['a', 'b'], ['b', 'c']),
      'a change may never leave the suite weaker than it found it',
    ).toEqual(['c']);
  });

  test('should say nothing when the second suite catches more', () => {
    expect(
      newSurvivors(['a', 'b'], ['a']),
      'a suite that kills more is stronger, and being stronger is not a finding',
    ).toEqual([]);
  });

  test('should count kills and carry the survivors by name', () => {
    const summary = summarise([
      { ...mutation({ breaks: 'one' }), killed: true },
      { ...mutation({ breaks: 'two' }), killed: false },
    ]);
    expect(summary, 'a count with no names cannot be acted on').toEqual({
      killed: 1,
      total: 2,
      survivors: ['two'],
    });
  });
});

test.describe('reading a command line', () => {
  test('should read a suite command as argv, spaces and all', () => {
    const args = parseCompareArgs([
      '--mutations',
      'set.json',
      '--repo',
      '../subject',
      '--suite',
      'node',
      '--test',
      'my folder/x.test.js',
      '--against',
      'node',
      '--test',
      'test/weaker.test.js',
    ]);

    expect(args.mutations, 'splitting a command on spaces breaks on the first quoted path').toBe(
      'set.json',
    );
    expect(args.repo).toBe('../subject');
    expect(args.suite).toEqual(['node', '--test', 'my folder/x.test.js']);
    expect(args.against).toEqual(['node', '--test', 'test/weaker.test.js']);
  });

  test('should stop a flag at the next flag', () => {
    const args = parseCompareArgs(['--suite', 'node', '--test', 'a.js', '--repo', 'x']);
    expect(args.suite, 'a suite must not swallow the flag after it').toEqual([
      'node',
      '--test',
      'a.js',
    ]);
    expect(args.repo).toBe('x');
  });

  test('should default the repository and leave no suite when none is given', () => {
    const args = parseCompareArgs([]);
    expect(
      [args.repo, args.suite.length, args.against],
      'a missing suite is refused, not guessed',
    ).toEqual(['.', 0, null]);
  });
});

test.describe('reading a mutation set', () => {
  test('should accept entries that name a rule and anchor', () => {
    const { mutations, problems } = readMutations([mutation()]);
    expect(problems, 'a sound mutation must not be reported as a problem').toEqual([]);
    expect(mutations, 'and must survive loading with its fields intact').toHaveLength(1);
  });

  test('should refuse entries that are not mutations, naming the field', () => {
    const { mutations, problems } = readMutations([{ file: 'a.js', find: 'x' }]);
    expect(mutations, 'an entry with no replace or breaks would be applied blindly').toEqual([]);
    expect(problems[0]).toContain('replace');
    expect(problems[0]).toContain('breaks');
  });

  test('should refuse a set that is not an array', () => {
    expect(readMutations({ file: 'a.js' }).problems[0]).toContain('not an array');
  });
});
