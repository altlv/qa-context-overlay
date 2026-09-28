/**
 * A known-bad input for every gate check, and what it must say about it.
 *
 * The gate's verdict is what decides whether anything else in this repository is worth
 * believing. Nothing was checking the checkers, and twice in one week that cost:
 *
 *  - `mutation-compare` exited 1 whenever any mutation survived. No real suite kills
 *    every mutation — the subject's own hand-written suite leaves 10 of 14 alive — so as
 *    a gate step it would have been permanently red, and a step that cannot go green is
 *    one people learn to ignore.
 *  - `assertion floor: PASS` was read as "these tests are worth something". It means
 *    three mechanical things, and the module says so about itself: *"a floor that reports
 *    OK and means 'I read nothing you would need to worry about' is the failure this
 *    project keeps meeting: a verification that cannot fail reports as checked."*
 *
 * So each check is handed something it is supposed to reject, and is required to reject
 * it. A check that passes its own poison is not a verification, whatever it prints.
 *
 * **This is mutation testing aimed at the gate rather than at the code.** The poison is
 * the mutation; the check is the test; a poison that survives is a gate step that would
 * let the same fault through in a real run.
 *
 * Two rules for adding one. The poison must be *minimal* — bad in exactly the way the
 * check exists to catch and valid in every other respect, or a pass proves only that the
 * input was malformed. And `because` must name the fault a person would care about, not
 * the mechanism: "asserts nothing at all", not "no expect( in the source".
 */

export interface Poison {
  /** The check, named as the gate names it. */
  check: string;
  /** The file the check is pointed at, written into a scratch directory. */
  file: string;
  contents: string;
  /** Why a passing verdict here would mean the check is not one. */
  because: string;
}

/** A `node:test` file that runs green and proves nothing. */
const ASSERTS_NOTHING = `const { test } = require('node:test');

test('the search index returns results', async () => {
  const index = { search: (q) => [q] };
  index.search('anything');
});
`;

/** Every assertion reachable only when a branch is taken. */
const ASSERTS_IN_A_BRANCH = `const { test } = require('node:test');
const assert = require('node:assert/strict');

test('rejects an unknown lab', async () => {
  const reply = { status: 404 };
  if (reply.status === 500) {
    assert.equal(reply.status, 500);
  }
});
`;

/** An assertion no input can falsify. */
const ASSERTS_A_LITERAL = `const { test } = require('node:test');
const assert = require('node:assert/strict');

test('the registry lists labs', async () => {
  assert.equal(1, 1);
  assert.ok(true);
});
`;

/**
 * A report whose frontmatter is well-formed and whose content is not.
 *
 * `evidence` counts three findings and one is listed; a defect claim carries no `basis`.
 * Both are rules `check-report` exists to enforce, and neither is a parse error — a
 * malformed document would prove only that the parser works.
 */
const REPORT_THAT_LIES = `---
report: exploratory-session
target: https://example.test
date: 2026-09-28
author: poison
verdict: PASS
confidence: high
evidence:
  direct: 3
  inferred: 0
  claimed: 0
findings:
  - id: F1
    severity: blocker
    evidence: direct
    summary: The cart total disagrees with the sum of its lines.
not_covered: []
not_run: []
---

# Body
`;

export const POISONS: Poison[] = [
  {
    check: 'assertion floor',
    file: 'asserts-nothing.test.js',
    contents: ASSERTS_NOTHING,
    because:
      'a test that asserts nothing passes its runner, so the runner cannot catch it and this is the only step that can',
  },
  {
    check: 'assertion floor',
    file: 'asserts-in-a-branch.test.js',
    contents: ASSERTS_IN_A_BRANCH,
    because:
      'an assertion only reached when a branch is taken is green on every input that skips it',
  },
  {
    check: 'assertion floor',
    file: 'asserts-a-literal.test.js',
    contents: ASSERTS_A_LITERAL,
    because: 'no change to the code under test can make 1 !== 1 fail',
  },
  {
    check: 'report',
    file: 'report-that-lies.md',
    contents: REPORT_THAT_LIES,
    because:
      'the evidence counts do not match the findings and a blocker carries no oracle, which is what a report check is for',
  },
];
