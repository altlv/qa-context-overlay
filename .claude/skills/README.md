# Skills

Recreated from a QA plugin and QA Context Model authored by this repo's owner. The
techniques are recreated in our own words and wired to this repo's actual tooling —
the scanner, the network capture, the quality gate, the app folders.

Selected by **context, not count**: a skill is here when it changes what an agent does
in this repo. Knowledge with no use here is listed below as deliberately absent rather
than padded in.

## Working discipline

| Skill                                         | Purpose                                                                   | Trust |
| --------------------------------------------- | ------------------------------------------------------------------------- | ----- |
| [`work-discipline`](work-discipline/SKILL.md) | Start gate, bounded objective, evidence rules, failure loop, end gate     | 1     |
| [`honesty-check`](honesty-check/SKILL.md)     | Self-audit against known AI failure patterns before claiming work is done | 1     |

## Deciding what to test

| Skill                                                 | Purpose                                                                     | Trust |
| ----------------------------------------------------- | --------------------------------------------------------------------------- | ----- |
| [`risk-assessment`](risk-assessment/SKILL.md)         | How much testing an area deserves, scored so the decision is defensible     | 1     |
| [`test-design`](test-design/SKILL.md)                 | What to test and at which level — decomposition, techniques, traceability   | 1     |
| [`exploratory-session`](exploratory-session/SKILL.md) | Chartered discovery of what nobody specified                                | 1     |
| [`test-techniques`](test-techniques/SKILL.md)         | Deriving the cases a technique actually produces, and its coverage bar      | 1     |
| [`rule-modelling`](rule-modelling/SKILL.md)           | Recovering the rule a product applies, and testing its classes not examples | 1     |

## Looking at a running product

| Skill                                             | Purpose                                                                   | Trust |
| ------------------------------------------------- | ------------------------------------------------------------------------- | ----- |
| [`visual-inspection`](visual-inspection/SKILL.md) | Method for looking: pre-flight, position x state sweep, forced conditions | 1     |

## Writing tests

| Skill                                             | Purpose                                                                            | Trust |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- | ----- |
| [`pwtest`](pwtest/SKILL.md)                       | Generate Playwright UI/API tests: scan → design → approve → generate → run → debug | 1     |
| [`testability-audit`](testability-audit/SKILL.md) | Why automation here is fragile, and the concrete fixes to ask for                  | 1     |

## Judging findings

| Skill                                                   | Purpose                                                      | Trust |
| ------------------------------------------------------- | ------------------------------------------------------------ | ----- |
| [`oracle-check`](oracle-check/SKILL.md)                 | Is this actually a bug? Name the consistency it violates     | 1     |
| [`bug-report`](bug-report/SKILL.md)                     | Investigate and write it up so it gets fixed                 | 1     |
| [`flaky-test-detection`](flaky-test-detection/SKILL.md) | Diagnose intermittent failures instead of retrying them away | 1     |

## Routing

Do not load the catalogue. Load one or two skills for the task in front of you.

| Task                              | Load                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| "what should I test"              | `risk-assessment` → `test-design`                                       |
| "which values, which cases"       | `npm run ideas -- <scan.json>`, then `test-techniques`                  |
| "the product _decides_ something" | `rule-modelling` — table the rule, and never let the code be the oracle |
| "look at this page"               | `visual-inspection`                                                     |
| "write tests for this"            | `pwtest`                                                                |
| "explore this feature"            | `exploratory-session` + `oracle-check`                                  |
| "is this a bug"                   | `oracle-check`                                                          |
| "write this up"                   | `bug-report`                                                            |
| "this test is flaky"              | `flaky-test-detection`                                                  |
| "why do our tests keep breaking"  | `testability-audit`                                                     |
| "is this ready to ship"           | `npm run gate`, then read the verdict                                   |
| any non-trivial task              | `work-discipline` at the start, `honesty-check` before claiming done    |

## Deliberately absent

The source set covers ground this harness cannot currently act on. Listed so the gap is
a decision rather than an oversight:

**No system to apply them to yet** — chaos and resilience, observability verification,
database and migration testing, performance and load, damage control after a production
incident, production quality insights. All need a running system with real
infrastructure. Worth recreating when this harness is pointed at one.

**No requirements pipeline here** — requirements sufficiency, INVEST scoring, change
triage, regression selection. These operate on tickets, diffs and an existing suite.
They become useful the moment this harness is used against a real project rather than
practice apps.

**Adjacent specialisms** — accessibility, security, compliance, fairness, AI evaluation
and adversarial testing. Each is a discipline rather than a skill file, and a thin
recreation would be worse than an honest pointer.

## Output

Every skill emits the same envelope — YAML frontmatter a script can read, markdown a
human can read. See [`docs/report-format.md`](../../docs/report-format.md).

```bash
npm run check-report                 # validate everything under reports/
npm run check-report -- <file>       # validate one
```

The checker refuses a blocker that rests on anything but direct evidence, refuses a
PASS built on claimed evidence, and warns when `not_covered` is empty. That is what
makes these skills tier 2 rather than tier 1: their output is deterministically
checkable, not just described.

A worked example: [`examples/reports/testability-countdown-timer.md`](../../examples/reports/testability-countdown-timer.md).

## Trust tiers

The tier says how far to trust a skill's output versus verify it independently.

| Tier | Meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| 0    | Prose guidance. No defined output, no check.                                     |
| 1    | Defines what a good output looks like — a format, a checklist, a worked example. |
| 2    | A script or deterministic check can verify the output.                           |
| 3    | Has evals with at least three cases and a recorded pass rate.                    |

Skills that emit a report are **tier 2**: `npm run check-report` verifies the output
deterministically. `pwtest` is tier 2 by a different route — its output is Playwright
specs, and `npm run assert-quality` checks them.

Nothing is tier 3; that needs evals with a recorded pass rate, and none of these has
been run enough times to claim one. Judgement-heavy skills like `exploratory-session`
are tier 1 on their reasoning and tier 2 only on the shape of what they hand back —
a schema cannot tell you whether the exploration was any good.

## Conventions

A skill is a folder with `SKILL.md` and frontmatter carrying `name` and `description`.
The description decides whether the skill gets selected, so write it as _when to use
this_, not as a title. Long reference material goes in sibling files (`patterns/`) read
on demand — the body stays short enough to load cheaply.

Every skill carries a **Interlaying (blind spot)** section naming what it does not
cover. A skill that claims no blind spot has not been thought about.

Agent roles are separate: [`src/agents/roles.ts`](../../src/agents/roles.ts) holds SDK
`AgentDefinition`s, invoked programmatically rather than by a human typing a name.

**Every skill here is declared by at least one role, and that is enforced** —
`tests/unit/roles.test.ts` fails on any skill no role loads. A skill nothing reads is a
skill that does not exist, which is what `work-discipline` and `honesty-check` were
until it was checked.

The pairing is written twice on purpose, and the two halves must agree:

| Half                      | Job                                                            |
| ------------------------- | -------------------------------------------------------------- |
| the role's `skills` array | the SDK preloads these into the agent's context                |
| the role's prompt prose   | says **when** to reach for each one, which an array cannot say |

The two cross-cutting skills are declared through `SHARED_SKILLS` in
`src/agents/common.ts`, so every role gets them: `work-discipline` alongside the
guardrails, `honesty-check` in the output contract, at the moment each applies.

Which skills a role may hold follows from its **family** — `coding` produces
automation, `testing` produces judgement. `risk-assessment` and `oracle-check` reach
the testing family only; a coder that ranks its own risk is justifying the scope of the
code it is already writing.
