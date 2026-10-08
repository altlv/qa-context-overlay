import { test, expect } from '@playwright/test';
import {
  actedOnControl,
  describeFrontier,
  frontier,
  handoverLine,
  moveLabel,
  untriedControls,
  type Handover,
  type StateFrontier,
} from '../../src/qe/frontier.js';
import { StateModel } from '../../src/qe/state-model.js';
import type { Fingerprint } from '../../src/tools/identity.js';

/**
 * What a session has not tried — item 83.
 *
 * `maxStates` refused and never steered, so a run that hit its ceiling could say what it saw and
 * not what it had left untouched. "25 states visited" is heard as coverage; it means nothing
 * without "and 61 controls were never acted on".
 *
 * The blocker underneath turned out to be a dropped argument: nothing ever called the model's
 * `about()`, so every edge was labelled `unknown` and the tried half of the frontier did not exist.
 */

const control = (name: string): Fingerprint => ({
  tag: 'button',
  role: null,
  name,
  testId: null,
  fieldName: null,
  id: null,
  type: null,
  href: null,
  ancestors: ['body'],
  siblingIndex: null,
  nearbyText: null,
  constraints: null,
});

test.describe('naming the move that was made', () => {
  test('should take the control from the tool call that acted on it', () => {
    expect(
      moveLabel('browser_click', { element: 'Add to cart button', ref: 'e12' }),
      'MCP describes what it clicked, and that description is the only name available',
    ).toBe('browser_click:add to cart button');
  });

  test('should never key a move on a ref', () => {
    /**
     * A `ref` is an index into one snapshot and is reassigned on the next, so two clicks on the
     * same button in different states carry different refs. A frontier keyed on them would report
     * every control as untried forever — which looks exactly like a session that explored nothing.
     */
    expect(
      moveLabel('browser_click', { ref: 'e12' }),
      'a ref names no control, because it is an index into one snapshot',
    ).toBe('browser_click');
    expect(
      moveLabel('browser_click', { ref: 'e99' }),
      'and two refs for the same button must not read as two different moves',
    ).toBe('browser_click');
  });

  test('should still name the tool when no control was acted on', () => {
    // A navigation moves the page and consumes no affordance. It must still label its edge, or
    // `routeTo` loses a step and the path stops being replayable.
    expect(moveLabel('browser_navigate', { url: 'http://app/' })).toBe('browser_navigate');
    expect(actedOnControl({ url: 'http://app/' }), 'and it claims no control').toBeNull();
  });

  test('should keep the tool in the label even when a control is named', () => {
    // Clicking a field and typing into it are different moves. A route that replays one as the
    // other reproduces nothing.
    expect(moveLabel('browser_type', { element: 'Search' })).not.toBe(
      moveLabel('browser_click', { element: 'Search' }),
    );
  });

  test('should survive a tool input that is not an object', () => {
    for (const odd of [null, undefined, 'click', 42]) {
      expect(actedOnControl(odd), `${String(odd)} names no control`).toBeNull();
    }
  });
});

test.describe('which controls are left', () => {
  test('should retire a control something acted on', () => {
    expect(
      untriedControls(['add to cart', 'checkout', 'search'], ['browser_click:add to cart button']),
      'MCP says "Add to cart button" where the accessible name is "add to cart" — exact equality would retire nothing',
    ).toEqual(['checkout', 'search']);
  });

  test('should be able to come back empty', () => {
    /**
     * Instrument liveness, and the assertion that matters most here. A frontier that can never
     * shrink is indistinguishable from a session that explored nothing, and it would make every
     * coverage line this produces meaningless in the same direction.
     */
    expect(
      untriedControls(['buy'], ['browser_click:buy']),
      'the only control was acted on, so nothing is left',
    ).toEqual([]);
  });

  test('should leave a control untried when the label matches nothing', () => {
    // The stated bias. Two different authors name the same element — MCP for a human, the
    // accessibility tree for a machine — so they will sometimes disagree. An unmatched label
    // leaves the control in the frontier, which OVERSTATES what is left rather than claiming
    // completeness. Both biases in this module point that way on purpose.
    expect(
      untriedControls(['subscribe'], ['browser_click:some other thing entirely']),
      'erring towards "there is more to do" is the only safe direction for a coverage claim',
    ).toEqual(['subscribe']);
  });

  test('should not let a label with no control retire everything', () => {
    // A navigation consumes no affordance.
    expect(
      untriedControls(['one', 'two', 'three'], ['browser_navigate']),
      'a navigation acted on no control, so it retires none',
    ).toEqual(['one', 'three', 'two']);
  });

  test('should not let an empty control part match every control', () => {
    /**
     * The assertion the test above only looked like it was making. `browser_navigate` has no
     * colon at all, so it never reaches the empty-control branch — a poison that deleted that
     * branch left every test green. The shape that does reach it is a label whose control part is
     * present and blank, which `about()` accepts even though `moveLabel` does not emit one.
     *
     * It matters because `name.includes('')` is true for every name on earth: without the guard a
     * single such label retires the whole page and the run reports a fully explored app.
     */
    expect(
      untriedControls(['one', 'two', 'three'], ['browser_click:']),
      'a blank control name must match nothing, not everything',
    ).toEqual(['one', 'three', 'two']);
  });

  test('should ignore a nameless control rather than count it forever', () => {
    // An unnamed control cannot be matched by any label, so counting it would leave the frontier
    // permanently non-empty and the ceiling caveat permanently printed.
    expect(untriedControls(['', 'buy'], ['browser_click:buy'])).toEqual([]);
  });
});

test.describe('the frontier over a graph', () => {
  test('should find what a real sequence of looks left untried', () => {
    const model = new StateModel();
    const at = (url: string, names: string[]) => ({
      url,
      fingerprints: names.map(control),
      announcements: [],
    });

    model.observe(at('/', ['add to cart', 'checkout', 'search']));
    model.about(moveLabel('browser_click', { element: 'Add to cart' }));
    model.observe(at('/', ['add to cart', 'checkout', 'search', 'remove']));

    const open = frontier({
      states: model.graph().states,
      affordsIn: (state) => model.affordsIn(state),
      triedFrom: (state) => model.triedFrom(state),
    });
    const states = model.graph().states;

    expect(
      open.find((entry) => entry.state === states[0])?.untried,
      'the cart was clicked here, so only checkout and search are left in the first state',
    ).toEqual(['checkout', 'search']);
    expect(
      open.find((entry) => entry.state === states[1])?.untried,
      'and the state the click arrived at is new, so nothing has been tried from it at all — ' +
        'including the control that was clicked, which is a different move from here',
    ).toEqual(['add to cart', 'checkout', 'remove', 'search']);
  });

  test('should treat a look that harvests fewer controls as a different state', () => {
    /**
     * Written first as "merge rather than replace, so a flickering page cannot shrink the
     * frontier" — and a poison that replaced instead of merging left every test green. The state
     * key is **derived from** the control set, so the same key cannot arrive with a different one:
     * a re-render that drops a control produces a *different* state, and the merge guarded against
     * nothing.
     *
     * Worth pinning because the real consequence runs the other way. A flickering page inflates
     * the state count rather than deflating the frontier, and that is a cost of how finely this
     * model discriminates — recorded here rather than hidden behind a branch that never ran.
     */
    const model = new StateModel();
    model.observe({ url: '/', fingerprints: ['a', 'b', 'c'].map(control), announcements: [] });
    model.observe({ url: '/', fingerprints: [control('a')], announcements: [] });

    const states = model.graph().states;
    expect(states.length, 'same URL, fewer controls - a second state, not the same one').toBe(2);
    expect(model.affordsIn(states[0]!).sort(), 'and the first keeps everything it offered').toEqual(
      ['a', 'b', 'c'],
    );
    expect(model.affordsIn(states[1]!), 'while the second offers only what it had').toEqual(['a']);
  });

  test('should put the richest state first, because that is where to go next', () => {
    const open = frontier({
      states: ['thin', 'rich'],
      affordsIn: (state) => (state === 'rich' ? ['a', 'b', 'c', 'd'] : ['z']),
      triedFrom: () => [],
    });
    expect(open.map((entry) => entry.state)).toEqual(['rich', 'thin']);
  });

  test('should leave out a state with nothing left', () => {
    expect(
      frontier({ states: ['done'], affordsIn: () => ['only'], triedFrom: () => ['click:only'] }),
      'a state with nothing untried is not a frontier',
    ).toEqual([]);
  });
});

test.describe('what a run says about its own incompleteness', () => {
  const open = (untried: number): StateFrontier => ({
    state: `s${untried}`,
    untried: Array.from({ length: untried }, (_, i) => `c${i}`),
    tried: 1,
  });

  test('should count the controls and the states together', () => {
    const said = describeFrontier([open(3), open(2)], false).join('\n');
    expect(said, 'the total is what qualifies a state count').toContain('5 control(s) across 2');
  });

  test('should say a ceiling cut the run short, when it did', () => {
    /**
     * The whole point of item 83. A session stopped at its ceiling with the frontier still open
     * has measured its own budget, not the application — and nothing in the output said so while
     * `maxStates` was wired only to stopping.
     */
    const said = describeFrontier([open(4)], true).join('\n');
    expect(said, 'a state count that is really a budget must say which it is').toContain(
      'NOT a measure of the app',
    );
    expect(said, 'and what would change it').toContain('Raising maxStates');
  });

  test('should not claim a ceiling when none was reached', () => {
    // A caveat on every run is a caveat nobody reads, and this one would make an uncapped run
    // look truncated.
    expect(describeFrontier([open(4)], false).join('\n')).not.toContain('NOT a measure of the app');
  });

  test('should refuse to read an empty frontier as an explored app', () => {
    // The sentence that keeps this instrument honest. Nothing untried is not the same as nothing
    // left: a value never typed, a keyboard path, and a control the harvester cannot see are all
    // invisible to it.
    const said = describeFrontier([], false).join('\n');
    expect(said, 'it must say what it cannot see rather than imply completeness').toContain(
      'not the same as an app explored',
    );
  });
});

test.describe('handing what was discovered to the agent', () => {
  /**
   * The gap the whole frontier had until 2026-10-07: everything the observer learned went to
   * `console.error` and a post-run `summary()` — the operator, and a report. The session that could
   * act on an untried control was told nothing after its opening prompt.
   */

  const handover = (over: Partial<Handover> = {}): Handover => ({
    moved: null,
    surface: null,
    untriedHere: [],
    atCeiling: false,
    budgetLeft: null,
    ...over,
  });

  test('should tell the session what it has not touched where it is standing', () => {
    const said = handoverLine(
      handover({
        moved: '3 appeared — a state not seen before',
        untriedHere: ['checkout', 'search'],
      }),
    );

    expect(said, 'what the action did').toContain('3 appeared');
    expect(
      said,
      'and what is left here, which is the half that could not reach it before',
    ).toContain('checkout, search');
  });

  test('should say nothing at all when there is nothing to say', () => {
    /**
     * Silence is the default, and it is a budget decision rather than tidiness. A run is bounded by
     * tokens since 2026-10-06, so every line here is money and wall-clock taken from the session
     * itself. An action that moved nothing, into a state with nothing left, must cost nothing.
     */
    expect(handoverLine(handover()), 'nothing moved and nothing is left — send nothing').toBeNull();
  });

  test('should not tell the agent what to do', () => {
    /**
     * `formatActionPlan` settles this for the opening briefing — "Which deserve your budget is your
     * call — that judgement is the part no script makes" — and it holds here. A line that said "now
     * click Checkout" would replace the judgement that is the whole value of an exploratory role,
     * and turn the agent into a crawler that happens to cost model prices.
     */
    const said = handoverLine(handover({ untriedHere: ['checkout'] })) ?? '';

    expect(said, 'it reports a fact about what has been acted on').toContain(
      'nothing has acted on',
    );
    for (const order of ['you should', 'now click', 'try ', 'next, ', 'must ']) {
      expect(
        said.toLowerCase(),
        `"${order}" would be an instruction, not an observation`,
      ).not.toContain(order);
    }
  });

  test('should mark itself as the harness speaking, not the page', () => {
    // An agent that read this as page content would report the harness's own bookkeeping as a
    // finding — a defect claim against the product for something the product never said.
    expect(handoverLine(handover({ moved: 'something moved' }))).toContain('[harness]');
  });

  test('should say when the ceiling is what will stop it', () => {
    /**
     * The sentence `maxStates` could never produce while it was wired only to stopping. Without it
     * a session cannot tell a page that stopped changing from a harness that stopped letting it
     * move, and would read its own budget running out as the application having nothing left.
     */
    const said = handoverLine(handover({ atCeiling: true, untriedHere: ['a', 'b'] })) ?? '';

    expect(said, 'it must name the refusal that is coming').toContain('will be refused');
    expect(said, 'and tie it to what will therefore go unreached').toContain('will not reach');
  });

  test('should cap a long list rather than spend the budget on it', () => {
    // A state with forty controls would otherwise put forty names into the context after every
    // single action, paid for out of the token ceiling that bounds the run.
    const many = Array.from({ length: 40 }, (_, i) => `control ${i}`);
    const said = handoverLine(handover({ untriedHere: many })) ?? '';

    expect(said, 'the count is exact even when the list is not').toContain('40 control(s)');
    expect(said.length, 'but the line stays short enough to be worth sending').toBeLessThan(220);
  });
});

test.describe('telling a session its budget is nearly gone', () => {
  /**
   * The gap every live run on 2026-10-07 fell into: a session is handed its state ceiling and
   * nothing about its budget, so it is cut off mid-thought. None of them wrote a report, and each
   * then failed its gate on the formatting of its closing prose — a complaint about the wrong
   * thing entirely.
   */

  const handover = (over: Partial<Handover> = {}): Handover => ({
    moved: null,
    surface: null,
    untriedHere: [],
    atCeiling: false,
    budgetLeft: null,
    ...over,
  });

  test('should warn in time to act, not in time to know', () => {
    const said =
      handoverLine(handover({ budgetLeft: { fraction: 0.15, tightest: 'tokens' } })) ?? '';

    expect(said, 'how much is left').toContain('15%');
    expect(said, 'which limit it is').toContain('tokens');
    expect(said, 'and what to do with the rest of it').toContain('write up what you have');
  });

  test('should stay quiet while there is plenty left', () => {
    // A warning on every action is a warning nobody reads, and this one is paid for out of the
    // budget it is warning about.
    expect(
      handoverLine(handover({ budgetLeft: { fraction: 0.8, tightest: 'wall clock' } })),
      'four fifths left is not news',
    ).toBeNull();
  });

  test('should say nothing when nothing is bounded', () => {
    // Null is "no limit set", which must not print as "plenty left" — the two are different
    // facts and only one of them means the run is safe.
    expect(handoverLine(handover({ budgetLeft: null }))).toBeNull();
  });

  test('should name the tightest bound rather than the roomiest', () => {
    // A run with hours of clock and a spent token ceiling is as finished as one with the reverse.
    // Reporting whichever looks healthiest would be reassurance.
    const said =
      handoverLine(handover({ budgetLeft: { fraction: 0.05, tightest: 'wall clock' } })) ?? '';
    expect(said).toContain('wall clock');
  });

  test('should be the only instruction it ever gives', () => {
    /**
     * The narrow exception. Everything else here reports a fact and leaves the judgement to the
     * session; this one sentence is about the harness's own constraint rather than about what to
     * test. The test above for "should not tell the agent what to do" covers the ordinary case, and
     * this pins that the exception does not leak into it.
     */
    const ordinary = handoverLine(handover({ untriedHere: ['checkout'] })) ?? '';

    expect(
      ordinary.toLowerCase(),
      'with budget to spare, the harness still suggests nothing about what to do',
    ).not.toContain('write up');
  });
});
