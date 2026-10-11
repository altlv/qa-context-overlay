/**
 * A valid, empty exploratory report — the shape, handed over rather than described.
 *
 * **Why this exists.** Sessions do not get the schema wrong because they are careless; they get it
 * wrong because they are writing it from memory. Measured across the reports this harness has
 * kept: 29 total, 19 parse, 3 are prose, 7 are empty files. And on 2026-10-11, the first session
 * told to write its report early did write one at ~230 seconds — with `charter` as a prose block
 * where the schema wants an object, `preflight` as a list of `{check, status, note}` where it wants
 * six named keys, `unknowns` as strings where objects are required, and `report`, `target`, `date`,
 * `author`, `confidence` and `evidence` absent altogether. Sixteen errors. It corrected the shape
 * at the end, which means a run cut short would still have lost everything.
 *
 * The webtestingcourse session *read* `docs/report-format.md` and still produced a different
 * shape. A description of a schema is not a schema. This prints one.
 *
 * **Every block is filled with something a session knows before it explores**, which is the fact
 * that makes early reporting possible at all: the charter is written at step 3, the pre-flight runs
 * before it, and every coverage dimension may honestly read `gap` until it does not. `findings` is
 * an empty list, which is valid.
 *
 * **It must pass the gate with zero errors**, and that is asserted rather than hoped — the unit
 * test runs `auditReport` over this output and fails on any error. Warnings are expected and
 * correct: a session that has found nothing yet *should* be told it has recorded no observations.
 *
 * **Two lenses are named rather than left as placeholders**, because the gate requires at least two
 * and a session held to one persona is blindfolded. The two chosen are the ones that apply to
 * almost any interface, so the skeleton is honest as it stands; a session that keeps them
 * unexamined to the end has still only done what the charter said.
 */

export interface SkeletonInput {
  /** The target as the report's own header wants it: a URL, then the environment in brackets. */
  target: string;
  /** The role writing it. */
  author: string;
  /** ISO date, injected rather than read from the clock so the output is testable. */
  date: string;
  /** What the charter says to explore. Left as a placeholder when the charter is not written yet. */
  explore?: string;
  /** The timebox the charter was given. */
  timebox?: string;
}

const TODO = 'TODO — replace before this report is read as finished';

export function reportSkeleton(input: SkeletonInput): string {
  const explore = input.explore ?? TODO;
  const timebox = input.timebox ?? TODO;
  return `---
report: exploratory-session
target: ${input.target}
date: ${input.date}
author: ${input.author}
verdict: INFO
confidence: low
evidence:
  direct: 0
  inferred: 0
  claimed: 0
findings: []
not_covered:
  - "Session in progress — nothing has been ruled out yet. Replace this with what the charter did not reach, and why."
unknowns:
  - what: "${TODO}: what this session could not find out."
    why: "Nothing established yet; the session has only just started."
    settled_by: "Replace this entry, or delete it once the real unknowns are known."
coverage_candidates:
  - "None yet — nothing is confirmed at this point in the session."
charter:
  explore: ${explore}
  resources: "${TODO}: the browser, the origin it is confined to, and what is forbidden."
  to_discover: "${TODO}: the information this session is buying."
  timebox: ${timebox}
  lenses:
    - a first-time user, for what is discoverable
    - a keyboard-only user, for what is reachable
  constraint: "${TODO}: what this session may not do — commit actions, origins, credentials."
preflight:
  position: "gap — not swept yet."
  state: "gap — no overlay or panel opened yet."
  zoom: "gap — not run at 50% or 200% yet."
  keyboard: "gap — not tabbed yet."
  contrast: "gap — not measured yet."
  document_head: "gap — not read yet."
coverage:
  techniques: "None spent yet. Considered: replace this with what you applied and to what, and what you considered and skipped."
  rules: "gap — no rule recovered yet."
  inputs: "gap — no input probed yet."
  state: "gap — no state transition exercised yet."
  data: "gap — no data cross-checked yet."
  accessibility: "gap — the accessibility tree has not been read yet."
  platform: "gap — one viewport, one browser."
  content: "gap — no literal strings read yet."
  performance: "gap — no measurement taken."
  security: "gap — nothing probed."
---

**This is a skeleton, not a finished report.** It was written early on purpose: from this
point there is a readable report on disk, so whatever stops the run, what was confirmed
before it stopped is already saved.

Rewrite this file whenever a finding survives \`oracle-check\`. Findings live *inside* the
frontmatter above, so each save rewrites the file rather than appending to its end. Move
\`evidence\`, \`verdict\` and every \`gap\` along with it — a stale count in a saved file is a far
smaller problem than no file, but a \`gap\` left in at the end is a claim the session never
looked.
`;
}
