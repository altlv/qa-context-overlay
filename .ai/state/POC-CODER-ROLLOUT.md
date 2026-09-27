# The coder-role rollout — architecture, skills, tools, and the schedule

**Written:** 2026-09-25, after the first two live runs. Subject: `mcpa-training-bot` at `c8d7549`.
Read beside `PLAN.md` (ids 60, 65–70), `POC-UNIT-CODER.md` and `POC-INTEGRATION-CODER.md`.

One loop, run once per level: **the role writes a file; the subject's own tests for that seam are the
comparison; a mutation set for that seam is the score.** Unit and integration are built; api, e2e and
the AI level are not. This document is what each of them inherits, what is missing, and in what order.

## 1. What every new coder role already inherits

Built, verified and level-agnostic. A new level must not re-derive any of it.

| Capability                           | Where                                            | What it gives a new level                                                                                                                       |
| ------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject-scoped worktree + file guard | `src/qe/run-worktree.ts`, `src/qe/file-guard.ts` | The run's diff is its own; the subject's checkout is never touched; `.env` is refused on every file tool                                        |
| `TestStack` on the app config        | `apps/app-config.ts`, `src/qe/test-stack.ts`     | Runner, run-all, run-one, tests dir, file pattern, module system, assertion import, exemplar file — composed into the prompt instead of assumed |
| Level-aware subject block            | `src/agents/subject-prompt.ts`                   | `levelOfRole(role)` picks the level; each level has its own definition and boundary; the browser paragraph is written only where it is true     |
| Stack-neutral assertion floor        | `src/quality/assertion-floor.ts`                 | Works for `node:test`, vitest, Playwright — reads the assertion name from the stack's own import line                                           |
| Comparator                           | `src/qe/mutation-compare.ts`                     | Applies a named set to a named suite, reports kills by name, and refuses to let a suite get weaker                                              |
| Toolbox + target selection           | `npm run candidates`, `npm run survey`           | Which units/files a test could pin, and the import graph; both are already in every role's toolbox                                              |
| Run harness                          | `src/cli/role.ts`                                | Preflight refusals, one `PreToolUse` guard, tool ledger, wall clock, post-run gate, evidence kept, investigator command on failure              |

## 2. Per level: what it inherits, what is missing, what it is compared against

The comparison column is the whole PoC method — the subject ships a human baseline at every level.

| Level       | Role                   | Level skill                                                         | Comparison in the subject                                          | Score instrument                                                     | Blocking preconditions                                                                           |
| ----------- | ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| unit        | `unit-coder`           | `unit-testing` ✓                                                    | `test/searchIndex.test.js`                                         | mutation set + comparator ✓                                          | — **run done**: 12 → 14 of 20                                                                    |
| integration | `integration-coder`    | `integration-testing` ✓                                             | `test/labs-routes.test.js`, `test/mcp-server.test.js`              | `apps/mcpa/mutations/labs-routes.ts` (14, written) ✓                 | the subject's labs must be **built** in the worktree, or the baseline is red                     |
| api         | `api-coder`            | **missing** — brief then skill (id 68)                              | `test/api.test.js`, `test/specs.test.js`                           | a seam set for the HTTP surface                                      | a committed `--design` (planner first) **and** `--app --env`; the subject starts itself on :3000 |
| e2e         | `e2e-coder`            | **probably none** (id 69) — `pwtest` covers the generation workflow | the subject's Playwright suite under `e2e/`, page objects included | baselines/heal + the subject's own suite                             | a browser installed on this machine; `--design`; the subject's front end built                   |
| AI          | decision first (id 70) | `agent-testing` **if** the item-43 ruling stands                    | `test/chatService.test.js`                                         | the four layers: mock provider, record/replay, success rates, rubric | the item-43 ruling; layer 1 needs no new infrastructure                                          |

### 2b. Performance — the role this plan left out

Raised by the user on 2026-09-25: an agent for performance **test creation and maintenance**. It is the
same shape of question as the AI-coder, so the two need the same ruling.

**Performance is a quality attribute, not a level.** A performance test can live at any of the four: a
benchmark over a pure function (unit), a service measured through its real dependency (integration), a
load profile against the HTTP surface (api), or page weight and timings in a browser (e2e). A role
named `performance-coder` therefore crosses the axis the four coders split on — exactly the objection
recorded in item 43 against `agentic-coder`. **What is genuinely different is the instrument:** a
measurement is statistical rather than pass or fail, so it needs thresholds, a baseline per metric, and
a comparison across runs.

**What already exists.** `npm run archive-results` keeps the newest 20 runs (item 26), which is the
history a trend needs. The network-capture fixture records timings, E5b reads the live DOM, and
`flaky-test-detection` already carries the discipline of a _rate_ rather than a verdict. PLAN item 8 —
the scan-side performance pass, `performance.getEntriesByType`, about fifteen lines — has never been
built.

**What is missing, in order.** (1) Item 8's numbers, so a session can see page weight and timings at
all; (2) **thresholds** — a stated budget per metric, without which a number is an opinion; (3) a
**comparator for measurements**, the analogue of `mutation-compare`: same suite, N runs, median and
spread, and a refusal when a metric regressed beyond its budget; (4) a gate rule that reads it; and only
then (5) the skill, or role, that writes and maintains the suites.

**The ruling, to be made with item 43 — one axis or two.** One axis keeps a role per level and puts
performance and AI in skills plus tools; two axes adds roles named for what is measured. The
recommendation is **skills and tools for both**, and the user's word _maintenance_ deserves its own
answer: an owner that keeps baselines current across runs is a maintenance obligation, and this repo
has already declined a maintenance role once (_Considered and declined_) in favour of the pre-commit
end gate. On that precedent, maintenance belongs in the gate rather than in a role.

## 3. Tools: built, missing, and where each belongs

**Built** — `candidates`, `survey`, `assertion-floor`, `mutation-compare`, `fault-check`, `gate`,
`check-report`, `sessions`, `archive-results`.

**Missing, in the order the levels need them.** Each is a gap today's runs measured, not a guess:

1. **A baseline freeze.** The unit run added 120 lines to the subject's own `test/searchIndex.test.js`
   rather than writing a new file. Nothing forbade it — the guard confines writes to the worktree, and
   inside the worktree the baseline is just a file — so _"the human baseline is never edited"_ is an
   assumption with no mechanism. The gate is where it belongs, because it is the only component that
   holds the pre-change revision: a `problems` entry when the diff modifies a pre-existing test file,
   unless the run is an improve/remove run declaring §9's grounds.
2. **Override honesty in the banner.** `AGENT_TIMEOUT_MS=180000` in the ambient environment silently
   replaced `unit-coder`'s declared 600s, and the banner still read as if the role's budget were in
   use. `AGENT_MAX_TURNS` gets an annotation; `AGENT_TIMEOUT_MS` and `AGENT_MAX_USD` do not.
3. **Cost after an abort.** A wall-clock stop reports `0 turns, $0.0000`, because no result message
   ever arrived. The honest output is _unmeasured_, not free.
4. **Hole attribution in the floor.** The two `conditional-only` findings on the unit run are inherited
   from the human file, not written by the agent. With the base revision in hand the gate can say
   which — and that distinction is what makes §9's strength delta usable.
5. **A mutation-set convention.** `apps/mcpa/mutations/labs-routes.ts` establishes the path; the
   convention needs stating (one set per seam, under `apps/<app>/mutations/`, named for the source
   file, never copied from the subject) so the api and e2e sets land in the same place.
6. **The AI layers** — mock provider, record/replay, success rates, rubric judgement (items 43–46).

## 4. The schedule

Ordered so each step is worthless without the one before. **Acceptance is a command or a named number**,
never a judgement. Nothing here needs a credential except the runs, which need the session that now
exists.

| #   | Step                                       | Artefacts                                                    | Accepts when                                                                                                                     |
| --- | ------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Record what today's runs proved            | `PLAN.md` ids 71–73, _Not proven_ corrected                  | precommit green; the run-through-the-runner claim moved out of _Not proven_                                                      |
| S2  | Fix the three harness findings (tools 1–4) | gate `problems` entry, banner, abort cost, floor attribution | each with a unit test both directions and a mutation; comparator/floor tests still green                                         |
| S3  | Frame the **api** skill                    | brief → `.claude/skills/api-testing/SKILL.md`                | a person can grade an unfamiliar API test with it; `Not for` routes to `test-techniques`/`pwtest`; 150–260 lines; `compact core` |
| S4  | Wire api                                   | `api-coder` array + prose, catalogue, routing, 2 mutations   | `roles.test.ts` holds array and prose together; precommit green                                                                  |
| S5  | Portability audit for **api and e2e**      | two prompt edits + acceptance assertions                     | the composed subject prompt for each carries no harness path, fixture or runner — a test, not a reading                          |
| S6  | api mutation set + bar                     | `apps/mcpa/mutations/api-*.ts`                               | anchors resolve once; the human api suite is green and its kill count is recorded                                                |
| S7  | **api run**                                | a run against `src/routes/*` or `src/server.js`              | gate verdict + score by name against the human suite                                                                             |
| S8  | e2e prerequisites + portability            | browser installed, subject front end built                   | `npm run role -- e2e-coder … --preflight` passes                                                                                 |
| S9  | **e2e run**                                | a run against the subject's UI                               | same, with heal/baselines as the instrument                                                                                      |
| S10 | **AI ruling**, then layer 1                | decision recorded; `agent-testing` skill or role             | the user's ruling on item 43; layer 1 needs only a mock provider, which `chatService` already supports by falling back           |

**S1 and S2 before any new run.** Every run spends money and every run so far has produced a harness
finding; fixing them first is cheaper than discovering them three more times.

## 5. How a run is launched, as measured today

    $env:AGENT_TIMEOUT_MS='280000'      # an ambient value silently wins otherwise
    $env:AGENT_MAX_TURNS='40'           # turns bound the unit run at $0.75 of a $1.00 cap
    npm run role -- unit-coder '<task naming the module>' --app mcpa --env local --preflight
    npm run role -- unit-coder '<same task>' --app mcpa --env local

- **Turns, not money, throttle the work.** 21 turns cost $0.7504; the cap had $0.25 left.
- **A stopped run always fails the report step**, because a stopped run writes no report. That is a
  limitation to state, not a defect to fix.
- **No skill has ever been opened** — nine injected, unread, in both runs. The `Compact core` hedge was
  designed for this and did not change it; that is a finding for the skills, not for the runs.
- **The worktree is kept on failure** and is the evidence; the subject's own checkout stays clean.

## 6. What is deliberately out of scope here

The other roles' levels where the subject has no baseline to compare against; ranking or orchestrating
runs across levels; and any change to what a level _means_ — the five levels in `docs/agent-workflows.md`
stand.
