---
name: exploratory-session
description: Run a chartered, time-boxed exploratory session against a running app and report observations, questions and defects separately. Use when asked to explore a feature, find what nobody specified, or investigate an area before designing tests. Not for executing a known checklist.

# The named moves this skill is measured on. A session is credited with using this skill when
# its report names one of these, so they are the terms of art and not the procedure: the steps
# ("Write the charter", "Debrief") are what every session does, while these are what it chose
# to do. Single words and whole sentences are deliberately absent — "Observations" appears in
# every report and "Do not stop at what you expected" appears in none.
methods:
  - bugs cluster
  - the same bug lives elsewhere
  - rumble strip
  - error-message marathon
  - déjà vu
  - test-investigate-setup-record
---

Scripted tests check what someone already thought of. This finds what nobody did. It
is structured work, not clicking around — the structure is the charter and the notes.

## When to use

- A new app or feature has landed and nobody knows its edges yet
- Before `test-design`, to learn what is worth designing for
- After a fix, to check what else the change disturbed
- The state model in `apps/<app>/coverage.md` has cells nobody has verified

## When NOT to use

- You already know what to test → `test-design`
- You are verifying a known list → run the suite
- You have a specific defect to write up → `bug-report`

## Operating rules

- **Charter before exploring.** No charter is ad-hoc clicking with better branding.
- **Observe, then conclude.** Record "I saw X", not "X is broken". The conclusion is
  a separate step and needs an oracle.
- **Absence of findings is a finding**, but only within the charter's scope. "No
  issues found" is coverage evidence for what you explored, not for the feature.

## Procedure

### 1. Write the charter (2 min)

```
Explore    <target>
With       <resources: data, roles, tools, network conditions>
To discover <what class of information you are hunting>
Timebox    <15 / 45 / 90 minutes>
```

Add a **persona** — different personas find different bugs. A first-time user finds
discoverability problems; a keyboard-only user finds barriers; an admin finds
permission leaks.

Add a **constraint** to sharpen focus by deliberately excluding something: "without
touching the UI", "only error paths", "only with the clock skewed".

### 2. Set the box and start (decide before starting)

Set a timer. First impressions happen once — the early minutes are the most valuable
and the least repeatable.

### 3. Explore (the session)

Cycle: **test** (interact, observe) · **investigate** (reproduce, isolate) ·
**setup** (data, state) · **record**.

Watch the split. If setup consistently eats more than a fifth of the session, the
environment is the finding. If investigation dominates, the area may be too broken for
exploration — switch to structured work.

Apply `oracle-check` continuously — "is this consistent with the docs? with the rest
of the product? with itself?"

### What to do when you find something

The moves most often skipped, and the reason a session reports one defect and moves
on when it should have reported five:

- **Bugs cluster.** You found one. Test harder _right there_ before going anywhere
  else. This is the single most valuable move on the list and the easiest to skip,
  because finding something feels like finishing something.
- **The same bug lives elsewhere.** A defect in one place usually exists in its
  siblings. Found a wrong total in the cart? Check the order summary, the email, the
  invoice.
- **Rumble strip.** Something slightly odd means something badly wrong may be nearby.
  Odd is a direction, not a verdict.
- **Do not stop at what you expected.** Confirming your hypothesis ends the hunt
  early. Look around it.
- **Error-message marathon.** Trigger every error you can, then test hard _after_
  dismissing each one. Recovery paths are where state goes bad.
- **Déjà vu.** Reproduce every error you see. If the message changes on a second
  identical attempt, something underneath is not deterministic.

### Turning a finding into coverage, mid-session

The moment you find a field with a declared bound, a rule with conditions, or
anything with modes — that is not a different activity to be scheduled later. Reach
for `test-techniques` and spend the six values now, while you are looking at it.

### Moves this harness gives you

- Run `npm run scan -- <url>` first and read the **map** section. It tells you how
  large the play area is, and lists every input with the bounds the page declared.
- Watch the network capture, not just the page. A silent 4xx behind a cheerful UI is
  the defect class this repo exists to catch.
- Compare state before and after an action, not just the end state. Transitions hide
  more than destinations.
- Drive `page.clock` to reach states real time makes expensive — expiry, timeout,
  midnight rollover, long idle. (Needs a spec; an agent with shell access only cannot
  reach it.)
- **Look at the rendered page, not only the DOM** — and look the way
  `visual-inspection` says to, not once at whatever the viewport happened to hold.
  Its pre-flight is five checks and under two minutes, and it is where the cheapest
  findings of any session come from.

When stuck: ask someone, read the source, or reason from a system you already know.

### 4. Debrief (5 min)

Report four things, kept apart:

- **Observations** — what happened, with steps and data
- **Questions** — looked odd, unconfirmed, needs a decision from someone
- **Defects** — reproducible, with a named oracle
- **Not reached** — what the charter did not cover, and why

Then: which findings deserve permanent automated coverage? A session that yields no
candidate regression test probably explored well-covered ground.

## Decision points

| Situation                       | Action                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Nothing seems wrong             | Record that, scoped to the charter. It is coverage evidence.                        |
| Session drifts off charter      | Note the drift as a finding, then either return or consciously rewrite the charter. |
| Found something big mid-session | Note it, keep exploring. Full write-up after, via `bug-report`.                     |
| No oracle applies to a finding  | Raise it as a question, not a defect.                                               |
| Timebox expires mid-thread      | Stop. Record where you were. Unfinished is fine; unrecorded is not.                 |

## Interlaying (blind spot)

One session, one charter, one perspective. It gives no coverage confidence beyond its
own scope, and it does not produce regression protection — findings have to be turned
into tests to keep their value. It also relies on noticing, which is exactly what an
agent is weakest at: an agent will happily report a clean session because it never
tried anything surprising. Assign hostile charters deliberately.

_Lineage and licences: `docs/sources.md`._
