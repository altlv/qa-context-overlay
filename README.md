# qa-context-overlay

**Context** what the app under test is turned into · **Overlay** the bounds laid over a
run · **QA** whether any of it proves anything.

An agent handed a URL and told to test it will read the page to work out what is
there — expensively, every session — and then report whatever it did as a success.
This lays three things over that.

**Context.** A map of the play area, built by Playwright for no tokens: every control
with a graded selector, the bounds the page declared for each input, the traffic it
made, and a statement of what the scan could not see. The agent is given it rather
than buying it.

**Overlay.** Only the actions the target's environment permits, enforced as tools the
agent does not hold rather than rules it is asked to follow — and the harness watches
the same browser over CDP, so what each action actually changed is read from the live
DOM instead of taken on the model's word.

**QA.** Gates that refuse a test asserting nothing or checking a write only by its
render, a release verdict that goes stale the moment the code moves, and a report
format where a blocker must carry direct evidence.

The connective tissue is the network capture layer. Playwright keeps request and
response detail inside trace files, but an agent triaging a failure it did not watch
happen needs that evidence as text.

## Status

Honest state of each part.

|             | Built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Not yet                                                                                                                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overlay** | Bounded agent runner with a working stop path · eight roles in two families, coding and testing · every skill and every tool paired to a role and checked · a coder can call the planner · **roles drive a real browser under a policy that decides which tools they hold, which targets they may touch, and how many times** · every run preflighted, guarded at each tool call including the shell, and re-checked by a post-run gate (`docs/agent-workflows.md`) · **a pre-scanned session is handed the candidate actions its policy permits, with every refusal named** (E5a) · **the harness shares the agent’s browser over CDP and counts states off the live DOM, so `maxStates` refuses rather than advises** (E5b) | `api-coder`, `e2e-coder` and `failure-investigator` never executed — the other five have · no skill invoked by name · delegation exercised once, on 2026-09-28: `integration-coder` asked the planner whether a branch was reachable, and it was not · no orchestration recipes |
| **Context** | Five test levels on one runner — unit, integration, api, e2e, exploratory · network capture fixture · page scanner · **self-healing locators, with every heal recorded and gated** · clock-driven timing · per-subject projects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Auth/storageState setup · multi-browser · sharding · component tests                                                                                                                                                                                                            |
| **QA**      | Test quality gate, for this repository's stack and for a subject's own · release-gate verdict PASS/CONDITIONAL/FAIL with staleness detection · checkable report format · mutation testing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Regression selection · flake tracking over time · quality metrics · tier-3 evals                                                                                                                                                                                                |

Two words worth pinning down. **Validated** means the role ran, stayed inside its
budget, produced a report that passes `npm run check-report`, and every number it
reported was checked against an independent source — not that it looked plausible.
**Unexecuted** means exactly that: a role is prose until someone runs it, and most of
them still are. `.ai/state/PLAN.md` names which.

Counts are deliberately absent from this file. Inventory numbers rot the moment code
changes, and a confidently wrong number is worse than none — `npm run mutate`,
`npm test` and `ls .claude/skills` report the current ones.

## Quick start

```bash
npm install
npx playwright install chromium
npm test
```

Runs against a bundled fixture app, so it works on a fresh clone with no external
environment and no API key.

## Apps — the subjects under test

**`apps/` holds the things being tested, not the harness.** Each folder is a subject
under test plus the tests written against it. None of it is harness code, nothing in
`src/` imports from `apps/`, and deleting an app folder removes a target without
touching the tool.

The harness lives in `src/`. Its own tests live in `tests/`.

| App               | Kind           | What it is for                                                                                                       |
| ----------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `todo-fixture`    | local, bundled | Gives the suite and the network capture something real to exercise offline. Starts automatically.                    |
| `countdown-timer` | external       | Time-based UI. Proves the no-arbitrary-waits rule — a 30-second countdown asserted in milliseconds via `page.clock`. |
| `fakerestapi`     | external       | Validation target for the `api-coder` role. Has three real contract defects to write tests against.                  |

Three of them, as a sample. `npm run targets` prints every registered subject, the
environments it can be pointed at, and what each permits.

Each app folder carries its own `app.config.ts`, `tests/`, and — where they exist —
`pages/`, `scans/`, `coverage.md` and a `README.md` recording what was learned about
it. App folders share nothing, so adding a subject cannot disturb another.

Add one with `apps/<name>/app.config.ts` + `tests/`, then a line in
`apps/registry.ts`. Playwright derives the project, base URL and web server from the
registry. See `apps/README.md`.

**External subjects are excluded from `npm test` and CI** — a suite that goes red
because someone else's site is down teaches the team to ignore red. Run them
explicitly:

```bash
npm run test:external
```

## What each layer does

### Network capture (`pw`)

On by default; attaches to the HTML report on failure. Assert on it directly:

```ts
const create = await network.waitForCall((c) => c.method === 'POST' && c.path === '/api/todos');
expect(create?.status).toBe(201);
```

A DOM-only assertion passes even when the write 500s and the list renders from
stale client state. `tests/harness/network-capture.ui.spec.ts` proves exactly that,
rather than asking you to take it on trust.

### No arbitrary waits (`pw`)

`waitForTimeout` and `waitForSelector` are lint errors. For time-dependent UI drive
`page.clock` instead — the countdown-timer suite asserts a 30-second countdown and
a 60-second hold, and the whole file runs in about three seconds.

### Page scanner and testability audit (`qe`)

```bash
npm run scan -- https://example.com/app
```

Inventories interactive elements, grades every selector `stable` /
`text-dependent` / `fragile`, and reports what the team should fix to make the app
testable. This is the prerequisite for generating tests: without it an agent invents
selectors, which is how generated suites fill up with `.btn:nth-child(3)`.

### Self-healing locators (`pw`)

A selector rots when the page it names changes — an id regenerated by a rebuild, a
label reworded, a control moved. `src/tools/identity.ts` scores whether two
observations are the same control; `src/tools/heal.ts` uses that to find it again.

```ts
import { test, expect } from '../../src/fixtures/harness.js';

test('adds a todo', async ({ page, healing }) => {
  await page.goto('/');
  const submit = await healing.locator('[data-testid="todo-submit"]');
  await submit.click();
});
```

Capture baselines deliberately — `CAPTURE_BASELINES=1 npm test` — into a committed
`apps/<app>/baselines.json`. They are part of the tests: a heal is only reviewable
if what it healed _from_ shows up in the diff.

Three rules make this safe rather than dangerous:

- **A working selector is never second-guessed.** If it still resolves to exactly
  one element, that element wins. Healing is a fallback, not a policy.
- **A heal that is not decisive is refused.** Three identical `Edit` buttons give
  no answer, so the test fails with the rivals listed rather than picking one.
- **A working selector is still checked.** It wins, and the run says so if the
  element it resolves to now contradicts what was baselined — a recycled id
  resolves perfectly and proves nothing.
- **A healed run is not a clean run.** Every heal reaches `npm run gate` as a
  recorded risk, naming the selector the test should be changed to say — and that
  selector is verified to resolve to exactly one element, or reported as absent. A
  heal is a proposal; nothing here rewrites a test file.

### Test quality gate (`qe`)

`npm run assert-quality` — deterministic, no API key. Fails on tests with no
assertion, navigate-and-assert-once tests, unmarked fragile selectors, banned waits,
a writing UI test that checks only the DOM, and a successful API write that is never
read back. Generated suites drift toward tests that are green and worthless; this is
the floor.

`npm run assertion-floor` is the same idea for a test stack this repository does not
use. `assert-quality` reads Playwright specs, so a subject writing `node:test` clears it
having asserted nothing — the rules simply match no text. The floor reads the stack's
own import line, then refuses a test with no assertion, a test whose every assertion
sits inside a conditional or a loop, and a test that asserts only on literals no input
can change. The second is not hypothetical: the human baseline this proof of concept is
graded against asserts inside `if (results.length > 0)` in two of its tests, so both
pass having asserted nothing whenever the search returns nothing. It also exits 2 rather
than reporting a pass when a file holds no test it can read, and prints the list of
things it did not look at on every run — a floor that stays silent about its own gaps is
read as a review.

### Test ideas from a scan (`qe`)

`npm run ideas -- <scan.json>` — deterministic, no API key. Reads a saved scan and
prints the cases it supports: boundary values for declared ranges and lengths, probe
sets per field type, the write sequence for every submit (negative set, double submit,
back after submit, read-back), selection and repeat-transition cases, and the effect
tag each should carry. It says what the scan could not support, which gates the spec
will face, and the judgement still left to the author. Values come from
`src/fixtures/probes.ts`, which specs import rather than retype.
`npm run ideas -- --catalogue` lists every heuristic in `src/qe/heuristics.ts` by
what does the work: scripted, generated, scriptable, or judgement.

### Release gate (`qe`)

`npm run gate` aggregates results, flake and quality findings into a verdict:

- **FAIL** — failing tests, or tests that assert nothing. The suite is not telling
  the truth about the product.
- **CONDITIONAL** — flake, weak assertions, skipped tests, healed locators.
  Shippable, recorded.
- **PASS** — clean.

Three outcomes rather than two, so a known risk can be shipped _and_ written down.

### Bounded agents (`cc`)

Every run is capped on turns, dollars and wall-clock; whichever trips first ends
the run and returns a partial result saying why. An agent that cannot find the
answer does not error — it keeps looking.

**Each role declares the turns its own work needs**, and the model tier scales that
and the spend — `src/agents/models.ts` is the only place a model is chosen. Setting
`AGENT_MAX_TURNS` overrides every role at once, so `.env.example` deliberately no
longer ships a value: the one it used to ship cut the exploratory tester from the 30
turns it asks for to 12, the tightest budget on the most open-ended role.

Roles live in `src/agents/roles.ts` as SDK `AgentDefinition`s, in two families.
**Coding** roles produce automation; **testing** roles produce judgement and hold no
`Edit`. Each carries the guardrails, the repo conventions, the deterministic toolbox
and the skills it must load — and none of that is convention: `tests/unit/roles.test.ts`
fails if a skill is orphaned, if a judgement skill reaches a coder, or if a testing
role can edit code.

### Seeing and acting (`cc`)

Roles that look at running software drive a real browser through Playwright MCP:

```bash
npm run role -- exploratory-tester "Explore the cart
Timebox 30 minutes" --app juice-shop --env local
npm run role -- testability-reviewer "audit the home page" --app juice-shop --env prod --scan
```

`--env` is required and has no default, because deleting a record on a local fixture
is a test and the same click on production is an incident. What the policy for that
environment permits becomes three bounds the model cannot decline:

- **which tools it holds** — production grants observation only, and `browser_evaluate`
  is refused everywhere, because an allowlist containing arbitrary code execution is
  not a bound
- **where the browser may go** — the origin, enforced by the browser itself
- **which control, and how many** — labels that commit to something (pay, checkout,
  subscribe, invite) are refused wherever you are

`--scan` runs the page scanner first and hands the agent the map, so it spends its
turns on whether anything is _wrong_ rather than on discovering what is there.

`--preflight` runs every check that can refuse a run — readiness, a committed design,
the lockfile, the target lock — and stops before the worktree, the browser and the
agent, so it costs nothing.

After every action that can move the page, the harness looks for itself over its own CDP
connection and says what happened — how many controls appeared, went or changed, whether
that is somewhere new, and **what kind of surface arrived**. The kind is derived from what
the surface does, never from its name: a modal is the thing that covers content and holds
focus, a toast is the thing that announces itself, floats and leaves on its own. So a
`<div>` with no role and no recognisable class is named correctly, and the classifier can
come back saying it _cannot_ name what arrived — which is a finding, because either the
product is doing something unusual or the categories are wrong.

A label resting on an observation nobody paid for says so. Watching whether a surface
leaves on its own costs seconds of a session, so it is off by default and the summary counts
how many of its labels are provisional as a result — an unmeasured lifetime is never
reported as a surface that stayed.

## Commands

| Command                           | Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                        | Local subjects + harness self-tests (unit, integration, api, e2e)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `npm run test:external`           | Third-party subjects, opt-in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `npm run check`                   | format + lint + typecheck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `npm run assert-quality`          | Test quality gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `npm run assertion-floor`         | The half of the quality gate that survives the subject being swapped: every test must hold an assertion the code can falsify. Reads a subject's own stack — `node:test`, `vitest`, Playwright — from the import line its config declares, refuses a test that asserts nothing, one whose every assertion sits inside a branch, and one that asserts only on literals. Exits 2 rather than passing when a file holds nothing it can read, and prints what it did not look at                                                                                                                                     |
| `npm run gate`                    | Release verdict, refusing stale results                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `npm run mutate`                  | Breaks each enforced rule deliberately and checks the suite notices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `npm run mutation-compare`        | Runs a named mutation set against a named suite and says what each mutation proves: `--suite <command…>`, and `--against <command…>` to require that a second suite is not weaker, because a change may never leave the suite weaker than it found it. It is the judge for a file `npm run mutate` cannot see — its list and its suites are this repository's                                                                                                                                                                                                                                                   |
| `npm run bug-replay`              | Replays a real fixed bug from a subject's own git history: reverses one commit's **source** changes, leaves every test at HEAD, and asks whether the suite notices. Every mutation score here grades a suite against faults we invented; these were authored by the subject, which is the one thing a hand-written set can never claim. `--candidates` ranks commits worth the run and executes nothing. Refuses a checkout with uncommitted work, a red or unstable suite, and a revert that will not apply — a replay that could not be performed is reported apart and never counted as one the suite passed |
| `npm run precommit`               | Housekeeping before a commit: dead commands and paths in docs, undocumented capability, stale `PLAN.md`, plus the drift no scanner can catch                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `npm run plan:facts`              | The numbers `PLAN.md` quotes, read from the runs that produced them — refuses any that predate the code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `npm run scan -- <url>`           | Page scan + testability audit (`SCAN_DEEP=1` also probes hover, keyboard, responsive, scroll and zoom)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `npm run ideas -- <scan.json>`    | Test cases a saved scan supports — boundaries, probes, write sequences, effect tags — the gates they face, and the judgement left. `--catalogue` lists every heuristic as scripted, generated, scriptable or judgement                                                                                                                                                                                                                                                                                                                                                                                          |
| `npm run survey -- <path>`        | Map the source under test: exported units, the import graph with reverse edges, which tests import a file and which merely name it, and the files no test imports. `--changed <ref>` scopes it to a git diff plus one hop each way — the opener for a coding task, rather than a tree walk                                                                                                                                                                                                                                                                                                                      |
| `npm run candidates -- <path>`    | Which exported units a unit test could pin — unit, needs-control, not-unit, unknown — with the line and the signal that decided it, and the candidates no test names                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `npm run crawl -- <url>`          | Crawl the site: link graph, broken links, orphans, template clusters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `npm run targets`                 | Every app and the environments it can be pointed at                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `npm run check-report -- <path>`  | Validate a QA report against `docs/report-format.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `npm run known-defect-check`      | How many of a run's tests are marked expected-to-fail, and whether each names the defect it stands in for. The slot exists because the gate makes two opposite outcomes the same colour — a run that wrote a broken test, and a run that found a real one — and it is audited because it is also the obvious way to turn a red suite green. A marker with no `KNOWN:` comment fails; the count is reported either way, since a green suite holding three of them is not a green suite                                                                                                                           |
| `npm run subject-fault-check`     | Does a subject own test notice the process it spawns failing: breaks the declared entry point four ways — refuses to start, throws, dies after starting, exits 0 silently — and requires the suite to fail each time. The silent exit is the one worth missing least                                                                                                                                                                                                                                                                                                                                            |
| `npm run fault-check -- <spec>`   | Reruns app specs with every server response a 500 and refuses any that stay green — the proof a spec notices its server failing, which `mutate` never gave app specs                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `npm run flake-rate`              | How often each test has been unreliable, across the runs in `artifacts/runs/`. The release gate reports flakes within one run; this is the question it cannot answer — how often, and is it getting better. Prints the number of archived runs **before** the figures, warns below five that a handful is not a rate, and refuses to read a quiet archive as a promise of stability: a test that flakes one time in twenty is invisible in ten runs and is exactly the one that randomises a mutation score                                                                                                     |
| `npm run archive-results`         | Copies the run behind `artifacts/results.json` into `artifacts/runs/`, keeping the newest 20, so a trend can be read where before only the latest run existed. Copies, never moves — the gate and `plan:facts` read the fixed path. Nothing runs it automatically, so the history it builds is a floor and says so                                                                                                                                                                                                                                                                                              |
| `npm run sessions`                | What agent sessions have been kept, and what each holds. `npm run sessions -- rescue` copies the evidence out of a worktree before it is removed                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `npm run findings -- <app>`       | What every session against one app found between them: the union, the findings every session reached, and the ones seen exactly once. Five sessions against one storefront filed 105 findings amounting to roughly 57 distinct; the best single session reached 39% of them                                                                                                                                                                                                                                                                                                                                     |
| `npm run role -- <role> "<task>"` | Run an agent role in its own git worktree: preflight, a guarded loop, a post-run gate on the worktree's diff — `docs/agent-workflows.md`. Roles that test a deployment need `--app <app> --env <local\|test\|prod>`; e2e and api coders also need a committed `--design <file>`. `--preflight` runs only the refusals, for free. The work comes back uncommitted in the worktree; a failed gate prints the `failure-investigator` command, to run with `--worktree`                                                                                                                                             |
| `npm run triage -- <file>`        | Triage a failure JSON                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

The agent commands need a credential, and not specifically a key. The SDK resolves the OAuth
session from `claude login`, or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` — the route
the CI job authenticates with, and the one to reach for when `claude auth status` reports
`loggedIn: false`, which is what a fresh checkout and an unauthenticated machine both report.
`ANTHROPIC_API_KEY` resolves as well, but it is for billing an API account instead of a
subscription: nothing here needs it, and offering it as the fix for an auth failure is what
caused a key to be issued that nobody used. Verified 2026-09-13 by running a role with the key
variable absent.
`.env` is gitignored; never commit one, and never paste one into a transcript. Note which file
is loaded: the harness reads the `.env` beside `src/` in the checkout it runs from, so in a run
worktree it is not the main checkout's.

## Practices

`.claude/skills/` — loadable skills for deciding what to test (`risk-assessment`,
`test-design`, `test-techniques`, `exploratory-session`), looking at a rendered page
(`visual-inspection`), judging findings (`oracle-check`, `bug-report`,
`flaky-test-detection`), writing tests (`pwtest`, `unit-testing`, `testability-audit`),
mapping the source before writing any of them (`repo-survey`), and working honestly
(`work-discipline`, `honesty-check`). Every one of them is loaded by at least
one role, and a test fails if that stops being true. See
[`.claude/skills/README.md`](.claude/skills/README.md) for routing and for what is
deliberately absent.

`docs/conventions.md` for code rules, `CLAUDE.md` for how agents work here, and
[`docs/mutation-evals.md`](docs/mutation-evals.md) before believing a mutation score — what
the number cannot see, why part of every set is withheld from the role being measured, and
what else is worth measuring instead.

Much of this is adapted from a Goose-based QA harness: the guardrails, the verdict
schema, the selector ladder and the anti-pattern list.

## CI

GitHub Actions on push and PR. `verify` needs no secrets: format, lint, typecheck,
quality gate, Playwright, release gate. Agent checks are a separate job that
authenticates with a Claude subscription token (`CLAUDE_CODE_OAUTH_TOKEN`, created with
`claude setup-token`). It does not run for pull requests from forks, which get no
secrets; a run without the token skips the smoke with a warning rather than passing
silently.

## Stack

TypeScript (ESM/NodeNext) · `@playwright/test` · `@playwright/mcp` ·
`@anthropic-ai/claude-agent-sdk` ·
zod · faker · ESLint + Prettier · Node 20+
