# Sources

Where the thinking in `.claude/skills/` came from, and what each licence lets us do
with it.

One file rather than a paragraph per skill. Credit is owed and has to live somewhere;
it does not have to live inline, where it grows every file it touches and pushes the
useful part further from the top.

## How to read the "we may" column

| Term      | Meaning                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **adapt** | The licence permits derivative work. We may rewrite it into a skill, with attribution.                                                                            |
| **cite**  | The licence forbids derivatives, or the source is a book we do not hold rights to. We may reference it, link it and build from its own upstream — not rewrite it. |
| **idea**  | General practice with no single owner. Attribution is courtesy and accuracy, not obligation.                                                                      |

Ideas and facts are not copyrightable; the selection, arrangement and expression of a
list can be. When in doubt this repo cites rather than adapts — it costs nothing,
since most of this material descends from shared upstream anyway.

## Practice this repo's skills are built on

| Source                                                                        | We may | Where it shows up                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cem Kaner, James Bach, Bret Pettichord** — context-driven testing           | idea   | `test-design` risk-driven design and product-dimension decomposition; `bug-report` advocacy                                                               |
| **James Bach, Michael Bolton** — FEW HICCUPPS consistency oracles             | idea   | `oracle-check`. Ours runs to eleven oracles: theirs plus Comparable features, Explainability and World                                                    |
| **James Bach, Michael Bolton, Maaret Pyhäjärvi** — session-based testing      | idea   | `exploratory-session` charter-and-debrief                                                                                                                 |
| **Egbert Marselis** (product-dimension thinking), **Mike Cohn** (the pyramid) | idea   | `test-design` decomposition and level allocation                                                                                                          |
| **ISTQB Foundation** test design techniques                                   | idea   | `test-design` §5 today; `test-techniques` when it lands. The techniques themselves are public practice — the syllabus wording is not, so we write our own |

## Specific works consulted

| Work                                                                                                                             | Licence                          | We may | What we took                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trowser** — testing browser and `trowserkit`, Rikard Edgren. `github.com/Trowser/Trowser`                                      | MIT with Commons Clause          | adapt  | `testheuristics.md` is the source for the follow-up moves and time-sequence probes we lacked. Commons Clause restricts **selling**; this harness is not sold. Rewrite in our own words, credited here                                                                                                             |
| **The Little Black Book on Test Design** — Rikard Edgren, thetesteye. `thetesteye.com/papers/TheLittleBlackBookOnTestDesign.pdf` | CC Attribution-**NoDerivatives** | cite   | Read it; do not rewrite it. Its 37 Sources for Test Ideas, quality-characteristics set and the ongoing/classic/combinatorial/visual split informed our thinking. Build from the upstream **it** names — Sabourin's 10 Sources, HICCUPPS(F), Kaner                                                                 |
| **Software Quality Characteristics** — Edgren, Emilsson, Jansson, thetesteye                                                     | CC Attribution-NoDerivatives     | cite   | The characteristic set `test-design` §3 should widen toward, **charisma** included                                                                                                                                                                                                                                |
| **Elisabeth Hendrickson** — Test Heuristics Cheat Sheet                                                                          | published freely, author's own   | cite   | Data-attack vocabulary                                                                                                                                                                                                                                                                                            |
| **Brian Marick** — the term "test idea"                                                                                          | —                                | idea   | Terminology                                                                                                                                                                                                                                                                                                       |
| **Kody** — agent harness by **Kent C. Dodds**                                                                                    | not checked — nothing copied     | idea   | Compared against, not borrowed from. It independently confirmed two rules already here (secrets by reference, fork-before-build) and surfaced three ideas parked as `PLAN.md` items 18–20: a triage ledger, splitting app docs into a human `README.md` and an agent `AGENTS.md`, and event-first triage triggers |

## Reviews and reading that shaped a decision

| Source                                                                                                              | We may | What came of it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two reviews of `docs/agent-workflows.md` by Gemini**, pasted in by the maintainer on 2026-09-14                   | idea   | Raised concurrency, a dirty working tree, lock expiry, partial failure, cleanup, allowlist widening, data leakage, the investigator loop, spend limits, orphaned ports, attributing `git status`, and what triggers an investigation. Weighed against the document's principles rather than adopted: several proposed patches pointed at one broken principle, and the answer was a worktree per run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **"Autonomous product development"**, `mega.dev/autonomous-product-development`, read on 2026-09-14                 | idea   | One practitioner's setup of event-triggered cloud agents under coordinator agents. Confirmed the direction — human-owned context injected into sessions, narrow tasks, indirect production access — and changed no principle. Nothing adopted: it offers no gate evidence, cost bounds or error rates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **"A Test Pyramid for AI Agents"** — Angie Jones, `angiejones.tech/test-pyramid-for-ai-agents/`, read on 2026-09-19 | cite   | Four layers ordered by **how much uncertainty you tolerate** rather than by test type: deterministic foundations on mock providers, reproducible reality by recording and replaying MCP interactions, probabilistic performance measured as success _rates_, and judgement by LLM-as-judge on a rubric. Its sharpest line for us is that layer 2 asserts **tool-call sequences, not outputs** — a shape this repo already has for HTTP in the network capture and lacks entirely for MCP. Mapped against what is here: layers 1 and 2 have partial foundations (`budget.ts` turn and spend limits, `roles.test.ts` validating a role's tools and skills, and the JSON-RPC-over-stdio client written for `observer.int.test.ts`), layers 3 and 4 have none. Parked as items 43–46 rather than built, and **no `agentic-coder` role added yet**: with no mock provider, no record/replay, no run history and no registered AI subject, it would be exactly the placeholder `CLAUDE.md` forbids. Nothing rewritten from the post — the layer names here are hers and are used as reference, not adapted |

## Provenance of this repo

Seeded from the maintainer's own earlier local projects (`b530114`) and from a
predecessor "goose-harness" whose agent-contract shape — mission, loads, method,
boundaries, output — this repo's roles still follow.

A large share of the 183 heuristic items across `.claude/skills/` originated there
rather than from any external source. The maintainer has declined personal credit; it
is recorded because provenance is a fact about the work, not a favour to anyone.

## Things we wrote ourselves

Not everything here descends from somewhere. These came out of failures in this repo
and are original to it:

- **`honesty-check`** — no external antecedent. Twenty-three rules about not
  overclaiming, written because agents overclaim.
- **`work-discipline`**, **`flaky-test-detection`**'s cause rows, **`testability-audit`**'s
  grading, and every rule in `docs/definition-of-done.md` — each traced to a specific
  failure that happened here.
- **Mutation testing as verification-of-verification** (`npm run mutate`) — the idea is
  old; hand-writing one mutation per enforced rule, and treating a survivor as proof a
  rule is untested, is this repo's own discipline.
