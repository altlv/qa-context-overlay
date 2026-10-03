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

Head is `aa801b5` — the commit this file was last checked against. A file cannot name
the commit that contains it, so `npm run precommit` accepts HEAD itself, or HEAD's
parent when the latest commit updated this file.

**A second coder subject exists, and finding it four harness bugs was the point.**
`coursera-rag` is registered: an Express/RAG service whose suite runs under **vitest**,
where every subject before it ran `node --test`. Each check that claims to honour a
subject's declared stack rather than assume one was then asked to prove it, and four
did not: `readiness.ts` hardcoded `src/` in two places, so a subject keeping its code in
`server/` was refused however precisely a task named it; the shell guard read a regular
expression as a hostname; the gate mapped the runner over each changed file and
flattened, so two changed tests became `npx vitest run a npx vitest run b`; and
`subject-fault-check` could not spawn an npm runner on Windows at all. A harness
assumption survives exactly as long as every subject agrees with it.

**The mutation and process-fault steps had still never run against it**, and the cause
was not in the steps. A worktree holds what git tracks, `vitest` is a devDependency, and
this subject declared no `prepare` — so the suite could not start, which both steps
report the same way an honestly red suite is reported. It now declares
`npm install`, and `apps/coursera-rag/mutations/rate-limit.ts` gives it a mutation set:
fourteen rules taken from `server/rate-limit.js` before its test was opened, every anchor
verified to match the source exactly once. Scoring it against the subject's own suite is
the next thing to run, and until that runs there is no baseline and no bar.

One rule that had been written three times and forgotten a fourth now lives in
`src/qe/subject-runner.ts`: a subject's runner needs a shell, because on Windows anything
npm installs is a `.cmd` shim. The gate, the patience wrapper and the fault check each
learned it separately; `mutation-compare` had not, which is why it reported every vitest
subject as unstartable.

The gate also runs the changed tests **as a suite**, not only one file at a time. Tests
that share a port, a fixture directory or a module-level singleton pass alone and collide
together — and together is how the subject's own developer runs them.

**Part of every mutation set is now withheld from the role being measured.** The pre-run
coverage briefing is worth giving — 8 of 14 choosing its own targets against 11 of 14 told
the survivors, with 23 tests instead of 34 — and it also means the gate scores a suite
against the set it was briefed from, which marks a role on the answer we handed it. Five
of fourteen entries in each set are `holdout`: scored like any other, never briefed, never
mentioned. The split is declared in the set rather than drawn per run, interleaved across
the seam's families of rule rather than taken as a block, and filtered before the totals
are computed so the size of the set does not leak through them. A set that is entirely
holdout is refused.

`holdoutPower` exists because a split can be shaped correctly and measure nothing: a
holdout the baseline already kills would never have surfaced as a survivor, so withholding
it changed no run. The role runner prints how many are live before each scored run. **For
both subjects that number is unknown** — neither split has been scored yet, and the 4, 8
and 11 above were all taken against whole sets and do not compare with anything measured
after the split.

**`npm run precommit` was approving the commit it then refused, and had been for four builds.**
CI has failed on `3b8cea1`, `ba8acf3`, `361fadd` and `0c0717a` — every one of them with
`✗ PLAN.md is not current`, and every one green on this machine first. The rule has two fresh
states: the plan names HEAD and is uncommitted, or it names HEAD's parent and the latest commit
updated it. The second branch never asked whether the plan was **dirty**, so a plan edited again
on top of a plan commit matched it: `planChangedInHead` was true, the stamp named HEAD's parent,
and the check passed a tree whose commit would have HEAD as its parent, making the stamp stale by
one the instant it landed.

It fires whenever two consecutive commits touch the plan, which is this file's normal rhythm, so
the hole was open for as long as the rule has existed and the red builds were read as separate
slips. `planChangedInWorkingTree` closes it, with its own refusal message — stale by one is a
different mistake from a plan nobody updated, and the generic message sent the reader to re-verify
a plan that was already current.

**A pre-commit check that passes a tree and fails its commit is worse than no check**: it moves a
one-minute desk failure into CI, where it costs a red build and a second commit. Nothing in the
repository was watching for that shape, which is the same blind spot as the plan understating
itself — both are checks whose errors point the safe-looking way.

**A test that correctly fails because the subject is broken now has somewhere to live.** The gate
makes two opposite outcomes the same colour — a run that wrote a broken test, and a run that found
a real defect — and `mcpa`'s `L6.4` is the proof: 34 tests, 33 passing, and the run was failed for
its best result. With no slot for the finding, the only moves left to a role are the two
non-negotiable 4 forbids. So a stack declares the marker its own runner uses (`it.fails` for
vitest, `{ todo }` for `node:test`), the role is told about it in `subjectConventions`, and
`known-defect-check` is a gate step for **every** subject — including those declaring no idiom,
because that is where a role has no legitimate slot and the most pressure to invent one. A marker
must carry a `KNOWN:` comment naming the defect or the step fails, and the count is reported either
way: a green suite holding three of them is not a green suite. The idiom and the pattern that
counts it are two fields that must agree, so a test asserts they do for every registered subject.

`docs/mutation-evals.md` is the reasoning: seven things that decide whether a score means
anything, and nine other instruments with what each buys that mutations cannot. Two of
those are worth naming here as gaps. **Replaying real fixed bugs from a subject's git
history** is the highest-value thing we do not have — the fault distribution is real
instead of invented, and both coder subjects have the history. **Repeat-run variance for
coders** is the second: the explorer side measures it (best single session reaches 39% of
what five sessions found) and the coder side measures nothing of the kind, so every coder
number is a sample of one.

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
the code. On 2026-09-24 it refused to bless them outright — "Not safe to quote yet: 65
local test(s) failing" — so each carries what was measured and what the command said about
it, rather than reading as evidence it did not stand behind.

- `npm test` **704 passed, 65 failing, 5 skipped** — `plan:facts` reporting unit 646,
  integration 58, todo-fixture 7, harness 63 — and it **refuses to bless this line while it
  stands**, which is the check working. **64 of the 65 are one environmental cause:** there is
  no Playwright browser installed on this machine at all (`ms-playwright` does not exist,
  `PLAYWRIGHT_BROWSERS_PATH` is unset), so every browser-dependent suite fails with
  `browserType.launch: Executable doesn't exist at …chromium_headless_shell-1243…` before it
  reaches the product. The 65th is item 64. `npm run test:unit` holds alone: **646 passed**
- `npm run test:external` **not clean, and not quoted as such** — countdown-timer fails
  intermittently at a rate that jumped on 2026-09-19, idle or busy alike. The 16
  fakerestapi tests passed every run. The failure signature is captured under _Not
  proven_ and the diagnosis is item 47; `npm run plan:facts` refuses to bless this line
  while it stands, which is the check working
- `npm run mutate` **144/144**, one mutation per enforced rule, no survivors. 1515
  seconds on 2026-09-19 — worth recording, because the module header claimed "under a
  minute" until today and that sentence is why a sweep was once fired mid-edit.
  `npm run mutate -- --changed` covered 16/16 in 114s while the rules were being
  written; it prints no percentage and says how many rules it skipped. **Not run on
  2026-09-24, and it cannot be:** its baseline is the unit + integration + harness projects
  and the harness project cannot launch a browser, so it exits 2 rather than score a
  shrunken suite. The six rules added that day were verified instead as 6/6 against the
  unit project by hand, which is the projection that can kill them. **150 declared**
- `npm run gate` **FAIL** — 65 failing tests, the two groups above, written to
  `artifacts/verdict.json`. `npm run assert-quality` **69 files, 11 findings, all
  pre-existing** — three test files carry them, untouched since the branch point, and
  `main` reports 14 over 67. This line said "61 files, 0 findings" until 2026-09-24,
  quoting a state that stopped being true when those tests gained a second assertion
  without a message. Item 64
- **A subject run's prompt is level-aware.** The same subject stack now composes a different
  level block for a unit run and an integration run, asserted in both directions: the
  integration prompt carries "exercise the real entry point rather than importing around it" and
  not the unit boundary, and the unit prompt the reverse. The "there is no browser in this run"
  paragraph is asserted present for an api run and absent for an e2e one, and a role that works
  at no level gets no level definition rather than the unit one. Before this the block was a
  constant written for the unit PoC, so the first integration run would have been told by its own
  prompt that the thing it exists to do is out of scope. Five compose tests, three mutations,
  each caught
- **A named mutation set can be run against a named suite, and a suite can be proved not to have
  weakened.** `npm run mutation-compare -- --mutations <set> --repo <path> --suite <command…>`, with
  `--against <command…>` requiring `survivors(against) ⊆ survivors(suite)`. It is the judge for a
  file `npm run mutate` cannot see: that tool's list and suites are this repository's, and the
  subject's own script runs a fixed list of five files. Fourteen unit tests and five integration
  tests, three mutations each caught. It refuses an empty set, a rotted anchor, a suite that cannot
  be started and a suite that is already red — the last of those refused a fixture of mine that was
  genuinely broken, which is the behaviour working
- `npm run check` clean · `npm run precommit` clean
- **The post-run gate can run its own scripts inside a subject's worktree.** Every
  script-shaped step named a path relative to _this_ repository, and a subject run's
  worktree is a worktree of the _subject_, so `node <tsx> src/cli/check-report.ts` died at
  `ERR_MODULE_NOT_FOUND` before it looked at the agent's work. Reproduced from
  `mcpa-training-bot-runs/c8d7549` on 2026-09-24: every subject run would have been failed
  by the harness's own path, and no subject run has ever reached a gate. The scripts now
  come from the checkout that holds them, while a run in this repository keeps the
  worktree's own copy — a run that changed the checker must be judged by the version it
  changed. Both directions pinned by a unit test and a mutation
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
- ~~**The driver's plan has never reached a live agent.**~~ **Proven 2026-09-20.** Both
  eprimer sessions ran `--scan`, and the wiring executed end to end: scan, `ideasFor`,
  `planActions`, briefing. Each run reported `40 lines, 1 candidate action(s), 0 refused
by policy, 0 tokens spent`. What is **still** unproven is whether the plan changes a
  session, and eprimer was a poor subject for finding out — one candidate action is
  barely a plan, and both models did their real work from controls they found
  themselves. Item 30 still owes the with-and-without comparison, and it needs a subject
  whose scan yields more than one candidate.
- **Nobody knows what the plan costs in tokens, or whether it changes a session.** It is
  prose added to every pre-scanned browsing prompt, and this repo has twice measured a
  briefing change in turns and dollars. The with-and-without comparison is item 30, and
  its "saves turns" remains a claim until that runs.
- **The plan deliberately does not rank, and that may be wrong.** Forty permitted
  candidates in scan order may be worse for a session than ten ranked badly. Ranking was
  left out because `heuristics.ts` files it under judgement and an invented score would
  be a confident number with nothing behind it — but no session has been observed
  drowning in the list either, so this is a decision, not a finding.
- ~~**No exploratory session has ever been run by an agent.**~~ **Proven 2026-09-20 —
  twice.** `exploratory-tester` ran against eprimer/test on sonnet and opus. Both
  produced session notes written as they worked and a report that passes
  `check-report`, both kept defects, questions and observations apart, and **every
  defect in both reports named the oracle that condemns it — 2 of 2 and 5 of 5, with no
  `claimed` evidence anywhere.** Opus found two blockers sonnet did not. What remains
  unproven is the generalisation: this is one role against one small static page, and a
  subject with server state, authentication or multiple screens has still never been
  explored by an agent here.
- **No spec has been written from `npm run ideas`.** Its output has been read by a
  person, not used by an agent. That it saves agent turns is the reason it exists and
  is still a claim — item 30 measures it through the driver, with it and without.
- **Whether a skill is used cannot be observed, and reporting it as "none" was a harness
  fault presented as a finding.** `composeSystemPrompt` inlines the full text of every
  skill a role declares and tells the role not to spend a turn opening it, so "skills
  opened: NONE" was the only answer the metric could ever return. Three runs were reported
  as having ignored their skills on that basis. `src/qe/skill-use.ts` replaces it with
  something that can distinguish: whether the report names a skill's methods. That is
  weaker evidence than a tool call and it is evidence; the original claim was none. Still
  open underneath it: nothing shows a skill changed what a role did, which is the thing the
  2026-09-11 demonstration — `oracle-check` holding the oracle that found nearly every bug
  in a manual session, unread — was about.
- ~~**No agent run has gone through the new runner.**~~ **Proven 2026-09-20**, item 10, and
  every run since. What is still unproven is narrower and was the point of the bullet: no
  live run has yet shown **a preflight refusal**, and the `Bash` guard's refusals have been
  seen only for the hostname pattern it misread. A gate verdict on real output is routine.
- ~~**No agent has worked in a run worktree.**~~ Every run since 2026-09-20 has, and the
  coder runs work in a worktree **of the subject**, which found three separate harness
  faults that a worktree of this repository could not have: `src/cli` scripts absent,
  `node_modules` absent, and the subject's own `prepare` never declared. Still open, and
  unchanged: `Bash` can `cd` out of a worktree — the shell guard refuses git writes,
  secrets and foreign hosts, not paths — and nothing removes finished worktrees, by
  design, so they accumulate beside the repository until a person removes them.
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
- ~~**Delegation has never fired.**~~ **It fired once, on 2026-09-28**: `integration-coder`
  asked `test-planner` whether a branch it had been told to cover was reachable, and it was
  not — the first `Agent` call this repository has recorded, and it was used to refuse an
  instruction rather than to do more work, which is the better of the two things it could
  have been used for. One call is not inheritance proven. The design is a single `query()`
  carrying an `agents` map, one budget and one `PreToolUse` hook; **nothing in that run
  required the subagent to attempt a guarded action**, so whether the SDK applies the hook
  to a subagent's own tool calls is still unexercised — the same class of assumption as
  `canUseTool`, which was replaced precisely because a guard counts as proven only when it
  refuses something live. Raised by the user on 2026-09-24 while asking whether each agent
  needs its own credential; it does not, and the guard half remains unobserved.
- **`maxStates` has now refused a live agent.** The Polymer Shop session on 2026-09-25
  was stopped at the ceiling — "refused browser_click: state ceiling reached (25 for test;
  25 visited)" — and the session recorded the consequence itself, filing "the viewport
  width at which the dialog stops occluding the Size control" as an unknown it could not
  reach because the ceiling ended interaction first. The bound is proven; whether 25 is
  the right number for a shadow-DOM single-page shop is a separate question, now open. What the state model calls a state
  is also a judgement nothing outside its own tests has yet argued with: two screens
  whose interactive controls match and whose content differs fold into one, by design.
  **"By design" was doing too much work there.** Measured on 2026-10-02: a page at rest, the
  same page showing an `aria-live` toast, and the same page showing an error banner give an
  identical state key — same control count, same hash. So the fold is not an edge case
  between two similar screens; it swallows every surface made of text rather than controls,
  which is where error messages, validation, confirmations, empty states and loading states
  all live. The bullet named the limit correctly and its wording made it sound survivable,
  while item 4 went on claiming such surfaces were detected. Items 4 and 80.
- **The state count is a floor whenever a look was missed.** The observer is fail-soft
  on purpose — the action has already happened, so refusing afterwards prevents nothing
  — which means a page caught mid-navigation silently costs a state. The run summary
  says so, and no live run has yet shown how often it happens.
- **The label guard reads the model's own words.** Playwright MCP names a target by an
  opaque `ref` plus a description the model writes, so "Delete account" is refused and
  "the third button" is not. A guard against accident, not against an adversary —
  there is a test asserting exactly that limit.
- ~~**No interactive session has run.**~~ `INTERACT` has been exercised repeatedly — the
  Polymer Shop session was refused a `browser_click` at the state ceiling, which only
  happens to a session that is clicking. The ten `exploratory-tester` sessions interacted
  freely under `test`. What is **still** unexercised is `FILL` against a live page: no
  session has submitted a form, which is also why item 7 (`storageState`) matters — the
  authenticated half of every app is dark, and filling a login box is the one thing an
  agent will never do.
- **Self-healing has never faced a change someone else made.**
- Framework detection is largely unverified; three tiers confirmed against live sites.
- **Three of eight roles have never run**: `api-coder`, `e2e-coder` and
  `failure-investigator`. The five that have are `test-planner` (2026-09-13),
  `testability-reviewer` (2026-09-13), `exploratory-tester` (ten sessions over five
  subjects), `unit-coder` and `integration-coder` (four sessions over two subjects). This
  bullet read "six of eight have never run" for long enough to be quoted, while
  `CLAUDE.md` said five of eight had — the two were never both true. **No role has written
  a browser spec**, which is the part that was always the real gap: every coder run so far
  wrote tests for source it read, and `e2e-coder` is the one that would need the browser,
  the design and the scan together.
- **The unit tier has a skill and a map, and no agent has used either.** `unit-testing` and
  `repo-survey` are declared by their roles, and `npm run candidates` / `npm run survey` are
  enforced by tests — but a person ran them, not a role. What that proves is that the tools
  classify this repo's source and a subject's source as described, including the gaps they
  find. `npm run assertion-floor` is the gate's third piece and is in the same position: it
  graded the hand-written suite and the human baseline, which is how the two conditional-only
  tests were found, but no run has yet been judged by it. What none of this proves is that a
  coder given them writes better tests, which is the claim a run against a subject is meant to
  settle.

## The layer roles, and what judges each

This session's scope: the roles that **create** tests at each layer, and the evaluation that
decides whether what they wrote is worth anything. Those are two capabilities, and they are not at
the same stage — the roles exist, the judgement exists for this repository's own stack, and only
part of it survives the subject being swapped.

| Level       | Role                   | Its level skill                          | What re-checks its output when the subject is not this repository                                          |
| ----------- | ---------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| unit        | `unit-coder`           | `unit-testing`                           | the subject's own runner, then `npm run assertion-floor`. Mutation needs the unit's set and the comparator |
| integration | `integration-coder`    | `integration-testing`                    | the subject's own runner, the floor, and the comparator against a declared mutation set. Item 60 is open   |
| api         | `api-coder`            | none — `pwtest` and `test-techniques`    | `assert-quality`, a Playwright run, `fault-check`. It also refuses to start without a committed `--design` |
| e2e         | `e2e-coder`            | none — as api                            | the same three, over app specs; `--design` and `--app --env` as well                                       |
| exploratory | `exploratory-tester`   | `exploratory-session` and four more      | `check-report`, and it is the role with the most live runs behind it — ten, over five subjects             |
| design      | `test-planner`         | `test-design`, `risk-assessment`         | `check-report` on the design, plus the gate's own "wrote no design" problem                                |
| review      | `testability-reviewer` | `testability-audit`, `visual-inspection` | its report only                                                                                            |

**Two coder roles have now run, and the asymmetry is closing.** `unit-coder` against
`mcpa`, and `integration-coder` against the same subject on 2026-09-27: 132 turns, $14.98, 34
tests written into `test/labs-integration.test.js`, 33 of them passing.

The one failing test is the result worth keeping. **It is right, its boundary is right, and I
mis-stated its mechanism twice before measuring anything.** `L6.4` asserts that stopping a lab
while a large message is still being written leaves the whole Express app dead, and its own comment
records the boundary it found: 65535 bytes survives, 65536 does not.

Reproduced on 2026-10-02 against `node:child_process`, by writing `size` bytes to a child that
never reads stdin and killing it immediately:

| write       | flushed synchronously | result                                          |
| ----------- | --------------------- | ----------------------------------------------- |
| 1025 bytes  | yes                   | no uncaught exception — survives                |
| 65538 bytes | **no**, 65538 queued  | **uncaught exception `EOF`** — the process dies |

So the mechanism is the **draining write**, and nothing to do with liveness. A write larger than
the 64 KiB pipe buffer does not flush; the remainder sits queued; `kill()` destroys the pipe under
it; the resulting stream error has no listener anywhere in the file, so it becomes an uncaught
exception and ends the process that serves quiz, exam and chat. The agent found that from the
route's own `MAX_MESSAGE_BYTES` ceiling being one byte short of the buffer, which is a better piece
of reasoning than either thing I wrote about it.

What I got wrong, recorded because the pattern matters more than the instance. First I wrote the
cause as "writes to a killed child's stdin with no error handler" — true of the file, not the
mechanism, and specific enough to be believed. Then, correcting it, I measured a write to a stream
that was **already destroyed**, found it silently discarded, and was about to record that the
crash does not exist. A reproduction of the wrong scenario is worth less than no reproduction,
because it carries the authority of a measurement.

The near-miss did turn up a second, independent defect, which is real and milder: the send route's
guard is `session.child.exitCode !== null`, and a signal-killed child has `exitCode === null` with
`signalCode` set — so the guard does not fire, and the route answers **HTTP 200 `{ok: true}`** for
a message it did not deliver. `session.alive` is set to `false` correctly by the `exit` handler and
that route never consults it. Two liveness facts on one object; the route reads the one that lies.

And the comparator now exists and is a gate step. Scored against the 14 mutations of
`src/routes/labs.js`: the hand-written `test/labs-routes.test.js` kills **4 of 14**, the file
`integration-coder` wrote kills **8 of 14** — and survives one the hand-written suite catches, the
WWW-Authenticate challenge. Twice as strong, and weaker in one place. That is the PoC's central
claim getting its first integration-level evidence, and it is also the first number here that no
other check could have produced.

Item 60 is now closed. `npm run subject-fault-check` breaks a subject's declared entry point
four ways — refuses to start, throws, dies a moment after starting, exits 0 silently — and requires
the suite to fail each time; it is a gate step wherever a subject names its entry point. Both suites
notice all four, which is the answer hoped for rather than the one that was assumed. The silent exit
is the one worth missing least: a clean exit reads as success, so a suite that waits with a timeout
can pass with no application behind it.

What remains incomplete at this level is the score itself. Six mutations survive both suites — `MAX_LOG_ENTRIES`, the 409 on a pending lab,
OAuth token reattachment, dead-session refusal, port reuse — so 8 of 14 is an improvement and not
a good score.

For an **AI-backed** subject the judgement has four layers rather than one — deterministic
foundations on a mock provider, reproducible reality by record and replay, success rates over runs,
and rubric judgement — and this repository has partial foundations for the first two and none for
the last two. Items 43–46, from `docs/sources.md`.

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

## How the agent sees the app — the discovery layer

**Measured against three live subjects of different architecture on 2026-10-02**, after a first
pass that overstated the problem badly. Both the finding and the overstatement are recorded,
because the overstatement is the more instructive half.

| subject                       | elements           | controls found | text surfaces present |
| ----------------------------- | ------------------ | -------------- | --------------------- |
| eprimer — plain static DOM    | 33                 | 4              | 0                     |
| polymer-shop — web components | 213, 148 in shadow | 16 / 24 / 4    | 1                     |
| academybugs — CMS storefront  | 1120               | 182            | 1                     |

**Control detection is in better shape than it looked, shadow DOM included.** `harvestCandidates`
pierces shadow roots, and on polymer-shop — the subject registered as the hardest element-identity
case available — it returns rich fingerprints (`paper-icon-button`, role `button`, name "Shopping
cart: 0 items"), with 12, 8 and 4 distinct signatures across three pages that the state key tells
apart correctly. On eprimer, nothing plainly interactive was missed at all. A synthetic adversarial
page gave 1 of 11; no real subject behaves like that page, and quoting the synthetic number as the
general case was wrong.

**The confirmed gap is content, not controls.** A `role=status` toast and a `role=alert` banner
both leave the state key **unchanged** — verified with the mapping `observer.ts` actually uses. A
state is `url + set(interactive-control signatures)`, so what the application _says_ is outside
perception entirely: error messages, validation, confirmations, empty states, loading states. Live
regions exist on two of the three real subjects and are part of no state key.

**The unresolved tail is the clickable container.** On academybugs, 182 controls are found and up
to 130 further elements carry `cursor: pointer`, a role or a `tabindex` without being in the list —
but their tags are `div span i main img h5 video br`, so most are wrappers and images inside links
rather than controls. **No static rule can separate a clickable container from a styled wrapper**,
and that is the argument for probe-based discovery rather than a longer selector list: an element
is interactive if acting on it changes a projection, which is measurable and cannot go out of date.

One structural untidiness, found on the way and not yet costing anything: the same twelve selectors
are written out three times — `INTERACTIVE` in `src/tools/heal.ts`, `INTERACTIVE` in
`src/tools/reveal.ts`, and a third copy inline inside the `page.evaluate` in
`src/tools/page-scanner.ts`. Nothing holds the three to each other, so widening one makes the map,
the state count and the hover sweep disagree about what a control is.

### The accessibility tree, as a second source — built 2026-10-02

`src/tools/aria.ts` reads `ariaSnapshot()` and unions it with the selector sweep. Not a
replacement: the sweep produces the healable path, the tree knows a role without being told a
tag. `scanPage` now carries `aria.widgetsMissedBySelectors`, `aria.announcing` and
`aria.unreadable`, and the scan report prints them when there is something to say.

| page                          | sweep | a11y widgets | recovered | what                          |
| ----------------------------- | ----- | ------------ | --------- | ----------------------------- |
| synthetic 11-control fixture  | 1     | 3            | **+2**    | `option`, `combobox`          |
| eprimer — plain static DOM    | 4     | 4            | 0         | the two sources agree exactly |
| polymer-shop — web components | 16    | 16           | **+1**    | the cart link                 |
| academybugs — CMS storefront  | 72    | 81           | **+12**   | the sort `<select>`'s options |

The academybugs recovery is the one that matters: those are the **sort options**, and that
subject is registered precisely because "sorting, discounting, page-size and login-gated pricing
are rules rather than controls". The rule's inputs were invisible to the inventory.

**The role list is still a list** — ARIA's widget roles. The claim is not that a list was
avoided but that it is now a citable standard rather than twelve hand-picked selectors, and that
the roles are computed by the browser instead of inferred from a tag.

**It dents the text blindness without closing it.** An announcement is found only when it
carries a role; `<div aria-live="polite">` renders as a bare text node with no role, so item 4's
text projection is still owed. The first version checked for a `live` state flag in a branch
that **could never fire**, because `ariaSnapshot()` emits none — pinned by a test now, so nobody
reads the tree as having solved content.

Three of my own errors were caught while building it, and the counters that caught two of them
are the reason they are worth keeping:

- **`unparsed` fired on the first live page.** Polymer-shop emits `- 'link "Shopping cart: 0
items"':` — YAML single-quotes a node whose name contains a colon and a space — and the first
  regex required a leading letter, so **both cart nodes were silently dropped**. Without the
  counter the storefront would have been reported as having no cart, and nothing would have
  contradicted it.
- **A check that could not fail**, above.
- **The join inflated the gap six-fold**: 79 reported against a measured 13 on academybugs,
  because `ScannedElement.role` stores the **raw** attribute — null for a plain `<a>` — while
  `defaultRole` derives `link` three lines away. Every ordinary link read as a blind spot. Caught
  only by comparing the new number against the earlier measurement instead of believing it.

Still unreached, in order of value: **iframes — no traversal anywhere**, so a Stripe-style
payment surface is wholly invisible; closed shadow roots; `<summary>`, which the tree calls a
`group`; a focusable `div` with no role, which it calls `text`. And every locator this produces
is `text-dependent` by construction, which the report says on each line it prints.

### Inside the frames — a third source, built 2026-10-02

`src/tools/frames.ts`. Neither of the other two sources crosses an iframe boundary, asserted
rather than assumed: a test pins that the selector sweep sees only the host page and the
accessibility tree reports a frame as a bare leaf, so if a future Playwright starts piercing
frames this module becomes redundant loudly.

It is the most expensive blind spot that was left, because of **what lives in a frame by design
rather than by accident**. A hosted card field from Stripe, Adyen or Braintree is an iframe
precisely so the merchant page cannot read the number — so the payment surface of any storefront
using one was wholly unperceived. The same holds for embedded editors, map widgets, consent
managers and iframe-composed micro-frontends.

Proven end to end on a framed checkout fixture: the card frame's two textboxes, its confirm
button and its `role=alert` "Card declined" message all come back with usable locators —
`frameLocator('#card').getByRole('textbox', { name: "Card number" })` — and a consent frame with
no id falls back to `frameLocator('iframe[src="./consent.html"]')`.

Three distinctions it keeps, each of which is the kind this repository keeps paying for:

- **A frame that could not be read is reported as unread, never as empty.** A hosted payment
  field is both the slowest thing on a page to settle and the least affordable to miss, so a
  timeout reporting zero controls would be the most expensive possible wrong answer.
- **A positional frame locator is labelled as positional.** A frame with no id, name or src gets
  `iframe >> nth=0`, which breaks the moment another frame is added before it, and is handed over
  labelled rather than withheld.
- **Each frame is read under its own timeout and its own try**, so one frame that will not settle
  costs its own reading and not the scan.

**Unexercised live.** None of the three subjects probed on 2026-10-02 — eprimer, polymer-shop,
academybugs — has a child frame at all, so this is proven on a fixture and no registered subject
has yet exercised it. A subject with a hosted payment field would be worth registering for this
reason alone; `juice-shop` is the nearest candidate already on the list.

### demoqa, registered at `test` — the frame source's first live subject

Registered 2026-10-02 for the reason it had been **parked** for. `apps/README.md` held it under
"demoqa browser-windows … the `unscanned-frame` finding, and whether the scan should follow a
frame rather than only declare it". The scan now follows one, and no registered subject had a
frame to follow — every subject probed had none, which is why the frame source was recorded as
fixture-proven only.

**Live recovery, `/select-menu`: 16 controls** the browser reports and the selector sweep did not
find — every `option` of the native selects, plus a `listbox`. The first live confirmation that
the accessibility source earns its place on a real page rather than an adversarial fixture. It
also surfaced the site's own typo, `getByRole('option', { name: "Voilet" })`, which nothing in
the harness could see the day before.

`/nestedframes` exercises the case `page.frames()` flattens: a frame inside a frame, read as two
documents, the inner one addressable only by position and labelled as such. Both hold text rather
than controls, so the control count is zero and correctly so — and the site's third-party ad
frames are read and reported like any other, because filtering them would need a list of
plausible ad hosts, which is the shape this whole layer has been correcting.

**A contradiction this introduced, and fixed.** The scan had always said of a frame "This scan
does not cross into frames, so anything inside it is unexamined", and that became false the
moment `readFrames` was wired in — the report declared the content unexamined on the same page
that listed what was in it. Narrowed to what is still true: the _inventory_ stops at the frame,
no selector is harvested inside it, and nothing is interacted with. **A blind spot claimed after
it has been closed is the mirror of one claimed closed before it was**; both make a report
untrustworthy, and this half was mine.

### Three reliability fixes — 2026-10-03

Chosen over four other candidates because each closes something **currently false** rather than
merely absent, and each is independently verifiable.

**1. The comparator refuses an unstable suite.** It already refused a red baseline and an
unstartable one, both because they score every mutation as caught. A suite that passes
_sometimes_ was accepted, and it is the worst of the three: a flaky test kills a mutation by
chance, so the score is noise with a mean while every number still prints with a straight face.
The release gate reports flakes it sees in a run — "a test that needs a retry is not yet
evidence" — and **nothing on the mutation path read that at all**, which is where it does the
most damage, because every value claim here comes through there. One extra run of the suite in
total, not one per mutation. Stated in the code and worth repeating: two green runs do not
certify a stable suite — a test that flakes one time in twenty passes both. This catches an
unstable suite cheaply; measuring a flake _rate_ is still nothing anybody does.

**2. The state signature normalises the volatile part of a name.** `"Shopping cart: 0 items"` →
`"1 items"` used to forge a state, and `maxStates` had already refused a live session on
polymer-shop at its ceiling of 25 — so a counter could spend the whole allowance on one screen
and the session would stop for a reason nobody could see.

Measured both directions, because dropping the name outright was the obvious fix and is worse —
too few states hides screens, where too many merely exhausts a budget:

|                                  | before   | after        |
| -------------------------------- | -------- | ------------ |
| cart 0 → 1 → 2 forges a state    | yes      | **no**       |
| polymer-shop signatures per page | 12, 8, 4 | **12, 8, 4** |
| its three pages still distinct   | yes      | **yes**      |

Digits go and nothing else, so discrimination is unchanged. **The locale case is not fixed** and
is not pretended to be: translating a label still produces a new state, which is arguable either
way since the screen genuinely changed.

**3. `tests/unit/instrument-liveness.test.ts` — can each instrument produce the opposite
answer?** Every other test asks whether a measurement is right; these ask whether the thing
measuring can disagree with itself at all. An instrument that can only return one verdict
returns it confidently and nothing downstream can tell it from a finding.

Written because **five** mistakes of exactly that shape happened in one session, and only one
was caught by a mechanism rather than by going back to re-check: the `Candidate` wrapper that
collapses every signature to four pipes; a light-DOM query standing in for the shadow-piercing
sweep; a substring match standing in for a selector match; a write to a destroyed stream
standing in for a draining one; and a `sed` range that could not contain what it was used to
prove absent. It is `gate-poison.ts`'s idea — prove each step can fail — generalised from the
gate to the measurements the gate rests on.

**It caught a weakness in itself on the first poisoning.** `controlSignature` was broken to
return `||||`, the exact historical bug, and one of the two state-key tests still **passed** —
because it compared two different URLs and `stateKey` begins with the URL. A liveness test that
cannot fail for its own case is precisely what the file exists to prevent. Rewritten to compare
two screens at **one** URL, which is also the real case: a modal opening, a menu expanding. Both
tests now fail under the poison and all twelve pass without it.

Not done, and the reasons they were ranked lower: a flake **rate** across runs needs the archive
to fill first (2 runs on disk, 20 kept); the spend cap is still a trailing stop with a measured
35% overshoot; and `Transition` still computes `from`/`to` and discards them, so there is still
no graph and **no coverage claim about an app is defensible**.

### What is structurally missing

- **Content is not perceived at all.** The one confirmed blindness, above.
- **One moment.** The scan is taken once, on a page nobody has touched. Nothing is observed
  arriving, changing or leaving.
- **Still no iframe interaction** — the frames are read, and nothing acts inside one yet.
- **No geometry.** Occlusion, stacking, overflow and off-screen are invisible — and the single best
  finding `testability-reviewer` ever produced was an occlusion, a consent banner over a product
  image, which is a spatial fact no DOM query returns.
- **No diff.** Nothing turns two observations into "what arrived, what left, what changed", which
  is the unit behaviour is visible in, and which E5c needs anyway.

### The mechanics it wants

1. **Observation as several cheap projections of one page**: controls (which work), visible text
   blocks, geometry and stacking, focus and whether it is trapped, liveness, network, console.
2. **The transition as the unit of perception** — this action, these projections changed.
3. **Interactivity confirmed by probe for the tail only.** The selector list is adequate for the
   bulk; probing is for the `cursor: pointer` residue nothing static can resolve.
4. **Categories derived, with their evidence attached** — item 80.
5. **Mandatory admission of the unclassified**, louder than any label. The `unknown truths` rule
   applied to the instrument instead of the agent.

The scan already ends with a statement of what it could not see, and names frames and shadow hosts
rather than skipping them silently; `tests/harness/perception.ui.spec.ts` now pins that so a
refactor cannot drop it. It is point 5 in miniature and the only part of perception that fails
honestly today.

### A standing hazard, recorded because it is now a pattern

Four times in this session I measured something **adjacent** to the thing I was claiming, and
reported the result as the thing: a write to an already-destroyed stream instead of a draining one
(nearly declaring a real crash nonexistent); a substring match against a JSON blob instead of a
selector match; a light-DOM-only query instead of the shadow-piercing one the harness uses
(reporting that polymer-shop was invisible to it); and the `Candidate` wrapper passed where a
`Fingerprint` was wanted, which collapses every signature to four pipes and makes any two state
keys equal (producing a retracted finding that polymer-shop states were told apart by URL alone).

**A reproduction of the wrong scenario is worth less than no reproduction, because it carries the
authority of a measurement.** The wrapper-for-fingerprint error is the same one `PLAN.md` already
records against the coverage briefing, where a module namespace was passed where an array was
wanted and ten survivors read as a clean bill. The guard that would have caught all four: before
believing a measurement, check that the instrument can produce the _opposite_ result — a state key
that can never differ, a selector set that can never match, a write that can never fail.

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

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Blocked by           | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10  | **DONE 2026-09-20 — the first live runs through the new runner, and what injected skills cost.** Two sessions of `exploratory-tester` against eprimer/test at `4b0d190`, same charter, sonnet then opus. Shown: a refused `Bash` call (opus independently reached for `fonts.googleapis.com` and the per-call guard refused it by name), a worktree created and gated in both runs, a gate verdict in both, and the injected context measured at 60,660 chars ≈ 16.4k tokens across 8 skills. Sonnet completed unstopped at $2.18 over 69 turns; opus was cut off by spend at $5.38 over 70 turns | —                    | Cost $7.57, not the $0.20 estimated — that estimate assumed the 30-turn budget, which is the first thing these runs falsified. Write-up in `artifacts/compare/comparison.md`. Four harness defects exposed: `isAuthFailure` blind to a signed-out CLI (fixed), `maxTurns: 30` starving the role (fixed), the gate validating `--out` rather than the report the role actually writes (item 48), and the spend cap overshooting by 35% because it is checked after a turn completes (item 49)                                                                                                                                                                                                                                                                                                                                                     |
| 3   | **E5 — the driver.** **E5a and E5b done** (2026-09-19). E5a: `src/qe/driver.ts` joins `ideasFor` to the policy, so a `--scan` run hands a session its candidate actions with every refusal named. E5b: one browser, two clients — the run launches Chromium with a debugging port, gives Playwright MCP the endpoint, and reads the live DOM over its own connection after any call that can move the page, which is what closes item 23. **E5c — choosing the next action from the diff — is open**                                                                                              | 10 for the live half | The driver narrows and still does not choose, and that boundary was deliberate: `heuristics.ts` files which case deserves the budget under judgement. E5c is where that is revisited, and the diff is now available to revisit it with — `appeared`, `disappeared` and `changed` per action. Everything here refuses in unit tests and nothing has refused a live agent, which is item 10                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4   | **The map is a single state, and its notion of "state" cannot see a message to the user.** Measured 2026-10-02 against the mapping `observer.ts` uses: a page at rest, the same page showing an `aria-live` toast, and the same page showing a `role=alert` banner give an **identical state key**. A state is `url + set(interactive-control signatures)`, so what the application says is outside perception entirely — error messages, validation, confirmations, empty states, loading states. Pinned in `tests/harness/perception.ui.spec.ts`                                                | 80                   | **The previous wording of this item was wrong twice over.** It claimed E5b meant "a surface that opens is now _detected_", which is false for a toast; and it framed the job as a list of plausible surfaces — mini-cart, dropdown, modal, toast, drawer — which is the same assumption-until-contradicted shape as a hardcoded `src/` or `node --test`. But the first correction overcorrected: a synthetic adversarial page gave "1 of 11 controls visible", and against three live subjects **control detection is in good shape, shadow DOM included** — `harvestCandidates` returns rich fingerprints on polymer-shop and missed nothing plainly interactive on eprimer. So this item is now only about **content**, which is the part that is genuinely invisible. Do not widen `INTERACTIVE` for it; a selector list cannot perceive text |
| 77  | **`failure-investigator` still has no first run, and this is no longer the failure for it.** The `mcpa` crash `L6.4` asserts is **real and now proven** — a write past the 64 KiB pipe buffer stays queued, `kill()` destroys the pipe under it, and the stream error has no listener, so the process serving quiz, exam and chat dies. Reproduced directly on 2026-10-02, which means the role was not the thing that proved it                                                                                                                                                                  | —                    | The role's value is proving a cause nobody has. This cause is settled, so giving it to the role would only have it confirm a conclusion already in the file — the same contamination the mutation holdout exists to stop. Point it at a failure that is genuinely unexplained: `sessions/` holds several red gate steps, and the countdown-timer flake (item 47) is the strongest candidate, because its signature is captured and its cause is still open. Separately, both `mcpa` defects now need writing up through `bug-report`: the crash, and the 200 `{ok: true}` for a message a signal-killed session never received                                                                                                                                                                                                                   |
| 6   | **E7 — a real agent session against the scored benchmark**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 3                    | The empirical test of all of it, and the only thing that turns "better" from opinion into a number. No longer blocked on a key — OAuth works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Independent — any time, in any order

| #   | Item                                                                                                                                                                                                                                                                   | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | **`storageState`**, captured once by a person and replayed by the harness                                                                                                                                                                                              | The authenticated half of every app is otherwise permanently dark. An agent never enters credentials, so this is the only route in: `playwright codegen --save-storage`                                                                                                                                                                                                                                                                                                                                                             |
| 8   | **A performance pass** — `performance.getEntriesByType`, roughly fifteen lines                                                                                                                                                                                         | One of the five benchmark categories has no capability at all. Fifteen hand-written lines found ~3x oversized images, 2.2MB of payload and a dead CDN                                                                                                                                                                                                                                                                                                                                                                               |
| 9   | **Multi-provider / multi-model, as a side quest.** A second seam — `askModel(model, prompt)`, single-shot, no tools, no budget loop — reaching OpenRouter (Gemini and the rest) beside the Claude SDK                                                                  | The SDK is Anthropic-only by construction: it recognises `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, Bedrock and Vertex, and nothing else. So this is a **sibling of `runAgent`, never a replacement**. See below                                                                                                                                                                                                                                                                                            |
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
| 48  | **The post-run gate validates the wrong file.** `src/cli/role.ts` writes `result.text` — the agent's final chat message — to `--out`, then points the gate at it. On 2026-09-20 sonnet correctly wrote its report to `reports/` and signed off with a summary, so the gate validated the summary and failed it for missing frontmatter while the real 15 KB report passed `check-report` cleanly. Opus happened to emit its whole report as its last message and passed the identical gate. Compounding it, `/reports/` is gitignored, so `worktreeChanges` never sees the run's deliverable at all — sonnet's gate listed five screenshots and no report. Find the report the role wrote, or make the contract explicit and enforce it. **A gate whose verdict depends on a stylistic choice the role never made deliberately is not a gate.** Both runs are evidence and their worktrees are kept                                                                                                                                                                                                     |
| 49  | **The spend cap is a trailing stop, not a ceiling.** Opus spent $5.3834 against `AGENT_MAX_USD=4` on 2026-09-20 — 35% over — because `budget.exceeded()` is consulted after a turn completes, so one expensive turn carries the run past its limit. Either check a forecast before the turn, or stop calling it a limit in the output. It matters most where it is least affordable: the overshoot scales with per-turn cost, so the pricier the tier the further it overruns, and nothing in the run output says the number is approximate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 50  | **The `coverage` declaration — generalise what made the pre-flight fix work.** A fixed list of testing dimensions in every session report, each answered `ran`, `gap`, or `not applicable, because…`. **Not a mandate to test them — a mandate to account for them.** This is the mechanism, and it is the prerequisite for items 51-56: each new skill plugs in as a dimension rather than as another paragraph of prose nobody checks. Proven twice now: `preflight` and `lenses` moved seeded-bug recall 2.7-3.8× with the models unchanged, and sonnet's "contrast: not measured … declared as a gap" passed the gate, which is exactly right. Context to fall back on, never a ceiling — three findings across the eprimer runs **disagreed with the seeded key** and were right to                                                                                                                                                                                                                                                                                                                |
| 51  | **`rule-modelling` skill — the largest single gap, 16 seeded bugs of which 6 high-impact.** `test-techniques` generates from DOM shapes: field types, constraints, toggles, groups. A product that implements a **domain rule** has its defects in the rule, not in the markup, and no scan can see one. Recover the rule from docs, source or behaviour; write it as a table; enumerate its classes; test classes rather than examples. **Carries the oracle rule that nothing else states: a rule recovered from source describes the implementation, so it may generate inputs and can never be the oracle.** That single sentence would have prevented sonnet's CJK false pass, where it read the tokenizer, adopted whitespace-splitting as its oracle, and certified a seeded bug as correct behaviour                                                                                                                                                                                                                                                                                            |
| 52  | **`web-platform-checks` and `content-review` — about 15 seeded bugs for almost no browser actions.** Platform: document head, charset, viewport, favicon, HTML/CSS validation, security.txt, privacy, and page weight **from the network capture the role already tells sessions to watch and no session has ever opened**. Content: read every string and ask whether it is accurate, consistent in its terminology, and complete — labels rendering with no value, instructions that do not instruct. The best ratio in the whole table and the cheapest to write                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 53  | **`accessibility-audit` skill — 5 seeded bugs, and the only dimension here with consequences outside this exercise.** `visual-inspection` carries one contrast line. Needed: contrast **measured** rather than eyeballed, focus management, `aria-live` on dynamic result regions, reflow at 320px, and decorative-versus-meaningful `alt`. Evidence it is missing: opus computed WCAG ratios and found the two elements carrying the product's entire meaning at 1.01:1 and 2.18:1 — citing WCAG 1.4.10 from its own knowledge, because the harness gave it none — while sonnet eyeballed the same page and recorded nothing borderline                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 54  | **`internationalisation` skill — 3 seeded bugs and one false pass, which is worse.** Non-Latin scripts, languages that do not use whitespace between words, NFC/NFD normalisation, bidi, locale-aware counting, and encoding declaration. The false pass is the reason this ranks above its bug count: Japanese has no inter-word spaces, so an app counting whitespace tokens and a session counting whitespace tokens agree perfectly while both are wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 55  | **The structural skills nothing covers: `test-strategy`, `state-modelling`, `performance-check`, `test-data-design`, `session-report`.** Strategy sits above `test-design` — scope of a whole effort, allocation across levels, entry and exit criteria; the capture-the-bugs repo ships `testStrategy.js`, `requirements.js` and `userStories.js` and we have no equivalent. State covers sequence, recovery, idempotence, back/forward and double-submit, which lives partly inside `test-techniques` and fired in none of four runs. `session-report` covers reporting a whole effort to someone deciding something, where `bug-report` covers one defect well. **Also fix a dangling pointer:** `test-design` says it is "not for checking whether requirements are ready (`requirements-sufficiency`)" and no such skill exists                                                                                                                                                                                                                                                                    |
| 56  | **A scorer for targets that ship an answer key.** `capture-the-bugs` gives each seeded bug a `matchText` field written for semantic matching against free-text reports. Until this exists every recall figure in `docs/model-comparison-eprimer.md` is one person's judgement, and that judgement has already been wrong in both directions — it under-credited techniques as "not wired" when the pipeline had in fact delivered the `O'Brien` probe straight into a finding, and it counted #32, #41 and #73 as misses where the sessions had measured the key to be wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 57  | **Run the next model comparison against a DIFFERENT target.** Four runs against eprimer risk tuning the harness to one static, single-page, client-side text tool: no server state, no authentication, no navigation, one state for the whole session. **The principles are the deliverable, not eprimer's bug list.** Pick a subject with at least server state and more than one screen, keep the charter and settings identical, and treat any guidance that only helps on eprimer as overfitting to be deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                           | Blocked by | Why                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 58  | **`npm run mutate -- --changed` reports success when it checked nothing.** The mutations are a hand-registered list per file, so a new file scopes to zero of them: it printed "Nothing to check here" and exited 0                                                                                                                                                                                                                            | —          | A verification that cannot fail reports as _checked_ — the mutation-that-cannot-fail trap one level up, and the reason a capability can land with no mutation coverage at all. Either make zero-coverage a non-zero outcome, or generate candidate mutations from what `npm run candidates` and `npm run survey` already know about a file. Caught on 2026-09-24: four new source files, no mutation, green gate                           |
| 59  | **DONE 2026-09-24 — built and wired (C6).** `src/quality/assertion-floor.ts` reads whichever stack a subject declares; `npm run assertion-floor` is the command and the post-run gate runs it on a subject's changed test files. Originally: a subject's unit tests have no assertion floor. `npm run assert-quality` reads TypeScript specs, so a `node:test` file can wrap every assertion in a conditional and pass having asserted nothing | —          | The floor is stack-shaped, and the first subject we do not own already exercises the hole: two tests in its own suite assert inside a conditional, one asserts only that its result is shorter than its input. What the floor cannot see has to be stated in its own output, not implied. Detail in `.ai/state/POC-UNIT-CODER.md` §10                                                                                                      |
| 60  | **Nothing proves a subject test notices its process failing** (C5's remainder). `fault-check` covers app specs and their server; a spawned process, a file that was not written, or a swallowed exit code has no equivalent                                                                                                                                                                                                                    | —          | The gate now runs a subject's changed test files with the subject's runner, so the hook is in place and only the check is missing. Without it a green subject test says nothing about whether it would notice a fault — the same gap the mutation work covers at unit level                                                                                                                                                                |
| 61  | **A change to a test file can make the suite weaker and nothing notices.** The four grounds for removing a test, a `removed` block in the report envelope, and a strength step requiring `survivors(after)` to be a subset of `survivors(before)`                                                                                                                                                                                              | 58         | Specced 2026-09-24 in `.ai/state/POC-UNIT-CODER.md` §9. The coder roles have to be able to create, improve _and_ remove, and only creation is covered; `GUARDRAILS` forbids deleting an assertion to make a test pass, so removal and concealment are the same keystrokes and only evidence separates them. The gate is the only component holding the pre-change revision. Blocked by 58 because the strength delta consumes a comparator |
| 62  | **DONE 2026-09-24 — both are driven at integration level, and the first run found a defect.** Originally: two new CLIs have no integration test. `src/cli/candidates.ts` and `src/cli/survey.ts` were added on `poc/unit-coder-mcpa` and no test points at either; `tests/integration/cli.int.test.ts` covers every other CLI here                                                                                                             | —          | The repo convention is that CLI behaviour is tested at integration level, and a new command that nothing exercises is a command whose flags rot silently — the same failure the toolbox test exists to catch for prompts                                                                                                                                                                                                                   |
| 63  | **`src/qe/source-mtime.ts` has no test.** Found by `npm run survey -- src --tests tests`, which reports it as imported by two files and named by no test                                                                                                                                                                                                                                                                                       | —          | A real pre-existing coverage gap in this repository's own suite, found by the source map on its first run against the harness rather than by reading. It is the map demonstrating it can find a gap nobody was looking for                                                                                                                                                                                                                 |

| 64 | **DONE — `npm run assert-quality` reports 0 findings over 85 spec files, on `main`, and `tests/integration/cli.int.test.ts` passes with it.** Originally: the gate was red here and on `main` — 11 findings and 14 — so the test requiring a clean run failed and `npm test` with it. Every one was drift of the same kind, a test that gained a second assertion without an explanatory message, and each was fixed by giving an assertion a message rather than by relaxing the rule. The lasting lesson is the one in this file's header: `PLAN.md` quoted the clean number until 2026-09-24, long after it stopped being true | — | Closed 2026-10-02 |

| 65 | **DONE 2026-09-25 — `.claude/skills/integration-testing/SKILL.md` written, wired and committed in `f85b40b`:** the role declares it, its prose names it, the catalogue and routing carry it, and two mutations are caught. Its spine is component versus app integration, and it states where a non-deterministic dependency must be fixed rather than trusted. Originally: an `integration-testing` skill, and `integration-coder` declaring it — the C1 analogue for the second level. The role loads `test-techniques` (technique) and `repo-survey` (the map) and nothing that says where an integration test's boundary is, what it must assert about a process, or what it must refuse | — | The PoC method is follow the skill, judge the tests it produced, then adjust the skill, so a level with no skill has nothing to grade and nothing to correct. Needs a brief in the shape of `.ai/state/POC-UNIT-CODER-DEEPSEEK.md`. Until the file exists the role must not declare it: `tests/unit/roles.test.ts` refuses a declared skill with no file behind it. **Brief written 2026-09-24: `.ai/state/POC-INTEGRATION-CODER-DEEPSEEK.md`** — its spine is the two kinds this subject actually has: component integration (a few real modules wired together, the outside edge doubled) and app integration (the whole app through a real entry point — a spawned process, an HTTP surface, a protocol on stdio) |
| 66 | **DONE — `integration-coder` has run three times against `mcpa`** (2026-09-27, 09-28, 09-29), aimed at the seam rather than the unit, judged against the subject's own suite and its 14 mutations. Measured: hand-written 4 of 14, the agent unaided 8, the agent fed the survivors 11 with 23 tests instead of 34. It also found a real crash its subject's 11-of-11 suite never covered, chose the uncovered `models` seam from seven candidates unaided, and refused one instruction as unreachable after delegating the question to the planner — the first `Agent` call this repository recorded | 60, 65 | Closed 2026-10-02. What it exposed is in items 72, 73 and 77 |

| 67 | **Say what enforces each skill, not only that it exists** — the trust-tier idea from `agentic-qe` (`docs/sources.md`), applied to `.claude/skills/`: for every skill, what fails when one of its rules is broken | — | Their Tier 3 means the skill has a full evaluation suite and Tier 0 means guidance only. Ours sit between: `tests/unit/roles.test.ts` proves a skill is declared and reachable and `npm run precommit` proves it is catalogued, and neither says whether any of its rules is checked. A reader cannot tell an enforced skill from prose wearing the same clothes, and this repo's own rule is that advice with no gate gets skipped — so the honest version is a table naming, per skill, what checks it and what does not. Related: item 35, a "when not to use" line in every skill |

| 68 | **The `api-testing` level skill, and `api-coder` declaring it** — the third level's gap. `pwtest` is a Playwright generation workflow and `test-techniques` produces values; neither says what an API test must assert: the contract as the oracle rather than the response, what to check beyond the status code, the error and auth shapes, idempotence, and the read-back rule this repository has a live counter-example for | — | The same commission as the other two levels — a brief in the shape of `.ai/state/POC-INTEGRATION-CODER-DEEPSEEK.md`, then the skill, then the role's array and prose held together by `tests/unit/roles.test.ts`, then the mutations. Note `api-coder` refuses to start without a committed `--design`, so its run is two roles deep: planner first |
| 69 | **Make `e2e-coder` portable — and probably give it no new level skill.** Its prompt names this repository's paths, fixtures and runner, none of which `forSubject` replaces, and its level's shape is largely `pwtest` plus the healing and baseline machinery | — | Judged 2026-09-24: a level skill here would restate `pwtest`, and this repository's own rule is not to duplicate a skill that covers the ground. So the work is the C9 treatment for `e2e-coder`, the level block it composes, and the subject's Playwright suite with page objects as the comparison. It is also the one level whose verification needs a browser, which this machine does not have installed (see _Waiting on the user_) |
| 70 | **The AI-coder for AI-specific tests — and the decision it needs first.** Item 43 records that this should be a _skill_ (`agent-testing`) rather than a role, because the four coders split by level and a role split by subject type crosses that axis | 43's decision, to be put to the user | Raised by the user on 2026-09-24 as "the AI-coder". What it covers is the four layers in `docs/sources.md`: deterministic foundations on a mock provider, record and replay, success rates over repeated runs, and rubric judgement — of which this repository has partial foundations for the first two and none for the last two, parked as items 43–46. `mcpa`'s chat seam is the natural first subject: it reaches six OpenAI-compatible providers and falls back to lexical search, so layer 1 is reachable with no new infrastructure, and `test/chatService.test.js` is the human baseline |

| 71 | **DONE 2026-09-25 — `describeBudget` and `describeSpend` in `src/agents/budget-line.ts`, printed by `role.ts`, eight unit tests, two mutations each killed by them.** Originally: the runner must admit when an operator overrode a limit, and must not report a killed run as free. `AGENT_TIMEOUT_MS=180000` in the ambient environment silently replaced `unit-coder`'s declared 600s, and the banner still read as if the role's own budget were in use; after a wall-clock abort the summary reads `0 turns, $0.0000`, because no result message ever arrived | — | Measured 2026-09-25: the first live run produced nothing in three minutes and nothing in its output said an environment variable had done it. `AGENT_MAX_TURNS` already gets an annotation; `AGENT_TIMEOUT_MS` and `AGENT_MAX_USD` do not. The second half is worse than cosmetic — a report implying a five-minute session cost nothing is believed |
| 72 | **"The human baseline is never edited" has no mechanism.** The unit run added 120 lines to the subject's own `test/searchIndex.test.js` rather than writing a new file | — | The file guard confines writes to the worktree, and inside the worktree the baseline is just another file. The gate is the component holding the pre-change revision, so the check belongs there: a problem when the diff modifies a pre-existing test file, unless the run is an improve/remove run declaring §9's grounds. Until then the comparison is the agent's edits against the unmodified baseline — an honest 12 → 14 of 20, but not the two-file comparison E1 describes |
| 73 | **The assertion floor attributes inherited holes to the run.** Its two findings on the unit run are the human file's own `conditional-only` tests, pushed down 120 lines by the agent's insertions | — | The gate holds the base revision, so it can say which holes a run inherited and which it wrote — and that distinction is what makes §9's strength delta usable rather than noise. A run that fixes an inherited hole should be credited for it, which is the "improve" capability the floor currently cannot see. The rollout for the remaining roles — what each inherits, the tools they still need, and the schedule — is `.ai/state/POC-CODER-ROLLOUT.md`, named to the exempt pattern on purpose: a plan names paths that do not exist yet, and `npm run precommit` checks every tracked `.md` except `PLAN.md` and `POC-*.md`. That exemption is also why the first version passed at commit time and failed the moment it became tracked — the check reads tracked files only, so it cannot see the document a commit is about to add |

| 80 | **Category discovery, as a capability.** The scanner and the state model both work by matching a page against names someone wrote down — twelve selectors in `INTERACTIVE`, five surface names in item 4. What is needed instead is deriving what kind of thing is present from **how it behaves**, with the category as output rather than input. Several cheap projections of the same page, none of them a taxonomy: the set of visible text blocks (catches a toast, a banner, an empty state, a validation message — all invisible today); geometry and stacking, which is what occludes what and the one spatial fact no DOM query returns; where focus went and whether it is trapped; whether a surface vanished unprompted or persists; and `aria-live`, `role=status`, `role=alert`. A modal is then _overlays, traps focus, persists_ and a toast is _does not overlay, vanishes unprompted, announced_ — labels with their evidence attached, not matched names | — | **The constraint that makes this discovery rather than a longer list: it must be able to say "something arrived and I cannot classify it", and that output must be louder than a confident wrong label.** This is the `unknown truths` rule — already standing in the explorer role at the user's instruction — applied to the instrument instead of the agent. Raised by the user on 2026-10-02, reading item 4's surface list as plausible web structures rather than discovered ones, which is exactly what it was. It also connects to two things already here: zoom as an oracle, where magnification reveals what a query does not, and `testability-reviewer`'s own best finding, a consent banner occluding a product image |
| 75 | **Replay real fixed bugs from a subject's git history.** Find a commit that fixed a defect, revert the fix in a worktree, and ask whether the suite — the subject's own, then the agent's — notices. `docs/mutation-evals.md` names this the highest-value gap | — | Every mutation in both sets was invented by me from the source, so the fault distribution is mine rather than the product's, and `coursera-rag`'s set leans one way by its own admission: all fourteen loosen the limiter. A real fix is a fault that really happened, in the shape it really took. Both coder subjects have the history, and no new instrument is needed — a reverted fix is a mutation whose author was the product. The work is selection: a fix that also changed tests cannot be used, and one that changed several files is not one fault |
| 78 | **The README leads with the pillar that has the least evidence.** "Context" there means a map of the page, handed over rather than bought. Nothing has shown that map changes a session — item 30 is still unpaid, and both eprimer models did their real work from controls they found themselves. What _has_ moved numbers is a different kind of context: the session clock and a thin charter (13 minutes → 41, 9 defects → 17) and the coverage briefing (8 of 14 mutations → 11, with 23 tests instead of 34) | 30 answers it; this is what to do either way | Process context and coverage context are earning the claim that page context was written to make. Either pay 30 and find out, or reorder the README to lead with what works — but not leave the strongest sentence on the page attached to the weakest evidence behind it. Found by auditing the repo against its own README on 2026-10-02, in the same pass that found five _Not proven_ bullets contradicted by this file |
| 79 | **Nothing measures whether a person is helped.** Every number here compares an agent to another agent, or an agent's suite to a hand-written one (4 of 14 against 8, then 11 — a real comparison, and of **artifacts**) | 76 gives the variance this would need | "Meaningful aid for QA activities" is the purpose in the README's first line and it is the one claim with no instrument at all. The activity has never been measured: whether a tester working with this finds more, or faster, or with better evidence, than the same tester without it. It may not be cheaply measurable — that is a reason to say so plainly rather than to let the artifact comparisons stand in for it |
| 76 | **Repeat-run variance for coders.** Same seam, same task, three runs; compare mutation scores and take the union of killed mutations against the best single run | 75 is independent of this; neither blocks the other | The explorer side measures this and the number was the most useful one we have — the best single session reaches **39%** of what five sessions found between them, 31 of 57 findings seen exactly once. The coder side measures nothing of the kind, so every coder number on this page is a sample of one, including the 4/8/11 progression. A capability whose spread is unmeasured cannot be said to have improved. It also gives killed-mutations-per-dollar, which is the axis that should decide model choice and which we have never computed despite logging cost and turns for every run |
| 74 | **Performance: the coder capability this plan forgot, and the measurement instrument underneath it.** Raised by the user on 2026-09-25 — an agent for performance test _creation and maintenance_ | the item-43 ruling, which it shares | Performance is a quality attribute that crosses all four levels, so a role named for it crosses the axis the coders split on — the same objection as `agentic-coder`. The genuinely different part is the instrument: a measurement is statistical, so it needs thresholds and a baseline per metric. Item 8 (the scan-side `performance.getEntriesByType` pass) has never been built, there is no comparator for measurements — the analogue of `mutation-compare` — and no gate rule that reads one. `.ai/state/POC-CODER-ROLLOUT.md` §2b gives the sequence, and the ruling to make together with item 43 |

## Waiting on the user

Raised, recommended, and not yet answered. Only the user can close these.

- **Run `npx playwright install` on this machine before trusting any browser number.** The
  Playwright browser cache does not exist at all on 2026-09-24 (`AppData/Local/ms-playwright`
  is absent) and `PLAYWRIGHT_BROWSERS_PATH` is unset, so 63 tests fail at launch, `npm test`
  reports 65 failures, and `npm run mutate` refuses to start because its baseline includes the
  harness project. An agent does not install a browser onto the machine; this is the user's,
  and item 19 already treats "`npm ci` → browsers → all suites" as what a fresh clone needs.

- **Give the harness a credential before the unit-coder run — and `claude auth login` is not
  the only route.** The PoC's last step needs one and this machine has none: `claude auth
status` reports `loggedIn: false` with `authMethod: none`, and three attempts at the run
  failed before any model call with `Not logged in · Please run /login`. Two routes close it:
  an interactive `claude auth login`, or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`,
  set in `.env` or in the shell that starts the run. The token is the route CI already uses —
  run 34883565980 authenticated with it alone for $0.0802 — and it is the one that works on a
  machine nobody has logged in to. `ANTHROPIC_API_KEY` is still not needed: it is optional and
  CI-only, and the line that once called it required is why a key was issued that nobody
  needed. **A token is a secret: `.env` or the environment, never a chat transcript** — the key
  pasted on 2026-09-10 is still in one and should be revoked. **`.env` is a person's file: an AI
  edits `.env.example` and never `.env`, and does not read one either** — the file guard refuses
  it on every file tool. Corrected 2026-09-24: this note named `claude auth login` alone and said
  flatly that nothing belongs in `.env`, so a person had to ask whether the token was the
  answer. It was, and `.env.example` now documents it.

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

Two more are registered as **coder** subjects rather than browser ones — their runs never
open a page: `mcpa` (`node --test`, commonjs) and `coursera-rag` (vitest, esm). The second
exists to keep the first from being the definition of a subject: every check that reads a
declared test stack had only ever faced `node --test`, and a stack that is honoured rather
than assumed cannot be shown to work by a subject that agrees with the assumption. It
found four bugs on its first two runs.

Used but not registered: **`academybugs`** (the scored benchmark above), `the-internet`,
`rigassatiksme`, `adayinhistory`.

Parked with reasons in `apps/README.md`: uitestingplayground · saucedemo · qaplayground ·
automationexercise · demoqa · testsheepnz calculator · parabank · parkcalc ·
qa-practice · applitools demo · gh-users-search · realworld · bugeater ·
practice-software-testing.

## Recently closed

| Item                                                                        | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **11** — `mcpa-bot` not a registered subject                                | **DONE** — registered as `mcpa`, at its external path, with its own `TestStack` (`node --test`, commonjs), `entryPoint` and mutation set. It has since driven `unit-coder` and `integration-coder` live, and its existing suite is the baseline `mutation-compare --against` holds new work to: hand-written 4 of 14, agent unaided 8, agent fed the survivors 11 with 23 tests instead of 34. A second coder subject, `coursera-rag`, was added afterwards for the reason this one could not serve: it agrees with every assumption the harness makes about a runner                                                                                                                                                                                                                                                                                                                                                                 |
| **5** — E6, the session report unenforced                                   | **DONE 2026-09-19** — the rules live in `auditReport` and fire on `report: exploratory-session`, so the `check-report` step every role already ran now enforces them: no new gate step, one place the rules live. A charter is required; every defect claim names an oracle (error here, warning elsewhere, because a session is the one document with no spec to settle it); `severity: observation` is new, since the skill says to keep observations, questions and defects apart and only three of the four had a home. Three mutations                                                                                                                                                                                                                                                                                                                                                                                           |
| **23** — `maxStates` enforced by nothing                                    | **DONE 2026-09-19** — `src/qe/state-model.ts` counts distinct states off the live DOM and `browserGuard` refuses at the ceiling. A state is the URL plus the _set_ of interactive-control signatures: a set rather than a multiset, so a list growing by a row is the same screen and a modal opening is not. Seen refusing a real action against a running app. Blind spot, stated: two screens with matching controls and differing content fold into one                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **26** — only the latest run on disk                                        | **DONE 2026-09-19, and the first work here written by another model.** `npm run archive-results` copies the run behind `artifacts/results.json` into `artifacts/runs/<start time>.json`, newest 20 kept. The name comes from the run's own start time, never the clock; pruning ranks by the stamp in the name, never mtime, which a copy does not preserve; an unrecognised file is never deleted. Delegated against a written spec, then reviewed by mutating each rule — four of five caught, and the survivor was real: the negative-count test used `-5` against three runs, where clamped and unclamped slices happen to agree. A `-1` case closed it                                                                                                                                                                                                                                                                           |
| **41** — `isRunWorktree` refused a worktree it had just made                | **DONE 2026-09-19** — an 8.3 short-path mismatch, not space handling: git reports the long Windows path and `path.resolve` does not expand short names, so two strings naming one directory compared unequal. `canonical()` normalises through `realpathSync.native`. Not only a test fix — `--worktree` reuse was broken for anyone reaching the repo through a short name, and it blocked `npm run mutate` entirely. Deliberately not applied to `insideDir`, which guards the file tools past a `node_modules` link                                                                                                                                                                                                                                                                                                                                                                                                                |
| **42** — `denyLabels` refused an email _field_                              | **DONE 2026-09-19** — found by the driver planning WebDriverUniversity's contact form, not by reading code: seven candidates and "Email Address" silently dropped, because the label contains "email". Label rules now apply only to controls that act, never to a box you type into. Fail-safe where it counts: `browser-guard` passes `tag: 'unknown'` and keeps the full rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A role run rested on the agent's word (F1–F7)                               | **DONE** — drawn first, then specified in `docs/agent-workflows.md` and built: preflight refuses a run missing its inputs (a coder needs `--design`); declared skills injected as text; one `PreToolUse` hook guards every tool call, `Bash` included; per-role wall clocks; a post-run gate re-checks what the run changed, including `npm run fault-check` on app specs, and stops rather than retrying. Found while building: the browser guard sat on `canUseTool`, which `bypassPermissions` may skip; and a nested Playwright run cleared the outer run's traces. Enforced and tested, not yet exercised live                                                                                                                                                                                                                                                                                                                   |
| Runs could not be told apart (G1–G5)                                        | **DONE** — reviewing `docs/agent-workflows.md` against its own principles found concurrency, attribution and cleanup patched one by one, which meant one broken principle: a run's effects must be separable. A worktree per run, a lock per target, a port per run, the design required at the base commit, one registry resolution feeding the browser, the shell and `TEST_ENV`. Found before commit: removing a worktree deleted the checkout's `node_modules`, and tool paths were relative to the working directory                                                                                                                                                                                                                                                                                                                                                                                                             |
| Heuristics with no bridge to action (E4)                                    | **DONE** — `src/qe/heuristics.ts` sorts each by what does the work; `npm run ideas` prints the generated cases from a saved scan, with values importable from `src/fixtures/probes.ts` so specs loop rather than retype; `assert-quality` gates a write checked only by its render and a write never read back. The first run on real pages found three flaws the unit fixtures had agreed with — a bodiless beacon offered as a read-back, login probes tagged for shared environments, duplicate cases — each now a test and a mutation                                                                                                                                                                                                                                                                                                                                                                                             |
| The gate judged the wrong suite                                             | **DONE** — `npm run test:external` wrote the same results file as `npm test`, and the gate then returned PASS over 22 external tests without seeing the local suite. External runs now write `results-external.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Plan numbers typed by hand                                                  | **DONE** — `npm run plan:facts` reads them from the runs and refuses any older than the code, after a hand-typed count quoted a stale file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Documentation drifted unchecked                                             | **DONE** — `npm run precommit`: dead commands and paths, undocumented commands, uncatalogued skills, a stale plan head; obligations derived from the diff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| "Regenerate, never hand-patch" misfired                                     | **DONE** — redefined as "kept accurate": re-run every number, update what changed, delete what is no longer true                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A way to see                                                                | **DONE** — Playwright MCP, granted per role and per environment. Proved by a role reporting an occlusion, which no DOM query returns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The exploration policy bound nothing                                        | **DONE** — it compiles to the tool allowlist, the browser's allowed origins, and a fail-closed per-call guard. `actionAllowed` had no caller for months                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| The toolbox was invisible                                                   | **DONE** — every role gets it; three of eight had named a single tool each. Every command in it is checked against `package.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Prompt logic nothing could test                                             | **DONE** — `session-briefing.ts`, after an inline contradiction cost 4 turns and $0.2613 against 1 turn and $0.1871                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Agent-to-skill pairing                                                      | **DONE** — every skill declared by a role through the SDK's `skills` field, prose and field must agree, nothing orphaned, all enforced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Roles conflated two kinds of work                                           | **DONE** — a `coding` family and a `testing` family, as data in `roles.ts` rather than a naming convention. Two names that lied were corrected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Design done by whoever wrote the code                                       | **DONE** — `test-planner` owns risk and design and holds no Edit; the four coders shed `test-design`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Delegation wired and dead                                                   | **DONE** — `role.ts` passes `agents`; the coding family holds the `Agent` tool and is told to call the planner for a named gap. **Never yet exercised**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Model chosen in three places that disagreed                                 | **DONE** — `src/agents/models.ts`. Roles no longer pin a model, so a subagent inherits its parent's and a delegated planner cannot end up on another model                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Turn budgets one flat number                                                | **DONE** — per-tier multipliers over what each role declares. `.env.example` no longer ships `AGENT_MAX_TURNS`, which had been cutting every role to 12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Harness read `.env` relative to cwd                                         | **DONE** — anchored to the module. A subject's secrets can no longer reach the harness process. mcpa-bot had this right first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `.env.example` claimed a key was required                                   | **DONE** — it is optional; OAuth suffices, and that is now measured and dated in the file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Element identity and fuzzy matching                                         | **DONE** — one scorer; decisive signals set a floor rather than casting a vote                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Self-healing                                                                | **DONE** — baselines, resolution, drift, verified proposals, every heal gated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Three detector false positives                                              | **DONE** — occlusion measured after scrolling, hover given a control group, `alt` added to the name ladder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| One report mixing three audiences                                           | **DONE** — the map, the product findings, automation readiness, in that order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ISTQB techniques named but not defined                                      | **DONE** — `test-techniques`, with derivation rules and coverage criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| No method for looking at a page                                             | **DONE** — `visual-inspection`, written after three defects were missed by looking once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Inventory taken before a page settled                                       | **DONE** — settle unconditionally, and the map now declares whether it is a floor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **The unit tier had no skill**                                              | **DONE on `poc/unit-coder-mcpa`, unmerged** — `unit-testing` shapes a unit test and `repo-survey` maps the source before one is written; both are declared by their roles and held there by `tests/unit/roles.test.ts`. The role has still never executed: the subject's tests were written by a person following the skill, not by the role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Nothing chose a test target mechanically**                                | **DONE on `poc/unit-coder-mcpa`, unmerged** — `npm run candidates` classifies every exported unit as unit, needs-control, not-unit or unknown and names the ones no test references; `npm run survey` adds the import graph with reverse edges, the tests that import a file or merely name it, and the files no test imports. Built because the first real use of the skill excluded a pure method along with the I/O class around it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **The map contradicted its instruction**                                    | **DONE** — the gap rule accepted a mention as coverage while the skill it serves says a mention is weaker evidence, so a file was reported as tested because unrelated test files contained its name. A gap is now decided by imports alone, and a mention has to look like the file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **A subject's level block described only the unit level**                   | **DONE 2026-09-24** — `subjectLevels()` was written for the unit PoC and described the unit level as _the_ level: composed for an integration run it said "anything needing a process, a file, or a running server is not this level", so the first integration run would have been argued out of its own job by its own prompt. The level now comes from the role's name (`levelOfRole`), each of the four levels has its own definition and boundary, the paragraph denying a browser is written only for the three levels where it is true, and a role that works at no level gets no level rather than the unit one. `integration-coder` also got the C9 treatment its sibling already had: its opening no longer names `tests/integration/*.int.test.ts` and its method no longer names `npx playwright test --project=integration` — the subject's own runner arrives instead. Five compose tests, three mutations, each caught |
| **59** — a subject's unit tests had no assertion floor (C6)                 | **DONE on `poc/unit-coder-mcpa`, 2026-09-24** — `src/quality/assertion-floor.ts`: a test with no assertion, a test whose every assertion is inside a conditional or a loop, and a test that asserts only on literals. The assertion name comes from the stack's own import line, so it reads `node:test`, `vitest` or Playwright rather than assuming one. `npm run assertion-floor` is the command and the post-run gate runs it on a subject's changed test files. Checked against the corpus before being trusted: it finds exactly the two conditional-only tests the baseline was recorded as holding, at lines 182 and 193, and passes the hand-written 28-test suite with 0 findings. It exits 2, not 0, when a file holds nothing it can read, and prints what it cannot see on every run. Five mutations                                                                                                                     |
| **62** — two new CLIs had no integration test                               | **DONE 2026-09-24** — `tests/integration/cli.int.test.ts` now drives `candidates` and `survey` against a fixture (classification reaches the output, `--save` writes a parseable map, a root with no source exits 2). It paid for itself immediately: without `--tests`, `candidates` dropped the path it was given — the `indexOf` -1 defect already fixed in `survey` and left in its sibling — so it mapped `src` and exited 0. Fixed, with the same shape grepped for across the CLIs                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **The post-run gate could not run its own scripts in a subject's worktree** | **DONE 2026-09-24** — every script-shaped step named a path relative to this repository, and a subject run's worktree is a worktree of the subject, so the step died at `ERR_MODULE_NOT_FOUND` before it read the agent's work: **every subject run would have been failed by the harness's own path.** Reproduced from `mcpa-training-bot-runs/c8d7549`. Scripts now resolve from the checkout that holds them; a run in this repository still uses the worktree's own copy, so a run that changed the checker is judged by the version it changed. A unit test in both directions and a mutation                                                                                                                                                                                                                                                                                                                                    |

## Plans change; facts go stale

Two kinds of content live here and only one is at risk. Judgements — what to build
next, and why — age slowly. Facts — counts, verdicts, what is proven — age the moment a
command runs. Every number above came from a command run at this gate. If the tree has
moved since, re-run them rather than trusting the page.
