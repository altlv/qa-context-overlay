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
});
