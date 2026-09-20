---
name: rule-modelling
description: Recover the rule a product implements, write it as a table, enumerate its classes, and test the classes rather than examples. Use when behaviour is governed by a rule — validation, eligibility, pricing, permissions, formatting, scoring, routing, retention — rather than by a control you can see. Not for choosing values for a visible input (test-techniques) or for unscripted discovery (exploratory-session).
---

`test-techniques` derives values from a **control**: a field's type, its declared
bounds, a toggle's states. This derives them from a **rule**.

The distinction matters because the two live in different places. A control is in the
markup, so a scan finds it and a generator can produce ideas for it. A rule is in
someone's head, a specification, or a function — and no scan has ever revealed one.
When a product's whole purpose is to apply a rule, its defects are in the rule, and a
session that only probes the visible controls will test the box the rule lives in.

## When to use

- The product decides something: who is eligible, what it costs, what is allowed,
  what is flagged, where it routes, how long it is kept
- A single input produces a judgement rather than a value
- Behaviour depends on the _meaning_ of the input, not only its shape or length
- Mid-session: you have found the thing the product exists to do, and it is a rule

## When NOT to use

- The input has a declared bound and no semantics — that is `test-techniques`
- You are deciding whether an area deserves coverage at all — `risk-assessment`
- You have no rule yet and are looking for one — `exploratory-session` first

## Procedure

### 1. Recover the rule, and record where each clause came from

Sources, most independent first:

| Source                                                           | Independence | Note                                          |
| ---------------------------------------------------------------- | ------------ | --------------------------------------------- |
| Specification, acceptance criteria, ticket                       | High         | What it _should_ do                           |
| A standard, regulation or domain authority                       | High         | Often the only oracle worth having            |
| The product's own claims — help text, labels, headings, tooltips | Medium       | The product committing to something in public |
| Observed behaviour                                               | Low          | What it _does_                                |
| The implementation — source, config, error strings               | **None**     | See step 3                                    |

Write the rule as prose first, clause by clause, tagging each clause with its source.
You will need those tags, and reconstructing them later is guesswork.

Where sources disagree, **stop** — that disagreement is a finding before you have
tested anything. A help text that describes one rule and a function that implements
another is a defect in whichever one users rely on.

### 2. Write it as a table

Conditions across, outcome down. One row per distinct outcome.

```
Discount eligibility
| order total | member | first order | promo code | → discount |
| < 50        | any    | any         | none       | → 0%       |
| >= 50       | no     | any         | none       | → 5%       |
| >= 50       | yes    | any         | none       | → 10%      |
| any         | any    | yes         | any        | → 15%      |
```

Two things fall out of writing it down that never fall out of holding it in your head:
**the dimensions** (here: total, membership, order history, promo) and **the rows
nobody specified** — what happens to a member on a first order with a promo code? The
table has a hole, and holes are where defects live.

### 3. Choose the oracle — and do not let the implementation be it

**A rule recovered from the implementation describes what the code does, not what it
should do. It may generate inputs. It can never judge them.**

This is the one rule in this skill that is not a heuristic. Breaking it produces a
_confident clean result_, which is worse than a miss, because it closes the question.

The failure looks like this every time: you read the code to learn the rule, you
derive your expected values from that rule, you run them, the product agrees with
itself, and you record a pass. You have verified that the function is the function.

> **Worked example.** A word-count feature splits input on spaces. You read that,
> derive "three spaces means four words", test it, and it agrees. But the domain's
> rule is _words_, and several writing systems do not put spaces between them. The
> implementation's rule and your oracle were the same rule, so the defect was
> invisible — not missed through lack of effort, but ruled out by construction.

So: when the only available rule came from the code, say so, and name a _different_
oracle for judging. Independent oracles, roughly in order of strength:

1. A specification or standard that predates the implementation
2. A domain authority — how the field, the regulation or the language actually works
3. The product's own public claims, which it is bound by whether or not the code agrees
4. Comparable products, for conventions the product has not claimed
5. A competent user's reasonable expectation, stated explicitly as such

If none of those exist, you do not have a defect — you have a **question**. Raise it.

### 4. Enumerate classes per dimension, including the ones the rule does not mention

For each dimension, list the values that _should_ behave identically. Then add the
classes the rule is silent about, because that silence is untested by definition:

- The dimension's natural boundaries and the values either side
- Forms the rule's author probably had in mind, and forms they probably did not
- The same meaning expressed differently — abbreviations, synonyms, alternative
  notations, different scripts, different casing, different punctuation
- The same surface form meaning something else
- Absent, empty, and malformed

### 5. Probe the four failure shapes

Every rule fails in the same four ways. This is the part worth remembering, because it
transfers to any rule in any product:

| Shape                 | The rule…                                                   | Probe with                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **False positive**    | fires where its own definition says it must not             | Subjects that _look_ like the target but are not — a homograph, a quoted example, an escaped form, a name that matches a keyword                                            |
| **False negative**    | does not fire where its definition says it must             | The target expressed in an unusual but valid form — an alternative notation, a different script, an abbreviation, a compound                                                |
| **Context blindness** | matched a surface form without its meaning                  | The target embedded in something larger, or a word that is also something else in another sense                                                                             |
| **Boundary leakage**  | split the subject differently from how the domain splits it | Separators the domain treats as internal — hyphens, apostrophes, underscores, digits, decimals, combining marks — and separators the _domain_ uses that the parser does not |

Two more that apply once a product has more than one rule:

- **Order dependence** — the same inputs in a different sequence give a different
  outcome, with nothing saying order matters
- **Interaction** — two rules that are each correct produce a wrong result together,
  which is the case a single-rule table cannot show and a decision table can

### 6. Test classes, not examples

One representative per class, plus the boundary between adjacent classes, plus one
deliberate probe per failure shape above. A second example from a class you have
already covered tells you nothing new and costs the same as a new class.

## When you are done

- Every row of the table has at least one case, including the rows the specification
  did not mention
- Every dimension has a representative from each class, including classes the rule is
  silent about
- Each of the four failure shapes has at least one deliberate probe against it
- The oracle is named and is **not** the implementation
- Where clauses came from disagreeing sources, that is reported

## Output

Carry the rule table into the report. It is the coverage evidence: a reader can see
which rows were exercised and which were not, which no list of test cases conveys.
State the oracle beside it, and for any clause recovered only from the implementation,
mark it — a reader needs to know which parts of your model are a description of the
code rather than a statement about what is correct.

Findings from this work are usually **specification questions** as often as defects.
A rule that no source defines is not a broken rule; it is an undefined one, and the
product owner decides which.
