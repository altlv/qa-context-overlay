# CLAUDE.md

Conventions for this repo. Read `docs/conventions.md` before writing or changing a
test, and the skills in `.claude/skills/` before deciding _what_ to test.

## What this repo is

`qa-context-overlay` — Claude (via `@anthropic-ai/claude-agent-sdk`) driving a real
browser through Playwright MCP, with three things laid over the app under test:
**context** the agent is given rather than pays to re-derive every session, **bounds**
its environment permits, enforced as tools it does not hold, and the **QA** checks that
decide whether the result proves anything.

| Capability                                      | Status                              | Entry point                 |
| ----------------------------------------------- | ----------------------------------- | --------------------------- |
| Network capture                                 | built                               | `src/capture/network.ts`    |
| Page scanner + testability audit                | built                               | `src/tools/page-scanner.ts` |
| Test quality gate                               | built                               | `src/quality/assertions.ts` |
| Release gate verdict                            | built                               | `src/qe/gate.ts`            |
| Failure triage agent                            | built, unverified against live API  | `src/agents/triage.ts`      |
| Agent roles — coding family and testing family  | defined, not yet driven             | `src/agents/roles.ts`       |
| Self-healing selectors                          | built                               | `src/tools/heal.ts`         |
| Test ideas from a scan, heuristics catalogue    | built, reaches a run via the driver | `src/qe/test-ideas.ts`      |
| Driver (E5a) — candidate actions under a policy | built, no live agent has seen one   | `src/qe/driver.ts`          |
| State model (E5b) — shared browser over CDP     | built, never refused a live session | `src/qe/state-model.ts`     |
| Role runner — preflight, guards, worktree, gate | built, not yet driven by an agent   | `src/cli/role.ts`           |
| Fault check — does a spec notice a 500          | built                               | `src/cli/fault-check.ts`    |

Do not add placeholder modules for the planned items. Build one end to end when it
is wanted.

## Non-negotiables

Ported from `core/HARNESS.md` and `core/guardrails/` in `goose-harness`.

**1. Evidence beats memory.** Read the file, run the check. Never claim a check ran
when it did not — report NOT RUN explicitly. A test that did not execute is not
evidence, and a test that passes without exercising the claim is insufficient.

**2. Every agent runs under a budget.** Never call the SDK's `query()` directly; go
through `runAgent()` in `src/agents/client.ts`, which enforces turn, spend and
wall-clock limits. An agent that cannot solve a problem loops rather than erroring.

**3. A test must prove behaviour.** Assert an observable outcome; for state changes
assert the UI _and_ the captured network call, and read a write back rather than
trusting its response. `npm run assert-quality` is the mechanical floor and it gates
CI.

**4. Never widen a selector or delete an assertion to make a test green.** Fix the
locator or report the defect.

**5. Tests must be isolated.** Never assert on a shared collection's size — assert
the specific thing your test created or rejected. Parallel workers share app state,
and a count assertion is a race. This has already bitten once.

**6. Do not read or commit `.env`.** Prefer checking that a variable exists over
reading its value.

**7. Destructive actions need explicit authorisation** — `git reset/clean/force`,
deleting files, production writes. Ask first. **This includes `git commit` and
`git push`: confirm with the user before either.**

**8. Do not recursively load the repository.** Start from structure and targeted
search, then open exact files.

## Layout

```
apps/<name>/       Subjects under test — NOT harness code. Config, tests, pages, scans, README.
                   Nothing in src/ imports from apps/.
src/agents/        Budget guard, SDK client, triage, role definitions
src/capture/       Network recorder — the evidence layer
src/fixtures/      harness.ts for UI specs, api.ts for API specs
src/pages/         BasePage — no assertions in page objects
src/quality/       Static analysis gating generated tests
src/qe/            Verdicts and gates; a run's preflight, guards, worktree and lock
src/tools/         Page scanner
tests/harness/     Tests of the harness itself
.claude/skills/    Test design, risk, exploratory sessions, oracles, defect reporting
```

## Adding an app

`apps/<name>/` with an `app.config.ts` and `tests/`, then register it in
`apps/registry.ts`. Playwright derives the project, base URL and web server from
the registry — nothing else needs editing. App folders never share code, so a new
target cannot disturb an existing one.

## Commands

```bash
npm test                  # local apps + harness self-tests
npm run test:external     # third-party apps, opt-in only
npm run check             # format + lint + typecheck
npm run assert-quality    # test quality gate
npm run gate              # PASS / CONDITIONAL / FAIL verdict
npm run scan -- <url>     # page scan + testability audit
npm run check-report      # validate QA reports against docs/report-format.md
npm run triage -- <file>  # triage a failure JSON (needs API key)
npm run role -- <role> "<task>" --app <app> --env <env> [--preflight]
                          # run a role in its own worktree — docs/agent-workflows.md
npm run fault-check -- <spec>   # does a spec notice its server failing
npm run archive-results   # keep the last 20 runs, so a trend can be read
npm run sessions          # what agent sessions have been kept, and what each holds
npm run sessions -- rescue      # copy evidence out of a worktree before removing it
npm run ideas -- <scan.json>    # test cases a saved scan supports
npm run precommit         # housekeeping before handing over a commit
```

## Gotchas

- Relative imports need `.js` extensions (NodeNext).
- Assert network with `await network.waitForCall(...)`, not `entries()`. Playwright
  delivers network events to Node asynchronously, so the DOM can show a result
  before the recorder sees it. This caused a real 1-in-60 flake.
- Code inside `page.evaluate` must contain no named or const-assigned functions —
  `tsx`/esbuild rewrites those with a `__name` helper that does not exist in the
  page, and evaluate fails at runtime.
- `page.clock.runFor()`, not `fastForward()`, for apps that reschedule with
  recursive `setTimeout`. `fastForward` fires each pending timer once.
- App servers under `apps/*/app/` are plain JavaScript, not TypeScript.
- Spawn a tool through `src/tool-paths.ts`, never `node_modules/...` relative to the
  working directory — a role's gate runs inside a worktree, which has none of its own.
