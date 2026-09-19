# HANDOFF — how to work here

The recovery packet. Read this first after a context loss, then `PLAN.md` for where
the work actually stands.

Deliberately durable: working agreements, traps and orientation. **No counts, no test
results, no "what is proven"** — that is `PLAN.md`, and duplicating it here is what
previously let this file claim a role was unvalidated after it had been validated. If
something here needs updating every session, it is in the wrong file.

## What this is

`cc-pw-qe-harness` — Claude + Playwright + QA/QE practice, public at
`altlv/cc-pw-qe-harness`. Three parts, all meant to be real: **cc** agent roles and
skills, **pw** the Playwright stack, **qe** the quality practice that decides whether a
test proves anything.

Apps under `apps/` are **subjects under test**, one folder each, so a new app never
collides with an existing one.

## Working agreements

- **The user owns every commit and push.** Do not commit unprompted, never push
  unasked. Reach a coherent point, say what it would contain, let them decide.
- **mcpa-bot is its own repository.** It may be read as a benchmark; nothing from it is
  copied in.
- **Do not put inventory counts in documentation.** Name the command that produces the
  number instead. `docs/conventions.md` carries the rule and the reasoning.
- **Every test must prove something** — expectations met or failed, and if failed, why.
  Enforced, not aspirational: `npm run assert-quality`.
- **A repeating pattern means a tool is missing.** When agents or specs keep deriving
  or retyping the same thing, build the helper, generator or command instead. And
  "scripting a heuristic" means two things: something produces the work, and a gate
  checks written tests honour it. Advice with no gate gets skipped. (User, 2026-09-14.)
- **Draw the flow before concluding how it works.** Before deciding how a flow or set of
  calls behaves — or how it should — sketch it and check the picture for pointers
  nothing follows, steps nothing enforces, and loops that never close. On 2026-09-14
  drawing the coder flow exposed six flaws that reading the files one at a time had
  not, and drawing the desired flow found six more gaps before anything was written.
  `docs/agent-workflows.md` came out of those drawings. (User, 2026-09-14.)
- **Principles before mechanisms; a string of patches means a broken principle.** The
  flow will change; its principles (`docs/agent-workflows.md`, top) must not. Judge a
  proposal — ours or an outside review's — against them rather than agreeing with it.
  On 2026-09-14 two reviews produced a lock, change detection, edit tracking, separate
  result folders and a port check, each fixing one symptom of runs sharing a checkout;
  a worktree per run removed the cause and made most of them unnecessary. (User,
  2026-09-14: "evaluate and suggest an even better flow".)
- **Role restrictions limit activity, not knowledge.** A unit-coder does not go
  exploring end to end, but every heuristic is available to both families, because
  whoever writes a test must make its assertions good enough. Judging a finished test
  is reviewer work; good assertions inside the tests we write are expected of everyone.
  A guard that conflicts with this may change, with the user deciding. (User,
  2026-09-14.)
- **Extending the harness has its own bar:** `docs/definition-of-done.md`. Ten items,
  each earned by a real failure here.
- **Three outputs, three readers, in this order.** The **map** says how large the play
  area is and judges nothing. The **product findings** are defects in the thing itself.
  **Automation readiness** is about driving it, and comes last because it only matters
  once you know what is worth keeping. The map is the denominator, a session is the
  numerator, automation prep is downstream of both. They were one list until
  2026-09-11, and the first exploratory session run with this harness spent itself on
  selectors while the money on the page was wrong.
- **A report that cannot say how complete it is, is not finished.** `crawl` says "a
  floor, not a total"; `scan` says whether the page had stopped changing when the
  inventory was taken. A short list that announces itself as short can be worked with;
  one that looks complete cannot.
- **Attribution goes in `docs/sources.md`, never inline.** Its licence column decides
  what may be done with a source — `adapt`, `cite`, or `idea` — and the distinction is
  load-bearing, not bookkeeping.

## The definitions this project runs on

**Testability** — the ability to **identify** and **interact with** the available
elements and objects, _easily enough_. Test ids are one way to satisfy the first half
and were inherited from the tooling, not the definition. Most apps have none and are
testable anyway, so their absence is not a finding. What is: ambiguous, unaddressable,
unreachable, unlabelled input, no observable state.

**Exploration** — interaction, observation and hypothesis testing. Scan logging and
page-structure understanding are tooling that supports it; session reports and
heuristics are separate tools that also support it. All are needed.

## Traps found the hard way

Curated, not appended. Delete anything that stops being true.

- **A guard is only proven by a refusal it made in a live run.** The browser guard was
  wired as `canUseTool`, a permission handler, and listed as proven. Every run uses
  `bypassPermissions`, which the SDK's own types describe as "Bypass all permission
  checks" — so the handler may never have been consulted. Nobody had read that line
  because the unit tests of the guard's logic were green. On 2026-09-14 every guard
  moved to one `PreToolUse` hook; which path the SDK actually calls is still to be
  seen in a run that tries a refused command. Test the logic, then watch it refuse.

- **`PLAN.md` must be accurate, not regenerated.** The old rule was "regenerate, never
  hand-patch", and it failed both ways: patches accumulated anyway because a full
  rewrite is expensive, and on 2026-09-13 a full rewrite destroyed a decision record
  another session had not committed. Redefined that day to what the rule was for:
  update the sections that changed, **re-run every number rather than recalling it**,
  and delete anything no longer true rather than appending a correction beside it. The
  failure to avoid is not a patch — it is a stale or misleading line surviving.
  `HANDOFF.md` is curated the same way, with anything that stops being true deleted.
- **Never chain a command that reads a file with the command that creates it — and
  `|| cat > /dev/null` is not a no-op.** On 2026-09-13 a backgrounded command ran a
  script that did not exist yet; the `||` fell through to `cat > /dev/null`, which
  waited on stdin for five hours. Write in one step and run in the next; `|| true` is
  what swallows a failure. A background task whose output was never read is a loose
  end, not a finished one.
- **Never describe the working tree in a file that will be committed.** "Uncommitted on
  top: …" was written into `PLAN.md` and became false the moment the commit landed. A
  committed file describes what the commit contains. The same logic bounds the plan's
  head stamp: a file cannot name the hash of the commit that includes it, so it names
  the parent, and `npm run precommit` accepts that only when the latest commit
  actually updated the plan.
- **Uncommitted work is invisible to a `git diff` self-check.** Before overwriting a
  file, run `git status` on it: if it carries uncommitted changes, whatever you are
  about to destroy was never in HEAD, so the diff afterwards cannot show it to you.
  This is not theoretical — on 2026-09-13 a regeneration of `PLAN.md` overwrote a
  decision record another session had written but not committed, the diff showed the
  removal of nothing, and the loss was reported to the user as "preserved". Read the
  working copy first, not the committed one.
- **A rejection with no reasons gets re-proposed.** `PLAN.md` has a
  _Considered and declined_ table for exactly this. Deleting a "we looked at X and
  said no" note costs more than deleting an open item, because the open item is
  obviously missing and the rejected one silently returns as a fresh idea.
- **You will look once and believe you looked.** One viewport, one state, one scroll
  position, and the report reads as if the page had been examined. Three defects were
  missed that way on the same site, all of them plainly visible two scrolls down or
  with a panel open. `.claude/skills/visual-inspection/SKILL.md` is the method; the
  bug-counter overlay on that site was rendered in the corner of every screenshot
  taken and went unnoticed for four sessions.
- **A detector that cries wolf is worse than none.** Several of ours have. Run a new
  rule against a known-good page and confirm silence, not only against the case you
  built it for. Generators too: synthetic fixtures agree with their author. The first
  real run of `npm run ideas` offered an analytics beacon as the read that proves a
  login, and tagged login probes to run on shared environments. Both had passed every
  unit test written against hand-made scans.
- **Measure in the state the action actually happens in.** The occlusion check
  hit-tested elements where they sat, but Playwright scrolls before clicking, so it
  was answering about a moment that never occurs. Right question, wrong instant.
- **A difference detector needs a control group.** The hover pass credited hovers with
  anything that appeared while it ran, including a promo button that arrives on its
  own after ~16s. If the claim is "X caused Y", measure Y without X too.
- **`mouse.move(0, 0)` is not "hovering nothing".** The origin is over whatever the
  page put there. Find a point that resolves to the body first.
- **Drift is contradiction, not weak confirmation.** Checking a recycled id by score
  fails, because the id is the thing that agrees. Report a decisive signal that
  _disagrees_ while another agrees; absence of confirmation is not evidence of change.
- **A green suite is not evidence the assertions are good.** Run `npm run mutate`.
- **A mutation that cannot fail is worse than none**, because it reports as caught.
  Three ways it happens, all seen here: the mutation removes something a later line
  still does; its only test calls the pure function directly instead of the real path;
  or it targets a branch nothing reaches. Confirm a new mutation fails for the right
  reason before trusting the score. The reverse is the useful one: a survivor is often
  a test whose input makes the rule redundant. "Never hand a password field probe
  values" survived because the test's password field declared no length or pattern,
  so nothing would have generated values for it anyway. Give the test the input under
  which the rule is the only thing standing in the way.
- **A mutation score is over the mutations that ran.** Anchors rot when code is
  refactored, and a skipped mutation used to print a line nobody read at the top of a
  five-minute run — two rules were silently unchecked that way while the score said
  100%. The runner now refuses on any anchor that does not resolve to exactly one
  place. An anchor matching _several_ is the same bug: `String.replace` takes the
  first, so the mutation lands somewhere other than the rule.
- **Scoped runs must never print a percentage.** `npm run mutate -- --changed` covers
  only the rules you touched; a number that looks like a score gets read as one.
- **`document.elementFromPoint` only answers inside the viewport.** Clamping an
  off-screen centre onto the edge samples a different element and invents an overlay.
  Off-screen is not a blocker anyway — Playwright scrolls before acting.
- **No named or const-assigned functions inside `page.evaluate`.** tsx/esbuild rewrites
  them to call a `__name` helper that does not exist in the page; the failure is an
  opaque `ReferenceError`.
- **A static value can be a decoy.** The countdown display ships in the HTML already
  reading `01:01:12` — exactly what the init script sets — so asserting it proves
  nothing about whether the app is alive.
- **Use a script file, not a shell heredoc**, for anything containing escapes. The most
  repeated mistake in this project, and it recurs because each attempt looks like it
  worked. The specific failure: `\n` inside a string you are writing into a source file
  arrives as a **real line break**, giving an unterminated string literal — and quoting
  the heredoc does not prevent it. It happened five times in one session on
  2026-09-11 and twice more on 2026-09-13 — every one of those seven after this line
  was already written, and two of them minutes after re-reading it. Reading the
  warning does not work. Use the editing tools, or write a real `.py`/`.mjs` file and
  run that. It is not only heredocs: on 2026-09-14 a `sed` replacement meant to write
  the escape for a byte-order mark into a regex wrote `FEFF`, and the test for
  frontmatter stripping was what noticed. Two edit-tool retries then wrote the
  invisible character itself, which lint calls irregular whitespace. When an escape
  keeps collapsing, stop writing it: compare the char code instead, as `parseReport`
  does, and check the bytes with `od -c`.
- **A prompt is behaviour; test it like code.** A briefing that said "do not re-derive
  this from the page" three sentences after "begin with browser_navigate" made an
  agent rebuild a map it had already been given: 4 turns and $0.2613 against 1 turn
  and $0.1871 once the contradiction was gone. It was invisible because it lived
  inline in a CLI where no test could reach it. Prompt logic with branches belongs in
  a module with tests and a mutation, the same as any other branch.
- **Measure a cost before naming a cause.** `--snapshot-mode full` attaches an
  accessibility tree to every tool response, which is obviously the expensive thing —
  and turning it off saved nothing ($0.0738 against $0.0742), because a screenshot
  response carries no tree at all. The real cost was an explicit `browser_snapshot`
  on a large page. Stated as a finding twice before anyone ran the comparison.
- **The expensive way to look at a page is the text one.** An accessibility tree cost
  $0.2345 on a real e-commerce page and $0.0675 on a trivial one; a screenshot of the
  large page cost $0.0738. The tree scales with the page and the image does not, so
  the intuition that text is cheap is backwards here. Cheaper than either: `npm run
scan`, which costs no tokens and grades the selectors as well.
- **A stated allowance gets spent.** A briefing saying "at most 200 actions" invites a
  session to use them. Same limit, phrased as a backstop that means the session lost
  its way, pulls the other direction.
- **A whitespace-only edit does not survive `npm run format`.** Prettier reverts it, so
  a file you "touched" to test something is not actually modified. Check
  `git status --porcelain` rather than assuming.
- **Do not share an output path between parallel tests**, and do not assert on the size
  of a shared collection. Both have caused flakes here. A child process counts: a test
  that spawns its own Playwright run clears the shared `test-results/` at startup and
  deletes trace files the outer run is still writing. On 2026-09-14 that failed two
  heal tests with `ENOENT … .trace` inside the mutation baseline, while `npm test` a
  minute later passed on timing luck. A nested run gets its own `--output` and report
  folder. The same day, hours after writing this, a countdown-timer run started beside
  `npm test` to simulate load failed a heal test the same way. Two Playwright runs at
  once share `test-results/` unless one is given its own `--output`.
- **A run that writes nothing leaves the last run's results behind.** `--reporter=line`
  or `--reporter=json` on the CLI replaces the reporters configured in
  `playwright.config.ts`, so `results.json` is not written and still holds the previous
  run. The gate refuses stale results; a hand-typed counting snippet did not, and quoted
  414 tests when 420 existed. Until 2026-09-13 `npm run test:external` also wrote that
  same file, and the gate returned PASS over 22 external tests without ever seeing the
  local suite. External runs now write `results-external.json`, and the numbers
  `PLAN.md` quotes come from `npm run plan:facts`, which refuses anything older than the
  code.
- **`page.setContent` reuses the same window.** A second `customElements.define` of
  the same tag throws, and the page quietly keeps the first definition — so a test
  that thinks it loaded new markup is still running against the old. Attach shadow
  roots imperatively in tests, or use a fresh tag name each time.
- **Two guards for one rule means neither can be shown to be doing the work.** Both
  mutations survive, each masked by the other. Belt-and-braces reads as caution and
  is the opposite: pick the one guard that carries the rule.
- **A Playwright fixture reads its inputs at setup, before the test body runs.**
  Setting `process.env` inside a test to steer a fixture is always too late. Use a
  fixture option and `test.use()`.
- **A fixture's teardown runs after the test body.** A test cannot observe a file its
  own teardown will write; assert it from the next test, in serial mode.
- **A rule that reads git history must be checked where history is shallow.** precommit
  accepts a plan stamped with HEAD's parent, and `actions/checkout` fetches one commit by
  default — so from 2026-09-13 CI refused every correctly stamped plan, and on 2026-09-14
  those red runs were first explained to the user as real drift. A depth-1 clone
  reproduced CI's exact message in a minute. Reproduce CI's conditions before naming a
  cause for a CI-only failure.
- **Importing a CLI module runs it.** A script meant to check mutation anchors imported
  `src/cli/mutate.ts` for its list and started a full mutation run, rewriting source
  files while it went. Every `src/cli/*.ts` does its work at the top level. To read what
  one declares, parse the file — the TypeScript compiler API reads `MUTATIONS` without
  executing anything.
- **`git worktree remove` follows a link inside the worktree.** The first run worktrees
  linked the checkout's `node_modules` inside themselves, and removing one deleted the
  checkout's modules. Found in a throwaway repository before any commit. The link now
  sits beside the worktrees, in the runs folder, where Node and `npx` still find it by
  walking up. It is git's removal that follows the link: on 2026-09-14 `rm -rf`,
  `rmdir`, Node's `fs.rmSync` and PowerShell's `Remove-Item -Recurse` each removed a
  junction and left its target intact. Written first as "never a recursive delete"
  before that was tested — it was wrong.
- **A tool path relative to the working directory breaks the day a process runs
  somewhere else.** `resolve('node_modules/…')` worked for months because every command
  ran from the repository root, and failed the moment the gate ran in a worktree.
  `src/tool-paths.ts` resolves each CLI the way an import does.
- **A test of a command that can spend must stop before spending by construction.**
  The SDK falls back to a Claude Code login when no key is set, so a refusal test whose
  refusal failed to fire would have started a paid agent run. Every `role.ts` test
  passes `--preflight`, which exits before the worktree and the agent. Never mutate that
  exit.
- **A defensive branch for a case you never confirmed is a fiction with a comment
  attached.** The driver split its target on `→` before looking the element up,
  believing the arrow was a selector with a read-back appended, and documented that
  belief in the function's doc comment. Only `apiIdeas` produces that form, and its
  target is an endpoint — so the branch could never have matched and the comment
  described a case the codebase does not contain. A test written to prove the branch
  worked is what exposed it. Write the case that proves the branch fires; if you cannot,
  the branch is the thing to delete.
- **Two `npm test` runs at once corrupt each other's results.** One in the background
  and one in the foreground gave 587 passed with 4 "did not run", against 603 passed and
  1 failed when either ran alone — they compete for the fixture server and both write
  `artifacts/results.json`, which `npm run gate` and `npm run plan:facts` then read. Run
  the suite alone and re-run it before quoting any number from it.
- **Playwright MCP writes into its working directory unless `--output-dir` says
  otherwise.** A spike that spawned it without the flag left a `.playwright-mcp/`
  folder in the repository root, holding a snapshot of the page it had visited.
  `browserMcpConfig` always passes the flag, so a real run is unaffected — and the
  reason to keep it that way is that a run's cwd is its worktree, whose diff is the
  only account of what the run changed. A tool quietly adding files there turns
  evidence into noise, and `worktreeChanges` would report them as the agent's work.
  Verified after the fact: the integration test, which does pass the flag, creates
  nothing.
- **`npm run mutate` rewrites source files in place — nothing else may touch the tree
  while it runs.** It edits a file, runs the suites, restores it, and moves to the
  next, for every mutation in the list. Two consequences, both met on 2026-09-19.
  Editing during a run makes every result meaningless in both directions: your change
  can fail a suite and be recorded as a mutation caught, and a restore can write the
  pre-edit copy back over your work. And **killing a run leaves the current mutation
  applied** — a stopped run left `page` replaced by `Promise.resolve()` in
  `src/tools/probe.ts`, which `git status` showed and `git diff` briefly did not,
  because the process restored that file and mutated the next one between the two
  commands. After stopping one, check `git diff` over `src/` for a change you did not
  make, and be aware the run takes roughly an hour: `TaskStop` on a wrapper shell does
  not stop the node process underneath it.
- **A CDP connection learns about a page when the browser tells it, not when the other
  client opens one.** The observer attaches to the shared browser before Playwright MCP
  does, so after MCP's first `browser_navigate` the page exists while
  `browser.contexts().pages()` on this connection can still be empty. A single look
  returned null and the run counted a miss on the very first action of every session —
  an undercount, which makes the state ceiling permissive. `activePage` now polls for a
  bounded window and returns the moment a page appears. Found by
  `observer.int.test.ts` failing about one run in four, not by reading the code: it
  passed every time it was run alone.
- **`grep -q "failed"` over Playwright's line reporter matches test names.** Several
  tests here are called things like "should FAIL when tests failed", so a loop counting
  failures that way reported 10 failures in 10 runs of a suite that was entirely green.
  Match the summary line — `^ +[0-9]+ failed` — and re-read any flake rate measured the
  other way before believing it.

## Credentials

A 3-hour API key was supplied on 2026-09-10 and written to `.env` — gitignored, and
verified absent from every tracked file. **It is in the chat transcript and should be
revoked.** `.env` also holds deliberately empty keys for other providers; the user set
those to observe how bad keys are handled. Do not "fix" them.

`src/env.ts` loads `.env` via Node's own loader.

**An agent never types a password into a form**, on any environment, however the
request is framed. This was tested on 2026-09-11: credentials for a deliberately
buggy practice site were offered, with the fair point that it is a test app and that
refusing costs coverage. Both halves are true, and the answer does not change.

The consequence is a real blind spot, not a shrug: the account area of every subject
stays dark, and one defect the user found behind that login — a billing panel
spinning forever — was unreachable. **The route in is `storageState`**: a person runs
`playwright codegen --save-storage` once, and the harness replays an already
authenticated session without an agent ever handling a secret. It is queue item 8 in
`PLAN.md` and it exists for this reason. Offer it rather than re-arguing the rule.

## Where things live

| Kind of knowledge             | Home                                               |
| ----------------------------- | -------------------------------------------------- |
| Where the work stands         | `.ai/state/PLAN.md`                                |
| Working agreements, traps     | this file                                          |
| How an app under test behaves | `apps/<app>/README.md` and `coverage.md`           |
| Why a line of code exists     | a comment next to it, and the commit that added it |
| Test conventions              | `docs/conventions.md`                              |
| Bar for extending the harness | `docs/definition-of-done.md`                       |
| How a role run works, and why | `docs/agent-workflows.md`                          |
| Where an idea came from       | `docs/sources.md`, with what its licence allows    |
| Which subjects exist and why  | `apps/README.md`                                   |

## Still missing from the goose inheritance

Recipes: 0 of 9 — the orchestration layer; format in
`goose-harness/recipes/new-feature.yaml`. Agent contracts: 7 of 22, though the seven
cover every test level. Schemas: verdict ported; requirements-analysis and
triage-report not.
