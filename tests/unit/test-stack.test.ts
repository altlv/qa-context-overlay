import { test, expect } from '@playwright/test';
import { subjectTests, type TestStack } from '../../src/qe/test-stack.js';

/**
 * Which changed files a gate should run with the subject's own runner. Getting this wrong is
 * quiet in both directions: too narrow and the gate reports nothing to check, too wide and it
 * hands a source file to a test runner and fails a run that did nothing wrong.
 */

const stack = (testFilePattern: string): TestStack => ({
  runner: 'node --test',
  runAll: 'node --test test/*.test.js',
  runOne: 'node --test ',
  testsDir: 'test',
  testFilePattern,
  moduleSystem: 'commonjs',
  assertions: "const assert = require('node:assert/strict');",
  exemplar: 'test/specIndexer.test.js',
});

test.describe('picking the subject test files out of a change', () => {
  test('should take every matching test file and nothing else', () => {
    expect(
      subjectTests(stack('*.test.js'), [
        'test/searchIndex.unit.test.js',
        'src/services/searchIndex.js',
        'test/specIndexer.test.js',
      ]),
      'a source file handed to a test runner fails a run that did nothing wrong',
    ).toEqual(['test/searchIndex.unit.test.js', 'test/specIndexer.test.js']);
  });

  test('should match a pattern that names a directory', () => {
    expect(subjectTests(stack('**/*.spec.ts'), ['a/one.spec.ts', 'a/one.ts'])).toEqual([
      'a/one.spec.ts',
    ]);
  });

  test('should match a path git reports with backslashes', () => {
    expect(
      subjectTests(stack('*.test.js'), ['test\\one.test.js']),
      'git and Node spell the same path differently on Windows',
    ).toEqual(['test\\one.test.js']);
  });

  test('should find nothing in a change that touched no test', () => {
    expect(subjectTests(stack('*.test.js'), ['src/server.js', 'README.md'])).toEqual([]);
  });

  // These four are the cases the tests above could not fail. Every pattern they exercise
  // discriminates on its last segment, so an implementation that kept only that segment and
  // discarded the directories passed all of them — while turning "tests/**/*.js" into the
  // suffix ".js" and claiming every changed JavaScript file in the repository.
  test('should honour the directory part of a pattern, not only its last segment', () => {
    expect(
      subjectTests(stack('tests/**/*.js'), ['tests/unit/x.js', 'src/index.js', 'src/deep/a.js']),
      'a pattern whose discrimination lives in its path must not reduce to a file suffix',
    ).toEqual(['tests/unit/x.js']);
  });

  test('should claim nothing when the declared directory is absent from the change', () => {
    expect(subjectTests(stack('**/__tests__/*.js'), ['src/index.js', 'lib/util.js'])).toEqual([]);
  });

  test('should keep * inside one segment', () => {
    // "src/*.js" names the files directly in src, not the tree beneath it. A matcher that
    // let * cross a slash would hand the gate a file two directories down.
    expect(subjectTests(stack('src/*.js'), ['src/a.js', 'src/deep/b.js'])).toEqual(['src/a.js']);
  });

  test('should treat a pattern with no slash as "anywhere"', () => {
    // Which is how every stack so far writes it, and the reason the old suffix match looked
    // sufficient for as long as it did.
    expect(subjectTests(stack('*.test.js'), ['deep/nested/a.test.js'])).toEqual([
      'deep/nested/a.test.js',
    ]);
  });
});
