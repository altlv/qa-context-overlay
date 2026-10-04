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
  /**
   * What the page is currently **saying**, from `readAnnouncements`.
   *
   * The second projection, and the one that closes the blindness measured twice: a
   * `role=status` toast and a `role=alert` banner both used to leave the state key unchanged,
   * because a state was controls and a URL and nothing else.
   *
   * Optional, so an observation built before this existed still type-checks and so a caller
   * that cannot read the page still produces one. **Absent means not read, not silent** — and
   * the distinction is kept rather than collapsed, because an unread projection reporting as
   * an empty one is this repository's recurring mistake.
   */
  announcements?: string[];
}

/**
 * The volatile part of a control's name, removed before it identifies anything.
 *
 * A name is visible text, and visible text carries numbers that change without the screen
 * changing. Measured on 2026-10-02: polymer-shop names its cart button
 * `"Shopping cart: 0 items"`, so adding one item produced a **new state** — and `maxStates` had
 * already refused a live session on that subject at its ceiling of 25. A counter can therefore
 * spend the whole state allowance on one screen, and the session stops for a reason nobody can
 * see. A locale switch does the same to every control at once.
 *
 * **Normalised rather than dropped.** Removing the name entirely was the obvious fix and is
 * worse: the name is what distinguishes one button from another, and polymer-shop's 16 controls
 * produce 12 distinct signatures *because* of it. Without names, structurally different pages
 * collapse towards each other, which trades a state count that is too high for one that is too
 * low — and too low is the dangerous direction, because it hides screens instead of exhausting a
 * budget.
 *
 * So digits go, and nothing else: `"Shopping cart: 0 items"` and `"Shopping cart: 12 items"` both
 * become `"shopping cart: N items"`, while `"Add to cart"` and `"Remove"` stay apart. Case and
 * run-length whitespace are folded for the same reason the matcher folds them — two sources and
 * two renders disagree about trivia.
 */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\d+/g, 'N').replace(/\s+/g, ' ').trim();
}

/** One control's identity, reduced to the signals that survive ordinary use. */
export function controlSignature(fingerprint: Fingerprint): string {
  return [
    fingerprint.tag,
    fingerprint.role ?? '',
    normaliseName(fingerprint.name ?? ''),
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
  // Announcements get a section of their own rather than being mixed into the signatures, so a
  // control named "Saved" and a status region saying "Saved" cannot collide.
  //
  // Omitted entirely when the projection was not read, so an observation built without it
  // produces the key it always did instead of every state quietly acquiring an empty section —
  // which would make a run with the projection and a run without it incomparable for no reason.
  const said = observation.announcements ?? [];
  const saying = said.length === 0 ? '' : `\nsays:\n${[...said].sort().join('\n')}`;
  return `${observation.url}\n${signatures.join('\n')}${saying}`;
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

  /**
   * Every move recorded, as `from` → `to` with what was done to get there.
   *
   * Kept because `observe` already computes both ends and used to **throw them away**. A set of
   * visited states answers "how many" and nothing else — it cannot say how to return to a state,
   * which moves from a state have never been tried, whether a path loops, or what the shortest
   * route to a failure is. So the harness had the perception half of a crawler and none of the
   * planning half, while the one number it did keep was wired to a ceiling: used to stop, never
   * to steer, which is the opposite of a frontier.
   *
   * Edges are cheap — two strings and a label per action — and nothing downstream has to use them
   * for them to be worth keeping, because a path that was not recorded cannot be recovered later.
   */
  private readonly edges: { from: string; action: string; to: string }[] = [];

  /** What the session did to cause the next observation, set before `observe`. */
  private pending: string | null = null;

  /**
   * Name the action about to be taken, so the edge it produces can be labelled.
   *
   * Optional on purpose: an unlabelled move still records an edge, with the action as `unknown`.
   * Requiring the label would mean a caller that forgot it loses the edge entirely, and a graph
   * with a hole in it is worse than one with a vague label in it.
   */
  about(action: string): void {
    this.pending = action;
  }

  /** The graph so far, for a caller that wants to plan over it rather than only count. */
  graph(): { states: string[]; edges: readonly { from: string; action: string; to: string }[] } {
    return { states: [...this.seen], edges: this.edges };
  }

  /**
   * Moves that have been made from a state, so a caller can tell a state it has exhausted from
   * one it has barely touched.
   *
   * The complement — moves *not* yet tried — cannot be computed here, because only the driver
   * knows which actions a state affords. This is the half the model owns; `src/qe/driver.ts`
   * holds the other, and E5c is where they meet.
   */
  triedFrom(state: string): string[] {
    return this.edges.filter((edge) => edge.from === state).map((edge) => edge.action);
  }

  /**
   * The shortest recorded route from the first state seen to this one, or null when none was
   * recorded.
   *
   * Breadth-first over the edges, so the answer is the fewest moves rather than the order they
   * happened in. This is the thing a reproduction needs and nothing could produce before: a
   * session that found a defect twenty actions deep could say what it saw and not how to get
   * back. The route is only as good as the labels — an `unknown` action is in the path and not
   * replayable, which is visible rather than silent.
   */
  routeTo(state: string): string[] | null {
    const start = this.edges[0]?.from;
    if (start === undefined) return null;
    if (state === start) return [];
    const queue: { at: string; path: string[] }[] = [{ at: start, path: [] }];
    const visited = new Set([start]);
    while (queue.length > 0) {
      const step = queue.shift()!;
      for (const edge of this.edges) {
        if (edge.from !== step.at || visited.has(edge.to)) continue;
        const path = [...step.path, edge.action];
        if (edge.to === state) return path;
        visited.add(edge.to);
        queue.push({ at: edge.to, path });
      }
    }
    return null;
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

    // The edge, kept whether or not the state is new: a move that returns to a state already
    // seen is exactly the move a route needs, and dropping it would record only the spanning
    // tree of first visits rather than the graph.
    if (from !== null) {
      this.edges.push({ from, action: this.pending ?? 'unknown', to });
    }
    this.pending = null;

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
