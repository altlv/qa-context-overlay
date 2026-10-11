---
name: requirements-sufficiency
description: Decide whether what you have been told is enough to test against, and say what is missing when it is not. Use before designing tests, when a ticket is thin, when "it should just work" is the only stated requirement, or when there is no specification at all. Not for judging whether an observed behaviour is wrong (oracle-check) or for deciding what deserves coverage (risk-assessment).
# The named moves this skill is measured on — terms a report would write, not the steps of the
# procedure. A session is credited when its report names one of these.
methods:
  - ambiguity sweep
  - falsifiability test
  - missing-class sweep
  - contradiction check
  - oracle inventory
  - stated assumption
---

A test is a claim that something is wrong. You cannot make that claim from a requirement
that does not say what right looks like — and the usual failure is not noticing, then
writing tests that encode whatever the implementation happens to do.

This skill is the step before design. It answers one question: **is there enough here to
tell a pass from a fail, and if not, what exactly is missing?**

## When to use

- Before `test-design`, whenever the requirement is a sentence rather than a rule
- When a ticket says "should work correctly", "handle errors gracefully", "be fast"
- When you are about to write a test and find yourself reading the source to decide what
  the expected value is — that is the signal, and it means the implementation has become
  the oracle
- When **there is no specification at all**, which in this repository is the normal case:
  most subjects are third-party sites with no stated requirements whatsoever

## When NOT to use

- Judging whether a behaviour you have already observed is a defect → `oracle-check`
- Deciding how much testing something deserves → `risk-assessment`
- Recovering a rule the product implements from the product itself → `rule-modelling`

The boundary with `oracle-check` is worth stating plainly, because they look alike:
**this decides whether you can design a test; `oracle-check` decides whether something
you saw is wrong.** One runs before you touch the product, the other after.

## Operating rules

- **Never fill a gap silently.** An assumption you did not write down becomes a test
  nobody can argue with, and when it is wrong the test is confidently wrong. Write it as
  a stated assumption, and say which tests rest on it.
- **The implementation is never the oracle for the requirement.** If the only way to know
  the expected output is to run the code, you are not testing — you are transcribing.
  `rule-modelling` says the same thing about rules, for the same reason.
- **"Insufficient" is a finding, not a blocker.** It is the cheapest finding in testing:
  raised before anything is built, it costs a conversation; raised after release, it costs
  a defect and an argument about whether it is one.

## Procedure

### 1. Ambiguity sweep

Read the requirement and mark every word that cannot be measured. The recurring classes:

| Pattern                  | Example                        | What to ask                                        |
| ------------------------ | ------------------------------ | -------------------------------------------------- |
| Unquantified adjective   | fast, large, recent, simple    | How fast, measured where, at what percentile?      |
| Passive voice hiding who | "the order is cancelled"       | By whom, and who may not?                          |
| Undefined term           | "active user", "valid request" | Defined where? Is there a second definition?       |
| Missing units            | "a timeout of 30"              | Seconds? Per attempt or total?                     |
| Missing precision        | "the total"                    | Rounded how, at which step, in which currency?     |
| Implicit state           | "the user can retry"           | From which states? How many times?                 |
| Unbounded list           | "etc.", "and so on"            | Name the rest, or say the set is open and untested |

### 2. Falsifiability test

For each stated requirement, write the sentence that would make it **fail**. If you
cannot write one, the requirement is not testable as worded, and that is the finding.
"The page should be user-friendly" has no failing sentence. "A first-time visitor can
complete checkout without leaving the page" has several.

### 3. Missing-class sweep

Requirements describe the happy path; defects live elsewhere. Walk these and mark each
as stated, or as a gap:

- **Empty, zero, one, many, too many** — what happens at each
- **Error paths** — what the user sees, and what the system keeps, when a dependency fails
- **Permissions** — who may not do this, and what they see instead
- **Persistence** — what survives a reload, a new session, a second device
- **Concurrency** — two people, or one person twice
- **Limits** — lengths, sizes, rates, and the behaviour _at_ them rather than past them
- **Time** — timezones, expiry, clock skew, the boundary of a day
- **Locale and encoding** — what a name, a number and a date look like elsewhere
- **Reversal** — how this is undone, and whether undoing it is complete

A requirement that states none of these is not a small requirement; it is a large one
with most of itself missing.

### 4. Contradiction check

Two requirements that cannot both hold are worth more than ten that are vague, because
somebody has to decide and the decision is being made by accident today. Check the
requirement against: its own acceptance criteria, the rest of the specification, the UI
copy, the error messages, and the help text. Products contradict themselves most often
between a message and a rule.

### 5. Oracle inventory — the step for when there is no specification

Most subjects here have no stated requirements, so "insufficient" would be the answer
every time and would be useless. Instead, inventory what oracles _do_ exist, in rough
order of strength:

1. **The product's own claims** — labels, headings, button text, help text, error
   messages, structured data, the page title. A control labelled "View 10" claims
   something falsifiable.
2. **Internal consistency** — the same fact in two places, an arithmetic relationship, a
   list count against a stated total. The strongest oracle available without a spec.
3. **Standards** — WCAG, HTTP semantics, currency and date formatting, the platform's own
   conventions. A standard is a requirement somebody else already wrote down.
4. **Comparable products** — what every other storefront does. Weak alone, useful for
   raising a question.
5. **The absence of a crash** — the weakest, and not a pass. A page that renders is not a
   page that is right.

Name which oracle each planned test will use. A test with no named oracle is a test that
will be argued away.

### 6. Verdict and hand-off

State one of three, and never leave it implicit:

- **Sufficient** — tests can be designed and traced. Proceed to `test-design`.
- **Sufficient with assumptions** — list each assumption, what it affects, and how it
  would be settled. Proceed, and mark the affected tests as resting on it.
- **Insufficient** — name the questions that must be answered first, each with the
  decision it blocks. Do not proceed to design against the implementation.

## Decision points

| Situation                                          | Action                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| You are reading the source to find expected values | Stop. The implementation has become the oracle; raise insufficiency instead.                  |
| No specification exists at all                     | Run step 5 and proceed on oracles, not on assumed intent                                      |
| A requirement is ambiguous but low-risk            | State the assumption and carry on — `risk-assessment` decides if it is worth the conversation |
| Two requirements conflict                          | Raise it as a defect in the specification, with both quotations                               |
| Acceptance criteria exist but are untestable       | Rewrite them as falsifiable sentences and get them confirmed                                  |

## Interlaying (blind spot)

This says nothing about whether the requirement is a _good_ one — whether the feature is
worth building, or whether users want it. It also cannot tell you that a requirement is
missing entirely: it works from what you were given, and a dimension nobody mentioned
looks the same as one that does not apply. Step 3 is the partial defence, and it is a
checklist rather than a proof.

It has no instrument. Everything here is a reading, so two people will disagree — which
is the point: the disagreement is the finding, and it is cheaper now than after release.

_Lineage and licences: `docs/sources.md`._
