# Proof of concept — `integration-coder` against the same subject

**Branch:** `poc/unit-coder-mcpa` · **Opened:** 2026-09-24 · Subject: `mcpa-training-bot` at `c8d7549`

The unit PoC built the harness side of one coder role and measured it. This takes the next level out
with the same method, on the same subject, so the two are comparable.

## The claim, and what would falsify it

**Claim:** given the same treatment — a subject worktree, its own stack composed into the prompt, a
level skill, and a gate that re-checks the work — an `integration-coder` writes integration tests a
competent developer would accept, and the subject's own hand-written tests say whether it did.

**Falsified by:** tests that pass, read plausibly, and are killed by fewer mutations than the
subject's own file for the same seam — or that survive one the human file kills. That is the outcome
to design for, because it looks like success in a report.

## The method, for every coder role

One loop, four times, once per level: **the role writes a file; the subject's own tests for that seam
are the comparison; a mutation set for that seam is the score.** No agent output is judged by reading
it alone.

| Level       | Role                 | The subject's own tests — the comparison                           | The instrument                                           |
| ----------- | -------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| unit        | `unit-coder`         | `test/searchIndex.test.js`                                         | a mutation set for `searchIndex.js`, then the comparator |
| integration | `integration-coder`  | `test/labs-routes.test.js`, `test/mcp-server.test.js`              | a mutation set for the labs seam, then the comparator    |
| api         | `api-coder`          | `test/api.test.js`, `test/specs.test.js`                           | the same shape, over the HTTP contract                   |
| e2e         | `e2e-coder`          | the subject's Playwright suite under `e2e/`, page objects included | baselines and heal, plus the subject's own suite         |
| exploratory | `exploratory-tester` | — (no file is produced)                                            | the session report, gated by `check-report`              |

The subject ships a human baseline at every level, which is the whole reason it was chosen. Nothing
from it is copied here — it is read as a benchmark and pointed at.

**The unit level is further along and is the template.** Its incumbent suite was written by hand from
the skill before this PoC: 28 tests, killing 18 of 20 mutations, against the human baseline's 12. The
role itself has still never run.

## What the harness already gives this level

Committed and verified on this branch: the worktree is a worktree of the _subject_ with the file
guard confining writes to it; dirty subjects are refused by name; the prompt composes the subject's
own runner, imports and house-style file; a level block derived from the role rather than from the
unit PoC's constant; `npm run assertion-floor` for any stack; and `npm run mutation-compare` — a
named mutation set against a named suite, with the strength delta that refuses a suite which stopped
catching something.

## What is missing, in order

1. **A mutation set for the labs seam.** The comparator is the instrument; there is nothing to point
   at. The subject's own `scripts/mutate-app.mjs` carries 13 mutations but runs a **fixed list of five
   suite files**, so it cannot grade a file an agent writes. The set is written here, from
   `src/routes/labs.js` alone, kept under `apps/mcpa/` so the subject is never modified — exactly what
   the unit PoC did for `searchIndex.js`. Establish the bar by running it against
   `test/labs-routes.test.js` first.
2. **Item 60 — a subject test noticing its process failing.** `fault-check` proves an app _spec_
   notices a server failing; nothing proves a subject _test_ notices a process failing. At this level
   that is the gate's central claim, not a side check.
3. **The run, then the comparison.** `npm run role -- integration-coder 'write integration tests for
src/routes/labs.js' --app mcpa --env local`, then score the produced file against the human one.

## How a result is reported

By name, not by rate: which mutations the agent's file kills, which the human file kills that it does
not, and what class of reasoning the missing ones share. A rate invites the argument that the set was
kind; a named gap invites the fix.

## Traps this level has already met

- **The subject's script cannot grade a new file.** Its five suite files are fixed. Assuming otherwise
  produces a score for work that was never run.
- **A red suite reports every mutation as caught.** Both the subject's suites and the agent's must be
  green before a score means anything; the comparator refuses rather than scoring.
- **A short 8.3 path as `cwd` breaks a spawned process's relative resolution** — item 41, met again
  while building the comparator.
- **One credential, one run.** The token goes in the _worktree's_ `.env`, because `src/env.ts` loads
  the file beside `src/` in the checkout the command runs from. No level needs the browser.
