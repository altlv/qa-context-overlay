import { test, expect } from '@playwright/test';
import {
  analyzeAssertionFloor,
  assertionNames,
  type FloorKind,
} from '../../src/quality/assertion-floor.js';

/**
 * The floor is the half of the gate that survives the subject being swapped: `assert-quality`
 * reads Playwright specs, so a subject writing `node:test` used to pass the gate having
 * asserted nothing. Each rule below is tested in both directions, because a floor that fires
 * on a correct test teaches people to ignore it, and one that stays silent on a vacuous test
 * is the thing it exists to prevent.
 */

const kinds = (source: string): FloorKind[] =>
  analyzeAssertionFloor(source).findings.map((finding) => finding.kind);

const NODE_TEST = "const assert = require('node:assert/strict');\n";

test.describe('what the floor refuses', () => {
  test('should refuse a test that asserts nothing', () => {
    const source =
      NODE_TEST +
      `test('finds a term', () => {
        const results = searchIndex.search('alpha');
      });`;

    expect(
      kinds(source),
      'this test passes forever whatever the code does, which is the failure the floor is for',
    ).toEqual(['no-assertion']);
  });

  test('should refuse a test whose every assertion is inside a conditional', () => {
    // Taken from the human baseline this PoC is graded against: the assertion sits inside
    // `if (results.length > 0)`, so the test passes having asserted nothing whenever the
    // search returns nothing — which is exactly when it should fail.
    const source =
      NODE_TEST +
      `test('ranks a match', () => {
        const results = searchIndex.search('alpha');
        if (results.length > 0) {
          assert.equal(results[0].id, 'a');
        }
      });`;

    expect(kinds(source)).toEqual(['conditional-only']);
  });

  test('should read a braceless conditional as guarded', () => {
    const source =
      NODE_TEST +
      `test('returns something', () => {
        const results = searchIndex.search('alpha');
        if (results) assert.ok(results.length);
      });`;

    expect(
      kinds(source),
      'a branch written without braces guards its assertion exactly as much as one with them',
    ).toEqual(['conditional-only']);
  });

  test('should read a loop as guarded', () => {
    const source =
      NODE_TEST +
      `test('scores every hit', () => {
        for (const hit of searchIndex.search('alpha')) {
          assert.ok(hit.score >= 0);
        }
      });`;

    expect(
      kinds(source),
      'a suite that only asserts inside a loop asserts nothing when the collection is empty',
    ).toEqual(['conditional-only']);
  });

  test('should refuse an assertion no input can falsify', () => {
    const source =
      NODE_TEST +
      `test('the stemmer works', () => {
        assert.equal(1, 1);
      });`;

    expect(
      kinds(source),
      'two literals agree whatever the code does, so this is a green test with no subject',
    ).toEqual(['constant-assertion']);
  });

  test('should refuse an assertion on a literal through an expectation chain', () => {
    const source =
      "import { test, expect } from '@playwright/test';\n" +
      `test('adds', () => {
        expect(true).toBe(true);
      });`;

    expect(kinds(source), 'the chained half is read too, not only the value in expect()').toEqual([
      'constant-assertion',
    ]);
  });
});

test.describe('what the floor accepts', () => {
  test('should pass a test that asserts on what the code returned', () => {
    const source =
      NODE_TEST +
      `test('ranks a match', () => {
        const results = searchIndex.search('alpha');
        assert.equal(results[0].id, 'a');
      });`;
    const report = analyzeAssertionFloor(source);

    expect([report.tests, report.assertions], 'one case, one assertion, nothing left over').toEqual(
      [1, 1],
    );
    expect(report.findings).toEqual([]);
  });

  test('should pass a test with one assertion outside the branch and one inside it', () => {
    const source =
      NODE_TEST +
      `test('ranks a match', () => {
        const results = searchIndex.search('alpha');
        assert.ok(Array.isArray(results));
        if (results.length > 1) assert.ok(results[0].score >= results[1].score);
      });`;

    expect(
      kinds(source),
      'the floor asks for one unconditional assertion, not for none inside a branch',
    ).toEqual([]);
  });

  test('should not call an assertion on a computed value constant', () => {
    const source =
      NODE_TEST +
      `test('drops the stop word', () => {
        const tokens = searchIndex.tokenize('the alpha');
        assert.equal(tokens.length, 1);
      });`;

    expect(kinds(source)).toEqual([]);
  });

  test('should read a table-driven case from its second argument list', () => {
    const source =
      NODE_TEST +
      `describe('adds', () => {
        it.each([[1, 2], [3, 4]])('sums %i and %i', (a, b) => {
          assert.equal(add(a, b), a + b);
        });
      });`;
    const report = analyzeAssertionFloor(source);

    expect(
      report.findings,
      'the first argument list is the table, not the body — read as one, every table case looks empty',
    ).toEqual([]);
    expect(report.tests, 'and the case inside a describe is counted once').toBe(1);
  });

  test('should not judge a skipped declaration', () => {
    const source =
      NODE_TEST +
      `test.skip('not yet', () => {});
       test.todo('later');`;
    const report = analyzeAssertionFloor(source);

    expect(
      [report.tests, report.skipped],
      'a test that never runs has not passed, and failing a run over one is a reason nobody can act on',
    ).toEqual([0, 2]);
  });

  test('should not read a test declared inside a fixture string', () => {
    const source = "const example = `test('x', () => {});`;\nconst other = 'it(1)';\n";

    expect(
      analyzeAssertionFloor(source).tests,
      'this repository’s own quality tests carry example specs as strings; firing on those is how a gate gets ignored',
    ).toBe(0);
  });
});

test.describe('what a finding says', () => {
  const source = [
    "const assert = require('node:assert/strict');",
    '',
    "test('the first case', () => {",
    '  assert.equal(index.size, 2);',
    '});',
    '',
    "test('the second case', () => {",
    "  const results = searchIndex.search('alpha');",
    '});',
  ].join('\n');

  test('should name the test and the line it starts on', () => {
    const finding = analyzeAssertionFloor(source).findings[0];

    expect(
      finding?.testName,
      'a finding a reader cannot locate is a finding they cannot act on',
    ).toBe('the second case');
    expect(finding?.line).toBe(7);
  });

  test('should take the assertion name from the stack that declares it', () => {
    const declaration = "const verify = require('node:assert/strict');";
    const written =
      "const verify = require('node:assert/strict');\n" +
      "test('checks', () => { verify.equal(results.length, 1); });";

    expect(
      assertionNames(declaration),
      'a subject that asserts through another name is still read, from data rather than a guess',
    ).toContain('verify');
    expect(
      analyzeAssertionFloor(written, { assertions: declaration }).findings,
      'given the stack’s own import line, the file is read and clears the floor',
    ).toEqual([]);
    expect(
      analyzeAssertionFloor(written).findings.map((finding) => finding.kind),
      'without it the assertion is invisible, which is how a floor silently checks nothing',
    ).toEqual(['no-assertion']);
  });
});
