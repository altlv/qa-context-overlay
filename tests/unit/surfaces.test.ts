import { test, expect } from '@playwright/test';
import {
  arrivalLines,
  classifySurface,
  commonContainer,
  describeSurface,
  type SurfaceProperties,
} from '../../src/tools/surfaces.js';

/**
 * A category derived from behaviour, never matched against a name.
 *
 * Item 4 listed the surfaces it wanted found — mini-cart, dropdown, modal, toast, drawer — and
 * the user read that correctly as plausible web structures rather than discovered ones. A name
 * list holds exactly as long as the thing in front of it agrees, which is the pattern that cost
 * four runs this fortnight. So every rule below is a conjunction of observed properties, and the
 * label is output.
 */

const props = (over: Partial<SurfaceProperties> = {}): SurfaceProperties => ({
  overlays: false,
  trapsFocus: false,
  announced: false,
  floating: false,
  vanishedUnprompted: null,
  ...over,
});

test.describe('deriving what a surface is', () => {
  test('should call a focus-trapping overlay a modal', () => {
    const result = classifySurface(
      props({ trapsFocus: true, overlays: true, floating: true, vanishedUnprompted: false }),
    );
    expect(result.kind).toBe('modal');
    expect(
      result.because.join(' '),
      'the label must carry the facts that produced it, or it cannot be argued with',
    ).toContain('traps focus');
    expect(result.provisional, 'its lifetime was observed, so nothing is hedged').toBe(false);
  });

  test('should call an announced floating surface that leaves on its own a toast', () => {
    const result = classifySurface(
      props({ announced: true, floating: true, vanishedUnprompted: true }),
    );
    expect(result.kind, 'all three properties observed, so nothing is hedged').toBe('toast');
    expect(
      result.because.join(' '),
      'the lifetime was paid for, so the label must say so rather than imply it',
    ).toContain('went away with nobody acting');
  });

  test('should call an announced surface in the flow a banner', () => {
    const result = classifySurface(props({ announced: true, floating: false }));
    expect(result.kind, 'an error summary or a cookie notice').toBe('banner');
  });

  test('should call a silent floating overlay a popover', () => {
    // A menu, a tooltip, a date picker: covers things, holds no focus, announces nothing. The
    // shape most often missed by hand, and nameable without knowing any of those three words.
    expect(classifySurface(props({ floating: true, overlays: true })).kind).toBe('popover');
  });

  test('should call a quiet in-flow arrival inline', () => {
    expect(
      classifySurface(props({ vanishedUnprompted: false })).kind,
      'an expanded section or a revealed field is not a surface worth alarming about',
    ).toBe('inline');
  });
});

test.describe('refusing to name a surface', () => {
  test('should return null rather than guess', () => {
    // A focus trap that covers nothing matches no shape above. The whole design rests on this
    // being possible: a classifier that always produces a category is one whose categories mean
    // nothing, and the loud unnameable case is the `unknown truths` rule applied to the
    // instrument rather than the agent.
    const result = classifySurface(props({ trapsFocus: true, overlays: false }));
    expect(result.kind, 'no shape fits, so no shape is claimed').toBeNull();
    expect(
      result.because.join(' '),
      'and every observed property is reported, so a person can judge it',
    ).toContain('trapsFocus=true');
  });

  test('should say what it could not name, louder than any label', () => {
    const said = describeSurface(classifySurface(props({ trapsFocus: true })));
    expect(said).toContain('cannot name');
    expect(
      said,
      'and must offer both readings: the page is unusual, or the categories are wrong',
    ).toContain('the categories are wrong');
  });
});

test.describe('an unobserved lifetime', () => {
  test('should not read as persistence', () => {
    // The property that costs a session wall-clock. Defaulting it to false would turn an unpaid
    // measurement into a confident label, which is the failure this repository keeps meeting.
    const unwatched = classifySurface(props({ announced: true, floating: true }));
    expect(unwatched.kind, 'it still looks like a toast').toBe('toast');
    expect(unwatched.provisional, 'but the answer is hedged, because it could change').toBe(true);
  });

  test('should hedge the description rather than the label alone', () => {
    const said = describeSurface(classifySurface(props({ announced: true, floating: true })));
    expect(said, 'a reader of the line must see the hedge without reading the object').toContain(
      'provisional',
    );
  });

  test('should stop calling it a toast once it is seen to persist', () => {
    const persisted = classifySurface(
      props({ announced: true, floating: true, vanishedUnprompted: false }),
    );
    expect(
      persisted.kind,
      'something announced that floats and stays is not a toast — paying for the observation changes the answer',
    ).not.toBe('toast');
  });
});

test.describe('finding where a surface is', () => {
  /**
   * The step that was missing, and the reason this module had no caller for a day: everything
   * above takes a container selector and nothing produced one. `harvestCandidates` gives each
   * control a positional path, so the surface is the deepest element the arrivals share.
   */
  const page = 'html:nth-child(1) > body:nth-child(1)';

  test('should take the deepest element every arrival sits inside', () => {
    expect(
      commonContainer([
        `${page} > div:nth-child(3) > button:nth-child(1)`,
        `${page} > div:nth-child(3) > button:nth-child(2)`,
      ]),
      'two controls arriving in one panel means the panel is what arrived',
    ).toBe(`${page} > div:nth-child(3)`);
  });

  test('should stop at the shallowest disagreement rather than the first', () => {
    // Three arrivals, two of them nested deeper. The container is the one element all three
    // share, not the one the first two share — a prefix walk that stopped early would name a
    // sub-panel and then observe the wrong element's layout.
    expect(
      commonContainer([
        `${page} > section:nth-child(2) > div:nth-child(1) > a:nth-child(1)`,
        `${page} > section:nth-child(2) > div:nth-child(1) > a:nth-child(2)`,
        `${page} > section:nth-child(2) > button:nth-child(2)`,
      ]),
    ).toBe(`${page} > section:nth-child(2)`);
  });

  test('should refuse to call the whole document a surface', () => {
    /**
     * The guard that keeps this from labelling navigations. Controls arriving at opposite ends of
     * `body` is a page changing, and classifying `body` would hand `classifySurface` the layout of
     * the document — which is in the flow, covers nothing and announces nothing, so every
     * navigation would be reported as an `inline` arrival. A confident label on every page load is
     * worse than no label at all.
     */
    expect(
      commonContainer([
        `${page} > header:nth-child(1) > a:nth-child(1)`,
        `${page} > footer:nth-child(9) > a:nth-child(1)`,
      ]),
      'a prefix of html > body names no surface',
    ).toBeNull();
  });

  test('should keep a shadow boundary as a boundary', () => {
    // `>>` is a shadow root, not a child step. Folding it into an ordinary `>` would produce a
    // CSS chain that crosses a boundary CSS cannot cross, and the selector would reach nothing —
    // which `coversContent` would then report as "covers nothing" rather than as a failure.
    expect(
      commonContainer([
        `${page} > my-cart:nth-child(2) >> div:nth-child(1) > button:nth-child(1)`,
        `${page} > my-cart:nth-child(2) >> div:nth-child(1) > button:nth-child(2)`,
      ]),
    ).toBe(`${page} > my-cart:nth-child(2) >> div:nth-child(1)`);
  });

  test('should not let a shadow step match a child step at the same depth', () => {
    // Same tags, same positions, different boundary. Treating these as agreeing would put the
    // container inside a shadow root one of them is not in.
    expect(
      commonContainer([
        `${page} > my-cart:nth-child(2) >> div:nth-child(1)`,
        `${page} > my-cart:nth-child(2) > div:nth-child(1)`,
      ]),
      'the separator is part of the step, because it says which tree the next step is in',
    ).toBe(`${page} > my-cart:nth-child(2)`);
  });

  test('should name the control itself when only one arrived', () => {
    // Documented rather than fixed: the properties then describe the control, not the panel
    // around it. Climbing a level would be a guess about where the surface starts, and guessing
    // is what this module exists to avoid.
    const one = `${page} > div:nth-child(3) > button:nth-child(1)`;
    expect(commonContainer([one])).toBe(one);
  });

  test('should return null when nothing arrived', () => {
    expect(commonContainer([]), 'no arrivals is no surface, not an empty selector').toBeNull();
  });
});

test.describe('what a run says about the surfaces it saw', () => {
  const arrival = (over: Partial<SurfaceProperties>, container = '#panel') => {
    const properties = props(over);
    return { container, properties, classification: classifySurface(properties) };
  };

  test('should say nothing at all when no surface arrived', () => {
    // A summary line that is always there is a line nobody reads, and "0 surfaces" on a run that
    // never opened one is noise in the only place a person looks.
    expect(arrivalLines([])).toEqual([]);
  });

  test('should tally the labels it could produce', () => {
    const lines = arrivalLines([
      arrival({ floating: true, overlays: true }),
      arrival({ floating: true, overlays: true }),
      arrival({ announced: true, floating: false }),
    ]).join('\n');

    expect(lines, 'the count comes first, because it is what a reader scans for').toContain(
      'Surfaces that arrived: 3',
    );
    expect(lines, 'two of one kind read as two of one kind').toContain('2 popover');
    expect(lines).toContain('1 banner');
  });

  test('should print an unnameable surface in full, not as a number', () => {
    /**
     * The rule that matters most here. An unnameable surface is either a product doing something
     * the categories do not cover or an instrument out of vocabulary, and a tally would hide both
     * — which would undo the single thing `classifySurface` was written to make possible.
     */
    const lines = arrivalLines([
      arrival({ floating: true, overlays: true }),
      arrival({ trapsFocus: true, overlays: false }, '#odd'),
    ]).join('\n');

    expect(lines, 'counted apart from the labels').toContain('1 this cannot name');
    expect(lines, 'and given its address, so a person can go and look').toContain('#odd');
    expect(lines, 'with the properties that produced the refusal').toContain('trapsFocus=true');
  });

  test('should admit once that no lifetime was paid for', () => {
    const lines = arrivalLines([arrival({ announced: true, floating: true })]).join('\n');

    expect(lines, 'a tally of toasts resting on an unobserved lifetime has to say so').toContain(
      'provisional',
    );
    expect(lines, 'and must name the reason as a choice rather than a failure').toContain(
      'budget choice',
    );
    expect(lines, 'with how many labels it applies to').toContain('1 of these');
  });

  test('should drop the caveat once any lifetime was observed', () => {
    // Instrument liveness for the caveat itself: a note that is always printed carries no
    // information, and this is the input that must switch it off.
    const lines = arrivalLines([
      arrival({ announced: true, floating: true, vanishedUnprompted: true }),
    ]).join('\n');

    expect(lines, 'the observation was paid for, so there is nothing to hedge').not.toContain(
      'provisional',
    );
  });

  test('should count the provisional labels on a mixed run rather than go silent', () => {
    /**
     * How this was written first, and wrong. The caveat fired only when *every* lifetime was
     * unobserved, so a run that paid for one surface and not the other printed no caveat at all and
     * the unpaid label went out bare. A mixed run is the normal case once a caller pays selectively,
     * which is the whole purpose of `watchLifetime`.
     */
    const lines = arrivalLines([
      arrival({ announced: true, floating: true, vanishedUnprompted: true }),
      arrival({ announced: true, floating: true }),
    ]).join('\n');

    expect(
      lines,
      'claiming every label is provisional would be as wrong as claiming none is',
    ).toContain('1 of these');
  });
});
