# Task — write the integration testing skill

## The gap

`integration-coder` exists and has never run. It loads `repo-survey` (where the seam is) and
`test-techniques` (what values a technique produces) and **nothing that says what an integration
test is**: where its boundary lies, which doubles are legitimate at this level, what it must
assert about a process, and what it must never do.

That gap is not theoretical. This level exists in the first place because of a real failure: a CLI
crashed on a path that did not exist, every unit test passed, every browser test passed, and CI
died on the first run. The bug lived between the modules. A role given techniques and a map but no
level definition will write tests that call the modules and assert what they said back to each
other, which is the failure mode the whole level exists to catch.

The unit level has `unit-testing`; this is its sibling. **Do not duplicate `test-techniques`** —
that skill produces the values. This one decides what a test at this level is allowed to stand up,
what it must observe, and when the honest answer is that the check belongs at a lower level.

**And part of the system under test is not deterministic.** The subject's `src/routes/chat.js` and
`src/services/chatService.js` reach a model provider, so this level is where traditional test
automation meets agentic testing: component and app integrations cover the deterministic seams, and
an AI-backed seam is testable here too — but only by _fixing_ the dependency rather than trusting
it. Angie Jones' pyramid for AI agents puts exactly this at its middle layer, and `docs/sources.md`
records what this repo took from it and what it parked (PLAN items 43–46).

## Deliverable

One file: **`.claude/skills/integration-testing/SKILL.md`**, matching the house style of
`.claude/skills/unit-testing/SKILL.md`.

Write only that file. The harness owner wires it up afterwards — the role's `skills` array, the
catalogue row, and the test that holds the array and the prose together. A skill declared before
its file exists fails `tests/unit/roles.test.ts`, so do not edit `integration-coder.ts`.

## Read these first, and match them

- `.claude/skills/unit-testing/SKILL.md` — the sibling. Same voice, same shape, same standard of
  reasoning. Where a rule is the same rule, **do not restate it**: name it and move on.
- `.claude/skills/test-techniques/SKILL.md` — what is already covered, so the new skill adds a
  boundary rather than repeating a technique.
- `.claude/skills/README.md` — the catalogue, the routing table, and the `Interlaying (blind
spot)` section every skill here carries.
- `.ai/state/POC-UNIT-CODER.md` §9 and §10 — what the harness is doing with these skills.
- `.ai/state/HANDOFF.md` — the working agreements and the traps that apply to writing tests.

## Required shape

- Frontmatter `name` and `description`; the description carries a `Use when` and a **`Not for`**
  clause that routes correctly — `Not for` a single module's logic (`unit-testing`), for an HTTP
  contract alone (`test-techniques` with the api level), or for anything needing a browser.
- A **`Compact core`** of 15–25 lines that stands alone if lifted into a prompt. This exists
  because instrumentation found a role opening none of its injected skills across 68 tool calls;
  the compact core is the hedge.
- An **`Interlaying (blind spot)`** section: what this skill cannot see, stated rather than left
  to be inferred.
- British spelling, sentence-case headings, no emoji, no advocacy for any tool.
- **Every rule names the failure it prevents.** A rule with no failure behind it is a preference.
- 150–260 lines. Stack-neutral: concrete examples may use `node:test` + `assert/strict` +
  CommonJS or this repository's Playwright + TypeScript, and the rule must hold for both.

## The content it must cover

**1. Two kinds, and they differ in what may be doubled.** This is the spine of the skill.

- **Component integration** — a few real modules wired together, with the outside edge doubled.
  The wiring between them is the thing under test and may not be stubbed; what sits _beyond_ the
  cluster (a model provider, a clock, a network call) may be. Example: the subject's
  `test/specIndexer.test.js` wires its indexer to the real filesystem.
- **App integration** — the whole application through its real entry point: a spawned process,
  an HTTP surface, a protocol on stdio. Nothing of the app is doubled; the _environment_ is
  controlled instead — a temp directory, a chosen port, environment variables. Examples: the
  subject's `test/labs-routes.test.js` (spawns the server, speaks HTTP) and
  `test/mcp-server.test.js` (spawns the MCP process, speaks its protocol).

Say which kind a given risk needs, and say what happens when they are confused: an app test with
the app doubled proves the double works, and a component test with the wiring doubled proves
nothing about the wiring.

**2. The boundary rule.** Doubling the thing under test converts the test into a unit test with
extra steps — it will pass, and it will never catch the between-module defect the level exists
for. State the test that tells them apart: _if the assertion would still pass with the seam's two
sides disagreeing, the seam is not being tested._

**3. What to assert about a process.** Name each observable and what it catches:

- **The exit code.** A command that prints an error and exits 0 is a check that silently passes.
- **State that was persisted**, read back through the real boundary — not the response the
  component echoed. A 200 that stores nothing passes every check on its response; this repository
  has a live API that does exactly that.
- **The protocol or status**, and the shape of what came back.

**4. Unhappy paths that exist only at this level.** A missing file, a missing directory, malformed
input, no arguments, a path that exists but is the wrong kind of thing, a port already in use, a
child process that fails to start. Each is a seam, and each is where the real failures have been.

**5. Determinism and isolation.** Its own temp directory and its own output paths — two tests
writing one file is shared mutable state and has already made a suite flaky. A spawned process is
killed in a `finally`, or it outlives the test and holds a port or a directory. An integration
file is repeated before it is believed stable: one green run is not evidence about a process.

**6. Where a test does not belong.** No browser — that is the e2e level. No third-party network.
No asserting on the size of a shared collection. And when a check needs none of this, say so
rather than standing the world up: a test that could be a unit test and is written here costs the
suite its runtime and its trust.

**7. The oracle rule, in its integration shape.** The expected value must come from something
other than the implementation — a documented contract, a specification, or an independent
recomputation. The integration-specific trap: **a round trip proves the two sides agree, not that
either is right.** Two components that share a wrong assumption will pass every round trip you
write. Name it, with an example.

**8. A non-deterministic dependency, which is what makes this level the meeting point.** Record and
replay is the only honest way to test a seam that reaches a model or an MCP server: mock it
entirely and the real behaviour is hidden, call it live and the suite is slow, expensive and
unstable. So: capture one real interaction, commit it as a fixture, replay it deterministically,
and assert the **flow** — which dependency was asked, in what order, with what arguments, and what
your code did with the answer — never the text that came back. State the limit plainly, because it
is the trap at this level: a recorded session is one sample of a distribution, and a fixture the
model has outgrown is a test of the fixture. Where the infrastructure does not exist yet — this
repo has no mock provider and no record/replay (PLAN items 43–46) — the honest move is to double
the dependency at the cluster's edge, at component level, and say so in the report rather than
asserting against a live model and calling it deterministic.

Ground it in this subject, because it has both branches and that is easy to miss:
`src/services/chatService.js` lazily loads `src/services/modelConfig.js`, which picks a provider
from `CHAT_PROVIDER` (openai, openrouter, groq, xai, mistral, ollama — all OpenAI-compatible), and
**falls back to BM25 search plus template responses when no provider is configured**. So the
deterministic half of that path is testable today by controlling the environment, with no
record/replay infrastructure at all; only the provider-backed half needs its dependency fixed.
Require the skill to say that plainly: the fallback is a real code path with a real contract and it
has to be reached rather than assumed, and a test that asserts a model's wording is testing the
model, while one that asserts the fallback, the flow and the error handling is testing the subject.
`src/services/modelConfig.js` is a fair target in its own right at this level — its behaviour is a
function of which keys and variables are set, which is environment control rather than mocking.

## Constraints

- No inventory counts anywhere in the file. Name the command that produces the number instead.
- Do not advocate for a tool, a framework or a doubling library. The rules are what a test must
  prove; how it does so is the author's decision.
- Every example must be checkable by the reader against the code it names.
- Keep the `Compact core` free of any reference that only makes sense inside this repository.

## Done when

- A person can grade an unfamiliar integration test file against it: they can say which kind it
  is, what it is entitled to double, and whether its assertions could fail for the right reason.
- Its `Not for` clause sends a reader to `unit-testing` or `test-techniques` correctly.
- The `Compact core` stands alone if lifted into a prompt.
- `npm run precommit` passes: every command and repo path it names resolves.

## The corpus this level is graded against

Subject: `mcpa-training-bot` — an Express app, an MCP server and a set of services, in its own
checkout beside this repository.

| Kind                   | The subject's own file                                        | What it reaches                                                                                |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| App, HTTP              | `test/labs-routes.test.js`                                    | spawns the server, speaks HTTP, reads env                                                      |
| App, protocol          | `test/mcp-server.test.js`                                     | spawns the MCP process, speaks its protocol                                                    |
| App, HTTP              | `test/api.test.js`, `test/exam.test.js`, `test/specs.test.js` | spawned server over HTTP                                                                       |
| Component, filesystem  | `test/specIndexer.test.js`                                    | a service wired to real files                                                                  |
| Component, filesystem  | `test/data-integrity.test.js`                                 | services reading and writing the data directory                                                |
| Component, the AI seam | `test/chatService.test.js`                                    | a service wired to its provider configuration — the one place the subject is not deterministic |

Its own `scripts/mutate-app.mjs` carries **13 mutations** across `src/routes/labs.js` (7),
`src/mcp/server.js` (2), `src/server.js`, `src/services/questionService.js` and
`data/topics.json`, and it runs a fixed list of five suite files. That set is the objective score
this level will be judged by, and it was written before this experiment existed. Read it: it names
the rules the subject's own author thought worth breaking.

## How to hand it back

One commit on the branch you were given, containing that one file. Then say, in the hand-back, the
two or three rules you judged most likely to be wrong — the ones the first real run will test.
