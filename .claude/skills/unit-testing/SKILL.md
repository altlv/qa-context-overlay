---
name: unit-testing
description: Shape a unit test so it fails for exactly one reason when the rule breaks, asserts what the unit promises its caller, and would notice a real fault. Use when writing or reviewing a test for a function, module or class — input to output, no browser and no network. Not for choosing which values, combinations or paths to feed in — that is test-techniques, and it comes first only while the inputs and rules are still undecided.
---

`test-techniques` decides **which values** a unit's inputs deserve. This decides **what
the test does with them**: where the unit's edge is, which of its promises the assertions
check, when a collaborator is replaced, and how the test is written so that its failure
carries information.

It exists because a suite can be green, readable and worthless at the same time. Every
rule below names the failure it prevents; a rule that cannot name one does not belong in
this file.

## When to use

- A function, module, class or piece of pure logic needs its first test
- A design lists cases at unit level and you are implementing them
- An existing unit test needs reviewing — grade it against the coverage bar below
- A test broke during a refactor that changed no behaviour, and the test is the suspect
- You are about to reach for a double and want to know whether it is the right move

## When NOT to use

- The values, classes and combinations are not decided yet → `test-techniques` first
- The behaviour only exists across a boundary — a request, a database, a browser → test
  it at the level where that behaviour lives; a unit double for it proves nothing
- The question is what deserves testing at all → `test-design`
- A test passes and fails with no code change → `flaky-test-detection`, not this

## Procedure

1. **Read the unit before opening an editor.** Write down its inputs and what it does with
   each, the value it returns, the state it changes, the errors it raises, the
   collaborators it calls, and what it promises the caller. If you cannot state the
   promise in one sentence, you do not yet know what to assert — every assertion you write
   now will describe the code instead of the behaviour, and it will survive a defect. Read
   one of the subject's existing tests and the command that runs them before you write
   anything: the runner, the module system, the assertion library and the file's own
   conventions are facts to find, not choices to make. A file that does not match them is
   not collected by the suite at all, and a test nobody runs reports nothing.

2. **Decide where the unit ends.** One unit is a decision, not a fact about a file: a
   single file may hold three units, and one unit may span three files. Draw the boundary
   around the promise, not around the syntax. If the promise is "a query becomes ranked
   results", the tokeniser, the scorer and the ranking step are one unit under test.
   Drawing it around a private helper gives you a test that breaks on the next refactor,
   covers nothing the caller can observe, and cannot be deleted because nothing else
   covers the promise. Start from the scripted map rather than from memory:
   `npm run candidates -- <path>` lists every exported unit with a verdict — unit,
   needs-control (reads the clock or randomness), not-unit (reaches a file, a wire, a
   process or a database), or unknown — and names the candidates no test mentions. It
   decides reach from the symbol's own body, so a pure wrapper around an I/O call still
   reads as unit: take its output as a floor and a map, never as the decision, and read
   the body before trusting the label. Classing a whole class as not-unit because one of
   its methods writes a file is how pure methods beside it stay untested.

3. **Choose what to assert, in this order of preference.**
   - **The returned value, compared whole** — cheapest to read and the hardest to fool.
     Assert the entire returned value rather than the fields you happened to think of: a
     test checking three fields passes while the fourth is wrong, and it needs editing
     every time the value gains a field. Where some parts are incidental — a generated
     identifier, a timestamp — compare the rest whole and those parts narrowly, or the
     test fails on churn that is not the behaviour it covers. Where the value is a computed
     number, compare it within a stated tolerance rather than to a typed decimal: a
     hand-written decimal will not round-trip a computed double, so the test fails for a
     reason that is not the behaviour. Keep the tolerance tight enough that a changed
     formula still fails it.
   - **An observable state change** — what a caller can see afterwards: the record exists,
     the queue grew, the file was written. Asserting only the return value of something
     whose real job is the write passes happily while nothing is stored, which is the
     defect this repo has a live example of.
   - **An interaction with a collaborator** — only when the interaction _is_ the promise,
     such as asking a mailer to send. Reaching for this first turns the suite into a
     transcript of the implementation, and it fails on every internal reordering.

4. **Never assert how the unit does it.** No private methods, no call order between
   internals, no log strings, no intermediate variables, no "it called helper twice".
   A test coupled to the implementation fails on every refactor while catching no defect:
   it fires when the code is improved and stays silent when the code is wrong.

5. **Test both directions.** A unit that judges input — a validator, checker, parser,
   guard — needs a case where it fires on bad input **and** a case where it stays silent on
   good input. A suite proving only "a problem is reported" passes just as well for a
   function that reports a problem for everything, and the day it starts rejecting valid
   input the suite is still green. The inverse is as bad: a checker tested only with valid
   input is a checker nobody has seen work.

6. **Replace a dependency only when what it does makes that necessary.** The decision is
   about behaviour, not about the name of the double:

   | What the dependency does                          | What the test does                                  | Failure if you skip it                                                             |
   | ------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
   | Returns a value the unit branches on              | Hand it the value directly, or stubs it             | The slow real thing is dragged in and the branch is never reached                  |
   | Records something — writes, sends, appends        | Record the call and assert on the record            | The unit's actual promise goes unverified and passes with the write deleted        |
   | Is slow or unreachable — network, payment, queue  | Replace it; a unit test does not cross a wire       | The suite takes minutes, fails when the network does, and gets deleted             |
   | Is non-deterministic — clock, random, identifiers | Control it and inject the value; never assert on it | The assertion encodes today's date and fails tomorrow for unrelated reasons        |
   | Is not yours — a third-party SDK                  | Replace it at your own boundary                     | Their next release becomes a failure in your suite and a story about your code     |
   | **Is the unit under test**                        | **Stop. The test has lost its subject.**            | The assertions describe the double; the suite stays green while the unit is broken |

   Three doubles for one small unit is not a testing problem, it is a design signal: the
   unit is doing several jobs, and the fix is to split it rather than to build a stage set.

7. **Give each test one reason to fail.** Not one assertion — one reason. A table of
   invalid inputs, every one of them rejected for the same reason, is one reason to fail
   and a good test; several assertions of the same fact are fine and often clearer, which
   is why `test-techniques` prefers one case carrying many values to a dozen one-value
   tests. A test asserting five unrelated things reports none of them clearly when it
   breaks: the failure names one line, the other four rules are silently unverified, and
   whoever reads it has to work out what the test was for. If the assertions cannot share
   one sentence, they are two tests.

8. **Name the rule, not the function.** `rejects a verdict with no evidence` beats
   `test schema 2`; neither the function name nor the file name tells the reader what
   broke. The name is what the next person sees in a failing run, at the moment they know
   least about the change.

9. **Arrange, act, assert — as a shape, not a ritual.** Arrange the state, act once, then
   assert the outcome. Blur the three and a test that arranges in four places and acts
   twice cannot say which act produced the failure; the first half passes, the second half
   fails, and the evidence points at the wrong line. One act per test, unless the promise
   is a sequence — and then the sequence is the unit.

10. **Be deterministic and isolated.** No wall clock, no random values, no dependence on
    test order, no shared mutable module state, no files or rows left behind for the next
    test. Each test builds the state it needs and removes it. A suite that passes only in
    the order it happens to run is one long test with arbitrary breakpoints: running a
    single file alone then proves nothing, and the first genuine regression arrives
    disguised as flake.

11. **Check that the tests are worth having.** A green suite proves the tests ran, not
    that they would notice a fault. Break one rule of the unit on purpose — invert a
    comparison, drop a guard, return the input unchanged, move a boundary by one — and the
    suite must go red.

    ```js
    // source: if (score > threshold)   →   mutation: if (score >= threshold)
    // if the suite stays green, no test ever asserted which side of the
    // boundary counts, and the boundary is now an assertion hole
    ```

    A survivor is usually an assertion hole: strengthen the assertion rather than adding
    another test beside it. Check first that it is not equivalent — a mutation that cannot
    change behaviour for any input, because the branch it removes is unreachable or its
    effect is undone further down. Those survive every suite that will ever exist, and
    chasing them with a contrived case only adds a test nobody would have written.
    Coverage percentage is a floor that finds untouched code and never a
    goal — it cannot see whether anything was asserted, whether the expected value was
    right, or which values were never tried, and a branch covered by `assert.ok(result)`
    is covered by nothing.

## Coverage bar — when you are done

- The unit's promise is written in one sentence, and at least one test fails when it is
  broken
- Every error path and every branch of the rule has been exercised at least once, and you
  can name the case that reaches each
- Every judging unit has both a firing case and a silent case
- Each test has one reason to fail, and its name states the rule rather than the function
- The file has been run twice — alone, and with the whole suite. Alone it is green. In the
  suite the failures are no more numerous than the count you measured before adding it, and
  you can quote both numbers. A suite that was already red stays red: a run that does not
  separate the two cannot tell your file from the wreckage. A count that moves on its own
  between runs is the suite's flakiness, which is a finding, not your doing
- No assertion reaches into internals; no test needs the clock, the network or another
  test's leftovers to pass
- At least one rule was broken on purpose and a named test caught it. Any rule that
  survived is reported as a hole, not quietly left
- If coverage was measured, the report says which branches are still untouched and why,
  instead of quoting a percentage

## Output

- The test file, runnable by the subject's own runner with no new dependency and no
  change to the code under test
- The command run and its actual result, quoted, with the suite's failure count before and
  after your file; anything not run named as NOT RUN rather than left implied
- One line per unit: the promise it makes, the cases that cover it, and what was
  deliberately left out
- The mutations tried and the test that caught each — or the survivors, each named as an
  assertion hole with the assertion that needs strengthening, or as equivalent and why
- Anything that could only be asserted by doubling the unit itself, with the level at
  which it should be tested instead

## Compact core

If this file is not read as a file, these are the rules that still apply.

1. State the unit's promise to its caller in one sentence. If you cannot, you do not know
   what to assert.
2. The unit's boundary is a decision. Draw it around the promise, not around the file.
3. Assert, in order of preference: the returned value, the observable state change, the
   interaction with a collaborator — and the third only when the interaction is the
   promise.
4. Never assert how the unit works inside. Such a test fails on every refactor and catches
   no defect.
5. Anything that judges input gets a case where it fires and a case where it stays silent.
6. Replace a dependency because of what it does, never because of what it is called. A
   double standing in for the unit under test means the test has lost its subject.
7. One reason to fail per test. Five reasons in one test reports none of them.
8. Name the rule, not the function.
9. Arrange, act once, assert the outcome.
10. No clock, no randomness, no order dependence, no shared state. Passing only in order
    is not passing.
11. Green means the tests ran. Break a rule on purpose; if nothing goes red, that rule is
    unasserted.
12. Coverage is a floor, never a goal. It cannot see whether you asserted anything.
13. Report what you did not cover. A silent gap is indistinguishable from an oversight.

## Decision points

| Situation                                         | Action                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| The promise cannot be stated                      | Stop and ask. An assertion invented now encodes a guess and will pass forever        |
| The unit needs three doubles to be testable       | Split the unit, or move the test up a level. Do not build the stage set              |
| The only way to assert it is to call a private    | The test is aimed at the wrong boundary. Re-aim it at the caller's view              |
| A test broke on a refactor that lost no behaviour | The test was coupled to the implementation. Fix the test, and say so                 |
| A mutant survives                                 | Strengthen the assertion that should have caught it. Adding tests beside it hides it |
| The expected value is uncertain                   | Say so; do not derive the expectation from the code, which makes any output correct  |

## Interlaying (blind spot)

This shapes the test; it does not choose the values. Which classes, boundaries,
combinations and paths a unit deserves is `test-techniques`, and it is worth doing first.
It also cannot tell you whether the expected value is correct — an assertion can encode a
wrong expectation flawlessly, which is a question for the rule and the oracle rather than
for the test. What deserves coverage at all is `test-design`; why a suite is unstable is
`flaky-test-detection`; whether the production code could be made testable at this level
is `testability-audit`.

_Lineage and licences: `docs/sources.md`._
