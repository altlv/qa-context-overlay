# Task — write the dev-tier unit testing skill

**Repo:** `qa-context-overlay` · **Branch:** `poc/unit-coder-mcpa`
**Context:** `.ai/state/POC-UNIT-CODER.md` (read it first — it says why this is needed)
**Status:** delivered 2026-09-24 on this branch. The skill exists, `unit-coder` declares it,
and it was amended once from its first real use. The conditional `test-doubles` split was not
taken: the doubles material is a small part of the file, and the brief names a third as the
only reason to split. What the skill could not do on its own is recorded in the POC plan's
status section — it had no way to choose a target, so `repo-survey` and two commands were
added beside it.

---

## The gap

This repository has thirteen skills and every one is QA-side: what deserves testing,
which values to use, whether something is a bug, how to report it. `test-techniques`
answers **which values** — partitions, boundaries, decision tables.

**Nothing answers how to write the test well.** A role called `unit-coder` is expected
to do that from general knowledge, ungoverned by anything the repo can point at,
check, or improve.

You are writing that missing document.

## Deliverable

One file: **`.claude/skills/unit-testing/SKILL.md`**

If the doubles material grows past roughly a third of the file, split it into a second
skill `.claude/skills/test-doubles/SKILL.md` and cross-reference. Do not split for any
other reason.

## Read these first, and match them

- `.claude/skills/test-techniques/SKILL.md` — the closest neighbour. Yours must not
  repeat it; it chooses values, you shape the test around them.
- `.claude/skills/oracle-check/SKILL.md` — for how a skill states a rule.
- `.claude/skills/README.md` — for the index and the house line: _"a skill is here when
  it changes what an agent does in this repo."_

## Required shape

Frontmatter, exactly this form:

```yaml
---
name: unit-testing
description: <one sentence on what it does>. Use when <trigger>. Not for <the neighbouring skill and when to use that instead>.
---
```

The `Not for` clause is mandatory and is how the wrong skill stops being selected.

Then, in this order:

1. **One paragraph** distinguishing this from `test-techniques`, in the shape that
   file uses: "X decides A. This decides B."
2. **When to use** / **When NOT to use** — bulleted, concrete.
3. **Procedure** — numbered, each step something an agent can actually do.
4. **A coverage bar** — "when you are done", stated so a person could check it.
5. **Output** — what the work leaves behind.

## The content it must cover

Each of these exists because a real test suite fails without it. Where you can, say
**what goes wrong** when the rule is ignored — that is how the other skills earn their
place, and a list of best practices with no named failure is the thing to avoid.

**The unit and its boundary**

- What the unit under test actually is, and how to find its edge
- Reading a unit before testing it: inputs, outputs, invariants, error paths,
  dependencies, and what it promises its caller
- Why "one unit" is a decision, not a fact about the file

**What to assert**

- The three things worth asserting — returned value, observable state change,
  interaction with a collaborator — and how to choose
- What must never be asserted: how the unit does it internally. Explain why a test
  coupled to implementation fails on every refactor while catching no defect
- Both directions: a checker must fire on bad input **and** stay silent on good input.
  A suite proving only "it reports a problem" would pass for a function that always
  reports a problem

**Test doubles**

- A decision table keyed on **what the dependency does** — returns a value, records
  something, is slow, is non-deterministic, is not yours — rather than on what the
  double is called
- The line that matters: a double standing in for a collaborator is legitimate; a
  double standing in for the unit under test means the test has lost its subject
- When reaching for a double is really a signal the unit is at the wrong level

**Writing the test**

- One reason to fail per test, and why a test asserting five things reports none
  of them clearly when it breaks
- Naming that states the rule, not the function: "should reject a verdict with no
  evidence", never "test schema"
- Arrange / act / assert as a shape, and what it costs when the three blur
- Determinism and isolation: shared mutable state, clocks, ordering, randomness,
  and why a suite that passes only in order is not a suite

**Knowing the tests are worth having**

- Why a green suite proves the tests ran and not that they would notice a fault
- Mutation as the check on the check: break one rule on purpose, the suite must fail,
  a survivor is an assertion hole
- Coverage percentage as a floor and never a goal — say what it cannot see

**Also add one section titled `Compact core`.** Fifteen to twenty-five lines, the rules
that would survive if this were pasted directly into an agent's prompt rather than
read as a file. It must stand alone. (Reason: instrumentation on 2026-09-24 showed a
role opened none of its nine injected skills across 68 tool calls, so this content may
have to live inline — write it so it can.)

## Constraints

- **Stack-neutral in the rules, concrete in the examples.** The first subject uses
  `node:test` with `assert/strict` and CommonJS `require`; this repo itself uses
  Playwright with TypeScript. Rules must hold for both. Where an example helps, plain
  JavaScript is fine — do not write a skill that only makes sense under one runner.
- **Invent no facts about this repository.** Do not name files, commands or conventions
  you have not read. If you need one, describe the shape instead.
- **No framework advocacy**, no tool recommendations, no dependencies.
- **British spelling**, sentence case in headings, no emoji.
- Prose that says something. Avoid "it is important to" and "best practices dictate" —
  state the rule and the failure it prevents.
- Roughly 150–260 lines. Shorter and it is a checklist; longer and nobody reads it.

## Done when

- A person can read it and grade an unfamiliar unit test file against it
- Every rule names, or clearly implies, the failure it prevents
- The `Not for` clause sends the reader to `test-techniques` correctly
- `Compact core` stands alone if lifted out
- Nothing in it contradicts `test-techniques`

## How to hand it back

Commit on branch `poc/unit-coder-mcpa`, one commit, message stating what the skill
covers and what it deliberately leaves to `test-techniques`. Do not modify any other
file — the role wiring, the app config and the evaluation harness are being built in
parallel on the same branch.
