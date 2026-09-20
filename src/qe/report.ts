import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * One report envelope for every QA skill.
 *
 * The source model this harness inherits from has 33 separate templates, one per
 * skill. That is fine for a person filling one in; it is a lot of surface for an
 * agent, and none of it is machine-readable. This is a single shape instead:
 * YAML frontmatter a script can read, a markdown body a human can read.
 *
 * The frontmatter is doing real work. `evidence` forces the Direct / Inferred /
 * Claimed distinction into the format, so an agent cannot report a conclusion
 * without saying how well it is supported. `not_covered` is required, so a gap
 * has to be declared rather than silently omitted.
 */

export const evidenceCountsSchema = z.object({
  /** Observed: a test result, a captured response, a file:line. */
  direct: z.number().int().min(0),
  /** Deduced, with the reasoning shown. Not a hunch. */
  inferred: z.number().int().min(0),
  /** Asserted but unverified. Never sufficient on its own. */
  claimed: z.number().int().min(0),
});

export const findingSchema = z.object({
  id: z.string().min(1),
  /**
   * `observation` is not a defect claim and is deliberately not ranked among them.
   *
   * The `exploratory-session` skill says to report observations, questions and defects
   * **kept apart** — "I saw X" is an observation; "X is broken" is a conclusion and
   * needs a named oracle. Three of those four had a home in this schema and
   * observations had none, so a session either dressed one up as a `minor` defect it
   * could not support, or dropped it.
   */
  severity: z.enum(['blocker', 'major', 'minor', 'question', 'observation']),
  evidence: z.enum(['direct', 'inferred', 'claimed']),
  summary: z.string().min(10),
  /** File, URL, endpoint, or test name the finding attaches to. */
  where: z.string().optional(),
  /** Which oracle or check says this is wrong. Required for a defect claim. */
  basis: z.string().optional(),
});

/** The severities that assert something is wrong, and therefore owe an oracle. */
const DEFECT_CLAIM = new Set(['blocker', 'major', 'minor']);

/**
 * The charter a session is run under.
 *
 * "No charter is ad-hoc clicking with better branding" — the skill's words. Without
 * one there is no way to read "no issues found": it is coverage evidence for whatever
 * was explored, and nothing at all if what was explored is unstated.
 */
export const charterSchema = z.object({
  /** The target: an area, a feature, a flow. */
  explore: z.string().min(3),
  /** Resources taken in: data, roles, tools, network conditions. */
  resources: z.string().min(3),
  /** The class of information being hunted, not a pass/fail expectation. */
  to_discover: z.string().min(3),
  /** How long the box was, e.g. "45 minutes". */
  timebox: z.string().min(2),
  /**
   * The persona lenses the session rotated through, named.
   *
   * **Plural on purpose, and required to be plural.** This was `persona: string`, and
   * a session that adopted one persona for its whole run satisfied it. Two runs against
   * eprimer on 2026-09-20 did exactly that — both held "a careful first-time user who
   * reads what the screen says" throughout, and between them missed every seeded defect
   * in responsiveness, keyboard access, contrast and document head, because a first-time
   * user does not resize a window, tab through a page, or read source. Neither model
   * failed: a single persona is a blindfold that excuses every move it would not make,
   * and the field's own shape was what asked for one.
   *
   * A lens is rotated through deliberately: first-time user for discoverability,
   * keyboard-only for barriers, small-screen for layout, non-English for encoding,
   * maintainer-reading-source for what the markup admits.
   */
  lenses: z.array(z.string().min(3)).optional(),
  /** Superseded by `lenses`. Accepted so older reports still parse. */
  persona: z.string().optional(),
  /**
   * What the session deliberately excluded. Optional, and deliberately *not* warned
   * about when absent — a constraint narrows, and narrowing by habit is how a session
   * loses coverage it never decided to give up.
   */
  constraint: z.string().optional(),
});

/**
 * The visual-inspection pre-flight, declared check by check.
 *
 * Every field is required and every value is prose, so a skipped check has to be
 * written down as skipped. The role has always told sessions to run this sweep
 * "before the charter"; both eprimer runs skipped it, one of them said so in its own
 * `not_covered`, and both passed the gate — because the gate checked the report's
 * *shape* and never its *method*. Prose in a role prompt is a suggestion; a required
 * field is not.
 *
 * Say what you found, or say it is a gap. A check you did not perform is a gap, never
 * a pass, and never silence.
 */
export const preflightSchema = z.object({
  /** Layout at the sizes the app will actually meet, mobile widths included. */
  position: z.string().min(3),
  /** Empty, loading, error and populated states. */
  state: z.string().min(3),
  /** Browser zoom, out and in. */
  zoom: z.string().min(3),
  /** Tab order, focus visibility, and whether every control is reachable. */
  keyboard: z.string().min(3),
  /** Text and non-text contrast against the background behind it. */
  contrast: z.string().min(3),
  /** Title, charset, viewport meta, favicon, alt text, language. */
  document_head: z.string().min(3),
});

/**
 * One case in a test design. A coder implements cases by id, and a spec or report cites
 * the id, so the chain from design to code can be checked rather than asserted.
 */
export const caseSchema = z.object({
  id: z.string().min(1),
  level: z.enum(['unit', 'integration', 'api', 'e2e', 'exploratory']),
  /** The technique that produced the case: boundary values, decision table, sequence probe… */
  technique: z.string().min(3),
  summary: z.string().min(10),
  /** The `npm run ideas` heuristic id, when the case was generated rather than derived. */
  heuristic: z.string().optional(),
});

export const reportSchema = z.object({
  report: z.enum([
    'test-design',
    'bug',
    'exploratory-session',
    'testability',
    'flake',
    'gate',
    'triage',
  ]),
  target: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  author: z.string().min(1),
  verdict: z.enum(['PASS', 'CONDITIONAL', 'FAIL', 'INFO']).optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: evidenceCountsSchema,
  findings: z.array(findingSchema),
  /** What this report deliberately did not cover. Required — an empty list is a claim. */
  not_covered: z.array(z.string()),
  /** Checks that were expected but did not run. Silence about a skipped check reads as a pass. */
  not_run: z.array(z.string()).default([]),
  /** The cases a `test-design` report hands to a coder. Required there, ignored elsewhere. */
  cases: z.array(caseSchema).default([]),
  /** Required for `exploratory-session`, ignored elsewhere. */
  charter: charterSchema.optional(),
  /** Required for `exploratory-session`, ignored elsewhere. See `preflightSchema`. */
  preflight: preflightSchema.optional(),
  /**
   * Finding ids a session proposes for permanent automated coverage.
   *
   * The skill ends on this: "a session that yields no candidate regression test
   * probably explored well-covered ground." Empty is allowed and warned about, because
   * it is sometimes the honest answer and should be a stated one.
   */
  coverage_candidates: z.array(z.string()).default([]),
  /**
   * The commit a design was written against. A run started from it warns when the
   * app's files have changed since, because a design can outlive the code it describes.
   */
  commit: z.string().optional(),
});

export type Report = z.infer<typeof reportSchema>;
export type Finding = z.infer<typeof findingSchema>;

export interface ReportProblem {
  level: 'error' | 'warning';
  message: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseReport(
  source: string,
): { ok: true; report: Report; body: string } | { ok: false; problems: ReportProblem[] } {
  // A UTF-8 BOM before the frontmatter would stop the regex matching. Checked by
  // char code rather than a literal, which is invisible in an editor.
  const cleaned = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const match = FRONTMATTER.exec(cleaned);
  if (match === null) {
    return {
      ok: false,
      problems: [{ level: 'error', message: 'No YAML frontmatter block found.' }],
    };
  }

  let raw: unknown;
  try {
    raw = parseYaml(match[1] ?? '');
  } catch (error) {
    return {
      ok: false,
      problems: [{ level: 'error', message: `Frontmatter is not valid YAML: ${String(error)}` }],
    };
  }

  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        level: 'error' as const,
        message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      })),
    };
  }

  return { ok: true, report: parsed.data, body: match[2] ?? '' };
}

/**
 * Checks a valid report for the things a schema cannot express — mostly that the
 * evidence actually supports the conclusions drawn from it.
 */
export function auditReport(report: Report): ReportProblem[] {
  const problems: ReportProblem[] = [];
  const { direct, inferred, claimed } = report.evidence;
  const total = direct + inferred + claimed;

  if (total !== report.findings.length && report.findings.length > 0) {
    problems.push({
      level: 'warning',
      message: `evidence counts total ${total} but there are ${report.findings.length} findings — they should correspond.`,
    });
  }

  for (const finding of report.findings) {
    if (finding.severity === 'blocker' && finding.evidence !== 'direct') {
      problems.push({
        level: 'error',
        message: `${finding.id}: a blocker needs direct evidence, not "${finding.evidence}". Prove it or lower the severity.`,
      });
    }
    if (finding.evidence === 'claimed' && finding.severity !== 'question') {
      problems.push({
        level: 'error',
        message: `${finding.id}: claimed evidence is never sufficient for a finding. Verify it, or file it as a question.`,
      });
    }
    // A session is held to the harder version of this rule. Its own skill says "name
    // the oracle for every defect claim", and a session is precisely where there is no
    // spec to fall back on — so an unsupported claim there is the failure mode, not an
    // untidy edge. Elsewhere it stays a warning.
    if (DEFECT_CLAIM.has(finding.severity) && finding.basis === undefined) {
      problems.push({
        level: report.report === 'exploratory-session' ? 'error' : 'warning',
        message: `${finding.id}: no basis given. Name the oracle or check that says this is wrong — or file it as a question or an observation.`,
      });
    }
    // An observation is something you watched happen. One resting on anything weaker
    // is a conclusion wearing an observation's label, which is the exact confusion the
    // severity exists to prevent.
    if (finding.severity === 'observation' && finding.evidence !== 'direct') {
      problems.push({
        level: 'error',
        message: `${finding.id}: an observation is something you saw, so it needs direct evidence, not "${finding.evidence}".`,
      });
    }
  }

  if (report.not_covered.length === 0) {
    problems.push({
      level: 'warning',
      message: 'not_covered is empty — that claims complete coverage. State the scope limits.',
    });
  }

  if (report.report === 'test-design' && report.cases.length === 0) {
    problems.push({
      level: 'error',
      message:
        'A test design lists no cases, so it hands a coder nothing to implement. Add cases with id, level, technique and summary.',
    });
  }

  // ── A session is a different kind of document, and is checked as one ──────────────
  //
  // Until this existed the gate ran `check-report` on a session's notes and enforced
  // nothing a session cares about: it would accept a report with no charter, no
  // observations and no questions as a clean exploratory session. An unenforced format
  // is how a session's findings quietly go missing.
  if (report.report === 'exploratory-session') {
    if (report.charter === undefined) {
      problems.push({
        level: 'error',
        message:
          'An exploratory session needs a charter — explore, resources, to_discover, timebox. Without one, "no issues found" cannot be read: it is coverage evidence for whatever was explored, and the scope is unstated.',
      });
    } else {
      const lenses = report.charter.lenses ?? [];
      if (lenses.length < 2) {
        problems.push({
          level: 'error',
          message:
            `charter names ${lenses.length === 0 ? 'no lenses' : 'only one lens'} — a session held to a single persona is blindfolded, not focused. ` +
            'Rotate at least two and name them: first-time user for discoverability, keyboard-only for barriers, small-screen for layout, non-English for encoding, maintainer-reading-source for what the markup admits.',
        });
      }
    }

    // The role has always said to run this before the charter. Saying so was not enough.
    if (report.preflight === undefined) {
      problems.push({
        level: 'error',
        message:
          'No preflight block. The visual-inspection sweep — position, state, zoom, keyboard, contrast, document_head — runs before the charter, and each check is declared as what it found or as a gap. A check you did not perform is a gap, never silence.',
      });
    }

    if (!report.findings.some((finding) => finding.severity === 'observation')) {
      problems.push({
        level: 'warning',
        message:
          'No observations recorded, only conclusions. A session that noticed nothing worth writing down before judging it probably judged too early.',
      });
    }

    if (!report.findings.some((finding) => finding.severity === 'question')) {
      problems.push({
        level: 'warning',
        message:
          'No questions raised. A session with no questions in it is a session that did not explore — the hostile, the out-of-order and the absurd all produce questions before they produce defects.',
      });
    }

    if (report.coverage_candidates.length === 0) {
      problems.push({
        level: 'warning',
        message:
          'coverage_candidates is empty. Say which findings deserve permanent automated coverage, or state that none do — a session yielding no candidate probably explored well-covered ground.',
      });
    }
  }

  if (report.verdict === 'PASS' && claimed > 0) {
    problems.push({
      level: 'error',
      message: 'A PASS verdict cannot rest on claimed evidence. Verify it or report CONDITIONAL.',
    });
  }

  if (total > 0 && direct === 0) {
    problems.push({
      level: 'warning',
      message: 'No direct evidence at all — this report is reasoning, not observation.',
    });
  }

  return problems;
}
