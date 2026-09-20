# Report format

Every QA skill in this repo emits the same shape: **YAML frontmatter a script can
read, a markdown body a human can read.**

One envelope, not one template per skill. An agent learns a single format, and
`npm run check-report` can verify any of them.

## Why the frontmatter looks like that

Three fields are doing work beyond record-keeping:

- **`evidence`** forces the Direct / Inferred / Claimed distinction into the format.
  An agent cannot state a conclusion without saying how well it is supported, and the
  checker refuses a blocker that rests on anything but direct evidence.
- **`not_covered`** is required. An empty list is a claim of complete coverage, and
  the checker warns about it. Gaps have to be declared, not silently omitted.
- **`not_run`** captures checks that were expected but did not happen. Silence about
  a skipped check reads as a pass.

## Envelope

```yaml
---
report: test-design | bug | exploratory-session | testability | flake | gate | triage
target: apps/countdown-timer # app, feature, URL, or test
date: 2026-09-09 # YYYY-MM-DD
author: e2e-coder # agent name or person
verdict: PASS | CONDITIONAL | FAIL | INFO # optional; omit for pure findings reports
confidence: high | medium | low
evidence:
  direct: 3 # observed — a test result, a captured response, a file:line
  inferred: 1 # deduced, with the reasoning shown in the body
  claimed: 0 # asserted but unverified
findings:
  - id: F1
    severity: blocker | major | minor | question | observation
    evidence: direct | inferred | claimed
    summary: One sentence stating the defect or observation.
    where: apps/todo-fixture/tests/todos.api.spec.ts:42
    basis: Internal consistency — the list and the detail view disagree.
not_covered:
  - Mobile viewports — desktop Chrome only.
not_run:
  - npm run test:external — third-party site was unreachable.
commit: 6e03534 # test-design only — the commit it was written against, for the staleness warning
charter: # exploratory-session only, and required there
  explore: the cart and checkout flow
  resources: a seeded account, desktop Chrome
  to_discover: where totals and stock disagree
  timebox: 45 minutes
  lenses: # REQUIRED, and at least two — one persona for a whole session is a blindfold
    - a first-time buyer # discoverability
    - a keyboard-only shopper # barriers
    - a phone-sized screen # layout collapse
  constraint: without touching the admin panel # optional, and not warned about when absent
preflight: # exploratory-session only, and required there — the visual-inspection sweep
  position: checked at 1280, 768 and 375 wide; the basket summary wraps under 400
  state: empty, one item, and the out-of-stock error all rendered
  zoom: legible at 200%; nothing clipped at 50%
  keyboard: tab reaches every control; focus ring visible throughout
  contrast: body text passes; the muted stock note is borderline at 4.2:1
  document_head: title, charset and viewport present; favicon 404s
coverage_candidates: # exploratory-session: which findings deserve permanent coverage
  - O1
cases: # test-design only, and required there
  - id: C1
    level: api # unit | integration | api | e2e | exploratory
    technique: boundary values
    summary: A title at the maximum length is stored whole.
    heuristic: boundary-length # optional — the npm run ideas id it came from
---
```

## Body

Free markdown, but lead with these in order:

1. **Summary** — one paragraph. What was done, what it means.
2. **Findings** — one section per finding id, with steps and evidence.
3. **Not covered** — expand on the frontmatter list where it needs explaining.
4. **Next** — concrete actions, owned.

## Rules the checker enforces

| Rule                                                                       | Level   |
| -------------------------------------------------------------------------- | ------- |
| A `blocker` must carry `direct` evidence                                   | error   |
| `claimed` evidence is only valid on a `question`                           | error   |
| A `PASS` verdict cannot coexist with claimed evidence                      | error   |
| Findings should have a `basis` — the oracle or check that says it is wrong | warning |
| `evidence` counts should total the number of findings                      | warning |
| `not_covered` should not be empty                                          | warning |
| Some evidence should be `direct`                                           | warning |
| An `observation` must carry `direct` evidence                              | error   |
| **Session:** `exploratory-session` needs a `charter`                       | error   |
| **Session:** every defect claim needs a `basis` — warning in other reports | error   |
| **Session:** no observations recorded                                      | warning |
| **Session:** no questions raised                                           | warning |
| **Session:** `coverage_candidates` empty                                   | warning |
| **Session:** charter names fewer than two `lenses`                         | error   |
| **Session:** no `preflight` block — the sweep is declared, never silent    | error   |

```bash
npm run check-report                 # everything under reports/
npm run check-report -- path/to.md   # one file
```

Exit code is non-zero on any error, so it can gate CI.

## Evidence types

| Type         | Means           | Needs                                                |
| ------------ | --------------- | ---------------------------------------------------- |
| **direct**   | You observed it | A test result, response, screenshot, or `file:line`  |
| **inferred** | You deduced it  | The reasoning chain shown in the body, not "I think" |
| **claimed**  | Someone said so | Marking as unverified, plus what would verify it     |

Documentation is `claimed` until checked. A README describes intent, not behaviour.

**Silent failures are the dangerous ones.** A passing test that asserts nothing
reports success while the system is broken, and nobody investigates green. When
classifying a green result as direct evidence, ask whether the test verified the
_behaviour_ or only the _shape_.

**When the evidence is AI-generated**, verify it was actually gathered rather than
plausibly generated: does the result contain a specific value that could only come
from the real system? Did the tool actually run? An agent reporting "all tests pass"
without running them is presenting claimed evidence as direct — the worst
classification error available.

## Where reports live

`reports/` at the repo root, gitignored by default. Commit one when it is a durable
record — a testability audit you want to diff against next quarter, or the evidence
behind a release decision.
