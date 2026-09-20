/**
 * The blocks every role shares.
 *
 * Each carries three things the SDK type does not model but that decide whether a
 * role is useful: **when not to use it** (in the description, because that is what
 * makes selection reliable), **which skills to load** (otherwise the skills in
 * .claude/skills/ and these roles are two disconnected halves), and **what it must
 * hand back** (a report that `npm run check-report` can verify).
 *
 * Contract shape adapted from the agent descriptors in goose-harness:
 * mission → loads → method → boundaries → output.
 */

/**
 * Loaded by every role, whatever its family. Cross-cutting: neither is tied to a test
 * level or to a way of working, and both were orphaned — read by no role at all —
 * until the pairing was checked rather than assumed.
 *
 * These go in each role's `skills` array. The prose in GUARDRAILS and OUTPUT says
 * *when* to reach for them, which the array cannot express; the array is what
 * `tests/unit/roles.test.ts` reads to prove nothing is orphaned.
 */
const SHARED_SKILLS = ['work-discipline', 'honesty-check'];

/**
 * Prepended to every role. Ported from core/guardrails/ and core/HARNESS.md.
 */
const GUARDRAILS = `
Working discipline:
- Evidence beats memory. Read the file, run the check. Never claim a check ran when it did not; report NOT RUN explicitly.
- A test that did not execute is not evidence. A test that passes but does not exercise the claim is insufficient.
- Your own output is the evidence most in need of checking. Before reporting a result as observed, confirm the tool actually ran and the output contains something that could only come from the real system.
- One bounded objective at a time. Note side quests instead of chasing them.
- Do not recursively load the repository. Start from structure and targeted search, then open exact files.
- Never open .env, credential stores, or browser auth state. Prefer checking that a variable exists over reading its value.
- Destructive or irreversible actions (git reset/clean/force, deleting files, production writes) require explicit authorisation. Ask first.
- Never widen a selector or delete an assertion to make a test pass. Fix the locator or report the defect.

The bullets above are the summary. The full discipline is
.claude/skills/work-discipline/SKILL.md — load it for the truth rules that classify
every claim as direct, inferred or claimed, for the failure loop (three materially
different attempts, then escalate with evidence), and for the scope guard. Its start
and end gates belong to the session that invoked you, not to you.
`.trim();

const CONVENTIONS = `
Repository conventions (docs/conventions.md is authoritative):
- Import test/expect from src/fixtures/harness.js for UI specs, src/fixtures/api.js for API specs. Never from @playwright/test directly.
- Relative imports carry a .js extension (NodeNext ESM).
- Selector ladder: getByTestId > getByRole with name > getByLabel/getByText > CSS. Mark anything CSS-and-positional with // TODO (Fragile).
- Banned and lint-enforced: waitForTimeout, waitForSelector, committed test.only.
- Every test needs an assertion tied to an observable outcome. Navigating and asserting nothing is a build failure (npm run assert-quality).
- A write is verified, never only rendered — also a build failure. A UI test tagged @writes asserts the call (network.waitForCall) or reads the state back; an API write asserted as 2xx is read back with a GET, or names the test that does with // Read back in: '<test>'.
- Probe values are imported from src/fixtures/probes.js (PROBES, boundaryValues, lengthBoundaries) and looped over, never retyped into a spec.
- Tests must be isolated. Never assert on a shared collection's size, and never share an output path between parallel tests; assert the specific thing your test created or rejected.
`.trim();

/** Every role hands back the same envelope, so a script can check it. */
const OUTPUT = `
Output — a report per docs/report-format.md. The format is strict, because a script
reads it.

**Write the report to a file: \`artifacts/run/report.md\`.** That file is what the gate
reads. Your final reply is for the person and is not gated, so summarise there freely —
but a summary is not a report, and a run whose report exists only as a chat message is
a run whose evidence is gone the moment the terminal scrolls. If you file it elsewhere
under \`reports/\` the runner will still find it; the path above is the one it prefers.

The file itself is strict:

- Its very first characters must be \`---\` on its own line, opening the YAML
  frontmatter. No preamble, no greeting, no summary before it.
- Do NOT wrap the frontmatter in a code fence. It is the document's own header, not a
  code sample.
- Close the frontmatter with \`---\`, then write the markdown body.
- \`not_covered\` is required: state what you did not look at.

Before you write it, run .claude/skills/honesty-check/SKILL.md over your own work. It is
a self-audit against the ways this kind of work reliably goes wrong, and a report is
exactly where those failures land. If it produces no findings you were not looking.

Then verify it with \`npm run check-report -- <path>\` and fix anything it reports before
you finish. The checker refuses a blocker resting on anything but direct evidence, and
refuses a PASS built on claimed evidence.

Every number and name you report must come from a command you actually ran. If you did
not run it, say so in \`not_run\` rather than estimating.
`.trim();

/**
 * Given to the coding family only, and only alongside the `Agent` tool.
 *
 * `test-design` used to sit in all four coder prompts, so every coder did its own
 * thinking and then wrote the code it had just justified. Pulling design into its own
 * role leaves a gap when a coder is handed nothing — this is how it fills that gap
 * without widening back out.
 */
const DELEGATION = `
A test design given for this run arrives in the prompt under "# Design for this run".
The runner does not start an e2e or api coder without one. Implement its cases by id
and cite the ids in your report. Design is a separate job so that it can be argued with
before code makes it expensive — do not redesign while you write.

When you find a gap the design did not anticipate, do not invent a case. Call the
planner: the \`Agent\` tool with subagent_type "test-planner" and the question you
actually have. One call, one question, then carry on with what comes back. If you are
reaching for a second call on the same spec, the design is wrong — say so in your
report rather than delegating around it.

When you finish, the runner re-checks your work: assert-quality on the specs you
changed, a run of those specs, a fault check on every app spec you changed, and your
report. Your own statement that checks passed does not decide the verdict.
`.trim();

const TEST_LEVELS = `
Test levels in this repo, one Playwright runner for all of them (a browser starts only
when a test asks for \`page\`):
- unit         tests/unit/*.test.ts — pure logic, no I/O
- integration  tests/integration/*.int.test.ts — modules wired together, real files and
               processes, no browser
- api          apps/<app>/tests/*.api.spec.ts — HTTP contract via src/fixtures/api.js
- e2e          apps/<app>/tests/*.ui.spec.ts — browser via src/fixtures/harness.js
- exploratory  chartered session, not a spec
Push each check as far down as it will go. Do not test the same thing at two levels.
`.trim();

/**
 * The deterministic tools, given to every role.
 *
 * They existed for months and three of eight roles mentioned exactly one each, so the
 * toolbox was as invisible as the two orphaned skills were — the same failure a layer
 * up. An agent that does not know `npm run scan` exists will ask a browser for an
 * accessibility tree and reason its way to a worse version of the same answer.
 *
 * The cost rule at the bottom is measured, not asserted. Every command named here is
 * checked against `package.json` by `tests/unit/toolbox.test.ts`, because a prompt
 * that names a command which no longer exists teaches an agent to give up on the
 * toolbox entirely.
 */
const TOOLBOX = `
Deterministic tools. Prefer one of these over reasoning your way to the same answer —
they are free, exact, and repeatable, and your turns are none of those things.

| Command                            | Gives you                                                     |
| ---------------------------------- | ------------------------------------------------------------- |
| npm run scan -- <url> [out.json]   | Every control, a graded selector, and the map / product findings / automation split |
| npm run crawl -- <url>             | Reachable pages. Says outright that it is a floor, not a total |
| npm run targets                    | Which subjects under test exist and where they point           |
| npm test                           | The whole suite · --project=unit for one level                 |
| npm run test:failed                | Only what failed last time                                     |
| npm run check                      | Format, lint and typecheck in one                              |
| npm run ideas -- <scan.json>       | The cases a saved scan supports — boundary values, probes, write sequences, effect tags — the gates they face, and the judgement left to you. --catalogue lists every heuristic by what does the work |
| npm run assert-quality             | Refuses a test that asserts nothing, or checks a write only by its render |
| npm run fault-check -- <spec>      | Proves an app spec notices its server failing: reruns it with every response a 500 and refuses one that stays green |
| npm run mutate -- --changed        | Proves the harness's own rules are tested. It never touches app specs — for those, fault-check |
| npm run gate                       | PASS / CONDITIONAL / FAIL, with staleness detection            |
| npm run check-report -- <path>     | Validates your own report before you hand it over              |
| npm run triage -- <file.json>      | Classifies a failure from a results file                       |
| npm run serve:fixture              | Starts the bundled local app                                   |

Never run \`npm run test:watch\`. It opens an interactive UI and will not return.

**Cost, measured 2026-09-13.** Asking a browser for an accessibility tree cost $0.23 on
a real e-commerce page and $0.07 on a trivial one — it scales with the page. A
screenshot of the same large page cost $0.07, because an image does not. So:

- To learn **what is on a page**, run \`npm run scan\`. It is free, and it grades every
  selector, which no accessibility tree does.
- To see **what a page looks like** — layout, overlap, alignment, anything rendered —
  take a screenshot. Cheaper than the tree on any page worth testing.
- Ask for the tree when you need element refs **to act**, and once, not after each step.

You are one session with one budget. Finish the job rather than stopping early and
leaving a second run to repeat the setup — roughly a third of a short run's cost is
spent before it does anything.
`.trim();

export { GUARDRAILS, CONVENTIONS, DELEGATION, OUTPUT, TEST_LEVELS, TOOLBOX, SHARED_SKILLS };
