import { contradictions, matchAll } from '../tools/identity.js';
import type { Fingerprint } from '../tools/identity.js';

/**
 * How many distinct places a session has been, and what each action did.
 *
 * `maxStates` has been in the policy since the policy existed and enforced by
 * nothing, for a stated reason: the per-call guard sees one tool call at a time and
 * cannot tell a new page from a return to an old one. This is the thing that can —
 * it is fed the page after each action and keeps the set of states seen, so the
 * guard finally has a number to refuse on.
 *
 * It answers a second question the harness could not answer at all: **what did that
 * click actually do?** `matchAll` pairs the controls before against the controls
 * after, so appearing, disappearing and changing are separated rather than reported
 * as one churn. A mini-cart opening is a handful of controls appearing and nothing
 * disappearing; a navigation is most of them going at once.
 *
 * ## What counts as a state
 *
 * The URL plus the **set of distinct interactive-control signatures** — tag, role,
 * accessible name, type and field name. Deliberately none of the volatile signals:
 * `nearbyText` changes when any surrounding copy does, `siblingIndex` shifts when a
 * list grows, and a generated `id` differs on every render.
 *
 * A **set**, never a multiset, and that is the load-bearing choice. Adding a todo to
 * a list adds another control identical to the ones beside it; counting occurrences
 * would call that a new state and burn the ceiling on a list being used normally.
 * The same property is why a modal *is* noticed: it contributes controls that are
 * distinct, not merely more of the same.
 *
 * URL is included because two pages can carry the same controls — a paginated list
 * at `?page=1` and `?page=2` — and calling those one state would hide a whole route.
 *
 * ## What this cannot see
 *
 * Two screens whose interactive controls are identical and whose content differs
 * read as **one** state: a confirmation page that only swaps a heading, a detail view
 * reached from a row. That is the cost of ignoring volatile text and it is the right
 * trade at a ceiling — over-counting spends the session's allowance on noise, which
 * is the failure that leaves an exploration reported as complete after eight clicks.
 * Stated here and in `format()` rather than left for someone to discover.
 */

/** One look at the page, taken after an action settled. */
export interface Observation {
  url: string;
  /** From `harvestCandidates` in `src/tools/heal.ts` — the live DOM, not a snapshot. */
  fingerprints: Fingerprint[];
}

/** One control's identity, reduced to the signals that survive ordinary use. */
export function controlSignature(fingerprint: Fingerprint): string {
  return [
    fingerprint.tag,
    fingerprint.role ?? '',
    fingerprint.name ?? '',
    fingerprint.type ?? '',
    fingerprint.fieldName ?? '',
  ].join('|');
}

/**
 * The state key for one observation.
 *
 * Sorted, so the same page reached twice produces the same key whatever order the
 * DOM walk returned. An unsorted join made a re-render into a new state.
 */
export function stateKey(observation: Observation): string {
  const signatures = [...new Set(observation.fingerprints.map(controlSignature))].sort();
  return `${observation.url}\n${signatures.join('\n')}`;
}

export interface ChangedControl {
  before: Fingerprint;
  after: Fingerprint;
  /** Which decisive signals disagreed, from `identity.ts`. */
  disagreed: string[];
}

export interface Transition {
  /** Null on the first observation, which has nothing to come from. */
  from: string | null;
  to: string;
  /** False when this state has been seen before — a return, not a discovery. */
  isNewState: boolean;
  /** Present after, matched to nothing before. A menu opening looks like this. */
  appeared: Fingerprint[];
  /** Present before, matched to nothing after. */
  disappeared: Fingerprint[];
  /** Paired confidently, but something decisive about them differs. */
  changed: ChangedControl[];
}

export class StateModel {
  private readonly seen = new Set<string>();
  private last: Observation | null = null;

  /** Distinct states visited so far. */
  count(): number {
    return this.seen.size;
  }

  /**
   * Whether the session has spent its state allowance.
   *
   * A ceiling, never a target — the same phrasing rule the action ceiling follows.
   */
  atCeiling(maxStates: number): boolean {
    return this.seen.size >= maxStates;
  }

  /** Record one look at the page and say what changed since the last one. */
  observe(observation: Observation): Transition {
    const to = stateKey(observation);
    const from = this.last === null ? null : stateKey(this.last);
    const isNewState = !this.seen.has(to);
    this.seen.add(to);

    const before = this.last?.fingerprints ?? [];
    const after = observation.fingerprints;
    const result = matchAll(before, after);

    const changed: ChangedControl[] = [];
    for (const pair of result.pairs) {
      const disagreed = contradictions(pair.result);
      if (disagreed.length === 0) continue;
      changed.push({
        before: before[pair.beforeIndex]!,
        after: after[pair.afterIndex]!,
        disagreed,
      });
    }

    this.last = observation;
    return {
      from,
      to,
      isNewState,
      appeared: result.unmatchedAfter.map((index) => after[index]!),
      disappeared: result.unmatchedBefore.map((index) => before[index]!),
      changed,
    };
  }
}

/** One line a session can read after acting, or null when nothing moved. */
export function describeTransition(transition: Transition): string | null {
  if (transition.from === null) return null;

  const parts: string[] = [];
  if (transition.appeared.length > 0) parts.push(`${transition.appeared.length} appeared`);
  if (transition.disappeared.length > 0) parts.push(`${transition.disappeared.length} gone`);
  if (transition.changed.length > 0) parts.push(`${transition.changed.length} changed`);

  if (parts.length === 0) {
    // Worth saying out loud. A click that moved nothing is either a dead control or
    // a change this model cannot see, and both are findings rather than silence.
    return 'nothing observable changed — a dead control, or a change only the content shows';
  }
  const where = transition.isNewState ? 'a state not seen before' : 'a state already visited';
  return `${parts.join(', ')} — ${where}`;
}
