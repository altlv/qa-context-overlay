import { AxeBuilder } from '@axe-core/playwright';
import type { Result as AxeResult } from 'axe-core';
import type { Page } from '@playwright/test';

/**
 * Accessibility conformance against a published standard, rather than against judgement.
 *
 * **The gap this fills.** The report format requires a line for nine coverage dimensions, and
 * `accessibility` was the one a session could only answer by hand. The harness could already read
 * the accessibility tree — `src/tools/aria.ts` — and `visual-inspection` gained an accessible-name
 * pass, and both produce *observations*: this link announces nothing, those three share a name.
 * Useful, and not conformance. Nothing here could say which rule of which standard a page fails,
 * which is the form the finding has to take before anyone outside the session can act on it.
 *
 * Two subjects are now accessibility-teaching sites, one of them published by the company that
 * writes axe. Hand-rolled WCAG checks sat in three separate files. This replaces none of them —
 * see the blind spot below — but it gives the dimension an instrument.
 *
 * **What this is NOT, and the output says so every time.** Automated rules catch a minority of
 * WCAG failures: roughly a third to a half, depending on whose study and which ruleset, and the
 * ones they catch are the mechanical ones. No automated check can tell you that alt text is
 * *wrong*, that a heading structure misleads, that a focus order is illogical, or that an error
 * message is incomprehensible. **A clean axe run is not an accessible page**, and a coverage line
 * reading "accessibility: axe clean" would be exactly the drift `CLAUDE.md` forbids in its status
 * table — a number that rots into a claim. `summarise` therefore refuses to print a bare zero: a
 * pass is reported as "no automated violations", with what that excludes named beside it.
 */

export interface ConformanceViolation {
  /** The axe rule id, e.g. `image-alt`. The stable name to search and to cite. */
  rule: string;
  /** axe's own severity: minor, moderate, serious, critical. */
  impact: string;
  /** One line of what is wrong. */
  help: string;
  /** The standards this rule implements, e.g. `wcag2a`, `wcag412`. Empty for best-practice rules. */
  standards: string[];
  /** How many elements failed it. The count is the finding; the list below is the evidence. */
  count: number;
  /** A few failing selectors, capped — an agent pays for every one of these. */
  examples: string[];
}

export interface ConformanceResult {
  /** Null when the check could not run, which is NOT the same as a page with no violations. */
  violations: ConformanceViolation[] | null;
  /** Why it could not run, when it could not. */
  refused: string | null;
  /** Rules that passed, for the denominator — a count only. */
  passed: number;
  /** Rules axe could not decide, which it reports as incomplete and a person must check. */
  incomplete: string[];
}

export interface ConformanceOptions {
  /** Which standards to hold the page to. Defaults to WCAG 2.2 A and AA, the common legal bar. */
  standards?: string[];
  /** Failing selectors kept per rule. */
  mostExamples?: number;
}

const DEFAULT_STANDARDS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Run the rules against a live page.
 *
 * Takes a `Page` rather than a URL because the harness already holds one: the observer opens a
 * second CDP connection to the browser the agent is driving, so conformance can be measured on the
 * page as the session left it — mid-flow, with a dialog open — rather than on a fresh load of the
 * same URL, which is a different page.
 *
 * **Fail-soft and loud.** A refusal returns `violations: null`, never an empty list. The two are
 * opposite findings and this repository has already confused them once: an empty report file that
 * read as a report which existed.
 */
export async function conformance(
  page: Page,
  options: ConformanceOptions = {},
): Promise<ConformanceResult> {
  const mostExamples = options.mostExamples ?? 3;
  try {
    const results = await new AxeBuilder({ page })
      .withTags(options.standards ?? DEFAULT_STANDARDS)
      .analyze();

    return {
      violations: results.violations.map((violation: AxeResult) => ({
        rule: violation.id,
        impact: violation.impact ?? 'unknown',
        help: violation.help,
        standards: (violation.tags ?? []).filter((tag: string) => tag.startsWith('wcag')),
        count: violation.nodes.length,
        examples: violation.nodes
          .slice(0, mostExamples)
          .map((node) => String(node.target.join(' ')).slice(0, 120)),
      })),
      refused: null,
      passed: results.passes.length,
      incomplete: results.incomplete.map((rule: AxeResult) => rule.id),
    };
  } catch (error) {
    return {
      violations: null,
      // First line only: axe failures carry a stack, and a refusal a person cannot read is a
      // refusal that gets ignored. `??` because an empty message would otherwise yield undefined,
      // which would read as "ran and found nothing" — the one confusion this field exists to stop.
      refused:
        error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error),
      passed: 0,
      incomplete: [],
    };
  }
}

/** Order by how much it matters, so a capped list keeps the worst. */
const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor', 'unknown'];

/**
 * The result as lines for a scan or a session, with the standard's limits attached.
 *
 * The caveat is not a footnote and is not optional: every path through this function says what the
 * automated rules do not cover, because the one thing a conformance number must not become is a
 * coverage claim.
 */
export function summarise(result: ConformanceResult, mostRules = 8): string[] {
  const limit =
    'Automated rules find a minority of WCAG failures — the mechanical ones. They cannot tell ' +
    'you that alt text is wrong, that a heading structure misleads, that a focus order is ' +
    'illogical, or that an error message cannot be understood. Keyboard walking and the ' +
    'accessible-name pass in `visual-inspection` are still owed.';

  if (result.violations === null) {
    return [
      `Accessibility conformance: NOT RUN — ${result.refused ?? 'the check did not complete'}.`,
      '  This is not a clean result. Nothing was measured.',
    ];
  }

  if (result.violations.length === 0) {
    return [
      `Accessibility conformance: no automated violations, against ${result.passed} rule(s) that ` +
        `applied.`,
      `  ${limit}`,
      ...(result.incomplete.length === 0
        ? []
        : [
            `  ${result.incomplete.length} rule(s) axe could not decide and a person must check: ` +
              `${result.incomplete.slice(0, 6).join(', ')}.`,
          ]),
    ];
  }

  const sorted = [...result.violations].sort(
    (left, right) => IMPACT_ORDER.indexOf(left.impact) - IMPACT_ORDER.indexOf(right.impact),
  );
  const elements = result.violations.reduce((total, violation) => total + violation.count, 0);
  const lines = [
    `Accessibility conformance: ${result.violations.length} rule(s) failing across ${elements} ` +
      `element(s), against ${result.passed} rule(s) that passed.`,
  ];
  for (const violation of sorted.slice(0, mostRules)) {
    const standards =
      violation.standards.length === 0 ? 'best practice' : violation.standards.join(' ');
    lines.push(
      `  [${violation.impact}] ${violation.rule} ×${violation.count} (${standards}) — ${violation.help}`,
    );
    if (violation.examples.length > 0) lines.push(`      e.g. ${violation.examples.join(' · ')}`);
  }
  if (sorted.length > mostRules) {
    lines.push(`  … and ${sorted.length - mostRules} more rule(s), lower impact.`);
  }
  lines.push(`  ${limit}`);
  return lines;
}
