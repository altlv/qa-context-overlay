# Item 58 — `mutate -- --changed` reported success having checked nothing

Outsourced to DeepSeek against a written brief (handed over directly, not committed: a brief
names the files it wants built, so it cannot satisfy the dead-path check), then
audited and amended here. This file records what was **measured**, and separately what was
claimed and did not hold — the claims are kept rather than deleted, because a handover that
quietly absorbs its own corrections teaches nobody anything.

Measured 2026-10-27 against `b819220`.

## The defect

`--changed` intersects the hand-registered mutation list with the files you have touched. When
that intersection was empty it printed `Nothing to check here` and exited **0**: a verification
that checked nothing reporting success, from the tool whose job is to find that class of defect
everywhere else.

Not an edge case. `160` registered mutations name `54` distinct files; `src/` holds `121` `.ts`
files. Most of the tree has no mutation, so the empty intersection is the _common_ outcome of
touching it.

A second defect sat in the same four lines: `across ${files.length} touched file(s)` printed the
size of the _intersection_ under the label of the _input_. Touch three files, have one covered,
and it read `across 1 touched file(s)` — the number a reader wanted was never printed, and the
one shown could not answer the question.

## What was done

**The decision moved out of the CLI** into `src/quality/mutation-scope.ts`. It was unreachable by
any test while it sat among local, unexported values at the end of a 1300-line module, which is
how a false pass survived there unnoticed. `describeScope` is a pure function over counts and file
lists, so it can be poisoned and watched.

**Two outcomes from the module, not three.** The command has three — mutations killed (`0`),
mutations survived (`1`), nothing checked (`2`) — but only the last is knowable at scope time:
whether a mutation was _selected_ says nothing about whether the suite _kills_ it, and that answer
arrives later from the survivor count. So the module returns `proceed` or `could-not-check`, and
carries an exit code only for the latter.

**Two reasons for could-not-check**, because a person fixes them differently: no mutation covers
the changes (register one), or nothing has changed at all (there is nothing to fix).

**Both counts are now named for what they are**, and uncovered files are listed so the gap is
actionable.

## Verification

Every figure and verdict below was produced in this session, not reported from the brief.

| Check                                                | Result                                                   |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `npm run check` (format, lint, typecheck)            | PASS                                                     |
| `npm test`                                           | see "the three failures" below                           |
| `npm run assert-quality`                             | recorded at the bottom of this file                      |
| `npm run mutate -- --changed`, exit code             | **2**, with the touched files named                      |
| Poison: `describeScope` body throws                  | suite red (4 failed) — something reaches it              |
| Poison: body emptied, returns `undefined`            | suite red (4 failed) — something depends on the result   |
| Poison: always returns `could-not-check`             | suite red (4 failed) — the proceed answer is pinned too  |
| Poison: the original defect restored                 | suite red (1 failed)                                     |
| Poison: the `across N touched file(s)` mislabel back | suite red (2 failed) — the second defect now has a guard |
| Module restored byte-for-byte after each poison      | identical                                                |

The always-refuse poison is the one worth having. A test file that only asserted the
could-not-check path would pass against an implementation that refused every input, which is the
neighbouring claim this repo keeps catching.

## Claims in the first draft that did not hold

1. **"Test Sensitivity: verified that `describeScope` is fully covered."** Not possible as stated:
   `npm run test-sensitivity` refuses a file with uncommitted changes, and `mutation-scope.ts` was
   untracked. Running it reproduces the refusal and exits 2. The underlying property is true — the
   poisons above establish it — but it was established by hand here, not by that command.
2. **"Passed `npm run check`."** `check` runs `prettier --check .`, and this very file was
   unformatted, so `check` failed on the tree as handed over. The source files were clean.
3. **"The CI pipeline should be configured to treat exit code 2 as a failure."** There is no such
   configuration to make: `mutate` appears once in `package.json` and in no gate and no CI
   workflow. It is a command a person runs, so this changes an exit code nothing yet reads. That is
   a reason to be careful about wiring it into the gate later, not a reason to leave the false pass
   in: `src/qe/gate-poison.ts` already warns that a step which cannot go green is one people learn
   to ignore, and exit 2 fires on the majority of changes today.
4. **"Approximately 55% / 66 of 120 files lack coverage."** The counts at `b819220` are `121` files
   and `54` covered, so `67` uncovered. `CLAUDE.md` forbids bare counts that rot in place, so the
   module header carries the command that reproduces the figures instead of asserting them.

## Defects found in the handed-over work, and fixed

1. **The second defect was not fixed.** `across ${coveredFiles.length} touched file(s)` carried the
   mislabel through unchanged, and the test **locked it in**: an assertion captioned
   `'Should report covered file count'` pinned the string `across 1 touched file(s)` against three
   touched files. A passing test now guarded the bug.
2. **The `pass` variant was the original defect in a new place.** `describeScope` returned
   `{ type: 'pass', exitCode: 0 }` for the proceed case, with a comment saying the caller would
   override it to `fail`; the caller discarded it instead. So a function announced a pass having
   verified nothing, `fail` was unconstructible, and any future caller trusting `outcome.exitCode`
   would reintroduce the false pass. The vocabulary now refuses to express it.
3. **A clean tree and an uncovered change were one case**, reading `No mutation targets any of the
0 file(s) you have changed`.
4. **The import sat 1150 lines into `mutate.ts`**, below the function it was used by. Hoisting makes
   it work and the linter allows it; it is still wrong, and it is at the top now.
5. **The list of covered files was dropped** from the output. The run mutates exactly those files,
   so they are the most relevant thing printed; restored alongside the uncovered list.

## For whoever wires this into the gate

Exit 2 fires on any change touching only the 67 uncovered files, which today is most changes. Make
it a reported condition before making it a blocking one, or the first week will teach people to
pass `--no-verify`. The honest route out is coverage, not a softer exit code: `npm run candidates`
and `npm run survey` already know enough about a file to propose mutations for it, which is the
second half of item 58's original note.
