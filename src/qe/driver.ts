import { actionAllowed } from './exploration-policy.js';
import type { ExplorationPolicy } from './exploration-policy.js';
import type { Ideas, TestIdea } from './test-ideas.js';
import { heuristic } from './heuristics.js';
import type { PageScan, ScannedElement } from '../tools/page-scanner.js';

/**
 * What a session may actually try here, and why the rest is out of reach.
 *
 * `ideasFor` answers "what cases does this page support?" without knowing where the
 * page is. The policy answers "what may be done here?" without knowing what is on the
 * page. Neither alone can tell a session what to do next, and until now nothing joined
 * them: a run with `--scan` was handed a map and no candidate actions at all, so
 * "what to try" was rederived by the model every session, from a list it could not see.
 *
 * This is the join, and it is deliberately only the join.
 *
 * **It narrows; it does not rank.** Which of forty permitted cases deserves the budget
 * is a risk call, and `heuristics.ts` files exactly that under `judgement` — the
 * catalogue's own line about what a script must not decide. A ranking invented here
 * would be a confident number with nothing behind it, and the surrounding code has
 * already been bitten twice by detectors that sounded certain and were wrong. So the
 * order is the scan's order, and choosing stays with the session.
 *
 * **A skip is an output, not a silence.** Every idea the policy refuses is returned
 * with the reason, because `exploration-policy.ts` makes the same promise about
 * controls — "silent skipping is how a session claims coverage it does not have" —
 * and a plan that quietly dropped its refusals would break that promise one level up.
 */

/** Where an idea is carried out. The policy applies to both; the browser does not. */
export type Via = 'browser' | 'api';

export interface Candidate {
  idea: TestIdea;
  via: Via;
  /** The control's accessible name, when this idea came from one element. */
  label: string | null;
}

export interface Skipped extends Candidate {
  /** Why the policy refuses it, in words a report can quote. */
  reason: string;
}

export interface ActionPlan {
  candidates: Candidate[];
  skipped: Skipped[];
  /** Carried through from `ideasFor`: what the scan itself could not support. */
  notGenerated: string[];
}

export interface PlanInput {
  ideas: Ideas;
  /** The scan the ideas came from, read back for the labels `TestIdea` does not carry. */
  scan: PageScan;
  policy: ExplorationPolicy;
}

/**
 * The element an idea points at, or null when it does not point at one.
 *
 * `TestIdea.target` is `element.suggested` for anything derived from a single control,
 * so the lookup is exact rather than fuzzy. Three shapes have no element and are meant
 * not to resolve: the group ideas ("3 checkboxes in form 0") describe a set, and the
 * API ideas are `POST /items` or `POST /items → GET /items`, which are endpoints and
 * were never selectors.
 *
 * An earlier version split on ` → ` before the lookup, on the belief that the arrow
 * was a selector with a read-back appended. It is not — only `apiIdeas` produces that
 * form — so the split could never have matched anything and was removed rather than
 * left in as a comment describing a case that does not exist.
 */
function elementFor(
  target: string,
  byselector: Map<string, ScannedElement>,
): ScannedElement | null {
  return byselector.get(target) ?? null;
}

/**
 * Why the policy refuses this idea, or null when it permits it.
 *
 * Three rules, in the order that reads most usefully in a report: the effect the idea
 * has, the effect nobody established, then the control itself.
 */
function refusal(
  idea: TestIdea,
  element: ScannedElement | null,
  policy: ExplorationPolicy,
): string | null {
  // `actionAllowed` refuses a write only when it can see a submit control. An idea
  // tagged `@writes` is a statement that the case changes server state whatever it
  // clicks to get there, so it is checked on the tag rather than on the element.
  if (idea.tag === '@writes' && !policy.allowWrites) {
    return `changes server state, which is not permitted on ${policy.environment}`;
  }

  // An untagged idea is one whose effect `ideasFor` could not establish — a login
  // form, a toggle that may persist. Unknown is not read-only, and reading it as
  // read-only would put exactly the unproven case on the environment least able to
  // absorb it.
  if (idea.tag === null && !policy.allowWrites) {
    return `effect not established (${idea.untagged ?? 'untagged'}), and an unproven effect is not a read on ${policy.environment}`;
  }

  const verdict = actionAllowed(policy, {
    label: element?.accessibleName ?? null,
    tag: element?.tag ?? 'unknown',
    type: element?.type ?? null,
    isSubmit: element?.affordance === 'submit',
  });
  return verdict.allowed ? null : verdict.reason;
}

export function planActions(input: PlanInput): ActionPlan {
  const { ideas, scan, policy } = input;

  const byselector = new Map<string, ScannedElement>();
  for (const element of scan.interactive) {
    // First wins: a selector matching several controls is already flagged
    // `unique: false` on the idea, and picking a different one of them each run
    // would make the label in a report depend on scan order.
    if (!byselector.has(element.suggested)) byselector.set(element.suggested, element);
  }

  const candidates: Candidate[] = [];
  const skipped: Skipped[] = [];

  for (const idea of ideas.ideas) {
    const element = elementFor(idea.target, byselector);
    const entry: Candidate = {
      idea,
      via: idea.level === 'api' ? 'api' : 'browser',
      label: element?.accessibleName ?? null,
    };
    const reason = refusal(idea, element, policy);
    if (reason === null) candidates.push(entry);
    else skipped.push({ ...entry, reason });
  }

  return { candidates, skipped, notGenerated: ideas.notGenerated };
}

function line(entry: Candidate): string[] {
  const { idea } = entry;
  const warn = idea.unique ? '' : '  (selector matches several elements)';
  const lines = [`${entry.via} · ${idea.target}${warn}`, `  ${heuristic(idea.heuristic).name}`];
  if (idea.values.length > 0) {
    const from = idea.from === null ? '' : `  ← src/fixtures/probes.js: ${idea.from}`;
    lines.push(`  values: ${idea.values.join(' · ')}${from}`);
  }
  lines.push(`  assert: ${idea.assert}`);
  return lines;
}

/**
 * The plan as a session reads it.
 *
 * Both halves are printed, and the refused half is printed second rather than dropped:
 * a session that reports "explored everything permitted" is only worth reading beside
 * the list of what that excluded.
 */
export function formatActionPlan(plan: ActionPlan, target: string): string {
  const out = [
    `--- Candidate actions: ${plan.candidates.length} the ${target} policy permits here ---`,
    '',
    'These are generated from the scan, not chosen. Which deserve your budget is your',
    'call — that judgement is the part no script makes. Spending fewer is a better',
    'session, not a lesser one.',
    '',
  ];
  for (const entry of plan.candidates) out.push(...line(entry), '');

  if (plan.skipped.length > 0) {
    out.push(
      `--- Refused by the policy: ${plan.skipped.length} — report these as unexplored ---`,
      '',
    );
    for (const entry of plan.skipped) {
      out.push(`${entry.via} · ${entry.idea.target}`, `  ${entry.reason}`, '');
    }
  }

  if (plan.notGenerated.length > 0) {
    out.push('--- Not generated — what the scan could not support ---', '');
    for (const reason of plan.notGenerated) out.push(`- ${reason}`);
    out.push('');
  }

  out.push(
    '--- What this list cannot see ---',
    '',
    '- It is built from ONE state: the page as it first loaded. Anything reached only by',
    '  opening something — a mini-cart, a dropdown, a modal, a drawer, a toast — appears',
    '  in no scan and therefore in no line above. Those are yours to find.',
    '- It offers values and targets. It does not know which risk matters here.',
  );
  return out.join('\n');
}
