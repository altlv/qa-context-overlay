import { test, expect } from '@playwright/test';
import {
  classifySurface,
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
