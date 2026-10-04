import { test, expect } from '@playwright/test';
import { normaliseAnnouncement } from '../../src/tools/announcements.js';

/**
 * What an announcement is reduced to before it identifies a state.
 *
 * The projection exists to close a blindness measured twice — a `role=status` toast and a
 * `role=alert` banner both left the state key unchanged. The risk in closing it is the opposite
 * error: a `role=timer` counting down, or a status reading "3 of 12 uploaded", would make every
 * look a new state and spend the state ceiling in seconds. A projection that thrashes is worse
 * than none, because it hides the screens it was added to reveal.
 */

test.describe('reducing an announcement to what identifies it', () => {
  test('should fold a counter so a tick is not a new state', () => {
    expect(
      normaliseAnnouncement('10 seconds left'),
      'a timer ticking must not spend the state ceiling one second at a time',
    ).toBe(normaliseAnnouncement('9 seconds left'));
    expect(
      normaliseAnnouncement('3 of 12 uploaded'),
      'nor must a progress counter, which is the same defect the accessible name had',
    ).toBe(normaliseAnnouncement('4 of 12 uploaded'));
  });

  test('should keep two different things the page says apart', () => {
    // The other direction, and the one that matters more: folding too hard would hide the very
    // messages this projection was added to see.
    expect(
      normaliseAnnouncement('Upload failed'),
      'folding too hard would hide the very messages this projection was added to see',
    ).not.toBe(normaliseAnnouncement('Upload complete'));
    expect(
      normaliseAnnouncement('Card declined'),
      'an error and a confirmation are the two most important things to tell apart',
    ).not.toBe(normaliseAnnouncement('Added to cart'));
  });

  test('should fold case and run-length whitespace', () => {
    expect(normaliseAnnouncement('  Saved   automatically\n')).toBe(
      normaliseAnnouncement('saved automatically'),
    );
  });

  test('should bound the length it keeps', () => {
    // A long block differing only past the bound folds, which is a deliberate floor on
    // discrimination rather than an accident: an announcement is a sentence, and a page using a
    // live region for an essay is doing something this projection was not built for.
    expect(normaliseAnnouncement('x'.repeat(200)).length).toBe(120);
  });
});
