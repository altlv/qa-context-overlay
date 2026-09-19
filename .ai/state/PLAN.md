# PLAN — where we are and what is next

**Kept accurate, never left stale.** Before every commit, every fact here is re-verified
by running the command that produces it; sections that changed are updated in place,
and anything no longer true is deleted rather than left beside its correction. A stale
number is worse than no number, because it is believed. Status and next actions live
together because they are one sentence: what is true now decides what comes next.

Durable working agreements live in `HANDOFF.md`. Facts about an app under test live in
that app's `README.md`. Why a line of code exists lives in a comment next to it.
Attribution lives in `docs/sources.md`. None of that belongs here.

## Where we are

Head is `fe38d51` — the commit this file was last checked against. A file cannot name
the commit that contains it, so `npm run precommit` accepts HEAD itself, or HEAD's
parent when the latest commit updated this file.

Roles drive a real browser through Playwright MCP, bounded by the exploration policy at
three layers, the third not yet seen firing in a live run; the toolbox reaches every role; the session briefing is a tested module
rather than inline prompt text; `npm run precommit` guards documentation drift before
each commit, and `npm run plan:facts` supplies the numbers below.

A session is no longer told only what is on the page. `src/qe/driver.ts` joins `ideasFor`
to the exploration policy, so a `--scan` run carries **candidate actions** into the
briefing with every policy refusal named beside them — where before it carried a map and
left "what to try" to be worked out again, at model prices, every session. That is E5a.
It narrows and deliberately does not rank: which permitted case deserves the budget is
what `heuristics.ts` files under judgement, and an invented score would be a confident
number with nothing behind it.

**E5b is built.** One browser, two clients: the run launches Chromium with a debugging
port, hands the endpoint to Playwright MCP, and keeps its own Playwright connection to
it. So after every call that can move the page, the harness reads the live DOM itself —
`harvestCandidates` for fingerprints, `matchAll` for what changed — instead of parsing
the text MCP wrote for the model. That is what closes **item 23**: `maxStates` was
enforced by nothing for months and now refuses at the ceiling, because something can
finally tell a new page from a return to an old one.

E5c — choosing the next action from the diff — is not built. The driver still narrows
and does not choose.

Heuristics now have a bridge to action. `src/qe/heuristics.ts` sorts each one by what
does the work — scripted, generated, scriptable, or judgement. `npm run ideas` turns a
saved scan into the generated cases, and `npm run assert-quality` gates the two that
generated suites most reliably skip: a write checked only by its render, and a write
never read back.

A role run no longer rests on the agent's word. `docs/agent-workflows.md` is the
specification, written from a drawing of the flow: preflight refuses a run missing its
inputs, the runner injects the role's skills and design, one `PreToolUse` hook guards
every tool call including `Bash`, and a post-run gate re-checks the work — with
`npm run fault-check` proving an app spec notices its server failing. Built and tested
on 2026-09-14; no live agent run has gone through it yet.

Runs are separable by construction. Each works in its own git worktree at the base
commit, beside the repository, so its diff is its work and nobody else's; one run holds
each app and environment at a time; a server the harness starts gets a free port per
run; the work comes back uncommitted for a person to bring in. `--preflight` runs every
refusal and stops before anything costs money.

## Proven — direct evidence, re-run before this commit

The first three lines are `npm run plan:facts` output, which refuses any run older than
the code.

- `npm test` **662 passed** — unit 541, integration 51, todo-fixture 7, harness 63
- `npm run test:external` **not clean, and not quoted as such** — countdown-timer fails
  intermittently at a rate that jumped on 2026-09-19, idle or busy alike. The 16
  fakerestapi tests passed every run. The failure signature is captured under _Not
  proven_ and the diagnosis is item 47; `npm run plan:facts` refuses to bless this line
  while it stands, which is the check working
- `npm run mutate` **144/144**, one mutation per enforced rule, no survivors. 1515
  seconds on 2026-09-19 — worth recording, because the module header claimed "under a
  minute" until today and that sentence is why a sweep was once fired mid-edit.
  `npm run mutate -- --changed` covered 16/16 in 114s while the rules were being
  written; it prints no percentage and says how many rules it skipped
- `npm run gate` **PASS** · `npm run assert-quality` **61 files, 0 findings**
- `npm run check` clean · `npm run precommit` clean
- **The driver's plan runs on real third-party pages, both directions, 2026-09-18.**
  `testpages.eviltester.com/styled/basic-html-form-test.html`: 11 ideas, and the same
  scan gives **0 candidates and 11 refusals on prod** against **11 and 0 on local and
  test** — only the policy differs. Every prod refusal names its reason. The countdown
  timer page gives 1 candidate and 0 refusals, correctly: it has no submit control, so
  `ideasFor` tags its field `@read-only`. Scans are in `artifacts/`, which is gitignored
  — committing one is item 31
- **The harness and Playwright MCP share one browser, proven both ways, 2026-09-19.**
  `tests/integration/observer.int.test.ts` spawns the real MCP server against a
  Chromium this repo launched, calls `browser_navigate` over JSON-RPC, and reads the
  resulting control back through a second CDP connection. The known-bad direction was
  run too: with `--cdp-endpoint` removed, MCP opens its own browser and the observer
  sees **nothing** — null transition, 1 missed look, 0 states. That matters because the
  failure is silent, a count of zero being indistinguishable from a session that never
  moved, which is why the miss is counted and reported as a floor
- **The state model's rules hold in both directions.** A list growing by a row is not a
  new state; a modal opening without a URL change is; a page whose copy ticks every
  second is not; returning somewhere already visited does not count twice; a control
  renamed in place is reported as changed rather than as one gone and one arrived. Four
  mutations, each applied and seen to fail a named test on 2026-09-19
- **The write gates hold both ways.** Silent on every committed spec, and firing on
  real specs once their verification is removed: fakerestapi books without its
  read-back marker, todo-fixture UI without its network checks, todo-fixture API
  without its reads, and the countdown spec retagged `@writes`. 2026-09-14
- **`npm run ideas` runs on real scans** — four the-internet pages (login, checkboxes,
  dropdown, inputs) and the local todo fixture, 2026-09-14. It refuses the committed
  countdown-timer scan, which predates the constraint format, out loud. Those scans were
  not committed, so this cannot be re-run from the repo yet — item 31
- **A role runs.** `test-planner` executed against the live API on 2026-09-13: 1 turn,
  $0.1677, 6s, returned what it was asked for
- **A role sees.** `testability-reviewer` against academybugs under a `prod` policy
  reported "a cookie-consent banner overlapping the third product image" — an
  occlusion, which is a spatial fact no DOM query returns. 4 turns, $0.0728, 17s
- **A role reasons from a pre-computed map.** Given `npm run scan` output, it named
  `getByRole('link', { name: "Select Options" })` as the most fragile selector on the
  page — three products, one accessible name, "resolves, looks valid, and silently
  clicks the wrong product instead of failing loud"
- **The policy binds the browser at two layers the model cannot talk its way past:** the
  tool allowlist (what it may hold) and the browser's own `--allowed-origins` (where it
  may go). The third, the per-call guard, moved on 2026-09-14 — see _Not proven_
- **`npm run fault-check` holds both ways on real specs** — its integration test runs
  the probe spec under the fault and requires the client-only test refused as survived
  and the server-dependent one credited as caught, and runs the todos API spec and
  requires every test caught. 2026-09-14
- **The post-run gate, readiness, skill injection, the shell guard and per-role wall
  clocks are enforced in code**, each with unit tests in both directions and a mutation.
  Enforced is not exercised: see _Not proven_
- **Worktree isolation holds against a real git repository** — a throwaway one: the
  worktree's changes are exactly the run's while the checkout is edited alongside, an
  uncommitted design is absent at the base, a differing lockfile is refused, and a plain
  `git worktree remove` leaves the checkout's `node_modules` intact. That last test was
  shown to fail against the first version, which linked modules inside the worktree.
  2026-09-14
- **The runner refuses as a process, not only as functions.** `role.ts` run with
  `--preflight` in a throwaway repository refuses an unknown role, a coder with no target
  or design, an uncommitted design, a differing lockfile, a target a live run holds, a
  coding role in another run's worktree, and a path that is not a run worktree; it
  replaces a dead run's lock and releases its own. Each refusal carries a mutation.
  Three repeats under `CI=1`, no failures. 2026-09-14
- **`npm run plan:facts` refuses failing external tests.** It had quoted 19 passed
  beside 3 failures and printed the failures after the last project's count, where they
  read as fakerestapi's. Both fixed, each with a test
- **CI is green** on `1eb4880`: 592 passed, release gate PASS — the first green run since
  the plan-stamp rule landed. Every run before it failed because `actions/checkout`
  fetched one commit and precommit could not see HEAD's parent; a depth-1 clone
  reproduced the refusal and a depth-2 clone passed. CI fetches two commits now
- **An agent runs in CI, on a subscription token.** Run 34883565980 on `fc69532`: the
  triage smoke authenticated with `CLAUDE_CODE_OAUTH_TOKEN` alone and returned a verdict
  ("infrastructure", high confidence) for $0.0802. Every earlier run skipped it for want
  of an API key, and no API key exists anywhere now. The same triage cost $0.16–0.17
  locally; why is not established
- **The harness needs no API key.** A role ran with `ANTHROPIC_API_KEY` absent from the
  process, on the Claude Code OAuth session alone — 1 turn, $0.027. `.env.example` had
  claimed the key was required since before the fallback existed, which is why one was
  issued and pasted in that nobody needed
- **Cost floor per role invocation ≈ $0.14** — the difference between a bare
  one-line system prompt ($0.027) and a full role prompt with skills ($0.168). At the
  default `maxUsd` of $1.00 that leaves roughly five to six turns of real work
- **The harness loads its own `.env` and no subject's** — two integration tests, one
  staging a temp directory with its own `.env`, plus the mutation that reverts to the
  cwd-relative load
- Self-healing proven against staged change: regenerated ids, a reworded label held by
  its `name` attribute, a reworded and moved link held by its href, a control behind a
  shadow boundary — plus every refusal
- Detector precision corrected against a live site: two occlusion false positives and
  one hover false positive, each carrying a regression test

## Not proven — do not claim otherwise

- **The test tier now runs `@destructive` and untagged specs, and nobody has watched
  that happen.** Flipping `allowDestructive` for `test` on 2026-09-19 moved two things
  at once, because one flag governs both: the browser tools an agent holds, and — via
  `grepForPolicy` — which Playwright specs run at all. The spec half is the wider blast
  radius and was a consequence of the change rather than its purpose. Pinned by a test
  that says so, unexercised against a real shared deployment. If it proves too loose,
  split the flag rather than narrowing that test
- **The bounded wait for a page has one measurement behind it, on one machine.**
  `activePage` polls for up to two seconds because a CDP connection learns of a target
  after the client that created it. Two seconds is a guess that made a 1-in-4 flake
  disappear over 16 consecutive clean runs; it is not a measured upper bound, and a
  slower machine or a heavier page may want more
- **The driver's plan has never reached a live agent.** `src/qe/driver.ts` is unit-tested
  in both directions and was run against two real third-party pages, but nothing has
  observed a session receiving it: the wiring in `src/cli/role.ts` — scan, `ideasFor`,
  `planActions`, briefing — has not executed end to end, because that needs the live run
  that is item 10. Until then "a session is handed its candidates" is claimed, not direct.
- **Nobody knows what the plan costs in tokens, or whether it changes a session.** It is
  prose added to every pre-scanned browsing prompt, and this repo has twice measured a
  briefing change in turns and dollars. The with-and-without comparison is item 30, and
  its "saves turns" remains a claim until that runs.
- **The plan deliberately does not rank, and that may be wrong.** Forty permitted
  candidates in scan order may be worse for a session than ten ranked badly. Ranking was
  left out because `heuristics.ts` files it under judgement and an invented score would
  be a confident number with nothing behind it — but no session has been observed
  drowning in the list either, so this is a decision, not a finding.
- **No exploratory session has ever been run by an agent.** Skills, roles and
  checklists exist; none has been exercised. Still the largest unproven claim here.
- **No spec has been written from `npm run ideas`.** Its output has been read by a
  person, not used by an agent. That it saves agent turns is the reason it exists and
  is still a claim — item 30 measures it through the driver, with it and without.
- **No skill has ever been invoked by name.** Demonstrated at cost on 2026-09-11:
  `oracle-check` already held the exact oracle that found nearly every bug in a manual
  session, and went unread because nothing made anyone read it.
- **No agent run has gone through the new runner.** Readiness, skill injection, the
  guard hook, the post-run gate and per-role wall clocks are unit-tested and mutated,
  and not one has met a live agent. The first run must show a refusal in preflight, a
  refused `Bash` command, and a gate verdict on real output.
- **No agent has worked in a run worktree.** Creating one, confining the file tools to
  it and gating inside it are tested apart; `--preflight` stops before the worktree, so
  no test runs the whole path. Also open: `Bash` can `cd` out of a worktree — the shell
  guard refuses git writes, secrets and foreign hosts, not paths — and nothing removes
  finished worktrees, by design, so they accumulate beside the repository until a person
  removes them.
- **The countdown-timer failures have a signature now, and the load theory is dead.**
  History: 3 of 6 failed once on 2026-09-14, then 0 in 90 runs. On 2026-09-19 the rate
  jumped — 4 of 5 runs while the machine was busy, and **3 of 5 with the machine idle**.
  That difference is nothing at n=5, so "heavy local load" is **disproven as the lead**
  rather than merely unconfirmed; it was recorded as the standing lead earlier the same
  day and should not have been without a control.
  What the failure actually looks like, captured rather than guessed: `runFor(10_000)`
  from `00:01:00` lands on `00:00:49`, not `00:00:50` — off by one — and then the
  display **keeps counting down in real time** while the assertion waits, drifting
  49 → 44 across a 5-second timeout. If `page.clock` held the page it would be frozen
  where `runFor` left it. So clock control over this app is partial or lost, which is a
  mechanism, not a mood.
  Ruled out: the site is not slow (HTTP 200 in 345–807 ms during failures); the spec
  does install the clock before `goto`, as the README demands; nothing in this
  repository has touched `apps/countdown-timer`, `src/fixtures`, `playwright.config.ts`,
  `apps/targets.ts` or `apps/registry.ts` since `711d738` — `git log` over those paths
  is empty, so no change here is implicated, the WebMCP work least of all since it was
  documentation rows only.
  The open lead: `/js/apps/timer/countdown.js` is served with
  `last-modified: 2026-09-18 15:49 GMT`, one day before the rate jumped, and it drives
  the display with `setInterval`. That is suggestive and not proof — a static-site
  rebuild touches every mtime without changing a byte — and it cannot be confirmed
  upstream, because the `sourceRepo` recorded in `app.config.ts` now 404s. Item 47
- **Which guard path the SDK calls under `bypassPermissions` is unobserved (F7).** Its
  types say that mode bypasses permission checks, which is why `canUseTool` was
  replaced with a `PreToolUse` hook. Until a live run refuses a command, neither is shown
  to fire — and the browser guard's old "fail-closed" claim was never shown either.
- **What injected skills cost per run is unmeasured.** `e2e-coder`'s four skills are
  several hundred lines of prompt on every run, against a measured floor of $0.14.
- **The per-role wall clocks are estimates.** No role has run long enough to observe a
  median.
- **The fault check tries one fault.** Every server response becomes a 500. A spec that
  notices a 500 but not a wrong value passes it, and an API spec that builds absolute
  URLs bypasses the fault and is reported untouched.
- **Delegation has never fired.** A coder can call `test-planner`; none has.
- **`maxStates` refuses in unit tests and has never refused a live agent.** It is no
  longer enforced by nothing — `src/qe/state-model.ts` counts states off the live DOM
  and `browserGuard` refuses at the ceiling — but like every other bound here it stays
  unproven until it is seen stopping a real session. What the state model calls a state
  is also a judgement nothing outside its own tests has yet argued with: two screens
  whose interactive controls match and whose content differs fold into one, by design.
- **The state count is a floor whenever a look was missed.** The observer is fail-soft
  on purpose — the action has already happened, so refusing afterwards prevents nothing
  — which means a page caught mid-navigation silently costs a state. The run summary
  says so, and no live run has yet shown how often it happens.
- **The label guard reads the model's own words.** Playwright MCP names a target by an
  opaque `ref` plus a description the model writes, so "Delete account" is refused and
  "the third button" is not. A guard against accident, not against an adversary —
  there is a test asserting exactly that limit.
- **No interactive session has run.** Every browser run so far was read-only under a
  `prod` policy, so `INTERACT`, `FILL` and the action ceiling are unexercised against
  a live page.
- **Self-healing has never faced a change someone else made.**
- Framework detection is largely unverified; three tiers confirmed against live sites.
- Six of eight roles have never run. No role has written a browser spec.

## The measured gap

`academybugs.com/find-bugs/` plants **25 bugs across five categories** — functional,
visual, content, performance, crash — and ships its own oracle: a counter overlay whose
`a.academy-tooltip-bug-link` elements carry found/unfound state in the DOM, per
session. That makes the harness's find rate a number rather than an opinion.

Measured 2026-09-11:

| Finder                                    | Distinct findings |
| ----------------------------------------- | ----------------- |
| A person with a browser, over four passes | ~30               |
| **The harness's tools, ever**             | **~8**            |
| Of those ~8, ones the person had missed   | ~4                |

The eight are all static and structural. Every serious defect on that site — a phantom
$100 added to every cart total, a quantity field that silently caps at 2, three
products with no purchasable path, an inert currency switcher, dead pagination — needs
**interaction**, and the harness never clicks anything.

**The honest headline: this is a good map and not yet a tester.** Nothing since has
moved that number. 2026-09-11 fixed how the map reads. 2026-09-13 fixed who does the
thinking, what pays for it, and — at the end — gave the roles hands and eyes.
2026-09-14 gave them something to choose with.

**The hands are new and have not been used.** A role can now click, under a policy
that decides which controls and how many, and no session has done it once. The
difference between this and the previous entry is that the gap is a session away
rather than a capability away.

## Work queue

Ordered so nothing appears before what it needs. The **blocked by** column is the
ordering — if it is empty, it can start today.

An earlier version of this table had E5 first and E4 sixth, while E5's own
description read "action selection under E4". Ranking by importance rather than by
dependency puts the most-wanted thing on top and quietly makes it unstartable. The
same fault returned on 2026-09-19 in a different shape: item 10 sat under
_Independent — any time_ while two items here waited on it, so the ordered table
claimed an order its own **blocked by** column contradicted. Whatever heads this list
must be startable today.

**The numbers are ids, not an ordering, and must never be renumbered.** They run
7–11 beside 24–27 because that is the order things were raised, and more than twenty
places in this file — plus commit messages and `docs/sources.md` — refer to an item by
its number. Tidying them into a sequence would read as an improvement and silently
break every one of those references. A finished item keeps its number and moves to
**Recently closed**, where the number stays in the row title so a reference to it
still lands.

### In this order

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Blocked by           | Why                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | **The first live run through the new runner, and what injected skills cost.** One cheap role run that must show a preflight refusal, a refused `Bash` command, a worktree created and gated, a gate verdict, and the token cost of the skills now injected into every prompt                                                                                                                                                                                                                         | —                    | **Moved here on 2026-09-19 from the independent list, where it had been sitting while two items in this table waited on it.** About $0.20 of agent time. Everything under _Not proven_ that starts "no live agent run has…" is waiting on this one run, and so is every bound this session added: the state ceiling, the action ceiling and the label rules all refuse in unit tests and have never refused a model                          |
| 3   | **E5 — the driver.** **E5a and E5b done** (2026-09-19). E5a: `src/qe/driver.ts` joins `ideasFor` to the policy, so a `--scan` run hands a session its candidate actions with every refusal named. E5b: one browser, two clients — the run launches Chromium with a debugging port, gives Playwright MCP the endpoint, and reads the live DOM over its own connection after any call that can move the page, which is what closes item 23. **E5c — choosing the next action from the diff — is open** | 10 for the live half | The driver narrows and still does not choose, and that boundary was deliberate: `heuristics.ts` files which case deserves the budget under judgement. E5c is where that is revisited, and the diff is now available to revisit it with — `appeared`, `disappeared` and `changed` per action. Everything here refuses in unit tests and nothing has refused a live agent, which is item 10                                                    |
| 4   | **The map is a single state.** Transient surfaces — mini-cart, dropdown, modal, toast, drawer — appear in no inventory and no crawl                                                                                                                                                                                                                                                                                                                                                                  | —                    | **Unblocked by E5b.** They are still absent from the pre-run scan, which is taken once on a page that has not been touched, but a surface that opens is now _detected_: the state model reads the live DOM after each action and reports the controls that arrived without the URL moving. What remains is making the session go and open them, which is E5c, and carrying what it found back into a scan artefact, which is items 20 and 21 |
| 6   | **E7 — a real agent session against the scored benchmark**                                                                                                                                                                                                                                                                                                                                                                                                                                           | 3                    | The empirical test of all of it, and the only thing that turns "better" from opinion into a number. No longer blocked on a key — OAuth works                                                                                                                                                                                                                                                                                                 |

### Independent — any time, in any order

| #   | Item                                                                                                                                                                                                                                                                   | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | **`storageState`**, captured once by a person and replayed by the harness                                                                                                                                                                                              | The authenticated half of every app is otherwise permanently dark. An agent never enters credentials, so this is the only route in: `playwright codegen --save-storage`                                                                                                                                                                                                                                                                                                                                                             |
| 8   | **A performance pass** — `performance.getEntriesByType`, roughly fifteen lines                                                                                                                                                                                         | One of the five benchmark categories has no capability at all. Fifteen hand-written lines found ~3x oversized images, 2.2MB of payload and a dead CDN                                                                                                                                                                                                                                                                                                                                                                               |
| 9   | **Multi-provider / multi-model, as a side quest.** A second seam — `askModel(model, prompt)`, single-shot, no tools, no budget loop — reaching OpenRouter (Gemini and the rest) beside the Claude SDK                                                                  | The SDK is Anthropic-only by construction: it recognises `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, Bedrock and Vertex, and nothing else. So this is a **sibling of `runAgent`, never a replacement**. See below                                                                                                                                                                                                                                                                                            |
| 11  | **Register `mcpa-bot` as a subject** at its external path, the way `juice-shop` is                                                                                                                                                                                     | Local Express app, own `.env`, nine `node:test` files and Playwright e2e **with page objects** — so it exercises item 15 with a real example, and its existing tests are ground truth to check an agent's findings against                                                                                                                                                                                                                                                                                                          |
| 24  | **Measured trial: `microsoft/playwright-cli` against Playwright MCP.** Same role, same task, same page; compare cost, turns, and exactly which policy bounds are lost                                                                                                  | Microsoft's own README positions the CLI as the alternative for coding agents — "token-efficient. Does not force page data into LLM" — which matches our measurement that the accessibility tree is the expensive way to look. The price: every bound here is built on MCP tool names, and a CLI runs through `Bash`, where the tool allowlist cannot bind a subcommand and the shell guard reads only the command as written. Split to be proven, not assumed: testing roles keep MCP, `e2e-coder` authors via the CLI. Apache-2.0 |
| 25  | **Review the test skills on skills.sh as benchmarks** — read, never install, and compare against our own. Shortlist below, plus `aihero.dev/skills-grilling`, recommended to the user on 2026-09-14                                                                    | Recreating what already exists well is waste; missing a technique someone else found is worse. Registry audits (Gen Agent Trust Hub, Socket, Snyk) are partial — many entries show Pending — and nothing states they cover prompt injection, the real risk in a skill. Check each licence before taking anything and credit it in `docs/sources.md`                                                                                                                                                                                 |
| 27  | **Move the scriptable heuristics to scripted.** `npm run ideas -- --catalogue` lists each with what it needs. Cheapest first: a console listener in the scan, a literal-string search over rendered text, a command that measures a flake's rate alone and in parallel | Scriptable is a decision to defer, not a decision against. Each one moved removes turns from every session that would otherwise do it by reading, and a gate can only check work that something produces                                                                                                                                                                                                                                                                                                                            |

#### On item 25 — the shortlist

From `skills.sh/?q=test` on 2026-09-13: the first 100 results, ranked by relevance,
publisher and installs. The list is rendered client-side, so it was read in a browser.

- **Web, E2E and browser** — against `pwtest` and `visual-inspection`: `anthropics/skills`
  webapp-testing · `github/awesome-copilot` webapp-testing, playwright-generate-test,
  scoutqa-test · `wshobson/agents` e2e-testing-patterns · `addyosmani/agent-skills`
  browser-testing-with-devtools · `browserbase/skills` ui-test · `affaan-m/ecc`
  e2e-testing · and the skill shipped with `microsoft/playwright-cli` (item 24)
- **Strategy and process** — against `test-design`, `risk-assessment` and
  `exploratory-session`: `anthropics/knowledge-work-plugins` testing-strategy ·
  `obra/superpowers` and `addyosmani/agent-skills` test-driven-development ·
  `riekelt/principal-engineer` testing-changes, writing-unit-tests ·
  `github/awesome-copilot` breakdown-test, polyglot-test-agent · `api/git` vip-test-plan,
  vip-test-executor
- **Techniques** — against `test-techniques`: `trailofbits/skills` property-based-testing
- **Failures and regressions** — against `flaky-test-detection` and triage:
  `forcedotcom/sf-skills` dx-devops-test-failures-analyze · `affaan-m/ecc`
  ai-regression-testing, relevant to the tier-3 evals nothing here has yet
- **Areas `.claude/skills/README.md` lists as deliberately absent** — re-read before that
  line is kept: accessibility — `wshobson/agents` screen-reader-testing; security —
  `usestrix/strix` owasp-top-10-testing, web-app-penetration-testing,
  api-security-testing. Review only: offensive testing is for a local subject such as
  `juice-shop`, never a third-party target
- **Vendor-bound** — ideas only, expect lock-in: `momentic-ai/skills` momentic-test ·
  `alwaysmeticulous/skills` meticulous-test
- **Out of scope** — language- or platform-specific (Go, Rust, Swift, Flutter, Dart, C#,
  Kotlin, Apex, Terraform and others), marketing A/B tests, trading backtests

#### On item 9 — the shape, so it is not rediscovered

Three separate problems, and conflating them is the trap:

1. **Running the roles.** Agentic, tool-using, needs the Claude Agent SDK. Anthropic
   direct, OAuth, Bedrock, Vertex, or a gateway speaking the Anthropic Messages API.
   OAuth covers it today for free. `src/agents/models.ts` is the single place this is
   decided, so a tier could gain a `via:` field without touching a role.

   **Answered on 2026-09-19, for DeepSeek at least: yes.** DeepSeek publishes an
   Anthropic-Messages endpoint at `api.deepseek.com/anthropic`, and the SDK honours
   `ANTHROPIC_BASE_URL` with `ANTHROPIC_AUTH_TOKEN`. So a non-Anthropic worker could
   run through the **existing** runner — worktree, guards, exploration policy,
   post-run gate — on two environment variables rather than an architecture. Read from
   DeepSeek's own documentation and **not tried here**: no key of any kind is set in
   this checkout. Claimed, not direct.

   **Verify before trusting it, in this order.** `budget.ts` enforces `maxUsd` from the
   cost the SDK reports. If a third-party endpoint does not populate that field, the
   spend limit silently stops binding — a bound quietly becoming advice, with nothing
   failing to say so, which is the failure mode this repo exists to catch. Then
   `MODEL_IDS`, which maps tiers to hardcoded Anthropic ids that `budgetForTier` scales
   turns from; pointed at another provider those ids mean nothing. Neither is hard.
   Both are the difference between a bounded worker and one that reports as bounded.

   Why this matters beyond cost: it is the missing piece of real parallel work. The
   worktree per run, the task format (`report: test-design` with `cases` a gate checks
   by id) and the merge discipline all exist already. What is missing is a worker that
   is not Claude — and on 2026-09-19 one task was delegated by hand instead, to a local
   model over copy-paste, which worked and cost exactly what sharing one checkout
   costs: `npm run mutate` could not run at all, and one "green" suite was measured
   against files changing underneath it.

2. **Second opinion and cross-model comparison.** Single-shot, no tools, no loop. Any
   provider. This is where OpenRouter earns its keep — one key, every model. It also
   unlocks the thing `honesty-check` most needs: **a role's output judged by a
   different model than wrote it**, since self-assessment is its weakest link.
3. **The model a subject under test uses** — mcpa-bot's `CHAT_PROVIDER` and
   `OLLAMA_BASE_URL`. Not ours. The `.env` anchoring now enforces that boundary rather
   than trusting it.

### Smaller, unblocked

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | **A triage ledger for test failures**, from Kody: a failure signature maps to `{status, note, who, when}` in `.ai/state/triage.json`, never deleted, and `gate.ts` reads it so a diagnosed flake becomes a documented risk instead of being re-litigated or silently retried away each run. `heal.ts` already carries exactly this for locators; there is no equivalent memory for test failures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 13  | **Split app docs by audience**, from Kody — each `apps/<name>/` gets a human-facing `README.md` (what, prerequisites, done-when) and an agent-facing `AGENTS.md` (how to invoke, smoke tests, edge cases), instead of one README serving both readers badly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 14  | **Event-first triage**, from Kody — trigger `triageFailure` off a failed CI run rather than a schedule. Only matters once triage runs unattended; today it is 100% human-invoked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 15  | **Analyzer blind to Page Objects** — `navigation-only` fires on PO-based tests because the interaction reads `exam.clickNext()`, not `.click(`. The write gates share the blind spot: a page object's `save()` hides the click, so `write-unverified` never sees the write                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 16  | **LICENSE** — a public repo with none is legally unusable. **User's decision**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 17  | CI actions target Node 20; GitHub is migrating to 24. A `@v5` bump clears the annotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 18  | `apps/todo-fixture/coverage.md` — three skills point at `apps/<app>/coverage.md` and only countdown-timer has one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 19  | Fresh-clone verification: `npm ci` → browsers → all suites, proving it works for someone who is not us                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 20  | The crawl writes no artefact, so two crawls cannot be diffed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 21  | Scans overwrite and nothing reads one back — no drift detection between runs. `npm run ideas` now reads one, but only the latest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 22  | Recipes 0 of 9 · agent contracts 7 of 22 · schemas for requirements-analysis and triage-report not ported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 28  | `apps/countdown-timer/scans/timer.json` predates the constraint format, so `npm run ideas` refuses it. Re-scan it — read-only, against an external site                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 29  | The write gates read patterns, not meaning: a helper that wraps `network.waitForCall` under another name is refused as unverified. Widen the recognised checks when a real spec hits it, not before                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 30  | **Measure `npm run ideas` through the driver (E5), once it runs.** Same charter, target and model, with it and without, so weak ideas are not blamed on a weak driver — the user chose this over a coder trial on 2026-09-14. Compare turns, cost and findings scored against the benchmark. Until then "saves turns" is the claim under _Not proven_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 31  | **Commit the evidence and test the command.** The real scans behind the Proven line sit in a session scratch folder that disappears with the session, and the `ideas` CLI has no integration test — only its functions do. Commit a todo-fixture scan under `apps/todo-fixture/scans/`, and test the CLI on it: new format, old format refused, non-scan input exits 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 32  | **Proposal, not decided: a coverage gate from ideas to specs.** For each case `npm run ideas` generates, a spec covers it or its report lists it under `not_covered`. It would turn the generated list into a checked obligation rather than a suggestion — and needs A2, a spec recording which scan it was written against                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 33  | **Audit the harness itself for AI-specific gaps**, after `marvin-template`'s `harden` skill (MIT). Ask visibility, access, deployment and compliance first and set severity from the answers; say what is and is not covered before starting; ask only what the code cannot answer. Then: prompt injection into role prompts, data the model can see, cost controls, whether AI output is checked before anything acts on it, hard-coded model assumptions. Findings as a checkable report, not a letter grade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 34  | **A "what a run can break" table in each `apps/<app>/README.md`** — action, risk, who is affected — after `marvin-template`'s per-integration Danger Zone. The exploration policy binds; the table tells a person what the binding protects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 35  | **"When not to use" in every skill.** Most skills here say when to load them and not when to leave them, which is how a skill fires on the wrong task. Find which lack it; a test beside `roles.test.ts` could require it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 36  | **List and clean up run worktrees.** Nothing removes them — see _Not proven_. A command listing each run worktree with its gate verdict and uncommitted changes, removing only those with nothing uncommitted, never work a person has not brought in; `git worktree prune` for stale entries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 37  | **Add to item 24's comparison:** `marvin-template` prefers a CLI when it is well maintained and its auth simpler, and MCP when no CLI exists or streaming is needed. Neither criterion covers bounds — the allowlist binds MCP tool names, and a CLI through `Bash` binds nothing — which is the one that decides here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 38  | **WebMCP as a driver mechanism — parked, not declined.** A page declares its own tools by shipping client-side JavaScript that calls `document.modelContext.registerTool({ name, description, inputSchema, execute })`, and an agent calls those instead of clicking. **Entirely front-end: no backend component, no MCP server process, no endpoint** — the spec's framing is that such a page _is_ an MCP server whose tools are implemented in page script, running in the tab under the user's existing session. Behind a flag even where it exists: Chromium 146.0.7672.0+ with `#enable-webmcp-testing`. A W3C Community Group draft of 2026-03-09, explicitly off the standards track; the API moved from `navigator.modelContext` to `document.modelContext` in July 2026. **Return condition: item 39 answered first, then a subject that declares tools.** It cannot touch the measured gap on its own — academybugs and every third-party app under `apps/` are ordinary pages, and the ~8-versus-~30 shortfall is on pages that will never declare a tool. Raised by the user on 2026-09-18 |
| 39  | **WebMCP inverts who names the bounds — assess before item 38, never after.** Every bound here is built on tool names this repo controls: `browser-tools.ts` allowlists `browser_click`, and `NEVER` refuses `browser_evaluate` because an allowlist is only a bound if nothing inside it can execute arbitrary code. A page-declared tool is named **by the system under test**, and its model-facing description is the subject's own prose reaching the model directly — the label guard already reads the model's words, and this is a step further out. Same family as items 24 and 37; the injection half belongs in item 33's audit                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 40  | **The other half: a declared tool is an oracle, and this one is actionable now.** A page publishing `addToCart` has made a machine-readable claim about what it does, so "the declared tool says X; does X happen?" is a defect claim with a named oracle — what `oracle-check` exists to establish and most often cannot. It also gives `testability-audit` a new finding class: a declared tool that is unaddressable, absent for a control that has one, or lying. **Nothing is blocked on a third party, which an earlier version of this row got wrong:** WebMCP needs no server, `todo-fixture` is ours, and Playwright can launch Chromium with the flag — so the fixture can register tools where some are honest and some are not (a tool that claims to add an item and does not; an `inputSchema` wider than what is enforced; a control with no declared tool), which is the known-good and known-bad pair the definition of done asks for. Testable without granting an agent a single page-declared tool                                                                                  |
| 43  | **A skill, not a role, for testing AI and MCP apps.** `agent-testing`, teaching Angie Jones' four layers (`docs/sources.md`) and which of them this harness can actually reach. Loadable by the existing coders rather than a new `agentic-coder`, for two reasons. `HANDOFF.md`: "role restrictions limit activity, not knowledge" — a unit-coder asserting turn limits against a mock provider is still a unit-coder. And the four coders here split by test **level**; a role split by **subject type** crosses that axis and would overlap three of them. Blocked on 44 having something for it to teach                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 44  | **Layer 2 first: record and replay an MCP conversation.** A fixture beside `src/fixtures/api.ts` that captures a real MCP server's stdio once and replays it deterministically, so a spec asserts the **tool-call sequence** rather than the model's words. The seed is already written and was written for something else: `tests/integration/observer.int.test.ts` speaks JSON-RPC over stdio to a real Playwright MCP server. This is the layer with the best value per unit of work here, and the one `assert-quality` could then gate — an MCP spec asserting a text blob instead of a call sequence is the same defect class as a UI spec checking a write only by its render                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 45  | **Layer 3 — success rates over runs. Unblocked 2026-09-19 when item 26 landed.** "Regression no longer means the output changed, it means success rates dropped" requires more than one run on disk to compare. `npm run archive-results` now keeps the newest 20, so there is finally something to measure against — though the history is a floor, since nothing runs it automatically                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 46  | **Layer 4 is item 9 wearing a different hat.** LLM-as-judge on a rubric, three runs and a majority vote, needs a second model — which is exactly the `askModel(model, prompt)` seam item 9 already describes, and exactly what `honesty-check` most needs, since self-assessment is its weakest link. Build the seam once and both land                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 47  | **Diagnose the countdown-timer failures properly, with `flaky-test-detection`.** The signature is captured (see _Not proven_): `page.clock` does not hold this app — the display keeps counting in real time while an assertion waits — and `runFor` lands one second short. Two things to establish. First, whether the subject changed under us: its JS is served `last-modified: 2026-09-18`, a day before the rate jumped, and `setInterval` drives the display. Second, why clock control is partial, given the spec installs before `goto` as the README demands. **The `sourceRepo` in `apps/countdown-timer/app.config.ts` 404s**, so upstream history cannot answer the first — find where that repository moved, or record that it is gone. Until then this is the one external subject whose red is expected, which is exactly the state that teaches a team to ignore a red suite                                                                                                                                                                                                           |

## Waiting on the user

Raised, recommended, and not yet answered. Only the user can close these.

- **Should `oracle-check` reach the coding family?** `tests/unit/roles.test.ts` refuses
  it, and `risk-assessment`, on any coding role. Clarified on 2026-09-14: role
  restrictions are about activity — a unit-coder does not go exploring — not about
  knowledge, and every test a coder writes must assert well. An assertion is an oracle
  written down, so a coder choosing an expected value is doing oracle work.
  Recommended: allow `oracle-check` for coders; keep `risk-assessment` with the
  planner, because ranking risk is design and design is the planner's. A guard change,
  so it waits for a yes.
- **A test-reviewer role?** Judging whether a finished test is good enough is reviewer
  work. `assert-quality` and `mutate` are its mechanical floor; nothing covers the
  judgement half — is this the right oracle, does it test the risk it claims. Proposed:
  a testing-family role with no Edit that reads a spec against its scan's
  `npm run ideas` output and the judgement list. Not built.
- **Should `prod` keep granting `allowAuthentication`?** It grants
  `browser_set_storage_state` on production — the one capability there beyond
  observation. Recommended: keep it. It changes browser state, not server state, and
  authenticating is how production is reached at all.
- **Should commit obligations be answered in writing?** Proposed: when handing a commit
  over, the agent answers each obligation `npm run precommit` prints, one line each, so
  the user reviews answers rather than taking "precommit ran" on trust. A
  `work-discipline` rule, no code. Prompted by a skill-catalogue obligation that fired,
  was skipped, and was right.
- **Remove `AGENT_MAX_TURNS=12` from the local `.env`.** Setting it overrides every
  role's declared budget — a run showed test-planner capped at 12 against the 20 it
  asks for. `.env.example` no longer ships it; the live `.env` still sets it, and
  agents do not edit `.env`.

## Considered and declined

Kept because a rejection with no reasons gets re-proposed. Reopen any of these on new
evidence — but bring the evidence, not the idea again.

| Proposal                                                                           | Declined because                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Durable memory as a queryable cross-agent store** (from Kody)                    | `HANDOFF.md` and `CLAUDE.md` already serve this at this size, file-based. A query layer would be overhead, not capability                                                                                                                                                                                                                                                                                 |
| **Packages as publishable / forkable units** (from Kody)                           | App folders here are subjects under test. They are meant to be deleted, not shared outside the repo                                                                                                                                                                                                                                                                                                       |
| **Per-project scoping of test runs**                                               | Measured at a 4% saving on 2026-09-11 after being confidently proposed. Not worth the complexity                                                                                                                                                                                                                                                                                                          |
| **Multi-provider for the agent roles themselves** (see queue item 9)               | The Claude Agent SDK is Anthropic-only by construction. A second provider belongs in a single-shot sibling seam, not in `runAgent`                                                                                                                                                                                                                                                                        |
| **A Context7 MCP server for library documentation** (2026-09-13)                   | The installed package is the authority: `node_modules`, its `.d.ts` and `--help` are the version actually run, and a test already scans the package so a release is caught. It would add an unclassified tool surface, a third-party text channel into agent context, and a network hole in a deliberately hermetic client. Revisit when a role must work against a library that is not installed locally |
| **A maintainer / DevOps role for documentation upkeep**                            | A role has to be invoked, and not being invoked was the failure; only the author of a change knows why its docs must change. The upkeep lives in the `work-discipline` end gate, run before every commit through `npm run precommit`                                                                                                                                                                      |
| **Timestamped results files in place of `results.json`**                           | A run that bypasses the configured reporters writes no file under any name, and readers would have to pick "the newest file" — which is how an old run gets quoted. History is kept as copies beside the fixed file instead: item 26                                                                                                                                                                      |
| **Scripting every heuristic** (2026-09-14)                                         | A script that decides what matters or whether something is wrong produces a confident, tidy false negative. Those stay judgement in `src/qe/heuristics.ts`, each with its reason, and `npm run ideas` prints them as what is still the reader's to do                                                                                                                                                     |
| **An automatic repair pass after a failed post-run gate** (2026-09-14)             | The user chose stop and report: a person reading why the gate failed is cheaper than a second run spent on a finding nobody looked at                                                                                                                                                                                                                                                                     |
| **Letting an agent read its skills on demand**                                     | That was the state before 2026-09-14, and a skill left for the agent to choose to read went unread when it mattered. The runner injects the text instead                                                                                                                                                                                                                                                  |
| **`canUseTool` as the guard path**                                                 | A permission handler, and runs use `bypassPermissions`. One `PreToolUse` hook carries every guard; two paths for one rule would leave neither shown to work                                                                                                                                                                                                                                               |
| **One lock for the whole checkout** (2026-09-14)                                   | Once each run has its own worktree, files no longer collide; what still does is the deployment two runs write to. The lock is per app and environment, so runs against different targets proceed side by side                                                                                                                                                                                             |
| **Tracking an agent's edits by comparing the tree before and after**               | Chosen first, then replaced the same day. A person's edits during the run land in the same comparison, and a tool that restores a timestamp hides its own. A worktree makes the run's changes separable by construction instead of by inference                                                                                                                                                           |
| **A branch per run, or a patch file as the run's output**                          | The user chose uncommitted work in the worktree. A branch is a name to clean up and invites merging by automation; a patch is a copy of what `git -C <worktree> diff` already shows. A person reviews in place and brings the work in                                                                                                                                                                     |
| **Fixed ports for servers the harness starts**                                     | A server a crashed run left behind answers the next run's specs, which then test the wrong process. A free port per run, passed through `portEnv`                                                                                                                                                                                                                                                         |
| **Overriding a failed gate, or retrying it**                                       | A failure is a finding. Its cause is proved — test design, app behaviour against a named oracle, or a flake with a measured rate — before anything runs again. The runner prints the investigator command and a person starts it, because starting it spends                                                                                                                                              |
| **Generating complete spec files from a scan**                                     | A generated spec encodes today's behaviour as the expected result, which is the oracle problem with the judgement removed. Values, sequences and tags are generated; the expected outcome and the decision to write the test stay with the author                                                                                                                                                         |
| **Installing skills automatically** (from `marvin-template`, 2026-09-14)           | It runs `npx skills add … -g -y` on start and installs suggested skills on request. A skill is a stranger's prompt text, and registry audits say nothing about prompt injection. Skills from skills.sh are read and compared, never installed — item 25                                                                                                                                                   |
| **Cloning and running a toolkit at runtime** (from `marvin-template`)              | Its software-engineering skill runs `git clone … && ./setup` mid-session: unreviewed code executed by an agent. Dependencies arrive through `package-lock.json` in a reviewed commit                                                                                                                                                                                                                      |
| **An agent writing real API keys into `.env`** (from `marvin-template`)            | An agent here never reads a `.env` value, let alone writes one. A person creates and enters every key                                                                                                                                                                                                                                                                                                     |
| **Safety as a confirmation the prompt asks for** (from `marvin-template`)          | "Confirm before sending" is a promise the model makes. Bounds here are the tool allowlist and the `PreToolUse` guard, which the model cannot talk its way past                                                                                                                                                                                                                                            |
| **Letter grades computed from finding counts** (from `marvin-template`'s `harden`) | A grade hides the evidence each finding rests on; two claimed findings can outscore one proven blocker. Reports here carry evidence per finding                                                                                                                                                                                                                                                           |

## Keeping this file honest

Lettered like the architecture gaps, because they are the same kind of thing: known
structural weaknesses rather than features.

This file drifted through the whole of 2026-09-13 and was only brought up to date when
the user asked. That is not carelessness; it was one unenforced rule, and every rule in
this repo that survives is mechanically checked. Three causes, three fixes:

| #   | Cause                                                                                         | State                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Nothing checked it.** The end gate was prose in a file that asked nicely                    | **Done, differently than planned.** Not in `gate.ts`: `npm run precommit` refuses a `PLAN.md` whose recorded head is not HEAD, alongside dead commands and paths, undocumented commands, and uncatalogued skills. A blocker at the commit, not a risk |
| D2  | **Updating was expensive**, so it got skipped                                                 | **Done.** `npm run plan:facts` prints the numbers this file quotes from the runs that produced them and refuses any older than the code. Built once the cost bit: a hand-typed count read a stale results file and quoted 414 tests when 420 existed  |
| D3  | **A session has no end.** "End gate" presumed a boundary an interactive session never reaches | **Done.** The `work-discipline` end gate is now "before every commit" and runs `npm run precommit`, whose judgement list is derived from the diff                                                                                                     |

None of this makes anyone diligent — it makes the failure visible, which is the only
version that has worked here before. It still cannot catch a sentence that was true and
quietly stopped being true; that is what reading the judgement list is for.

## Architecture gaps

| #   | Gap                               | State                                                                                                                |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A1  | No accumulation                   | Locator baselines exist (`qe/baselines.ts`); scans and crawls still overwrite                                        |
| A2  | No provenance                     | A spec does not record which scan it was authored against                                                            |
| A3  | Drift detection                   | Half done — the healer reports drift when it resolves; there is no scan-against-scan diff                            |
| A4  | Healing must propose, never apply | **Closed.** Every heal reaches the gate as a risk naming a replacement selector that was verified to resolve         |
| A5  | No performance or security pass   | Two benchmark categories with no capability. Queue item 8, and see `docs/sources.md` for the engines Trowser bundles |

## Subjects

Six registered: `todo-fixture` (local fixture), `countdown-timer`, `juice-shop` (local
plus public demo — the only two-environment subject), `polymer-shop` (real shadow DOM),
`fakerestapi`, `petstore` (a declared OpenAPI spec, so the inferred data dictionary can
be checked against a contract).

Used but not registered: **`academybugs`** (the scored benchmark above), `the-internet`,
`rigassatiksme`, `adayinhistory`. Candidate, not yet registered: **`mcpa-bot`** (queue
item 11) — it is its own repository and nothing from it is copied in.

Parked with reasons in `apps/README.md`: uitestingplayground · saucedemo · qaplayground ·
automationexercise · demoqa · testsheepnz calculator · parabank · parkcalc ·
qa-practice · applitools demo · gh-users-search · realworld · bugeater ·
practice-software-testing.

## Recently closed

| Item                                                         | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5** — E6, the session report unenforced                    | **DONE 2026-09-19** — the rules live in `auditReport` and fire on `report: exploratory-session`, so the `check-report` step every role already ran now enforces them: no new gate step, one place the rules live. A charter is required; every defect claim names an oracle (error here, warning elsewhere, because a session is the one document with no spec to settle it); `severity: observation` is new, since the skill says to keep observations, questions and defects apart and only three of the four had a home. Three mutations                                                                                                                 |
| **23** — `maxStates` enforced by nothing                     | **DONE 2026-09-19** — `src/qe/state-model.ts` counts distinct states off the live DOM and `browserGuard` refuses at the ceiling. A state is the URL plus the _set_ of interactive-control signatures: a set rather than a multiset, so a list growing by a row is the same screen and a modal opening is not. Seen refusing a real action against a running app. Blind spot, stated: two screens with matching controls and differing content fold into one                                                                                                                                                                                                 |
| **26** — only the latest run on disk                         | **DONE 2026-09-19, and the first work here written by another model.** `npm run archive-results` copies the run behind `artifacts/results.json` into `artifacts/runs/<start time>.json`, newest 20 kept. The name comes from the run's own start time, never the clock; pruning ranks by the stamp in the name, never mtime, which a copy does not preserve; an unrecognised file is never deleted. Delegated against a written spec, then reviewed by mutating each rule — four of five caught, and the survivor was real: the negative-count test used `-5` against three runs, where clamped and unclamped slices happen to agree. A `-1` case closed it |
| **41** — `isRunWorktree` refused a worktree it had just made | **DONE 2026-09-19** — an 8.3 short-path mismatch, not space handling: git reports the long Windows path and `path.resolve` does not expand short names, so two strings naming one directory compared unequal. `canonical()` normalises through `realpathSync.native`. Not only a test fix — `--worktree` reuse was broken for anyone reaching the repo through a short name, and it blocked `npm run mutate` entirely. Deliberately not applied to `insideDir`, which guards the file tools past a `node_modules` link                                                                                                                                      |
| **42** — `denyLabels` refused an email _field_               | **DONE 2026-09-19** — found by the driver planning WebDriverUniversity's contact form, not by reading code: seven candidates and "Email Address" silently dropped, because the label contains "email". Label rules now apply only to controls that act, never to a box you type into. Fail-safe where it counts: `browser-guard` passes `tag: 'unknown'` and keeps the full rule                                                                                                                                                                                                                                                                            |
| A role run rested on the agent's word (F1–F7)                | **DONE** — drawn first, then specified in `docs/agent-workflows.md` and built: preflight refuses a run missing its inputs (a coder needs `--design`); declared skills injected as text; one `PreToolUse` hook guards every tool call, `Bash` included; per-role wall clocks; a post-run gate re-checks what the run changed, including `npm run fault-check` on app specs, and stops rather than retrying. Found while building: the browser guard sat on `canUseTool`, which `bypassPermissions` may skip; and a nested Playwright run cleared the outer run's traces. Enforced and tested, not yet exercised live                                         |
| Runs could not be told apart (G1–G5)                         | **DONE** — reviewing `docs/agent-workflows.md` against its own principles found concurrency, attribution and cleanup patched one by one, which meant one broken principle: a run's effects must be separable. A worktree per run, a lock per target, a port per run, the design required at the base commit, one registry resolution feeding the browser, the shell and `TEST_ENV`. Found before commit: removing a worktree deleted the checkout's `node_modules`, and tool paths were relative to the working directory                                                                                                                                   |
| Heuristics with no bridge to action (E4)                     | **DONE** — `src/qe/heuristics.ts` sorts each by what does the work; `npm run ideas` prints the generated cases from a saved scan, with values importable from `src/fixtures/probes.ts` so specs loop rather than retype; `assert-quality` gates a write checked only by its render and a write never read back. The first run on real pages found three flaws the unit fixtures had agreed with — a bodiless beacon offered as a read-back, login probes tagged for shared environments, duplicate cases — each now a test and a mutation                                                                                                                   |
| The gate judged the wrong suite                              | **DONE** — `npm run test:external` wrote the same results file as `npm test`, and the gate then returned PASS over 22 external tests without seeing the local suite. External runs now write `results-external.json`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Plan numbers typed by hand                                   | **DONE** — `npm run plan:facts` reads them from the runs and refuses any older than the code, after a hand-typed count quoted a stale file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Documentation drifted unchecked                              | **DONE** — `npm run precommit`: dead commands and paths, undocumented commands, uncatalogued skills, a stale plan head; obligations derived from the diff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| "Regenerate, never hand-patch" misfired                      | **DONE** — redefined as "kept accurate": re-run every number, update what changed, delete what is no longer true                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A way to see                                                 | **DONE** — Playwright MCP, granted per role and per environment. Proved by a role reporting an occlusion, which no DOM query returns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| The exploration policy bound nothing                         | **DONE** — it compiles to the tool allowlist, the browser's allowed origins, and a fail-closed per-call guard. `actionAllowed` had no caller for months                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| The toolbox was invisible                                    | **DONE** — every role gets it; three of eight had named a single tool each. Every command in it is checked against `package.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Prompt logic nothing could test                              | **DONE** — `session-briefing.ts`, after an inline contradiction cost 4 turns and $0.2613 against 1 turn and $0.1871                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Agent-to-skill pairing                                       | **DONE** — every skill declared by a role through the SDK's `skills` field, prose and field must agree, nothing orphaned, all enforced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Roles conflated two kinds of work                            | **DONE** — a `coding` family and a `testing` family, as data in `roles.ts` rather than a naming convention. Two names that lied were corrected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Design done by whoever wrote the code                        | **DONE** — `test-planner` owns risk and design and holds no Edit; the four coders shed `test-design`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Delegation wired and dead                                    | **DONE** — `role.ts` passes `agents`; the coding family holds the `Agent` tool and is told to call the planner for a named gap. **Never yet exercised**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Model chosen in three places that disagreed                  | **DONE** — `src/agents/models.ts`. Roles no longer pin a model, so a subagent inherits its parent's and a delegated planner cannot end up on another model                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Turn budgets one flat number                                 | **DONE** — per-tier multipliers over what each role declares. `.env.example` no longer ships `AGENT_MAX_TURNS`, which had been cutting every role to 12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Harness read `.env` relative to cwd                          | **DONE** — anchored to the module. A subject's secrets can no longer reach the harness process. mcpa-bot had this right first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `.env.example` claimed a key was required                    | **DONE** — it is optional; OAuth suffices, and that is now measured and dated in the file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Element identity and fuzzy matching                          | **DONE** — one scorer; decisive signals set a floor rather than casting a vote                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Self-healing                                                 | **DONE** — baselines, resolution, drift, verified proposals, every heal gated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Three detector false positives                               | **DONE** — occlusion measured after scrolling, hover given a control group, `alt` added to the name ladder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| One report mixing three audiences                            | **DONE** — the map, the product findings, automation readiness, in that order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ISTQB techniques named but not defined                       | **DONE** — `test-techniques`, with derivation rules and coverage criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| No method for looking at a page                              | **DONE** — `visual-inspection`, written after three defects were missed by looking once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Inventory taken before a page settled                        | **DONE** — settle unconditionally, and the map now declares whether it is a floor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Plans change; facts go stale

Two kinds of content live here and only one is at risk. Judgements — what to build
next, and why — age slowly. Facts — counts, verdicts, what is proven — age the moment a
command runs. Every number above came from a command run at this gate. If the tree has
moved since, re-run them rather than trusting the page.
