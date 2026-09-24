# Proof of concept — `unit-coder` against a real application

**Branch:** `poc/unit-coder-mcpa` · **Base:** `6c81f1a` · **Opened:** 2026-09-24

One role, one subject, one unit, judged against work a person already did.

Every coding role in this repo has **never executed**. `unit-coder`,
`integration-coder`, `api-coder`, `e2e-coder` and `testability-reviewer` are prompts no
agent has ever run — `sessions/` contains only `exploratory-tester`. This is the first
of them, taken deliberately alone, because a role that cannot be evaluated is not worth
running five times.

It is also the first time this harness would work on **code it does not own**. Every
test written here so far was for itself, which is the easiest possible case and
flatters the conventions, because the role and the code share them.

---

## Status — 2026-09-24, branch `poc/unit-coder-mcpa`

**Landed.** C1 is done and wired: `.claude/skills/unit-testing/SKILL.md`, declared by
`unit-coder` beside `test-techniques`, with the array and the prose held together by
`tests/unit/roles.test.ts`. Three things the plan did not ask for were added because the
flow had no mechanical way to choose a target: `.claude/skills/repo-survey/SKILL.md`,
`npm run candidates` and `npm run survey`. The Phase F artefact exists — unit tests for the
subject's `searchIndex.js`, written by hand in a worktree of the subject, with the human
baseline never edited.

**Landed since.** C2, C3, C4, and the portability half of C9.

- **C2, C3** — `sourceRoot` and `testStack` on `AppConfig`; `apps/mcpa/` registered with a local
  environment and its own stack facts; readiness taught to resolve a module the subject names
  instead of only paths that exist in this repository.
- **C4** — the run's worktree is a worktree of the _subject_, at the subject's own HEAD; the file
  guard confines writes to it unchanged; the subject's `node_modules` are linked beside the runs
  folder, the arrangement that also survives being removed; a subject checkout with uncommitted
  work is refused by name, because a diff taken against a dirty checkout would not be the run's
  own. `--worktree` reuse now asks its question of the right repository.
- **C9** — `composeSystemPrompt` takes an optional subject, and the two sections describing _this_
  repository's stack are **replaced** by the subject's own, matched on the exported constants
  rather than rewritten into eight role files. The acceptance test the plan set is now a test: the
  composed prompt for `--app mcpa` carries no Playwright instruction, no `tests/unit` path, no
  harness fixture and no harness runner — asserted over the role's text _and_ its inlined skills,
  because the runner sends both and an instruction inside a skill is an instruction.

Three semantic bugs surfaced only by running it: a subject is a sibling of the _repository_, so
resolving from a worktree one level deeper found nothing; a named path is written relative to the
subject's repository root rather than to its `sourceRoot`, so resolving against the latter produced
`src/src/services/x.js`; and the first draft of the subject's prompt block named Playwright in order
to deny it, which the literal acceptance test correctly refused.

`--preflight` against mcpa/local reports **ready**, at the subject's own commit, and refuses a dirty
subject checkout by name.

**Not landed.** C6 (assertion floor), C7 (the `searchIndex` mutation set), C8 (the comparator), and
the rest of C5. The gate now runs a subject's changed tests with the subject's own runner, where
before it reported that there was nothing to check for any subject not using Playwright — which is
every subject we do not own. What it still lacks is a vacuity check at that level: `fault-check`
proves an app _spec_ notices its server failing, and nothing yet proves a subject _test_ notices its
process failing.

**Every run attempt so far has stopped at authentication.** Each one created a worktree of the
subject at `c8d7549` beside it — the direct evidence that C4 works end to end — released the lock,
touched no file in the subject's own checkout, and then failed before any model call with
`Agent auth failed. Either sign in with claude login, or set ANTHROPIC_API_KEY in .env`. Nothing was
spent, and the empty worktrees were removed afterwards. `src/agents/client.ts` refuses to pre-check
for a credential, because gating on the variable refuses everyone signed in through `claude login`,
so only an attempt can answer the question — and it has been answered: `claude auth status` reports
`loggedIn: false` with `authMethod: none` on this machine. There is no session for the SDK to find,
which is the whole blocker.

**The route is `claude auth login`, in a person's own terminal, and nothing belongs in `.env`.** The
key is documented as optional and CI-only; the line that once called it required is what caused a key
to be issued that nobody needed, and it should be removed rather than honoured. `src/env.ts` anchors
the environment file to its own module, so a key in the shared checkout would not reach a worktree
run anyway — the wrong diagnosis, corrected here so the next person does not act on it.

**Not proven, and worth repeating.** A run is now possible: the worktree, the guard, the prompt and
the gate all point at the subject. What has never happened is a single agent turn. The tests that
exist for `searchIndex.js` were written by a person following the skill — preflight proves the role
can be _pointed_ at a subject, not that it writes anything.

**Measured, on one mutation set and one subject commit, against the human baseline** (§6 is
the method): the agent's suite kills 18 of 20 mutations, the baseline kills 12 of 20, and both
survive the same two — guards whose removal cannot change behaviour for any input. Line
coverage runs the other way, 61.5% against 93.5%, because the baseline exercises the whole
index build and asserts almost nothing about it. Coverage and fault detection disagreed, which
is the finding E3 was for.

**Decisions taken here, and why.**

| Decision                                                                   | Reason                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The mutation set was written from the source before either suite was read  | AD4. But the agent's suite was then iterated against it — two survivors closed by strengthening inputs — so 18-versus-12 is not blind, and §6 says so rather than letting the number stand               |
| `SearchIndex` was ruled out of unit territory, boundary drawn at the class | Its methods read and write files. `indexMarkdown` is pure given its content argument and was excluded with the class; `npm run candidates` found it afterwards, and it is still untested by either suite |
| These plan files are tracked on the branch                                 | Progress and decisions in an untracked file are not tracked at all — which is what this section is correcting                                                                                            |

---

## 1. The claim, and what would falsify it

**Claim:** given the right context, a coder role writes unit tests a competent developer
would accept — and we can tell whether it did without asking it.

**Falsified by:** tests that pass, read plausibly, and kill fewer mutants than the human
suite. That is the outcome to design for, because it is the one that looks like success
in a report.

**This cannot prove** anything about the other four roles, the other test levels, or any
unit but the one tested. One unit is a proof of concept, not a measurement.

## 2. The subject

`mcpa-training-bot` at `C:/Users/PC User/Documents/GitHub/mcpa-training-bot` — a clean
git repository at `c8d7549`, zero uncommitted files.

| What it has                                          | Why it matters                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 9 hand-written `node:test` files under `test/`       | A human baseline, written without knowing an agent would be graded against it         |
| `scripts/mutate-app.mjs` — 13 hand-written mutations | An objective quality score that predates this experiment and was not built to flatter |
| `src/services/searchIndex.js` — BM25, tokenize, stem | Genuine unit territory: input to output, no I/O, nothing to mock                      |
| Routes, MCP server, Express app                      | The other four roles later, without changing subject                                  |
| Its own `.env`                                       | Exercises the rule that a harness must never inherit a subject's environment          |
| A clean git history                                  | Makes the isolation model below possible at all                                       |

## 3. Architecture

Four decisions. All four were open when this branch was cut; leaving any open would
make the plan unexecutable.

### AD1 — The agent works in a worktree **of the subject**, not of this repo

Today `createRunWorktree(repoRoot, …)` branches _this_ repository and
`fileToolGuard(worktree)` confines every write to it. Correct when the harness tests
itself; wrong the moment the subject is elsewhere, because the agent would be locked
inside a checkout that does not contain the code it was asked to test.

**Decision:** when a subject is its own git repository, the run worktree is a worktree
**of the subject**, checked out at the subject's HEAD. The agent writes its tests there.
The work comes back as an uncommitted diff in a throwaway checkout of the subject, and
the human baseline in the real checkout cannot be touched — not by policy, but by
construction.

Same shape the harness already uses on itself, pointed at another repository. It keeps
every property that made it worth having: a named base commit, isolation from the
working copy, a reviewable diff, and a gate that runs against what was actually
produced.

**Requires:** a local source path on the app config, and a refusal when the subject's
working copy is dirty — a dirty subject makes the diff meaningless.

### AD2 — The subject's test stack is data, not prose

`unit-coder`'s prompt opens _"You write unit tests for the harness's own logic in
`tests/unit/`"_, and the `CONVENTIONS` and `TEST_LEVELS` blocks it carries describe
Playwright, `src/fixtures/harness.js`, NodeNext ESM and `npx playwright test`. The
subject is `node:test`, `assert/strict`, CommonJS `require`, run by
`node --test test/*.test.js`.

As written the role cannot produce one valid file for this subject. **A role that only
works on the repository that defines it is a script, not a role.**

**Decision:** `AppConfig` gains a `testStack` — runner, how to run everything, how to
run one file, where tests live, module system, how assertions are imported, and one
exemplar file the role reads as the house style. The role composes stack knowledge from
that instead of assuming ours. This repo becomes one subject among several rather than
the implied one.

### AD3 — The gate is the subject's own, plus mutation

`npm run assert-quality` is this repo's mechanical floor and it parses TypeScript
Playwright specs. Whether it can grade CommonJS `node:test` is **unverified** — Phase A
finds out and records NOT RUN rather than assuming a pass.

**Decision:** the post-run gate for an external subject runs, in order:

1. **The subject's own suite** — still green. An agent that breaks the existing tests
   has failed regardless of what it added.
2. **The agent's new file alone** — passes on its own.
3. **A stack-neutral assertion floor** — every test has at least one assertion tied to
   an observable outcome. If `assert-quality` cannot read the stack, this is a small
   check written for the PoC, and what it cannot see is stated rather than implied.
4. **Mutation** — the real gate. See §6.

### AD4 — Mutations are written from the source, before either suite is read

A mutation written after seeing the tests grades the author's memory of the tests. The
subject's own `mutate-app.mjs` covers routes and the MCP server, not `searchIndex.js`,
so this PoC writes that set.

**Decision:** the `searchIndex` mutation set is written from
`src/services/searchIndex.js` alone, committed **before** either suite is read closely,
and kept in this repo under `apps/mcpa/` so the subject is never modified.

## 4. What has to be built

| #   | Component                                 | Where                                         | Owner    | Needs      |
| --- | ----------------------------------------- | --------------------------------------------- | -------- | ---------- |
| C1  | `unit-testing` skill                      | `.claude/skills/unit-testing/SKILL.md`        | DeepSeek | —          |
| C2  | `sourceRoot` + `testStack` on `AppConfig` | `apps/app-config.ts`                          | me       | —          |
| C3  | `mcpa` registration                       | `apps/mcpa/app.config.ts`, `apps/registry.ts` | me       | C2         |
| C4  | Subject-scoped run worktree               | `src/qe/run-worktree.ts`, `src/cli/role.ts`   | me       | C2, C3     |
| C5  | Stack-aware gate plan                     | `src/qe/run-gate.ts`                          | me       | C2         |
| C6  | Stack-neutral assertion floor             | `src/quality/`                                | me       | AD3 step 3 |
| C7  | `searchIndex` mutation set                | `apps/mcpa/mutations/search-index.ts`         | me       | —          |
| C8  | Mutation comparator CLI                   | `src/cli/mutation-compare.ts`                 | me       | C7         |
| C9  | Portable `unit-coder`                     | `src/agents/roles/unit-coder.ts`, `common.ts` | me       | C1, C2     |

C1 is parcelled out because it is documentation with a clear shape — no browser, no
agent, no key, checkable by reading. Brief: `.ai/state/POC-UNIT-CODER-DEEPSEEK.md`.
Everything else is architecture and stays here.

## 5. Phases

Ordered so each is worthless without the one before it. **Acceptance is a command that
passes or does not**, never a judgement.

### Phase A — the subject becomes a subject · C2, C3

1. Add `sourceRoot` and `testStack` to `AppConfig`.
2. Register `mcpa` at its external path, `local` environment, its own server.
3. Verify the harness does not inherit the subject's `.env` — `src/env.ts` anchors to
   its own file; verify rather than trust.
4. Verify whether `assert-quality` can read CommonJS `node:test`. Record either answer.

**Accepts when:** `npm run role -- unit-coder "…" --app mcpa --env local --preflight`
passes readiness with no paid run.

### Phase B — the missing documentation · C1 _(DeepSeek)_

One skill covering the unit's boundary, what to assert and what never to, doubles keyed
on what a dependency does, one reason to fail, determinism, naming, and why a green
suite is not evidence. It carries a **`Compact core`** — 15–25 lines that stand alone if
lifted into a prompt, because instrumentation on 2026-09-24 found a role opened **none**
of its nine injected skills across 68 tool calls.

**Accepts when:** a person can grade an unfamiliar test file with it, and its `Not for`
clause sends the reader to `test-techniques` correctly.

### Phase C — isolation for foreign code · C4, C5

5. Worktree creation takes the repository to branch as a parameter; for an external
   subject the run worktree is a worktree of that subject at its HEAD.
6. Refuse a subject whose working copy is dirty, naming the files.
7. The file guard confines writes to the subject worktree.
8. The gate plan comes from `testStack`: the subject's suite, then the new file alone.

**Accepts when:** a run against `mcpa` creates a worktree under the subject, and a
deliberate write outside it is refused with a reason.

### Phase D — the role becomes portable · C9

9. Split `CONVENTIONS` and `TEST_LEVELS` so stack facts come from the app config.
10. Give `unit-coder` the new skill and the subject's stack.

**Accepts when:** the composed prompt for `--app mcpa` carries no Playwright
instruction and no `tests/unit/*.test.ts` path — asserted in a unit test, not read.

### Phase E — the mutation set, written blind · C7, C8

11. Write mutations from `searchIndex.js` alone: tokenizer rules, stemmer reductions,
    BM25 ranking terms. Each removes exactly one rule.
12. Commit them **before** reading either suite closely.
13. Build the comparator: apply one mutation, run a named suite, record killed or
    survived, restore the source, repeat. Restore after failures too.
14. Establish the **baseline** — what the human suite kills. That number is the bar.

**Accepts when:** the comparator reproduces a known result (the human suite kills at
least one mutation and survives none it should kill) and every source is restored.

### Phase F — the run

15. Target `src/services/searchIndex.js`. The agent writes a **new** file; the human
    baseline is never edited.
16. Spend measured, not capped. The ledger records which skills were opened.

### Phase G — evaluation · §6

## 6. Evaluation

Five judgements, in descending order of how hard they are to argue with.

| #   | Measure                    | Method                                                                                 |
| --- | -------------------------- | -------------------------------------------------------------------------------------- |
| E1  | **Mutants killed**         | Comparator over three suites — human, agent, both. Kill rate is the score              |
| E2  | **Passes its own gate**    | Subject's suite still green; the new file green alone; the assertion floor             |
| E3  | **Against the baseline**   | Cases, assertions, and which rules each suite covers that the other does not           |
| E4  | **Was the context used**   | The ledger: skills opened versus skills paid for and never read                        |
| E5  | **Are the artefacts good** | C1–C9 judged as deliverables in their own right, not assumed good because tests passed |

**E1 is the one that matters.** Everything else can be argued; a surviving mutant
cannot. The finding this branch exists to surface is **a mutation the human suite kills
that the agent's does not** — a named, reproducible gap in machine-written tests, worth
more than a green run.

Three outcomes:

- **Agent kills fewer** — the interesting result. Which mutations, and what class of
  reasoning was missing.
- **Agent kills the same** — the claim holds for pure logic. Say only that.
- **Agent kills more** — check the mutation set was not written to suit the humans, then
  report which rules the baseline never covered.

E5 asks of each artefact: does it say what it is _not_ for, does it name the failure it
prevents, and would it survive the subject being swapped? An architecture that only
works for `mcpa` has proved nothing about roles.

## 7. Risks, stated before they bite

- **The agent edits the baseline.** AD1 makes it impossible rather than forbidden — the
  real checkout is not in the worktree.
- **Mutations written after reading the tests** grade nothing. AD4 orders it; Phase E
  commits them first.
- **A green suite is not evidence.** Both suites will pass. Only E1 separates them.
- **`assert-quality` may not read the stack.** Phase A finds out and records NOT RUN
  rather than a silent pass.
- **The skill may never be opened.** The ledger says that is the norm so far. The
  `Compact core` is the hedge; E4 measures whether it was needed.
- **One unit generalises to nothing.** Say so in the write-up rather than implying a
  role has been proven.

## 8. Out of scope, deliberately

The other four coder roles. The integration, api and e2e levels. Registering `mcpa` for
exploratory work — different experiment, same subject, later. Anything on `main`: this
branch exists so the exploratory work and this proceed without either waiting.

---

## 9. Change, not just create — what the gate has to carry

Added 2026-09-24, after the skill's first real use. A coder has to be able to **create** a
test, **improve** one that does not prove what it claims, and **remove** one that no longer
proves anything. Creating is covered. Improving has a single line — _strengthen the
assertion rather than adding another test beside it_. Removal has nothing at all, and the
gate is where both have to become checkable, because the gate is the only component that
still holds the pre-change revision: a run's worktree sits at a named base commit, so
`git show <base>:<file>` is the old suite and `git diff` is what went.

**Removal needs grounds, not judgement.** `GUARDRAILS` already says _"never widen a selector
or delete an assertion to make a test pass"_, so a deletion and a concealment are the same
keystrokes and only the evidence tells them apart. Four grounds are acceptable, each with a
companion fact something else can check:

| Ground           | Means                                       | Checked against                                      |
| ---------------- | ------------------------------------------- | ---------------------------------------------------- |
| `subject-gone`   | the code it tested was removed              | the symbol is absent from the source, by `file:line` |
| `rule-gone`      | the behaviour was dropped by decision       | the diff touches the source that held the rule       |
| `duplicate`      | another test asserts the same rule          | the twin is named and present after the change       |
| `proves-nothing` | it survives a mutation of the rule it names | the named mutation, before and after                 |

Anything else is taste, and taste is not a ground for deleting a test.

**Where each half runs — three mechanisms that already exist.**

1. **A declaration in the report.** `docs/report-format.md` already carries per-type blocks
   whose _presence_ is enforced (`charter` and `preflight` for `exploratory-session`, `cases`
   for `test-design`). A `removed` block joins them: one entry per removed test, carrying
   `ground`, `evidence`, and the companion fact above. `check-report` validates the entries
   exactly as it validates a charter's lenses.
2. **A problem in the gate plan.** `run-gate.ts` already decides things without running
   anything — _"test-planner wrote no design file under apps/<app>/designs/"_. The same shape
   carries: **the diff removes a test and the report declares none**, or declares a ground
   whose companion fact is missing from the repo. It reads the diff and the report, so it is
   a `problems` entry, not a step.
3. **A strength step, once an instrument exists.** Run the mutation set against the
   pre-change suite and the post-change suite, and require `survivors(after) ⊆
survivors(before)`: a change may never leave the suite weaker than it found it. This is
   the mechanical form of the guardrail, and it is the only part needing something that does
   not exist yet — C7 (a unit-level mutation set for this subject) and C8 (a comparator that
   takes a test file rather than one hard-coded path). Both are already in the table above;
   this makes the strength delta their consumer.

**Measured by a second run, not this one.** Phase F freezes the baseline — "the agent writes
a new file; the human baseline is never edited" — which is what makes E1 and E3 a clean
comparison, and which also removes improve and remove from the measurement entirely. Keep
the freeze for the first run. A second run invites editing, and its E3 changes shape: from
_which rules does your file cover_ to _what did you change, and is the suite stronger_.

The corpus for that run is already identified: the human baseline holds two tests whose
assertions sit inside `if (results.length > 0)`, so they can pass having asserted nothing,
and one that asserts only that its result is shorter than its input. That is **improve** with
real work to do on the first day.

**Ownership.** C5 (`src/qe/run-gate.ts`) and C6 (`src/quality/`) belong to the other builder.
This is the spec for the half that lives there; the report block is the half that reaches
into `docs/report-format.md` and `src/qe/report.ts`.
