import { normaliseName } from './state-model.js';

/**
 * What a session has **not** tried yet.
 *
 * `maxStates` has been a ceiling since the policy existed: a number that refuses, never one that
 * steers. Edges, `triedFrom` and `routeTo` landed on 2026-10-03 and nothing planned over them, so
 * a session that hit its ceiling on Polymer Shop could report what it saw and not what it had left
 * untouched — and item 83 draws the consequence: **until something computes the untried moves, no
 * coverage claim about an app is defensible.** "I visited 25 states" says nothing without "and
 * left 60 moves unexplored."
 *
 * ## The two halves, and which one was missing
 *
 * `StateModel` knows what was **tried**: every edge carries the action that produced it. Or it
 * would — until now nothing called `about()`, so every edge was labelled `unknown` and `triedFrom`
 * returned a list of that word. The first half of this work is therefore not arithmetic, it is
 * **naming the edges**, from the tool call that caused the transition.
 *
 * The other half is what a state **affords**. `state-model.ts` says in so many words that this
 * "cannot be computed here, because only the driver knows which actions a state affords". That is
 * true of the driver's full candidate list, which is generated from a scan and enumerates values,
 * boundaries and sequences. It is **not** true of the weaker question this module asks: the
 * controls the observer already harvested for the state key are the things a session could act on,
 * and they come for free because the state key needed them anyway.
 *
 * So this is a narrowing, stated rather than implied. It counts *controls not yet acted on*, and it
 * cannot see:
 *
 * - a control the harvester misses — the one-of-eleven limit recorded under the discovery layer;
 * - a move that is not a control at all: typing a particular value, a keyboard shortcut, scrolling,
 *   a drag, the back button;
 * - the same control acted on differently — clicked versus right-clicked versus long-pressed.
 *
 * Each of those makes the frontier an **undercount of what is possible** while the count of
 * untried controls is exact. That is the safe direction: it never reports an app as exhausted.
 *
 * ## Why an unmatched label leaves a control untried
 *
 * A tried-label comes from MCP's own description of the element it acted on, and an affordance
 * comes from our accessible name. They agree often and not always. When a label matches nothing,
 * the control stays in the frontier — so the frontier **overstates** what is left rather than
 * understating it. Both biases here point the same way on purpose: towards "there is more to do",
 * never towards "you are finished". A coverage claim that errs optimistic is the one that does
 * harm.
 */

/**
 * The control a tool call acted on, or null when the call names none.
 *
 * Built from MCP's `element` — its own human description of what it clicked or typed into — and
 * never from `ref`. A ref is an index into one snapshot and is reassigned on the next, so two
 * clicks on the same button in different states carry different refs, and a frontier keyed on them
 * would report every control as untried forever.
 *
 * Returns null for a call that moves the page without acting on a control: a navigation, a resize,
 * a back. Those still produce an edge — the model labels it with the tool name — but they consume
 * no affordance, and attributing them to one would retire a control nobody touched.
 */
export function actedOnControl(toolInput: unknown): string | null {
  if (typeof toolInput !== 'object' || toolInput === null) return null;
  const element = (toolInput as { element?: unknown }).element;
  if (typeof element !== 'string' || element.trim() === '') return null;
  return normaliseName(element);
}

/**
 * The label an edge carries, for `StateModel.about`.
 *
 * The tool name is always included, even when a control is named: `browser_click` on a button and
 * `browser_type` into it are different moves, and a route that replays one as the other does not
 * reproduce anything. `routeTo` is only as good as these labels.
 */
export function moveLabel(toolName: string, toolInput: unknown): string {
  const control = actedOnControl(toolInput);
  return control === null ? toolName : `${toolName}:${control}`;
}

/**
 * Which of a state's controls have not been acted on.
 *
 * Matching is containment either way, because the two sides are written by different authors for
 * different readers: MCP says `"Add to cart button"` where our accessible name is `"add to cart"`.
 * Exact equality would retire almost nothing and the frontier would never shrink, which looks
 * identical to a session that explored nothing.
 */
export function untriedControls(affords: readonly string[], tried: readonly string[]): string[] {
  const labels = tried.map((label) => normaliseName(label));
  return [...new Set(affords.map((name) => normaliseName(name)))]
    .filter((name) => name !== '')
    .filter(
      (name) => !labels.some((label) => label.includes(name) || name.includes(labelControl(label))),
    )
    .sort();
}

/** The control part of a `tool:control` label, or the whole of it when there is no control. */
function labelControl(label: string): string {
  const at = label.indexOf(':');
  // An empty control part must never match every affordance, which `''.includes` would.
  const control = at === -1 ? label : label.slice(at + 1);
  return control.trim() === '' ? '\u0000no control\u0000' : control;
}

export interface StateFrontier {
  state: string;
  /** Controls this state offers that nothing has acted on. */
  untried: string[];
  /** How many of its controls have been acted on, for a reader judging the share. */
  tried: number;
}

export interface GraphView {
  states: readonly string[];
  affordsIn: (state: string) => readonly string[];
  triedFrom: (state: string) => readonly string[];
}

/** Every state with something left to try, the richest first. */
export function frontier(graph: GraphView): StateFrontier[] {
  return graph.states
    .map((state) => {
      const affords = graph.affordsIn(state);
      const untried = untriedControls(affords, graph.triedFrom(state));
      return { state, untried, tried: Math.max(0, new Set(affords).size - untried.length) };
    })
    .filter((entry) => entry.untried.length > 0)
    .sort((a, b) => b.untried.length - a.untried.length);
}

/**
 * The lines a run says about what it did not do.
 *
 * **The point of the whole item.** A session that reports "25 states visited" has made a claim a
 * reader will hear as coverage. The same session reporting "and 61 controls across 12 states were
 * never acted on" has made a claim about its own incompleteness, which is the only honest one
 * available — and the one `maxStates` could never produce while it was wired to stopping alone.
 */
export function describeFrontier(
  frontiers: readonly StateFrontier[],
  atCeiling: boolean,
): string[] {
  if (frontiers.length === 0) {
    return [
      'Frontier: no state holds a control nothing acted on. That is not the same as an app ' +
        'explored — see the limits in frontier.ts: a value never typed, a keyboard path, and a ' +
        'control the harvester cannot see are all invisible here.',
    ];
  }
  const total = frontiers.reduce((sum, entry) => sum + entry.untried.length, 0);
  const lines = [
    `Frontier: ${total} control(s) across ${frontiers.length} state(s) were never acted on.`,
  ];
  if (atCeiling) {
    lines.push(
      '  The run stopped at its state ceiling with those still open, so its state count is a ' +
        'budget that ran out and NOT a measure of the app. Raising maxStates would reach more.',
    );
  }
  for (const entry of frontiers.slice(0, 5)) {
    lines.push(
      `  ${entry.untried.length} untried, ${entry.tried} tried — ${entry.untried.slice(0, 6).join(', ')}` +
        `${entry.untried.length > 6 ? ` … and ${entry.untried.length - 6} more` : ''}`,
    );
  }
  if (frontiers.length > 5) {
    lines.push(`  … and ${frontiers.length - 5} more state(s) with something left.`);
  }
  return lines;
}

export interface Handover {
  /** What the last action did, from `describeTransition`. Null when nothing moved. */
  moved: string | null;
  /** What kind of surface arrived, from `describeSurface`. Null when none did. */
  surface: string | null;
  /** Controls in the state the session is now standing in that nothing has acted on. */
  untriedHere: readonly string[];
  /** True when the state ceiling is reached, so a move somewhere new would be refused. */
  atCeiling: boolean;
  /**
   * How much of the run is left, from `Budget.remaining()`, or null when nothing is bounded.
   *
   * A session was never told it was about to be killed. It is handed its state ceiling and nothing
   * about its budget, so it gets cut off mid-thought — and on 2026-10-07 every live run ended that
   * way, wrote no report, and then failed its gate on the formatting of its closing prose.
   */
  budgetLeft: { fraction: number; tightest: string } | null;
}

/**
 * What the harness tells the **agent** after an action, or null when it has nothing worth the
 * tokens.
 *
 * **The gap this closes.** Everything the observer learned went to `console.error` and to a
 * post-run `summary()` — the operator, and a report. The agent, the only thing that can act on an
 * untried control, was told nothing after its opening prompt. The frontier as first built was a
 * coverage report wearing the word "steering": it says what a session missed and cannot tell the
 * session. `PostToolUse` carries `additionalContext` back to the model — proven on 2026-10-07 with
 * a code word the agent read back — so the channel existed and was simply unused.
 *
 * **It informs and never instructs.** `formatActionPlan` settles this for the opening briefing:
 * "Which deserve your budget is your call — that judgement is the part no script makes." The same
 * holds here. A line reading "now click Checkout" would replace the judgement that is the whole
 * value of an exploratory role and turn the agent into a crawler that happens to cost model
 * prices. So this reports facts: what moved, what arrived, what has not been touched.
 *
 * **Silence is the default, because this is spent from the budget that bounds the run.** Since
 * 2026-10-06 a run is bounded by tokens, so every line here is money and wall-clock taken from the
 * session itself. A handover after an action that moved nothing, into a state with nothing left,
 * buys nothing and is not sent.
 */
export function handoverLine(handover: Handover, mostControls = 8): string | null {
  const parts: string[] = [];
  if (handover.moved !== null) parts.push(handover.moved);
  if (handover.surface !== null) parts.push(`a surface arrived: ${handover.surface}`);

  if (handover.untriedHere.length > 0) {
    const shown = handover.untriedHere.slice(0, mostControls);
    const more = handover.untriedHere.length > shown.length ? ', …' : '';
    parts.push(
      `${handover.untriedHere.length} control(s) here nothing has acted on yet: ` +
        `${shown.join(', ')}${more}`,
    );
  }

  /**
   * **The one place this module gives an instruction, and the exception is narrow.**
   *
   * Everything else here reports a fact and leaves the judgement to the session, because
   * `formatActionPlan` settles that doctrine and a harness saying "now click Checkout" has replaced
   * the thing an exploratory role is for. "Write up what you have" is a different kind of sentence:
   * it is about the **harness's own constraint**, not about what to test or where to look. The
   * alternative is not neutrality — it is a session killed mid-thought whose work is lost, which is
   * what happened to every run on 2026-10-07.
   *
   * The threshold leaves room to act rather than only to know. Measured the same day, a message of
   * this role costs ~21,262 weighted units against a $1 ceiling of ~484,792, so a fifth of the
   * budget is about four messages — enough to stop, gather and write. A warning at the last percent
   * would be an epitaph.
   */
  if (handover.budgetLeft !== null && handover.budgetLeft.fraction <= 0.2) {
    const left = Math.max(0, Math.round(handover.budgetLeft.fraction * 100));
    parts.push(
      `about ${left}% of this run’s ${handover.budgetLeft.tightest} budget is left, and the run ` +
        `ends when it is gone — write up what you have rather than losing it`,
    );
  }

  if (handover.atCeiling) {
    // Worth the tokens whatever else is true: without it a session cannot tell a page that stopped
    // changing from a harness that stopped letting it move, and would read its own budget running
    // out as the application having nothing left to show.
    parts.push(
      'the state ceiling is reached, so a move to a state not seen before will be refused — ' +
        'whatever is listed as untried is what this session will not reach',
    );
  }

  if (parts.length === 0) return null;
  // Named as the harness so it cannot be mistaken for something the page said. An agent reading
  // this as page content would report the harness's own bookkeeping as a finding.
  return `[harness] ${parts.join('. ')}.`;
}
