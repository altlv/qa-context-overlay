---
name: integration-testing
description: Shape an integration test around a real seam — components wired together, or the whole application through its entry point — so it fails for one reason when the wiring or the contract breaks. Use when the behaviour under test crosses a boundary: a spawned process, an HTTP surface, a protocol on stdio, a file written and read back, a configuration that decides which dependency is used. Not for pure logic inside one module (unit-testing), for choosing which values and paths to exercise (test-techniques), or for anything that needs a browser.
---

`test-techniques` decides **which values** a seam deserves. This decides **what the test stands
up, what it may replace, and what it must observe**: where the boundary of the thing under test
lies, which dependency may be fixed and which may not, and what a passing run actually proves.

This level exists because a real failure lived between the modules: a CLI crashed on a path that
did not exist, every unit test passed, every browser test passed, and CI died on the first run.
The bug was in argument handling — in the wiring, not inside any module. Every rule below names
the failure it prevents; a rule that cannot name one does not belong in this file.

## When to use

- Two or more real modules are wired together and the risk is in the wiring
- The whole application must be reached through its entry point: a spawned process, an HTTP
  surface, a protocol on stdio
- A file, a directory or a configuration value is written by one component and read by another
- A design lists cases at integration level and you are implementing them
- An existing integration test needs reviewing — grade it against the coverage bar below
- A seam behaves differently in a test than in production and you need to find out which half
  is not real

## When NOT to use

- The behaviour is inside one module and pure → `unit-testing`. Standing up a process to test
  arithmetic costs the suite its runtime for nothing
- The values, classes and combinations are not decided yet → `test-techniques` first
- The only way to see the behaviour is through a rendered page → the e2e level, not this one
- The question is what deserves testing at all → `test-design`
- A test passes and fails with no code change → `flaky-test-detection`, not this
- The subject reaches a model or an MCP server and you want its judgement measured over many
  runs → that is evaluation, not a test you write (see the blind-spot section)

## Procedure

1. **Say which kind of integration this is, because it decides what you may replace.**

   | Kind                      | The real thing                                | What you may fix                                                                             | The failure if you get it wrong                                                                                  |
   | ------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
   | **Component integration** | two or more of the subject's modules wired    | the world beyond the cluster: a provider, a clock, a queue, a third-party SDK                | Doubling the wiring makes it a unit test with extra steps: it passes while the seam it was written for is broken |
   | **App integration**       | the whole application through its entry point | the environment, never the app: a temp directory, a port, environment variables, seeded data | Doubling the app proves the double works. Nothing about the app is tested, and the suite reports success         |

   A seam needs one kind, and most mistakes at this level are a test that thinks it is the other.
   Write the kind down before the first assertion; a reviewer should be able to check it from the
   file.

2. **Never replace the thing under test.** The seam's two sides are the subject: the call that
   crosses and the code that answers it. A test that doubles either side asserts against its own
   arrangement and stays green while the real wiring is wrong. The test that tells them apart: _if
   the assertion would still pass with the two sides disagreeing, the seam is not being tested._

3. **Assert what a caller can observe across the boundary, in this order.**
   - **The exit code**, for anything that runs as a process. A command that prints an error and
     exits 0 is a check that silently passes, and CI branches on that number.
   - **State that was persisted**, read back through the real boundary. A response describes what
     the component said, not what it stored: a 200 that writes nothing passes every check on its
     body. This repository has a live API that behaves exactly that way.
   - **The protocol, status and shape** of what came back — the status code, the schema, the field
     an error must carry.
   - **An interaction with the other side** — only when the interaction _is_ the contract, such as
     a component being asked to publish. Reaching for this first turns the test into a transcript
     of the implementation.

4. **Reach the unhappy paths that exist only at this level.** A missing file, a missing directory,
   malformed input, no arguments at all, a path that exists but is the wrong kind of thing, a port
   already in use, a child process that fails to start. Each is a seam, and each is where the real
   failures have been. Both directions matter: a guard tested only with bad input is a guard nobody
   has seen stay silent, and one tested only with good input is a guard nobody has seen fire.

5. **Give every test its own world.** Its own temp directory, its own output paths, its own port.
   Two tests writing one file or sharing one fixture is shared mutable state, and it has already
   made a suite here flaky once. Seed what the test needs, remove it afterwards, and never depend
   on a file another test left behind.

6. **Kill every child process in a `finally`.** A spawned server that outlives its test holds a
   port and a working directory, and the next run fails for a reason that names no process. The
   same applies to a process started for setup: if the assertion throws first, nothing after it
   runs — which is exactly when the process is left behind.

7. **Repeat an integration file before believing it is stable.** One green run is not evidence
   about a process. Timing, ports and start-up order are where this level flakes, and a test that
   passes once and fails once has told you something a single run could not. Quote both runs.

8. **Take the expected value from outside the implementation.** A documented contract, a
   specification, an independent recomputation — never from the component's own output. The
   integration-specific trap: **a round trip proves the two sides agree, not that either is
   right.** Two components that share a wrong assumption pass every round trip you write, and the
   greener the suite, the more convincing the shared mistake looks.

9. **Fix a non-deterministic dependency, and say which way you fixed it.** A model provider or an
   MCP server cannot be asserted against directly: mock it entirely and the real behaviour is
   hidden, call it live and the suite is slow, expensive and unstable.
   - **Record and replay** is the honest default: capture one real interaction, commit it as a
     fixture, replay it deterministically, and assert the **flow** — which dependency was asked,
     in what order, with what arguments, and what your code did with the answer — never the text
     that came back.
   - **State the limit out loud**, because it is the trap at this level: a recorded session is one
     sample of a distribution, and a fixture the model has outgrown is a test of the fixture.
   - **Where the infrastructure does not exist**, double the dependency at the cluster's edge — at
     component level — and report that you did, rather than asserting against a live model and
     calling it deterministic.
   - **Look for a deterministic branch before you reach for any of this.** A seam with a provider
     often has a fallback: this repo's subject reaches six OpenAI-compatible providers _and_ falls
     back to lexical search with template responses when none is configured. That fallback is a
     real code path with a real contract, it is testable today with no fixtures at all, and it is
     the half most people never reach. Choosing which provider is active is itself a component
     under test when the selection is a function of the environment.

10. **Assert nothing a unit test could have asserted, and nothing a browser must.** Push each
    check as far down as it will go: logic that needs no process belongs at unit level, and
    anything only visible through a rendered page belongs to the e2e level. A suite that stands
    the world up to check a pure function costs runtime and trust, and one that reaches a real
    third-party host makes every future run depend on someone else's uptime.

11. **One reason to fail per test, named as the rule.** Arrange, act once, assert the outcome.
    `rejects a job whose output directory does not exist` beats `test run 3`. The name is what the
    next person sees in a failing run, at the moment they know least about the change. A test with
    five unrelated assertions reports none of them clearly.

12. **Check that the tests are worth having.** Green means the tests ran, not that they would
    notice a fault. Break one rule of the seam on purpose — drop a guard, ignore the exit code,
    write nothing where something must be written, invert the boundary by one — and a named test
    must go red. A survivor is an assertion hole: strengthen the assertion rather than adding
    another test beside it. Coverage is a floor that finds untouched code, never a goal; it cannot
    see whether anything was asserted, and a branch covered by `assert.ok(result)` is covered by
    nothing.

## Coverage bar — when you are done

- Each test states its kind — component or app — and what it fixed, and the thing under test is
  real on both sides of the seam
- Every seam the task names is reached through its real entry point, not by importing around it
- Every observable has been asserted where it exists: the exit code, the state read back, the
  status or protocol. A run that asserts only the response is reported as a gap, not as coverage
- Every error path the seam can take has a case, and the file names the one that reaches each
- Each test has its own temp directory and output paths, and no child process outlives its test —
  checked by running the file twice, in the order the runner chooses
- The file has been run alone and with the whole suite. Alone it is green. In the suite the
  failures are no more numerous than the count you measured before adding it, and you can quote
  both numbers. A suite that was already red stays red
- At least one rule was broken on purpose and a named test caught it. Any survivor is reported as
  a hole, with the assertion that needs strengthening — or as equivalent, and why
- Every dependency that was fixed is named, with what the fixing does and does not prove

## Output

- The test file, runnable by the subject's own runner with no new dependency and no change to the
  code under test
- The command run and its actual result, quoted, with the suite's failure count before and after
  your file; anything not run named as NOT RUN rather than left implied
- One line per seam: the kind, the entry point reached, the observables asserted, and what was
  deliberately left out
- Every dependency that was doubled or recorded, and what a passing run therefore does not prove
- The mutations tried and the test that caught each — or the survivors, each named as an assertion
  hole or as equivalent and why
- Anything that could only be asserted by doubling the thing under test, with the level at which
  it should be tested instead

## Compact core

If this file is not read as a file, these are the rules that still apply.

1. Say whether this is component integration (your modules wired, the outside world fixed) or app
   integration (the whole app through its entry point, environment fixed). Most mistakes are one
   test believing it is the other.
2. Never double the thing under test. If the assertion passes with the two sides disagreeing, the
   seam is not being tested.
3. Assert the exit code, the state read back through the boundary, and the status or protocol. A
   response describes what was said, not what was stored.
4. Missing file, missing directory, malformed input, no arguments, wrong kind of path, port in
   use: these paths exist only here, and both directions of every guard need a case.
5. Its own temp directory, its own output paths, its own port. Shared state is how this level
   flakes.
6. Kill every child process in a `finally`, or it outlives the test and holds a port.
7. Repeat the file before believing it is stable. One green run is not evidence about a process.
8. A round trip proves the two sides agree, not that either is right. Take the expected value from
   a contract, a spec or a recomputation.
9. Non-deterministic dependency: record and replay, assert the flow and never the wording, and say
   out loud that a fixture is one sample of a distribution.
10. Look for the deterministic branch first — a provider-backed seam often has a fallback, and it
    is real code nobody has reached.
11. Push it down if a unit test could assert it; push it up if only a browser can see it.
12. One reason to fail per test, named as the rule.
13. Green means the tests ran. Break a rule on purpose; a survivor is an assertion hole, and
    coverage is a floor rather than a goal.

## Decision points

| Situation                                               | Action                                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The seam needs three doubles to run at all              | The boundary is drawn wrong. Widen it to the app entry point, or narrow it to a unit                |
| The assertion is about the text a model produced        | You are testing the model. Assert the flow, the arguments and your code's handling of the answer    |
| The dependency has no replay fixture and no mock        | Fix it at the cluster's edge, component level, and report that the seam is not exercised end to end |
| The test is green and the two sides disagree            | The doubling is in the wrong place. Find which side of the seam is not real                         |
| A test passes alone and fails in the suite              | Shared directory, port or fixture. Give it its own, and quote both runs                             |
| The process is still running after the test             | The kill is not in a `finally`. It holds a port, and the next failure names no process              |
| The expected value came from the component's own output | It proves agreement, not correctness. Find the contract or the spec, or say the oracle is missing   |
| The check needs no process, file or wire                | It belongs at unit level. Move it down rather than paying for this level's runtime                  |

## Interlaying (blind spot)

This shapes the test; it does not choose the values. Which classes, boundaries and combinations a
seam deserves is `test-techniques`, and it is worth doing first. What deserves coverage at all,
and at which level, is `test-design`; a pure function that wandered in here is `unit-testing`'s;
anything only a rendered page can show belongs to the e2e level, and why a suite is unstable is
`flaky-test-detection`.

It also cannot tell you whether the expected value is correct — an assertion can encode a wrong
expectation flawlessly. At this level that failure is quieter than anywhere else, because a round
trip between two components that share a wrong assumption passes by construction.

And it is not an evaluation method. Success rates over repeated runs, and judgement of output that
has no single right answer, are a different kind of measurement from a test that passes or fails:
this repository has those parked rather than built, and what it does have of them is partial. A
recorded fixture also decays in a way a written test does not — it is only as good as the sample it
captured, and nothing here will notice when the model it recorded has moved on.

_Lineage and licences: `docs/sources.md`._
