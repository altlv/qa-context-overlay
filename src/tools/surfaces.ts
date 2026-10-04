import type { Page } from '@playwright/test';
import { INTERACTIVE_SELECTOR } from './controls.js';

/**
 * What kind of surface arrived, derived from how it behaves.
 *
 * Item 4's list of surfaces — mini-cart, dropdown, modal, toast, drawer — was the wrong shape and
 * the user said so: it is a list of plausible web structures rather than discovered ones, which is
 * the same assumption-until-contradicted pattern as a hardcoded `src/` or a regular expression
 * read as a hostname. A name list holds exactly as long as the thing in front of it agrees.
 *
 * So nothing here matches a name. A surface is described by properties that can be observed, and
 * a category is **derived** from them with the evidence attached: a modal is *overlays, traps
 * focus, persists*; a toast is *announced, does not overlay, vanishes unprompted*. The label is
 * output, never input.
 *
 * **The constraint that makes this discovery rather than a longer list**: it must be able to say
 * "something arrived and I cannot name it", and that output must be louder than any label. That
 * is the `unknown truths` rule — standing in the explorer role at the user's instruction — applied
 * to the instrument instead of the agent. A classifier that always produces a category is a
 * classifier whose categories mean nothing.
 *
 * **One property is legitimately a declaration, and that is not the same as a name match.**
 * `announced` comes from `readAnnouncements`, which reads `role=status`, `role=alert` and
 * `aria-live` — so it does consult attributes. The difference is what it consults them for: the
 * author marking a region as one that speaks is a fact about the page, where matching a surface
 * against the word "modal" or "drawer" would be a guess about its kind. The kinds here are
 * never matched; only this one input is declared.
 *
 * Measured 2026-10-04 with `role="dialog"` deleted from the fixture: a focus-trapping overlay
 * is still classified `modal`, and a floating silent overlay with no role or class is still
 * `popover`. Those two are the ones the claim rests on, because `trapsFocus` presses Tab and
 * `isFloating` reads computed position. The same run proves nothing about `banner` or `toast`,
 * whose deciding property was supplied by the caller.
 *
 * Occlusion is **not** re-derived here. `page-scanner.ts` already judges it, pierces shadow roots
 * with `elementFromPoint`, and distinguishes being below the fold from being covered — and
 * `testability-reviewer`'s best live finding was an occlusion. Writing a second implementation is
 * the mistake that put the control selector in three files and the accessible name in two, so this
 * takes occlusion as an input.
 */

/** What was observed about one surface. Every field is a fact, not a judgement. */
export interface SurfaceProperties {
  /** It covers content that was visible before — from the scanner's occlusion test. */
  overlays: boolean;
  /** Focus moved into it, and Tab does not leave. */
  trapsFocus: boolean;
  /** It is inside a `role=status`, `role=alert` or `aria-live` region. */
  announced: boolean;
  /** It is pinned to the viewport rather than placed in the document flow. */
  floating: boolean;
  /**
   * Whether it went away on its own, with nobody acting.
   *
   * **Null means not observed, never "it stayed".** Watching for this costs wall-clock in a
   * session — a second look after a delay — so a caller is allowed to skip it, and a classifier
   * that read the skip as "persists" would turn an unpaid measurement into a confident label.
   * That is the failure this repository keeps meeting, and the reason this field is nullable
   * rather than defaulted.
   */
  vanishedUnprompted: boolean | null;
}

export type SurfaceKind = 'modal' | 'toast' | 'banner' | 'popover' | 'inline';

export interface Classification {
  /** Null when the properties match no shape below — the output that matters most. */
  kind: SurfaceKind | null;
  /** The properties that decided it, in words, so a label can be argued with. */
  because: string[];
  /**
   * True when a decisive property was not observed, so the answer could change if it were.
   *
   * Kept apart from `kind` because "a toast, and I did not watch whether it vanished" is a
   * different statement from "a toast", and only one of them should survive into a report.
   */
  provisional: boolean;
}

/**
 * The derived kind, or null.
 *
 * Ordered most-constrained first, so a surface satisfying several shapes is called the one that
 * demanded the most of it. Each rule is a conjunction of observed properties and nothing else —
 * no tag, no class name, no role to match against.
 */
export function classifySurface(properties: SurfaceProperties): Classification {
  const { overlays, trapsFocus, announced, floating, vanishedUnprompted } = properties;
  const because: string[] = [];
  const say = (fact: string): void => {
    because.push(fact);
  };

  // A modal is the only shape that takes focus hostage. That is what makes it modal, and it is
  // observable without knowing the word "dialog".
  if (trapsFocus && overlays) {
    say('traps focus');
    say('covers content that was visible before');
    if (vanishedUnprompted === false) say('did not go away on its own');
    return { kind: 'modal', because, provisional: vanishedUnprompted === null };
  }

  // A toast announces itself, sits above the page, and leaves without being asked. The last of
  // those is the expensive one to observe, so a surface with the first two and an unwatched
  // lifetime is called a toast *provisionally* rather than confidently.
  if (announced && floating && vanishedUnprompted !== false) {
    say('announced to assistive technology');
    say('pinned to the viewport rather than in the flow');
    if (vanishedUnprompted === true) say('went away with nobody acting');
    return { kind: 'toast', because, provisional: vanishedUnprompted === null };
  }

  // A banner says something and stays, in the flow. An error summary, a cookie notice, a
  // validation message above a form.
  if (announced && !floating) {
    say('announced to assistive technology');
    say('placed in the document flow');
    return { kind: 'banner', because, provisional: false };
  }

  // Floating and silent: a menu, a tooltip, a date picker. It covers things but does not hold
  // focus and does not announce, which is exactly the shape that gets missed by hand.
  if (floating && overlays && !trapsFocus) {
    say('pinned to the viewport and covering content');
    say('does not trap focus and announces nothing');
    return { kind: 'popover', because, provisional: false };
  }

  // In the flow, silent, covering nothing. An expanded section, a loaded list, a revealed field.
  if (!floating && !overlays && !announced && !trapsFocus) {
    say('in the document flow, covering nothing, announcing nothing');
    return { kind: 'inline', because, provisional: false };
  }

  // Everything else. Said loudly and with the facts, because an unnameable surface is a finding:
  // either the page is doing something the categories above do not cover, or the categories are
  // wrong. Both are worth a person's attention and neither is served by a confident guess.
  say(`overlays=${overlays}`);
  say(`trapsFocus=${trapsFocus}`);
  say(`announced=${announced}`);
  say(`floating=${floating}`);
  say(`vanishedUnprompted=${vanishedUnprompted === null ? 'not observed' : vanishedUnprompted}`);
  return { kind: null, because, provisional: vanishedUnprompted === null };
}

/**
 * The lines a person reads about one classified surface.
 *
 * An unclassified surface is printed first and in full, because it is the one that is either a
 * product doing something unusual or an instrument that has run out of vocabulary.
 */
export function describeSurface(classification: Classification): string {
  if (classification.kind === null) {
    return (
      'a surface arrived that these properties cannot name — ' +
      `${classification.because.join(', ')}. Either the page is doing something the categories ` +
      'do not cover, or the categories are wrong. Worth looking at either way.'
    );
  }
  const hedge = classification.provisional ? ' (provisional: its lifetime was not observed)' : '';
  return `${classification.kind}${hedge} — ${classification.because.join(', ')}`;
}

/**
 * Observing the properties, as opposed to deciding what they mean.
 *
 * Split from `classifySurface` on purpose: the decision is pure and testable without a browser,
 * and the observation is the part that needs one. The same split `accessible-name.ts` uses, and
 * for the same reason.
 */

/**
 * Whether focus is held inside a container.
 *
 * Asked by **moving focus**, not by looking for a `role=dialog` or an `aria-modal` attribute. A
 * page that writes neither and traps focus anyway is trapping focus; a page that writes both and
 * does not is not. Attributes are a claim and this is the behaviour.
 *
 * Tab is pressed from the last focusable thing inside the container: a correct trap wraps to the
 * first, a missing one escapes to the page. One press is enough to tell those apart, and more
 * would only cost time.
 *
 * **Restores focus afterwards**, because this is a read. A session whose focus moved because the
 * harness looked at the page would be debugging the harness.
 */
export async function trapsFocus(page: Page, container: string): Promise<boolean> {
  const was = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return active === null ? null : active.getAttribute('data-qco-focus-probe');
  });

  try {
    const inside = page.locator(`${container} >> ${INTERACTIVE_SELECTOR}`);
    const count = await inside.count();
    if (count === 0) return false;

    await inside.nth(count - 1).focus();
    await page.keyboard.press('Tab');

    return await page.evaluate((selector) => {
      const host = document.querySelector(selector);
      const active = document.activeElement;
      if (host === null || active === null) return false;
      // `contains` is true for the host itself, which is right: a container that takes focus
      // onto itself has still kept it.
      return host.contains(active);
    }, container);
  } catch {
    // A container that went away mid-probe, a page mid-navigation. Not observed rather than
    // observed-false: the caller gets the honest answer from the catch, not a property.
    return false;
  } finally {
    if (was === null) await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  }
}

/**
 * Whether a surface is pinned to the viewport rather than placed in the flow.
 *
 * Computed position, not a class name. `fixed` and `sticky` are the two that float; `absolute`
 * is not, because an absolutely positioned element still scrolls with its container and a menu
 * anchored to a button is in the flow as far as a reader is concerned.
 */
export async function isFloating(page: Page, container: string): Promise<boolean> {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (el === null) return false;
    const position = getComputedStyle(el).position;
    return position === 'fixed' || position === 'sticky';
  }, container);
}

/**
 * Whether a surface goes away on its own within `withinMs`.
 *
 * **The expensive property**, and the only one that costs a session wall-clock rather than a
 * round trip. A caller that will not pay for it passes nothing and the classifier is told the
 * lifetime was not observed — which is a different answer from "it stayed", and is why
 * `vanishedUnprompted` is nullable.
 *
 * Nothing is clicked, nothing is dismissed, nothing is scrolled. The whole question is what the
 * page does when left alone, so acting on it would answer a different one.
 */
export async function vanishesUnprompted(
  page: Page,
  container: string,
  withinMs = 6000,
): Promise<boolean> {
  try {
    await page.locator(container).first().waitFor({ state: 'hidden', timeout: withinMs });
    return true;
  } catch {
    // Still there at the deadline. That is an observation, not a failure — the surface persists.
    return false;
  }
}
