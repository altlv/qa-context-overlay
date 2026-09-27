---
name: repo-survey
description: Map the repository under test — the changed files, their exported units, their callers and callees, what tests point at them and what nothing points at — before writing anything for it. Use when starting work on unfamiliar code, on new functionality, or when asked where the coverage gaps are. Not for deciding what deserves coverage (test-design) or for shaping the test once a target is chosen (unit-testing).
---

`test-design` decides **what deserves coverage**, and it is a planner's artefact. This
decides **what you are standing in**: which file holds the change, which units it exports,
who calls it, what it calls, which tests point at it, and what nothing points at.

It exists because the opening move of every coding task is a tree walk. Reading the tree
costs most of a context, is done again on the next task, and is done badly under pressure —
which is how a pure method gets excluded along with the class around it, and how a caller
that a change puts at risk is discovered after the change rather than before.

## When to use

- You are given a change, a feature, or a file you have not read, and must write tests
- You are asked where the coverage gaps are
- You are choosing what belongs together in one integration test
- Before a coder run, to turn "add tests for this" into a bounded target

## When NOT to use

- Deciding what deserves coverage at all → `test-design`
- Choosing which values a chosen unit needs → `test-techniques`
- Shaping the test itself → `unit-testing`
- Auditing how testable a running app is → `testability-audit` (that is the UI surface)

## Procedure

1. **Scope to the change, not the tree.** `npm run survey -- <path> --changed <ref>` maps
   one hop around the diff: the changed files, their callers, and their callees. The whole
   tree does not fit in a context and does not need to; one hop is what the work touches.

2. **Read the changed file before trusting the map.** The map decides _where_ to look, not
   _what_ is true. Its verdicts are lexical, and one of them is always the interesting case:
   a `unit` verdict means nothing in that body reaches outside it, and it cannot see a
   helper one call away.

3. **Pick the target by level.**
   - `unit` and not named by any test — this is the unit-testing skill's territory.
   - `not-unit` because it touches a file, a wire or a database — the check belongs one
     level up, in an integration test, not behind a double standing in for the subject.
   - The cluster for that integration test is the file plus what it reaches: the `uses:`
     lines. What it does _not_ say is what else has to be set up — read the callees.

4. **Treat the callers as the blast radius.** `used by:` is what a change can break, and
   the cheapest regression test is usually one of those callers rather than the changed
   file. A caller outside the mapped roots means the scope is too narrow: widen the path
   and re-run rather than assuming.

5. **Read the gap list as a question, not a verdict.** A file no test points at is either an
   untested unit, an entry point, a shim, or dead code — and those have four different
   answers. Naming which one it is, is the work.

6. **Hand the target on, do not improvise it.**
   - Values and cases → `test-techniques`.
   - The shape of the test, what to assert, the coverage bar → `unit-testing`.
   - Anything only reachable through three collaborators → say so and move it up a level,
     rather than building a stage set.

## Coverage bar — when you are done

- Every file in scope is either named by a test or listed as a gap with a reason, and the
  list is short enough that someone can check it
- Nothing is reported as covered on the strength of a mention: a test that names a file
  without importing it is weaker evidence and is labelled that way
- The callers of every changed file have been looked at, and the ones not tested are named
- Anything the map could not resolve — a dynamic require, a computed export, a path outside
  the roots — is stated rather than smoothed over
- The tests that follow were written from the target the map chose, not from a re-read of
  the tree

## Output

- The scope: changed files, callers, callees, and the gaps, as read from the command
- One line per target: the unit or cluster, why that level, and which test file it belongs in
- The gaps deliberately left, each with the reason it is not a defect — an entry point, a
  shim, dead code, or deferred
- `--save` writes the map when something else has to read it; nothing else does yet, so the
  artefact is written on request rather than accumulated

## Decision points

| Situation                                          | Action                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A changed file has no callers and no tests         | Entry point, shim or dead code. Say which before writing a test for it                |
| A caller is not in the mapped roots                | The scope is too narrow. Widen by one hop and re-run; do not guess at the call site   |
| The map disagrees with the code                    | The code wins. The extraction is lexical, and the file is the authority               |
| A file is marked tested but the test only names it | Read the test before claiming coverage — a mention is not an assertion                |
| The whole diff is `not-unit`                       | The work is integration. Move it up a level rather than doubling the world beneath it |

## Interlaying (blind spot)

**Its edges are imports, not calls.** A function reaches anything through a variable, a
factory, a callback or injection, and none of that appears here. So a `unit` verdict is a
floor, not a finding: it says nothing in that body _syntactically_ reaches outside, and the
body is still the authority.

**A mention is not coverage.** Text naming a file is recorded separately from a test
importing it, and neither proves an assertion exists — only `assert-quality` and a mutation
run say anything about whether a test would notice a fault.

**Extraction is lexical.** No parser is involved: unusual syntax, a dynamic `require`, a
computed export or runtime wiring degrade to `unresolved` or are missed entirely, and a path
outside the scanned roots cannot be followed. It is blind to what it was not pointed at, so
`--path` too narrow gives a confident map of the wrong thing.

_Original to this repo — not recreated from the source set. Lineage for the others: `docs/sources.md`._
