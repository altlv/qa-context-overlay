import type { Page } from '@playwright/test';
import { ANNOUNCING } from './announcements.js';
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

/**
 * Where a surface *is*, derived from the controls that arrived with it.
 *
 * Everything above takes a `container` selector and nothing produced one, which is the whole
 * reason this module sat built and unused: `Transition.appeared` carries fingerprints, and a
 * fingerprint is an identity rather than an address. `harvestCandidates` does produce an address —
 * `Candidate.path`, a positional `nth-child` chain valid for this render — so the join is the
 * **deepest element all the arrived controls sit inside**, which is the common prefix of their
 * paths.
 *
 * Positional paths are exactly the kind of selector this harness reports as fragile, and that is
 * fine here for the same reason `heal.ts` gives: it is used within milliseconds of being built and
 * never written down.
 *
 * **Three limits, stated rather than discovered later.**
 *
 * A prefix of fewer than three steps is `html`, or `html > body` — controls arriving all over the
 * document is a page changing, not a surface arriving, so that returns null rather than
 * classifying the whole page as a popover.
 *
 * With a **single** arrived control the prefix is that control itself, so the properties describe
 * the control and not the panel around it. Climbing a level would be a guess about where the
 * surface starts, and a guess is what this module exists to avoid.
 *
 * A surface that brought **no controls at all** — a text-only toast — produces no arrival here,
 * because there is nothing to take a path from. That is not a hole in this function but the
 * division of labour: `readAnnouncements` is the projection that sees those, and it is already in
 * every state key.
 */
export function commonContainer(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const walks = paths.map(pathSteps);
  const first = walks[0]!;
  let shared = 0;
  while (shared < first.length) {
    const step = first[shared]!;
    const agrees = walks.every((walk) => {
      const other = walk[shared];
      return other !== undefined && other.step === step.step && other.sep === step.sep;
    });
    if (!agrees) break;
    shared += 1;
  }
  // `html`, or `html > body`: the arrivals share nothing but the document.
  if (shared < 3) return null;
  return first
    .slice(0, shared)
    .map((at, index) => (index === 0 ? at.step : ` ${at.sep} ${at.step}`))
    .join('');
}

/**
 * One path split into steps, keeping which separator preceded each.
 *
 * `>>` must survive as itself: it is a shadow boundary, and treating it as an ordinary `>` would
 * let a prefix cross a shadow root and produce a selector that reaches nothing.
 */
function pathSteps(path: string): { step: string; sep: string }[] {
  const parts = path.split(/ (>>?) /);
  const out = [{ step: parts[0] ?? '', sep: '' }];
  for (let index = 1; index < parts.length; index += 2) {
    out.push({ step: parts[index + 1] ?? '', sep: parts[index] ?? '>' });
  }
  return out;
}

/**
 * Whether a surface covers content, asked of the surface.
 *
 * **Not a second occlusion implementation, and the distinction is the point.**
 * `page-scanner.ts` asks the control-side question — *is this control covered by something?* — and
 * its answer is a per-control blocker string produced by a full scan. This asks the surface-side
 * question: *does this thing cover anything?* One is about a victim and one is about a culprit,
 * and no amount of the first answers the second. They share a primitive, and sharing a primitive
 * is not duplicating a definition — what `controls.ts` exists to prevent is two answers to **one**
 * question.
 *
 * A full scan after every action is also not affordable. This is one `elementsFromPoint` call.
 *
 * The stack at the surface's centre always contains `html`, `body` and every ancestor of the
 * surface, so none of those count: what counts is an element that is neither inside the surface
 * nor an ancestor of it. One of those under the surface's centre means a reader had something
 * there and now has this instead.
 */
export async function coversContent(page: Page, container: string): Promise<boolean> {
  try {
    return await page.evaluate((selector) => {
      const host = document.querySelector(selector);
      if (host === null) return false;
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || x >= window.innerWidth || y < 0 || y >= window.innerHeight) return false;
      for (const el of document.elementsFromPoint(x, y)) {
        // Inside the surface, or an ancestor of it: both are the surface's own business.
        if (el === host || host.contains(el) || el.contains(host)) continue;
        return true;
      }
      return false;
    }, container);
  } catch {
    // Gone mid-probe, or a page mid-navigation. False here is "not observed to cover"; the
    // caller's own failure path is what says a look could not be taken at all.
    return false;
  }
}

/**
 * Whether **this** surface is one of the things the page is saying.
 *
 * `readAnnouncements` answers the page-level question and cannot attribute a message to a surface,
 * which is what a classification needs: a toast is announced *and* floating, and a floating panel
 * sitting next to an unrelated live region elsewhere on the page is not a toast.
 *
 * Both directions count. A `role=status` wrapper whose text sits in a child is announcing, and so
 * is a control inside an alert region — the author marked a region as one that speaks, and whether
 * the marked element is the surface or its parent is markup style.
 */
export async function announcedWithin(page: Page, container: string): Promise<boolean> {
  try {
    return await page.evaluate(
      ([selector, announcing]: [string, string]) => {
        const host = document.querySelector(selector);
        if (host === null) return false;
        if (host.closest(announcing) !== null) return true;
        for (const el of Array.from(host.querySelectorAll(announcing))) {
          if (((el as HTMLElement).innerText ?? '').trim() !== '') return true;
        }
        return false;
      },
      [container, ANNOUNCING] as [string, string],
    );
  } catch {
    return false;
  }
}

export interface ObserveOptions {
  /**
   * Whether to pay for the lifetime observation.
   *
   * **Off by default, and that is a budget decision rather than an oversight.**
   * `vanishesUnprompted` waits up to six seconds, and a session that paid that after every action
   * would spend its wall-clock watching surfaces instead of testing the application. Left off, the
   * classifier is told the lifetime was *not observed* — which is why that field is nullable and
   * why a label resting on it comes back `provisional`.
   */
  watchLifetime?: boolean;
  lifetimeMs?: number;
}

/**
 * Observe one surface's properties, then let `classifySurface` decide what they mean.
 *
 * The split is the one `accessible-name.ts` uses: the part that needs a browser is here, and the
 * part that can be argued with in a unit test is pure.
 */
export async function observeSurface(
  page: Page,
  container: string,
  options: ObserveOptions = {},
): Promise<SurfaceProperties> {
  const [overlays, announced, floating] = await Promise.all([
    coversContent(page, container),
    announcedWithin(page, container),
    isFloating(page, container),
  ]);
  // Last and on its own: it presses Tab, so running it alongside the reads above would move focus
  // under them.
  const traps = await trapsFocus(page, container);
  const vanished =
    options.watchLifetime === true
      ? await vanishesUnprompted(page, container, options.lifetimeMs)
      : null;
  return { overlays, trapsFocus: traps, announced, floating, vanishedUnprompted: vanished };
}

export interface Arrival {
  /** The selector the properties were observed through, so a finding can be re-checked. */
  container: string;
  properties: SurfaceProperties;
  classification: Classification;
}

/**
 * What arrived, from the addresses of the controls that arrived with it.
 *
 * Null when the paths name no surface — see `commonContainer` for the three cases.
 */
export async function classifyArrival(
  page: Page,
  paths: string[],
  options: ObserveOptions = {},
): Promise<Arrival | null> {
  const container = commonContainer(paths);
  if (container === null) return null;
  // A surface is a *part* of the page. See `holdsMostOfPage`.
  if (await holdsMostOfPage(page, container)) return null;
  const properties = await observeSurface(page, container, options);
  return { container, properties, classification: classifySurface(properties) };
}

/**
 * Whether this "surface" is really the page.
 *
 * **The depth guard in `commonContainer` was not enough, and a live run proved it the same day it
 * was written.** Against academybugs on 2026-10-05 a transition of `53 appeared, 30 gone, 3
 * changed` — a page re-render by any reading — was classified `inline`, which is precisely the
 * outcome the depth guard exists to prevent. The guard refuses a prefix shorter than three steps,
 * on the reasoning that scattered arrivals share only `html > body`. That is true of the fixture
 * the unit test used and false of the web: academybugs is WordPress and nests everything under
 * `html > body > div#page > div#content`, so fifty-three unrelated arrivals still share a
 * four-step prefix and the prefix is not `body`.
 *
 * **Depth was the wrong question.** A surface is a part of the page, so the test is proportional:
 * if the container holds essentially every control in the document, it *is* the document, whatever
 * its nesting. A modal leaves the page's own navigation and links outside itself and so holds a
 * small share; a content wrapper holds all of it.
 *
 * The threshold is a judgement and is named rather than hidden. 0.9 was chosen because the two
 * cases are far apart in practice — a wrapper measures at or near 1.0, and a surface arriving over
 * a page that keeps its own controls measures well under half — so anything in between is a shape
 * worth a person's attention rather than a confident label, and `classifyArrival` returning null
 * is how it asks for one.
 */
export async function holdsMostOfPage(page: Page, container: string): Promise<boolean> {
  try {
    const share = await page.evaluate(
      ([selector, controls]: [string, string]) => {
        const host = document.querySelector(selector);
        if (host === null) return 0;
        const all = document.querySelectorAll(controls).length;
        if (all === 0) return 0;
        return host.querySelectorAll(controls).length / all;
      },
      [container, INTERACTIVE_SELECTOR] as [string, string],
    );
    return share >= 0.9;
  } catch {
    // Unreadable mid-navigation. False means "not shown to be the page", which lets the
    // classification proceed and be judged on its properties — the same direction the rest of
    // this module fails in.
    return false;
  }
}

/**
 * The lines a run summary carries about every surface it saw.
 *
 * Pure, and here rather than in `src/qe/observer.ts`, for the reason the whole module is split
 * this way: the observer needs a browser to produce an `Arrival`, so formatting written inside it
 * could only be exercised by driving Chromium — and the two rules below are exactly the sort that
 * rot silently. They were written once in the observer and moved here when it turned out they'd
 * have shipped untested.
 */
export function arrivalLines(arrivals: Arrival[]): string[] {
  if (arrivals.length === 0) return [];
  const lines: string[] = [];

  /**
   * The unnameable ones counted apart and printed in full, because they are the finding.
   *
   * A surface whose properties match no shape is either a product doing something the categories
   * do not cover or an instrument that has run out of vocabulary, and both are worth a
   * person's minute. Folding them into a tally of labels would undo the one thing
   * `classifySurface` was written to make possible.
   */
  const unnamed = arrivals.filter((arrival) => arrival.classification.kind === null);
  const counts = new Map<string, number>();
  for (const arrival of arrivals) {
    const kind = arrival.classification.kind;
    if (kind === null) continue;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const named = [...counts].map(([kind, n]) => `${n} ${kind}`).join();
  lines.push(
    `Surfaces that arrived: ${arrivals.length}` +
      `${named === '' ? '' : ` — ${named}`}` +
      `${unnamed.length === 0 ? '' : `, ${unnamed.length} this cannot name`}`,
  );
  for (const arrival of unnamed) {
    lines.push(`  ${arrival.container}: ${describeSurface(arrival.classification)}`);
  }

  /**
   * Counted, said once, and at the end.
   *
   * A reader seeing `3 toast` has been told something that rests on an observation nobody paid
   * for, and the hedge belongs where the tally is rather than only on an object a report may never
   * print. Said per-run rather than per-line because a caveat repeated on every line is a caveat
   * nobody reads.
   *
   * **Counted rather than all-or-nothing**, which is how this was first written and wrong: a run
   * with one lifetime observed and one not printed no caveat at all, so the label resting on
   * nothing went out bare. A mixed run is the normal case once a caller pays for some surfaces and
   * not others, which is exactly what `watchLifetime` is for.
   */
  const provisional = arrivals.filter((arrival) => arrival.classification.provisional);
  if (provisional.length > 0) {
    lines.push(
      `  ${provisional.length} of these rest on a lifetime that was not observed, so those ` +
        `labels are provisional: not watching is a budget choice (see ` +
        'ObserveOptions.watchLifetime) and not an observation that they stayed',
    );
  }
  return lines;
}
