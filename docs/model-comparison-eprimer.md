# sonnet vs opus against eprimer, scored

**Date:** 2026-09-20 · **Target:** eprimer/test · **Base commit:** `8e2d04a`
**Role:** `exploratory-tester` · **Charter:** byte-identical between runs, read from a file
**Settings:** `--scan --snapshots none`, `AGENT_SPEND=measure`, `AGENT_TIMEOUT_MS=1800000`
**Only difference:** `HARNESS_MODEL`

Spend was **measured, not capped**. Neither run was stopped by anything.

This replaces an earlier pair of runs whose charter was defective — see §5.

---

## 1. What each run spent

|                            | sonnet                        | opus                    |
| -------------------------- | ----------------------------- | ----------------------- |
| Turn ceiling (tier-scaled) | 250                           | 200                     |
| Turns used                 | 89                            | 53                      |
| **Spend (measured)**       | **$3.0589** (0.76× ref)       | **$4.9835** (1.25× ref) |
| Wall clock                 | 587 s                         | 757 s                   |
| Browser actions            | 19 of 100                     | **11** of 100           |
| States visited             | 1                             | 1                       |
| Missed looks               | 0                             | 0                       |
| Page transitions           | 17                            | 9                       |
| Bash refusals              | 0                             | 0                       |
| **Stopped by**             | **nothing**                   | **nothing**             |
| Post-run gate              | FAIL — harness defect, see §5 | **PASS**                |

Opus did **less** and found **more**: 40% fewer turns, 42% fewer actions, 2.25× the
defects. The first pair of runs had them at 69 vs 70 turns and 20 vs 19 actions, so
this is a change in how opus worked, not a repeat of the same shape.

## 2. What each run found

|                                           | sonnet         | opus           |
| ----------------------------------------- | -------------- | -------------- |
| Blocker                                   | 0              | **2**          |
| Major                                     | 4              | 4              |
| Minor                                     | 0              | 3              |
| **Defect claims**                         | **4**          | **9**          |
| Observations                              | 5              | 4              |
| Questions                                 | 1              | 2              |
| Evidence: direct / inferred / **claimed** | 10 / 0 / **0** | 14 / 1 / **0** |
| Defects with a named oracle               | 4 of 4         | 9 of 9         |
| `not_covered` entries                     | 6              | 9              |
| Lenses rotated                            | 4              | 5              |
| `check-report`                            | **OK**         | **OK**         |

Neither made an unsupported claim. Both declared every pre-flight check, including
the ones they did not perform.

## 3. Scored against the seeded key

eprimer ships `bugs.js`: **72 deliberately seeded defects**, 24 flagged `highImpact`.
Mapping each report's findings onto those ids is **my judgement, not an automated
score** — the ids are listed so the mapping can be audited and disputed.

|                        | sonnet  | opus      |
| ---------------------- | ------- | --------- |
| Seeded bugs hit        | **8**   | **19**    |
| Recall, all 72         | **11%** | **26%**   |
| Recall, 24 high-impact | **29%** | **46%**   |
| Cost per seeded bug    | $0.38   | **$0.26** |
| Seeded bugs per action | 0.42    | **1.73**  |

**sonnet →** #1 (`'re` never detected), #8 (possessives flagged), #30 (not responsive),
#33 (scrolling blocked), #39 / #40 (non-English breaks the scanner), #52 (favicon 404),
#71 (no viewport meta).

**opus →** #8, #10 (word count wrong with newlines), #11 (newline-separated words
counted as one), #12 (only spaces separate words), #30, #33, #35 (image has no alt),
#36 / #37 (contrast failures), #39 / #40, #42 (colour coding unexplained), #52,
#60 (digit beside letters invents a violation), #63 (words on separate lines joined),
#64 (typed HTML entities decoded), #70 (word with two apostrophes checked from the
wrong one), #71, #74 (no charset meta).

**The cost result inverts the intuition.** Opus costs 1.63× more per session and finds
2.4× more seeded bugs, so it is **cheaper per bug found** — $0.26 against $0.38. On
this subject, paying for sonnet to find fewer bugs is the more expensive option.

### One honest disagreement with the key

Seeded bug **#32, "Performance degrades with large input"** (high-impact) is not
confirmed. Opus tested it directly and recorded the opposite as O2: **55,000 characters
processed in 17.7 ms**, counts correct, no `maxlength` on the field. Either the defect
needs a trigger opus did not reach, or it does not reproduce at that size. It is
counted as a miss for both runs, not as a hit for opus — but the evidence points at
the key, not at the session.

## 4. Did sonnet hold up?

**Better than the first comparison suggested, and still behind.**

Sonnet is not sloppy. Ten direct evidence items, zero claimed, four oracles for four
defects, and it fetched `eprime.js` rather than guessing the rule from black-box output
— a maintainer-lens move that produced its sharpest finding (F3, possessives and real
contractions treated identically, cited to `isApostropheEprime` at lines 51–64). It also
produced the single most valuable finding of either run, and it was about **us**: see §5.

Where it falls short is **measurement discipline**. Its pre-flight says contrast was
"not measured with a contrast tool — visual impression only from screenshots … plain
black text on white … nothing that read as borderline". Opus computed WCAG ratios from
computed colours and found the two elements that carry the product's entire meaning at
**1.01:1** and **2.18:1** — a blocker-adjacent accessibility failure sitting in plain
sight, which sonnet's eyeball check reported as unremarkable. Same for keyboard: sonnet
tabbed partially and declared the rest a gap; opus recorded four real Tab presses
through a `focusin` listener and confirmed the focus ring's computed outline.

The pattern: **sonnet inspects, opus measures.** Sonnet's gaps are honest and declared,
which is why its report passes — but a declared gap is still a gap, and the seeded key
says the bugs were in those gaps.

**Verdict.** For a session where the report contract and honest scoping matter, sonnet
is sufficient. For finding what nobody specified — the reason this role exists — opus
found 2.4× more, cost less per bug, and did it in 42% fewer actions. On this evidence
the default tier for `exploratory-tester` should be opus, and `TIER_BUDGET` should stop
implying sonnet is the economical choice.

## 5. What these runs proved about the harness

### The charter fix worked, and the size of the effect is the finding

The previous pair of runs used a charter I wrote with a single frozen persona — "a
careful first-time user who reads what the screen says" — and no mandatory pre-flight.

|                                | sonnet      | opus         |
| ------------------------------ | ----------- | ------------ |
| Seeded bugs, old charter       | 3 (4%)      | 5 (7%)       |
| Seeded bugs, corrected charter | **8 (11%)** | **19 (26%)** |
| Improvement                    | **2.7×**    | **3.8×**     |

Nothing about either model changed. The variable was the prompt and the two rules now
enforced in `src/qe/report.ts`: at least two rotated lenses, and a `preflight` block
declared check by check. Every bug in responsiveness, contrast, document head and
encoding that the first pair missed entirely came back in this pair.

**A single persona is worth more than a model upgrade, in the wrong direction.** Old-
charter opus (5) found fewer seeded bugs than new-charter sonnet (8).

### Three harness defects, one new

- **Item 48 reproduced exactly.** Sonnet wrote its report to `reports/` and signed off
  with a summary, so the gate validated the summary and failed it for missing
  frontmatter — while the real 19,935-byte report passes `check-report` cleanly. Opus
  emitted its whole report as its last message and **passed**. Two runs, same contract,
  opposite verdicts, decided by a stylistic choice neither role made deliberately.
- **NEW — the scanner mislabels the app's only action, and it starves the generator.**
  Sonnet raised this as Q1 against our tooling rather than the product. Confirmed by
  dumping the scan: the Check button is classified `affordance=control`, not `submit`,
  because it is a `<button>` with no wrapping `<form>`.

  The consequence is not cosmetic. In `groupIdeas`, four idea families generate inside
  `for (const submit of submits)` — `negative-set`, `double-submit`,
  `back-after-submit` and `reread-after-write` — so all four produce **nothing**. The
  one idea that does generate is also downgraded, because `fieldEffect` is
  `effect(submits.length > 0)`: typing into the textarea is classified as having no
  established effect, which on a tier where `allowWrites` is false would make
  `driver.ts` refuse it and yield **zero** candidate actions for this app.

  **That is why every run of this subject reported "1 candidate action(s)."** Opus's
  own `not_covered` names the gap the harness should have filled — "double-click and
  rapid repeated submission of the check button" — which is precisely what
  `double-submit` exists to prompt.

  What the one surviving idea _did_ deliver is worth recording, because it shows the
  pipeline works when fed: its probe values included `O'Brien`, `🚀漢字éñ`, `"   "` and
  `"x".repeat(1001)`, and those map onto seeded #70, #39/#40, #12 and the #32 probe.
  Opus's F7 — "'John's' is flagged, 'O'Brien's' is not" — is that candidate value
  reaching a finding. Techniques are wired end to end; they were handed one element.

- **Uncommitted docs never reach the run.** The worktree is checked out at the base
  commit, so a change to `docs/report-format.md` is invisible to the agent while the
  gate enforces it from the main repo. The harness already refuses this for `--design`
  ("an uncommitted file never reaches it") and checks nothing for docs or skills.

### Item 10's five things, restated

All five were shown across the two pairs: a preflight refusal, a refused `Bash` call
(`fonts.googleapis.com`, opus, first pair), a worktree created and gated, a gate
verdict — **including the first PASS this harness has produced** — and the injected
context measured at 60,660 chars ≈ 16.4k tokens across 8 skills.

## 6. Bottom line

Measuring spend instead of capping it was the right call: both runs ran to their own
stopping point, so "found little" and "was cut off" are now distinguishable, and the
numbers — $3.06 and $4.98 — are evidence rather than a ceiling artefact.

The experiment's original question was whether sonnet performs close enough to opus
given this project's support. The answer is that **the support was the dominant
variable, not the model.** Fixing one line of charter moved recall more than changing
tier did. Both models obeyed whatever contract they were given, faithfully, twice.

That is the finding worth keeping: this harness's leverage is in what it requires, not
in what it pays for. And its own scanner is still hiding the button.
