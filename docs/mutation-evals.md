# Mutation sets as evals — what the number means, and what it cannot

`npm run mutation-compare` is the only check in this repository that measures whether a
test has **value** rather than whether it has **form**. `assert-quality` and
`assertion-floor` ask whether a test asserts something; the gate asks whether it passes;
only this asks whether anything would notice the product breaking.

That makes it the number most worth having and the number most worth distrusting. This
file records what to take into account before believing one, and what else is worth
measuring instead. Mechanics live in `src/qe/mutation-compare.ts`; this is the judgement
around them.

## The mechanic, in one paragraph

A mutation is a hand-written break: one anchor string in the source, one replacement, and
a sentence naming the rule it removes. Scoring applies each one, runs the suite, and
records **killed** if the suite went red and **survived** if it stayed green. The score is
`killed / total`; the survivors are the output that matters, because each one names a rule
nothing tests, in words rather than as a line number.

```bash
npm run mutation-compare -- --mutations apps/coursera-rag/mutations/rate-limit.ts \
  --repo ../coursera-rag --suite npx vitest run test/unit/rate-limit.test.mjs
```

## What to take into account

### 1. The set is the eval, and it has an author

A hand-written set measures a suite against **the author's model of the code**, not against
the code. Writing the set from the source before reading the tests removes one bias — a
set written afterwards grades the author's memory of the tests — and leaves the larger one
untouched: you only write mutations for rules you thought of.

The current sets show this plainly. All fourteen entries in
`apps/coursera-rag/mutations/rate-limit.ts` make the rate limiter **more permissive**. A
suite could score 14/14 and still miss a rule that makes it _stricter_ than configured —
refusing a caller inside its allowance. The set has a direction, and the fraction does not
show it.

Say the direction out loud in the set's own header. It is the one limitation a reader of
the number cannot recover for themselves.

### 2. We contaminate the eval ourselves, on purpose — so part of it is held back

`src/qe/coverage-briefing.ts` hands a role the rules the existing suite leaves undefended
_before_ it writes, because taken first that measurement is direction rather than a
verdict. It is worth having: measured on `mcpa`, 8 of 14 choosing its own targets against
11 of 14 told the survivors, with 23 tests instead of 34.

It also means the gate then scores the suite **against the set it was briefed from**. A
role told "a refused caller is told how long until a token exists", and scored on whether
it covered that rule, is being marked on the answer it was given. The number still
measures something real — the role had to write a working test — but it stops measuring
what we wanted, which is whether a role can find the gap in a seam.

So every set keeps part of itself back. A `holdout: true` entry is scored like any other
and never appears in a briefing:

- **Declared in the set, never chosen per run.** A split drawn at random, or drawn from
  which mutations the baseline happens to survive, produces a number that cannot be
  compared with last week's.
- **Interleaved across the seam's families of rule**, not a run of adjacent entries.
  Holding back one _kind_ of rule measures that kind's difficulty rather than the effect of
  briefing.
- **Filtered before the totals are computed**, not at the point the sentences are
  rendered. A role told the set holds fourteen rules while hearing about nine knows to go
  looking for five.
- **Never mentioned to the role at all** — not its size, not its existence. Being told a
  holdout exists is enough to change what a capable agent writes.
- **A set that is entirely holdout is refused.** It would leave the briefing empty, and an
  empty briefing and a failed measurement are reported differently on purpose.

A holdout the baseline suite **already kills** carries no information: it would never have
surfaced as a survivor, so briefing could not have mentioned it, so holding it back changed
nothing. A split can therefore be shaped correctly and measure nothing, and it looks fine
from the outside. `holdoutPower` reports how many holdouts the baseline leaves alive, and
the role runner prints it before every scored run, so the split can be moved.

**Numbers taken before a split existed do not compare with numbers taken after it.** The
8, the 11 and the 4 above were all scored against the whole of `mcpa`'s set.

### 3. The absolute number is nearly meaningless; the delta is not

`11/14` does not compare across seams, across sets, or across revisions of one set. The
comparable thing is the subset rule:

```
survivors(after) ⊆ survivors(before)
```

A change may not leave a seam weaker than it found it, whether or not we mentioned the
rule. Anything in the difference is a rule the old suite caught and the new one does not,
which is what a deleted assertion looks like from the outside. That is what the gate
enforces; survivors above the baseline are **reported and do not fail**, because no real
suite kills everything and a step that can never go green is one people learn to ignore.

### 4. A flaky or non-isolated suite turns the score into noise

A flaky test kills mutations at random, so a mutation score over a flaky suite is noise
with a mean. Nothing here measures flake rate yet — it is still queue item 27, filed as
_scriptable_. Until it exists, every mutation score assumes a determinism nobody checked.

The same shape applies to isolation. Scoring a suite file-by-file and scoring it together
can disagree, which is why the gate now runs changed tests as one suite as well as
individually.

### 5. It scores detection — never diagnosis, and never scope

- A test failing with `expected true, got false` kills a mutation exactly as well as one
  that names the broken rule. **Mutation score is blind to what makes a failing test
  useful.**
- 14/14 on one file says nothing about the other thirteen. Whether the seam was worth
  testing at all is a prior question with **no mechanical check anywhere in this
  repository**. `npm run survey` and `npm run candidates` inform it; nothing scores it.

### 6. Cost is mutations × suite runtime, doubled by `--against`

Fine for a pure unit seam. For a forty-second integration suite that spawns a server,
fourteen mutations twice is roughly twenty minutes per gate run. Seam choice is a budget
decision as much as a fidelity one — which is why `coursera-rag`'s set points at the rate
limiter: pure, clock injected, no API key, so a score cannot be confounded by a live model
either.

### 7. A red or unstartable suite scores 100%

Everything "fails" under every mutation, so every mutation reports as caught. The
comparator refuses to report a score unless the suite is green first, and refuses again if
the suite could not start — the second of which is what `coursera-rag` was doing for two
runs, for a reason that had nothing to do with its tests. A worktree holds only what git
tracks; `vitest` is a devDependency; the subject declared no `prepare`.

**A measurement that fails must never be indistinguishable from a measurement that came
back clean.** This is the failure mode this repository keeps meeting, and every new check
should be read against it.

### 8. A crash mid-loop leaves the source broken

And a source left broken is indistinguishable from a suite that caught the mutation. The
restore lives in a `finally` and runs once more at the end. The one place this has actually
bitten was `subject-fault-check`, where a hang meant the `finally` never ran and a
subject's entry point sat mutated on disk — which is why that command now bounds every
wait rather than trusting the loop to come back.

## What else is worth measuring

Mutation scoring is one instrument. These are the others, with what each buys that
mutations cannot. Nothing below is built unless it says so.

| Option                                                                                                                                                          | What it buys                                                                                                                                           | State                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Holdout half of the set**                                                                                                                                     | Removes the contamination the briefing creates. Cheapest real fix available                                                                            | **Built** — `holdout`, `splitScore`, `holdoutPower`                                                                   |
| **Replay real fixed bugs** — find a fix in the subject's history, revert it, ask whether a suite notices                                                        | The distribution of faults is real rather than invented. Both coder subjects have the history                                                          | **Built** 2026-10-05 — `npm run bug-replay`. Measured: 3 of 10 commits replayable on `coursera-rag`, 0 of 3 on `mcpa` |
| **Existential checks** — the process dies, a dependency returns 500, config is missing, the clock jumps                                                         | Mutations are all in-process logic edits, so they never ask whether the suite would notice there being no application at all                           | One of them built: `src/qe/process-fault.ts`                                                                          |
| **Repeat-run variance** — the same seam several times, union of killed mutations against best single                                                            | Measures the process rather than one artifact. The explorer equivalent already showed the best single session reaching 39% of what five sessions found | Built for explorers (`finding-union`), nothing for coders                                                             |
| **Killed mutations per dollar**                                                                                                                                 | The axis that should decide model choice. Cost and turns are already logged for every run                                                              | Never computed                                                                                                        |
| **Metamorphic oracles** — same question phrased twice retrieves the same documents; an irrelevant document does not change the answer; a reranker is idempotent | Scores behaviour where there is no fixed expected output. Mutation-scoring a retrieval layer will always be thin                                       | Not built. `coursera-rag` already ships rubrics and a holdout set                                                     |
| **Mutating the agent's own test file and requiring the gate to fail**                                                                                           | Evaluates the eval                                                                                                                                     | Built for gate steps: `src/qe/gate-poison.ts`                                                                         |
| **Assertion floor**                                                                                                                                             | A static floor under everything above: does the test assert something the code can falsify                                                             | Built: `src/quality/assertion-floor.ts`                                                                               |
| **Line coverage**                                                                                                                                               | Can say a seam is untouched. Can never say a test is good                                                                                              | Deliberately **not** a score — keep it a negative filter                                                              |

## Replaying a real fix — what the number means

`npm run bug-replay` reverses a commit's **source** changes, leaves every test at HEAD, and runs
the suite. A suite that goes red noticed the behaviour being undone; one that stays green did
not, and for a fix commit that means the defect can come back in silence. Mechanics in
`src/qe/bug-replay.ts`.

It answers consideration 1 above and nothing else. The faults are the subject's, so the
distribution is real — but everything else in this file still applies, and two limits are its
own.

### Most commits cannot be replayed, and that is the headline

A reverse patch needs the lines it removes to still be there. A fix worth replaying is usually
several commits back, so later work has often rewritten them. `git apply -R --3way` closes most
of the gap — measured 2026-10-05, a plain apply failed on **all six** commits first tried across
both subjects and three-way recovered three of them — and a genuine conflict still cannot be
measured.

First run, `coursera-rag`, 10 commits: **3 replayable, 2 defended, 1 undefended.** On `mcpa`,
**0 of 3** — its commits are enormous (one names 125 files of generated quiz results) and old
enough that everything has moved under them. So this instrument wants a subject with small,
frequent commits, and says `would-not-revert` rather than guessing when it does not have one.

**A replay that could not be performed is never counted.** The denominator is
`defended + undefended`, and a run with nothing measurable prints _no score_ instead of 0% or
100% — the same rule as everywhere else here, and the one this repository keeps having to
re-learn.

### An undefended verdict is not automatically a finding

Reverting a change that cannot affect behaviour will always read as undefended. Documentation,
lockfiles, images and notebooks are excluded by extension for exactly this reason — `.ipynb`
was added after `mcpa` produced a perfectly true and useless finding about two study notebooks
— but **a comment-only edit inside a source file cannot be detected by path.** `coursera-rag`'s
`f8e5171` is one: a `docs:` commit that touched `server/rag.js`, and its undefended verdict says
nothing about the suite. The candidate ranking already sorts such commits to the bottom, since
they carry no evidence of being a fault; the verdict is still worth reading rather than
counting.

### It writes into somebody else's checkout

So it refuses more than it runs: not a git repository, anything uncommitted at all, a red
suite, an unstartable one, an unstable one. It restores after every commit and verifies against
git rather than assuming, because **a reverted source left on disk reads exactly like a suite
that caught the fault.** Both live runs found a hole in that restore — a recreated file git
could not check out, then a conflicted three-way apply whose failure path returned before
restoring — and the second one _reported success over a broken checkout_. Both are pinned in
`tests/integration/bug-replay.int.test.ts`.

## Writing a new set

1. Read the source. Do not open the tests.
2. One entry per rule, with `breaks` phrased as the behaviour a lead would describe —
   "a lab marked pending is refused with 409 rather than started". That sentence is what a
   briefing shows a role, and naming the mutation instead teaches the role to satisfy the
   instrument.
3. Check every anchor resolves to **exactly one** place. An anchor matching two is the same
   defect as one matching none: `String.replace` takes the first, so the mutation lands
   somewhere other than the rule and the score reports a rule as checked that nothing
   checked.
4. Mark roughly a third `holdout`, one from each family of rule.
5. Say in the header what direction the set leans and what it therefore cannot see.
6. Register it in the subject's `app.config.ts` under `mutations`, with the subject's own
   suite for that seam as `baseline`.
7. Score the baseline. If `holdoutPower` reports no live holdouts, move the split.
