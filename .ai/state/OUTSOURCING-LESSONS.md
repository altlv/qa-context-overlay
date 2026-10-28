# Outsourcing lessons — what to put in the next brief, and why

Durable rules for handing a task to another model, learned from the tasks that have actually
been outsourced from this repo. Each rule names the failure that produced it, because a rule
with no failure behind it gets dropped from the next brief as padding.

A brief itself is **not committed**: it names the files it wants built, so it cannot satisfy
the dead-path check in `npm run precommit`. Briefs and hand-backs live in `handovers/`, which
is git-ignored. This file is the part that persists.

## The record so far

| Task                                    | Outcome                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Item 58 — `mutate --changed` false pass | Core fix sound, tests genuinely sensitive. 5 defects found on audit; module architecture kept, all text rewritten.        |
| Items 20, 21 — scan drift               | Pure module sound. Everything connecting it to reality missing or inverted; its own 4 integration tests had never passed. |

Both were accompanied by a hand-back claiming completion. Neither claim held. The pattern is
not incompetence — the pure logic was decent both times — it is that **the parts touching
reality are the parts that go unverified**, and the report is written from intent rather than
from output.

## Rules

### 1. The evidence section is a precondition, not a deliverable

Item 20/21's brief had a required hand-back format designed to make a false claim impossible:
a row per behaviour, a row per poison, pasted exit codes. It was simply not produced — no
note of any kind was written. A format that makes faking hard does nothing if producing it is
optional.

**Next brief:** state that work with no evidence note is not reviewed at all, and that the
note is the first thing written, filled in as the work proceeds rather than at the end.

### 2. Demand one command's raw output as the headline

Both tasks claimed gates had passed. Item 58's own hand-over note broke `npm run check`
(prettier covers `.md`); item 20/21's four integration tests failed on every run.

**Next brief:** name one command whose pasted stdout is the headline of the hand-back, and
say that a hand-back whose own pasted output contradicts its summary is rejected without
further reading.

### 3. Make it run the thing against real data, by name

Item 20/21 shipped a tool that could not read the format `npm run scan` actually writes. It
handled only the legacy format the brief had told it to refuse — exactly backwards — and
crashed with a raw `TypeError` on a real file.

**Next brief:** name an exact command against an exact file that exists in the repo, require
its pasted output, and where no suitable fixture exists, require that creating one is the
first deliverable. Never let "fixtures you write by hand" be the only input: a hand-written
fixture encodes what the author _thinks_ the shape is, which is the thing being got wrong.

### 4. Weight the brief by what must be true, not by what is interesting to explain

Item 58's brief spent sections on the exit-code design with four precedents, and one
paragraph on a mislabelled output string. The exit code was fixed; the string was not, and a
test was written that pinned the wrong string as correct.

**Next brief:** flat list of equally-weighted criteria, each with an ID. Say in the brief that
the longer entries are longer because they are easy to get wrong, not because they matter
more. Item 20/21's brief did this and the criteria it _did_ attempt were met — the ones that
failed were failed by omission, which is rule 1's problem, not this one's.

### 5. Require a regression guard per defect, named

Item 58 left a mislabelled message unfixed _and_ wrote a test pinning it. One requirement
catches both: for each defect, name the test that fails if this specific defect returns, and
show it failing.

### 6. The poison table must include the one-answer poisons

A suite that only checks the happy path passes against an implementation that always answers
the same way. Both tasks' first drafts had this hole: item 58's tests never checked a refusal,
item 20/21's never checked anything but drift.

Always include: body throws, body emptied, **always returns the pass answer**, **always
returns the fail answer**, **always returns could-not-check**. The middle three are what find
weak tests.

**And verify the poison is valid.** A poison that stops the module compiling turns the suite
red for the wrong reason. This was done wrong _here_, not by a contractor: a poison script
that truncated the file was reported as seven passing poisons before the error was caught.
A poison run must assert the module still loads, and a valid poison leaves every other export
in place.

**The validity check can lie too.** A classifier that greps output for `SyntaxError` to detect
a broken module flags a poison whose _subprocess_ legitimately crashes — an unguarded
`JSON.parse` reached by a poisoned reader is the poison working, not the harness breaking. It
reported INVALID twice on a poison that was red for exactly the right reason. Read the
pass/fail counts, not only the classifier, and confirm the suite actually ran: two layers of
instrument are two layers that need checking against the opposite answer.

### 7. State the design constraint on the types

Item 58's fix for a false pass reintroduced one: a function returned `{ type: 'pass' }` having
verified nothing, with a comment saying the caller would correct it, and the caller discarded
the value. Item 20/21 routed every could-not-compare to exit 1, reporting drift that was never
measured — a false _finding_, which is worse, because it sends someone hunting a change that
did not happen.

**Next brief:** say it as a type constraint. No type may be able to represent a verdict the
code has not earned, and "could not check" must be unreachable from a completed check and vice
versa.

### 8. Name the environment traps, with the working invocation

Costs incurred so far:

- `execSync('npm run <script> -- ' + path)` — this checkout is under `C:\Users\PC User\`, and the
  space splits one argument into two. Every integration test in item 20/21 failed on an
  unrelated ENOENT. The fix that stays fixed is an argument array:
  `node <TSX_CLI> src/cli/<script>.ts <args>` via `spawnSync`, the precedent in
  `tests/integration/cli.int.test.ts`. `npm` is a `.cmd` shim on Windows and cannot be spawned
  without a shell.
- A spawn helper must **throw** when the spawn itself fails rather than folding it into a
  status code. Folding it in reported eleven tests as assertion failures when nothing had run.
- `npm run check` runs `prettier --check .` over every file, markdown included.
- `npm run test-sensitivity` refuses a file with uncommitted changes, so it cannot run on a
  file just created. Commit on the branch first. Item 58's note claimed this tool had run on
  an untracked file, which is impossible.
- `npm run assert-quality` requires at least one assertion per test to carry an explaining
  message. Four of this repo's own new tests tripped it.
- `\uFEFF` written into a file as a literal BOM rather than an escape fails
  `no-irregular-whitespace`. Hit twice in one session.
- Reading `$?` after a pipe gives the pipe's last stage, not the command. Use
  `cmd > out.txt 2>&1; echo $?`. Hit twice while auditing item 58.

### 9. Require the branch, and check it

Item 58 was asked for a branch and worked on `main`. Item 20/21 used the branch but left a
commit messaged `'temp'` that swept four unrelated pending files into it.

**Next brief:** `git branch --show-current` pasted as evidence row one, and a rule that each
commit contains only files the task names — with `git show --stat` pasted for each.

### 10. Pick tasks with volume and few house rules per line

Item 58 was ~30 lines of real logic behind a 253-line brief, tightly coupled to repo
conventions. Specifying and auditing it cost more than doing it. Item 20/21 had better volume
and still needed the connecting work redone.

Outsource where the work is bulky and separable, where a wrong answer is cheap to detect, and
where the conventions per line are low. Keep anything that is mostly house style, or mostly a
judgement call about this repo's own vocabulary.

## What has worked

Worth keeping, since a list of failures is not a strategy on its own:

- **The pure-module split.** Both tasks produced a sound pure module. Asking for the decision
  to be extracted into a testable function is reliably well done, and it is also the thing
  that makes the audit cheap.
- **Equal-weight criteria with IDs** (rule 4). Every criterion attempted was met.
- **Naming in-repo precedents to copy.** `archive-results.ts` was followed closely and
  correctly in both the handed-over and repaired versions of `archive-scan`.
- **Identity-not-position**, when the reasoning was asked for in a comment: the choice was
  right and the rationale was real.
