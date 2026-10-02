import type { Page } from '@playwright/test';
import { ariaLocator, readAria, selectorBlindSpots } from './aria.js';
import { accessibleNameFrom, type NameParts } from './accessible-name.js';

/**
 * Testability, as this harness defines it:
 *
 *   the ability to **identify** and **interact with** the available elements and
 *   objects, easily enough.
 *
 * All three parts carry weight. *Identify* is addressing one specific thing and
 * no other. *Interact* is being able to act on it once found — which is not
 * implied by finding it. *Easily enough* is the pragmatic bar: a workable route
 * counts, and it does not have to be the ideal one.
 *
 * Test ids are one way to satisfy the first half and were inherited from the
 * tooling, not from the definition. Most applications do not have them and are
 * testable anyway, so their absence is not reported as a defect here. What gets
 * reported is a failure of the definition itself:
 *
 *   identify   ambiguous (matches several) · unaddressable (position only)
 *   interact   disabled · readonly · covered by an overlay · off-screen
 *   observe    acted on, with no state exposed to assert against
 *
 * The last one matters most for exploration: an interaction whose outcome cannot
 * be observed yields no hypothesis to test.
 *
 * "Objects" in the definition extends past the DOM — the data dictionary in
 * `schema.ts` covers the values moving underneath.
 */

/** What you can do with an element. */
export type Affordance = 'input' | 'submit' | 'toggle' | 'control' | 'navigation';

export interface InputConstraints {
  name: string | null;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  /** Current value, truncated. The starting point for any boundary probe. */
  value: string | null;
  min: string | null;
  max: string | null;
  step: string | null;
  pattern: string | null;
  maxLength: number | null;
  /** For select elements: the option values on offer. */
  options: string[];
}

export interface ScannedElement {
  tag: string;
  type: string | null;
  role: string | null;
  accessibleName: string | null;
  testId: string | null;
  affordance: Affordance;
  /** Selector a generated test should use, best available. */
  suggested: string;
  /** False when `suggested` matches more than one element on the page. */
  unique: boolean;
  /** How much a test built on `suggested` can be trusted. */
  stability: 'stable' | 'text-dependent' | 'fragile';
  /** Populated for inputs, selects and textareas. */
  constraints: InputConstraints | null;
  /**
   * ARIA/DOM attributes that expose this control's state, e.g. `aria-expanded`.
   * Empty means acting on it produces nothing a test can assert against.
   */
  stateAttributes: Record<string, string>;
  /** Index of the form it belongs to, or null when it is not in one. */
  formIndex: number | null;
  /**
   * Why this element cannot be acted on, or null when it can. Being findable and
   * being usable are different halves of testability.
   */
  blocker: string | null;
}

/**
 * Who a finding is for.
 *
 * The first exploratory session run with this harness drowned in technicalities,
 * and this is why: one list mixed three audiences. A WCAG reflow failure is a
 * **defect in the product**; a selector that matches two elements is a problem
 * only for whoever automates it; an unscanned frame is neither, it is the map
 * admitting what it could not see.
 *
 * Most findings here turn out to be `['product', 'automation']`, and that is the
 * insight rather than a weakness of the split: a control with no accessible name
 * is an accessibility defect that this harness had been filing as a selector
 * complaint. Labelling it lets the tester read defects as defects and the
 * automator still see everything.
 */
export type Audience = 'product' | 'automation' | 'recon';

/**
 * How complete the inventory is allowed to claim to be.
 *
 * An inventory taken before the page stopped adding to itself is a floor, not a
 * total — the same distinction `crawl` already makes about page counts. Saying so
 * matters more than the missing entries: a short list that announces itself as
 * short can be worked with, and one that looks complete cannot.
 */
export type Settling = 'settled' | 'timed-out';

export interface TestabilityIssue {
  severity: 'high' | 'medium';
  /** Who should act on this. Never empty. */
  audience: Audience[];
  kind:
    | 'ambiguous'
    | 'unaddressable'
    | 'no-observable-state'
    | 'unlabelled-input'
    | 'unreachable'
    | 'unscanned-frame'
    | 'unscanned-shadow-root';
  element: string;
  problem: string;
  suggestion: string;
}

export interface PageScan {
  url: string;
  title: string;
  scannedAt: string;
  counts: {
    interactive: number;
    inputs: number;
    submits: number;
    stateful: number;
    /** Addressable but not actionable right now — the interact half. */
    blocked: number;
    withTestId: number;
    forms: number;
    tables: number;
  };
  /** Frame sources present on the page. Not scanned — an admitted blind spot. */
  frames: string[];
  /** Custom elements holding an open shadow root. Also not scanned. */
  shadowHosts: string[];
  interactive: ScannedElement[];
  /**
   * What the **browser's** accessibility tree reports that the selector sweep above did not
   * find, and what the page is currently announcing.
   *
   * A second source rather than a replacement: the sweep is what produces a healable selector
   * path, and the tree is what knows a role without being told a tag. Measured on 2026-10-02 —
   * the tree recovers `role=option`, `role=combobox` and 13 further controls on a CMS
   * storefront, one link on a Web Components storefront, and nothing at all on a plain static
   * page, where the two sources agree exactly. Full reasoning in `src/tools/aria.ts`.
   *
   * `unreadable` is non-zero when the snapshot held lines the parser could not understand, in
   * which case **this reading understates the page** and must not be read as a clean bill. It
   * has already earned that: polymer-shop quotes its cart nodes, because their name contains a
   * colon, and the first parser dropped both.
   */
  aria: {
    widgetsMissedBySelectors: { role: string; name: string | null; locator: string }[];
    announcing: { role: string; text: string | null }[];
    unreadable: number;
  };
  endpoints: { method: string; path: string; status: number | null }[];
  testability: TestabilityIssue[];
}

/** Attributes that carry a control's state, and so make an outcome assertable. */
const STATE_ATTRIBUTES = [
  'aria-expanded',
  'aria-pressed',
  'aria-checked',
  'aria-selected',
  'aria-current',
  'aria-invalid',
  'aria-disabled',
  'aria-busy',
  'open',
  'checked',
  'disabled',
];

/**
 * Names that imply the control flips between two states. Such a control with no
 * state attribute is a real finding: you can press it and cannot prove anything
 * happened.
 */
const TOGGLE_WORDS = [
  'show',
  'hide',
  'expand',
  'collapse',
  'open',
  'close',
  'start',
  'stop',
  'play',
  'pause',
  'mute',
  'unmute',
  'enable',
  'disable',
  'toggle',
  'more',
  'less',
];

export async function scanPage(
  page: Page,
  options: { within?: string; testIdAttribute?: string } = {},
): Promise<PageScan> {
  const scope = options.within ?? null;
  const testIdAttr = options.testIdAttribute ?? 'data-testid';

  // Everything below runs in the browser. It deliberately contains no named or
  // const-assigned functions: tsx/esbuild rewrites those with a `__name` helper
  // that does not exist in the page, and evaluate fails at runtime.
  const collected = await page.evaluate(
    ([testIdAttr, scope, stateAttributes]: [string, string | null, string[]]) => {
      const SELECTOR =
        'button, a[href], input, select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [contenteditable=true]';

      // Scrolling is needed to judge occlusion honestly (see below), so the
      // position is restored before returning — a read-only scan must not leave
      // the page somewhere the caller did not put it.
      const scrolledFrom = { x: window.scrollX, y: window.scrollY };

      const forms = Array.from(document.querySelectorAll('form'));

      // Frames are a blind spot, not an absence. querySelectorAll never crosses
      // into them, so an app that iframes its real content would otherwise be
      // reported as a nearly empty page — a wrong answer stated confidently.
      const frames = Array.from(document.querySelectorAll('iframe, frame')).map(
        (frame) => frame.getAttribute('src') ?? '(no src)',
      );

      // querySelectorAll does not descend into a shadow root, so a Web Components
      // app looks like an empty page. Declaring that as a blind spot was honest and
      // useless: the Polymer shop reported zero interactive elements while being a
      // working storefront. So walk the open roots.
      //
      // Iterative rather than recursive on purpose — a named helper here would be
      // rewritten to call the __name shim that does not exist in page context.
      const shadowHosts: string[] = [];
      const searchRoots: (Document | ShadowRoot | Element)[] = [
        scope === null ? document : (document.querySelector(scope) ?? document),
      ];
      const collected: Element[] = [];

      for (let index = 0; index < searchRoots.length; index += 1) {
        const root = searchRoots[index];
        if (root === undefined) continue;

        for (const el of Array.from(root.querySelectorAll(SELECTOR))) collected.push(el);

        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.shadowRoot !== null) {
            shadowHosts.push(el.tagName.toLowerCase());
            searchRoots.push(el.shadowRoot);
          }
        }
      }

      const result = {
        title: document.title,
        forms: forms.length,
        frames,
        shadowHosts: [...new Set(shadowHosts)],
        tables: document.querySelectorAll('table').length,
        elements: collected
          .filter((el) => {
            if ((el as HTMLInputElement).type === 'hidden') return false;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return false;
            const style = getComputedStyle(el);
            return style.visibility !== 'hidden' && style.display !== 'none';
          })
          .map((el) => {
            // Two separate casts rather than an intersection: intersecting the
            // two narrows `type` to the select-only union and the input checks
            // below stop compiling.
            const input = el as HTMLInputElement;
            const select = el as HTMLSelectElement;
            const isFormField =
              el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';

            const state: Record<string, string> = {};
            for (const attribute of stateAttributes) {
              const value = el.getAttribute(attribute);
              if (value !== null) state[attribute] = value;
            }
            // Checkedness is a property, not only an attribute: a checkbox the
            // user has clicked reports checked=true with no attribute present.
            if (isFormField && (input.type === 'checkbox' || input.type === 'radio')) {
              state['checked'] = String(input.checked);
            }

            const owningForm = el.closest('form');

            // Can it actually be acted on? Identifying an element is only half of
            // testability; a control that is covered, off-screen or disabled is
            // addressable and still unusable.
            let blocker: string | null = null;

            // Ask the question in the layout the click will actually happen in.
            //
            // Playwright scrolls an element into view before acting on it, so
            // hit-testing the page where it happens to be sitting answers about a
            // moment that never occurs. Against a real site that produced two
            // confident "covered by <section>" findings for links a trial click
            // opens without complaint. The reasoning was already written down one
            // branch above — being below the fold is not a blocker, because
            // Playwright scrolls first — and simply had not been carried across to
            // occlusion.
            el.scrollIntoView({ block: 'center', inline: 'center' });

            const rect = el.getBoundingClientRect();
            const centreX = rect.left + rect.width / 2;
            const centreY = rect.top + rect.height / 2;
            // elementFromPoint only answers for points inside the viewport, and an
            // element taller than the viewport still has its centre outside it even
            // after scrolling. Clamping onto the edge samples something else
            // entirely, so occlusion is only judged where it can be observed.
            const centreInView =
              centreX >= 0 && centreX < window.innerWidth && centreY >= 0 && centreY < innerHeight;

            if (input.disabled === true) {
              blocker = 'disabled';
            } else if (isFormField && input.readOnly === true) {
              blocker = 'readonly';
            } else if (centreInView) {
              // Whatever the browser would actually hand the click to. If that is
              // not this element or something inside it, a real click lands on an
              // overlay instead — the classic "cookie banner ate the test".
              //
              // elementFromPoint stops at a shadow host, so on a Web Components app
              // every control reported as "covered by" its own container. Descend
              // through each root at the same point to reach what is really on top.
              let atPoint = document.elementFromPoint(centreX, centreY);
              while (atPoint !== null && atPoint.shadowRoot !== null) {
                const deeper = atPoint.shadowRoot.elementFromPoint(centreX, centreY);
                if (deeper === null || deeper === atPoint) break;
                atPoint = deeper;
              }

              if (atPoint !== null && atPoint !== el && !el.contains(atPoint)) {
                const covering = atPoint.tagName.toLowerCase();
                const coveringId = atPoint.getAttribute('id');
                blocker = `covered by <${covering}${coveringId === null ? '' : `#${coveringId}`}>`;
              }
            }

            return {
              blocker,
              tag: el.tagName.toLowerCase(),
              type: el.getAttribute('type'),
              role: el.getAttribute('role'),
              id: el.getAttribute('id'),
              testId: el.getAttribute(testIdAttr),
              ariaLabel: el.getAttribute('aria-label'),
              labelledByText: el.getAttribute('aria-labelledby')
                ? (document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ??
                  null)
                : null,
              labelText: el.getAttribute('id')
                ? (document.querySelector(`label[for="${CSS.escape(el.getAttribute('id') ?? '')}"]`)
                    ?.textContent ?? null)
                : null,
              text: (el as HTMLElement).innerText ?? null,
              // An icon button or a logo link has no text of its own; the alt of
              // the image inside it is what names it.
              imageAlt: Array.from(el.querySelectorAll('img[alt]'))
                .map((image) => image.getAttribute('alt') ?? '')
                .filter((alt) => alt !== '')
                .join(' '),
              // input[type=submit] is labelled by its value, not by any text.
              value:
                el.tagName === 'INPUT' && (input.type === 'submit' || input.type === 'button')
                  ? (el.getAttribute('value') ?? null)
                  : null,
              title: el.getAttribute('title'),
              placeholder: el.getAttribute('placeholder'),
              stateAttributes: state,
              formIndex: owningForm === null ? null : forms.indexOf(owningForm),
              constraints: isFormField
                ? {
                    name: el.getAttribute('name'),
                    required: el.hasAttribute('required'),
                    disabled: input.disabled === true,
                    readOnly: input.readOnly === true,
                    value: (input.value ?? '').slice(0, 80),
                    min: el.getAttribute('min'),
                    max: el.getAttribute('max'),
                    step: el.getAttribute('step'),
                    pattern: el.getAttribute('pattern'),
                    maxLength:
                      input.maxLength !== undefined && input.maxLength >= 0
                        ? input.maxLength
                        : null,
                    options:
                      el.tagName === 'SELECT'
                        ? Array.from(select.options ?? [])
                            .slice(0, 25)
                            .map((option) => option.value)
                        : [],
                  }
                : null,
            };
          }),
      };

      window.scrollTo(scrolledFrom.x, scrolledFrom.y);
      return result;
    },
    [testIdAttr, scope, STATE_ATTRIBUTES] as [string, string | null, string[]],
  );

  const partial = collected.elements.map((raw) => {
    const accessible = accessibleNameFrom(raw satisfies NameParts);

    // Framework-generated ids (React's :r0:, Ember, ExtJS) change between builds,
    // so they are no better than a positional selector.
    const hasStableId =
      raw.id !== null && raw.id !== '' && !/^[0-9]|:r[0-9a-z]+:|^ember|^ext-gen/i.test(raw.id);

    const role = raw.role ?? defaultRole(raw.tag, raw.type);

    let suggested: string;
    let stability: ScannedElement['stability'];

    if (raw.testId) {
      suggested = `getByTestId('${raw.testId}')`;
      stability = 'stable';
    } else if (hasStableId && raw.id) {
      // A hand-written id is not a test id, but it is not positional either, and
      // in most codebases it is the best hook that actually exists.
      suggested = `locator('#${raw.id}')`;
      stability = 'stable';
    } else if (accessible) {
      suggested = role
        ? `getByRole('${role}', { name: ${JSON.stringify(accessible)} })`
        : `getByText(${JSON.stringify(accessible)})`;
      stability = 'text-dependent';
    } else {
      suggested = `locator('${raw.tag}')`;
      stability = 'fragile';
    }

    return {
      raw,
      element: {
        tag: raw.tag,
        type: raw.type,
        role: raw.role,
        accessibleName: accessible,
        testId: raw.testId,
        affordance: affordanceOf(raw.tag, raw.type, role, accessible),
        suggested,
        unique: true,
        stability,
        constraints: raw.constraints,
        stateAttributes: raw.stateAttributes,
        formIndex: raw.formIndex,
        blocker: raw.blocker,
      } satisfies ScannedElement,
    };
  });

  const interactive = markUniqueness(partial.map(({ element }) => element));

  // The second source. Wrapped because a page that will not produce a snapshot must not fail
  // the whole scan — but the failure is reported as unreadable lines rather than as an empty
  // reading, so a scan can never claim the tree agreed with the sweep when it was never read.
  let ariaReading: PageScan['aria'] = {
    widgetsMissedBySelectors: [],
    announcing: [],
    unreadable: 0,
  };
  try {
    const reading = await readAria(page, scope ?? 'body');
    const missed = selectorBlindSpots(
      // `el.role` is the raw attribute, which is null for a plain `<a>` or `<button>`, while the
      // accessibility tree always reports a computed role. Joining on the raw value made every
      // ordinary link look like a blind spot: 79 reported against a measured 13 on the same page.
      // `defaultRole` is the mapping the scan already uses for its own suggested locators, so
      // this reuses it rather than inventing a second one.
      interactive.map((el) => ({
        role: el.role ?? defaultRole(el.tag, el.type),
        name: el.accessibleName,
      })),
      reading.widgets,
    );
    ariaReading = {
      widgetsMissedBySelectors: missed.map((node) => ({
        role: node.role,
        name: node.name,
        locator: ariaLocator(node),
      })),
      announcing: reading.announcements.map((node) => ({ role: node.role, text: node.text })),
      unreadable: reading.unparsed,
    };
  } catch {
    ariaReading = { widgetsMissedBySelectors: [], announcing: [], unreadable: -1 };
  }

  return {
    url: page.url(),
    title: collected.title,
    scannedAt: new Date().toISOString(),
    counts: {
      interactive: interactive.length,
      inputs: interactive.filter((el) => el.affordance === 'input').length,
      submits: interactive.filter((el) => el.affordance === 'submit').length,
      stateful: interactive.filter((el) => Object.keys(el.stateAttributes).length > 0).length,
      blocked: interactive.filter((el) => el.blocker !== null).length,
      withTestId: interactive.filter((el) => el.testId !== null).length,
      forms: collected.forms,
      tables: collected.tables,
    },
    frames: collected.frames,
    shadowHosts: collected.shadowHosts,
    interactive,
    aria: ariaReading,
    endpoints: [],
    testability: auditTestability(interactive, collected.frames, collected.shadowHosts),
  };
}

/**
 * Flags every element whose suggested selector is shared with another.
 *
 * Ambiguity is the failure people actually hit: two controls with the same role
 * and name make `getByRole` throw a strict-mode violation at runtime, test ids or
 * not. Pure and exported so it can be unit-tested — it lived inside `scanPage`
 * until a surviving mutation showed that blanking it left the suite green,
 * because the only test covering it needed a browser and the mutation runner does
 * not start one.
 */
export function markUniqueness<T extends { suggested: string }>(
  elements: T[],
): (T & { unique: boolean })[] {
  const occurrences = new Map<string, number>();
  for (const element of elements) {
    occurrences.set(element.suggested, (occurrences.get(element.suggested) ?? 0) + 1);
  }
  return elements.map((element) => ({
    ...element,
    unique: (occurrences.get(element.suggested) ?? 0) === 1,
  }));
}

function affordanceOf(
  tag: string,
  type: string | null,
  role: string | null,
  name: string | null,
): Affordance {
  if (tag === 'a') return 'navigation';
  if (type === 'submit' || (tag === 'button' && (type === null || type === 'submit'))) {
    // A <button> with no type inside a form submits it, which is the single most
    // consequential default in HTML and the one a policy needs to know about.
    if (type === 'submit') return 'submit';
  }
  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    if (type === 'checkbox' || type === 'radio') return 'toggle';
    if (type === 'submit' || type === 'button') return 'submit';
    return 'input';
  }
  if (role === 'checkbox' || role === 'switch' || role === 'tab') return 'toggle';
  if (name !== null && TOGGLE_WORDS.some((word) => name.toLowerCase().includes(word))) {
    return 'toggle';
  }
  return 'control';
}

/**
 * The role a tag implies when the markup does not say one.
 *
 * Exported because the healer needs the same answer: comparing the raw `role`
 * attribute would leave the signal uncomparable on the great majority of pages,
 * which write no roles at all.
 */
export function defaultRole(tag: string, type: string | null): string | null {
  if (tag === 'button') return 'button';
  if (tag === 'a') return 'link';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'submit' || type === 'button') return 'button';
    return 'textbox';
  }
  return null;
}

/**
 * Findings a QE would actually raise. Note what is *not* here: "this element has
 * no test id". That is the normal state of most applications and is not, by
 * itself, a problem worth anyone's attention.
 */
export function auditTestability(
  elements: ScannedElement[],
  frames: string[] = [],
  shadowHosts: string[] = [],
): TestabilityIssue[] {
  const issues: TestabilityIssue[] = [];

  // Frames still bound everything below them. Shadow roots no longer do: open
  // roots are walked, so their controls appear in the inventory above rather than
  // as a caveat. A *closed* root cannot be detected at all, let alone entered,
  // which is a limit worth knowing but not one we can report per element.
  for (const src of frames) {
    issues.push({
      severity: 'medium',
      kind: 'unscanned-frame',
      // Not a defect and not an automation problem: the map declaring a blind spot.
      audience: ['recon'],
      element: `<iframe src="${src}">`,
      problem:
        'This scan does not cross into frames, so anything inside it is unexamined. A clean result above says nothing about this content.',
      suggestion:
        'Scan the frame URL directly, or use frameLocator() in tests and treat this area as uncovered until then.',
    });
  }

  // Open shadow roots are walked, so their controls are in the inventory rather
  // than behind a caveat, and `shadowHosts` is now a fact about the page's
  // construction instead of a finding. It stays in the scan output because it
  // changes how selectors behave: hand-written CSS descendant chains do not cross
  // a shadow boundary even though Playwright's own engines do.
  void shadowHosts;

  for (const el of elements) {
    const describe = `<${el.tag}${el.type === null ? '' : ` type=${el.type}`}>${
      el.accessibleName === null ? '' : ` "${el.accessibleName}"`
    }`;

    // Order matters. A nameless control that is also duplicated is duplicated
    // *because* it is nameless, so the actionable finding is the missing name.
    // Ambiguity is reported for elements that do have a name and still collide.
    if (el.stability === 'fragile' && el.affordance !== 'input') {
      issues.push({
        severity: 'high',
        kind: 'unaddressable',
        // Both halves, and the product half is the one that got lost: a control
        // with no accessible name announces as nothing to a screen reader.
        audience: ['product', 'automation'],
        element: describe,
        problem: 'No accessible name, no id and no test id — only reachable by position.',
        suggestion: 'Give it an accessible name (aria-label, or real label text).',
      });
      continue;
    }

    if (!el.unique) {
      issues.push({
        severity: 'high',
        kind: 'ambiguous',
        // The only automation-only finding here. A person looking at the page can
        // see which Edit button they mean; strict mode cannot.
        audience: ['automation'],
        element: describe,
        problem: `More than one element matches ${el.suggested}. A test using it fails on strict-mode violation, not on the behaviour it meant to check.`,
        suggestion:
          'Disambiguate by scoping to a container, or give this one a distinguishing name.',
      });
      continue;
    }

    // Before the generic case: an unlabelled input is always also positionally
    // addressed, so the generic branch would swallow it and the more specific,
    // more actionable finding would never be reachable.
    if (el.affordance === 'input' && el.accessibleName === null) {
      issues.push({
        severity: 'high',
        kind: 'unlabelled-input',
        audience: ['product', 'automation'],
        element: describe,
        problem: 'An input with no label cannot be filled reliably, nor read by anyone using AT.',
        suggestion:
          'Associate a <label for="...">, or add aria-label, so the field is addressable and announced.',
      });
      continue;
    }

    if (el.stability === 'fragile') {
      issues.push({
        severity: 'high',
        kind: 'unaddressable',
        audience: ['product', 'automation'],
        element: describe,
        problem: 'No accessible name, no id and no test id — only reachable by position.',
        suggestion: 'Give it an accessible name (aria-label, or real label text).',
      });
      continue;
    }

    // The interact half of the definition. `disabled` and `readonly` are usually
    // deliberate product states rather than defects, so only the cases that
    // genuinely surprise a test author are raised.
    if (el.blocker !== null && el.blocker !== 'disabled' && el.blocker !== 'readonly') {
      issues.push({
        severity: 'high',
        kind: 'unreachable',
        // A covered control is not a testing inconvenience. Nobody can click it.
        audience: ['product', 'automation'],
        element: describe,
        problem: `Addressable but not actionable: ${el.blocker}. A click resolves to something else, so the test fails somewhere far from the cause.`,
        suggestion:
          'Dismiss or scope out the overlay, scroll it into view first, or fix the stacking so the control receives its own clicks.',
      });
      continue;
    }

    if (el.affordance === 'toggle' && Object.keys(el.stateAttributes).length === 0) {
      issues.push({
        severity: 'medium',
        kind: 'no-observable-state',
        // Assistive technology cannot announce a state the page never exposes, so
        // this is a product defect as much as an assertion problem.
        audience: ['product', 'automation'],
        element: describe,
        problem:
          'This control changes state but exposes none: no aria-pressed, aria-expanded, aria-checked or equivalent. You can act on it and cannot assert the result.',
        suggestion:
          'Expose the state with the matching ARIA attribute, so the outcome is observable rather than inferred from styling.',
      });
    }
  }

  return issues;
}

/**
 * The scan as three reports, for three readers, in the order they are needed.
 *
 * **The map** answers "how large is the play area" and makes no judgements. **The
 * product findings** are defects in the thing itself. **Automation readiness** is
 * about driving the page, and comes last because it only matters once you know
 * what is worth keeping.
 *
 * They used to be one list. A WCAG reflow failure appeared under the heading
 * "Testability findings" between two selector complaints, and the first
 * exploratory session run with this harness spent itself on selectors while the
 * money on the page was wrong. The map is the denominator, the session is the
 * numerator, automation prep is downstream of both.
 */
export function formatScan(
  scan: PageScan,
  options: { alsoProduct?: string[]; settled?: Settling } = {},
): string {
  const { counts } = scan;
  const forAudience = (who: Audience): TestabilityIssue[] =>
    scan.testability.filter((issue) => issue.audience.includes(who));

  const lines = [
    `${scan.title}`,
    `${scan.url}`,
    '',
    '--- THE MAP - how large is the play area ---',
    '',
    // How much the map is entitled to claim, before the counts it applies to. A
    // reader who takes an incomplete inventory for a complete one designs against
    // it — and the page where that happened had written `min=1 max=10` on a field
    // the scan never saw.
    ...(options.settled === 'timed-out'
      ? [
          'INVENTORY IS A FLOOR: the page was still active when this was taken, so',
          'anything added later is missing. Treat every count below as "at least".',
          '',
        ]
      : []),
    ...(options.settled === 'settled'
      ? ['Inventory taken after the page stopped adding to itself.', '']
      : []),
    `Interactive: ${counts.interactive}  (${counts.inputs} input, ${counts.submits} submit, ${counts.stateful} expose state, ${counts.blocked} blocked)`,
    `Forms: ${counts.forms}   Tables: ${counts.tables}   Test ids: ${counts.withTestId}`,
    '',
  ];

  if (scan.frames.length > 0) {
    lines.push(
      `Frames: ${scan.frames.length} NOT scanned - content inside is unexamined:`,
      ...scan.frames.map((src) => `  ${src}`),
      '',
    );
  }

  if (scan.shadowHosts.length > 0) {
    lines.push(
      `Shadow roots: ${scan.shadowHosts.length} open host(s), walked - their controls are included above:`,
      ...scan.shadowHosts.map((host) => `  <${host}>`),
      '  A hand-written CSS descendant chain will not cross these boundaries, though',
      "  Playwright's own selector engines do. A closed root cannot be detected at all.",
      '',
    );
  }

  const inputs = scan.interactive.filter((el) => el.constraints !== null);
  if (inputs.length > 0) {
    lines.push('Inputs - the surface a boundary probe works on:');
    for (const el of inputs.slice(0, 20)) {
      const c = el.constraints;
      if (c === null) continue;
      const bounds = [
        c.required ? 'required' : null,
        c.min === null ? null : `min=${c.min}`,
        c.max === null ? null : `max=${c.max}`,
        c.maxLength === null ? null : `maxlength=${c.maxLength}`,
        c.pattern === null ? null : `pattern=${c.pattern}`,
        c.disabled ? 'disabled' : null,
        c.readOnly ? 'readonly' : null,
        c.options.length > 0 ? `options=${c.options.length}` : null,
      ]
        .filter((entry) => entry !== null)
        .join(' ');
      const label = el.accessibleName ?? c.name ?? '(unlabelled)';
      lines.push(
        `  ${el.suggested}  "${label}"${bounds === '' ? '' : `  [${bounds}]`}${
          c.value === '' || c.value === null ? '' : `  = ${c.value}`
        }`,
      );
    }
    // A declared min/max is a boundary specification the page handed over for
    // free. Saying so is still map rather than judgement - what to do with it is
    // the session's call, and for two sessions nobody made that call.
    lines.push('  Each bound above is a boundary the page declared. Probe it.', '');
  }

  const stateful = scan.interactive.filter((el) => Object.keys(el.stateAttributes).length > 0);
  if (stateful.length > 0) {
    lines.push('Observable state - what an interaction can be asserted against:');
    for (const el of stateful.slice(0, 20)) {
      const pairs = Object.entries(el.stateAttributes)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      lines.push(`  ${el.accessibleName ?? el.suggested}  ${pairs}`);
    }
    lines.push('');
  }

  for (const issue of forAudience('recon')) {
    lines.push(`Blind spot: ${issue.element}`, `  ${issue.problem}`, '');
  }

  // Grouped by kind, not listed one per element. Re-running against a real site
  // printed the same "unaddressable <a>" line twenty times and buried everything
  // else — which defeats the point of giving a product owner their own section.
  // One line per kind, a count, and a few examples is the same information a
  // person can act on.
  const render = (issues: TestabilityIssue[]): void => {
    const byKind = new Map<string, TestabilityIssue[]>();
    for (const issue of issues) {
      const group = byKind.get(issue.kind) ?? [];
      group.push(issue);
      byKind.set(issue.kind, group);
    }
    for (const [kind, group] of byKind) {
      const first = group[0]!;
      const count = group.length === 1 ? '' : ` x${group.length}`;
      lines.push(`  [${first.severity}] ${kind}${count}`, `      ${first.problem}`);
      const named = [...new Set(group.map((issue) => issue.element))].slice(0, 4);
      lines.push(`      ${named.join('  ')}${group.length > named.length ? '  ...' : ''}`);
      lines.push(`      fix: ${first.suggestion}`);
    }
  };

  // The deep passes hand their defects in here rather than printing their own
  // section. One product section or none: a reader who has to assemble the
  // defect list from two places is back where the split started.
  const product = forAudience('product');
  const alsoProduct = options.alsoProduct ?? [];
  lines.push('--- PRODUCT FINDINGS - defects in the thing itself ---', '');
  if (product.length > 0 || alsoProduct.length > 0) {
    render(product);
    lines.push(...alsoProduct);
  } else {
    lines.push(
      '  None from the static pass. This says nothing about behaviour: a scan',
      "  looks, it does not interact. Judging the product is the session's job.",
    );
  }
  lines.push('');

  const automation = forAudience('automation');
  const ambiguous = scan.interactive.filter((el) => !el.unique).length;
  const byStability = { stable: 0, 'text-dependent': 0, fragile: 0 };
  for (const el of scan.interactive) byStability[el.stability] += 1;
  lines.push(
    '--- AUTOMATION READINESS - can this be driven, and will it rot ---',
    '',
    `Addressability: ${byStability.stable} stable, ${byStability['text-dependent']} by name, ${byStability.fragile} positional, ${ambiguous} ambiguous`,
    '',
  );
  if (automation.length > 0) {
    render(automation);
  } else {
    lines.push('  None - every control is uniquely addressable.');
  }

  // The second source, and only when it has something to say. Printed here rather than beside
  // the inventory because what it reports is a disagreement between two ways of looking, which
  // is a fact about the instrument as much as about the page — and a reader deciding how far to
  // trust the inventory above needs it.
  const aria = scan.aria;
  if (
    aria !== undefined &&
    (aria.widgetsMissedBySelectors.length > 0 ||
      aria.announcing.length > 0 ||
      aria.unreadable !== 0)
  ) {
    lines.push('', '--- WHAT THE ACCESSIBILITY TREE ADDS - a second way of looking ---', '');
    if (aria.unreadable === -1) {
      lines.push(
        '  The tree could not be read at all, so the inventory above is one source only.',
        '  Treat its completeness as unknown rather than as agreed.',
      );
    } else if (aria.unreadable > 0) {
      lines.push(
        `  ${aria.unreadable} line(s) of the tree could not be parsed, so THIS SECTION UNDERSTATES`,
        '  the page. Fix the parser before trusting the counts below.',
      );
    }
    if (aria.widgetsMissedBySelectors.length > 0) {
      lines.push(
        `  ${aria.widgetsMissedBySelectors.length} control(s) the browser reports and the selector sweep did not find.`,
        '  Each is operable and absent from the inventory above:',
      );
      for (const widget of aria.widgetsMissedBySelectors.slice(0, 20)) {
        lines.push(`    ${widget.locator}`);
      }
      if (aria.widgetsMissedBySelectors.length > 20) {
        lines.push(`    ... and ${aria.widgetsMissedBySelectors.length - 20} more`);
      }
      lines.push(
        '  These are text-dependent locators: they break when the copy or locale changes.',
      );
    }
    if (aria.announcing.length > 0) {
      lines.push(
        '',
        `  ${aria.announcing.length} region(s) the page uses to announce things. The state model is built`,
        '  from controls only, so what these say is not a change a session can perceive:',
      );
      for (const region of aria.announcing.slice(0, 10)) {
        lines.push(`    ${region.role}${region.text === null ? '' : `: ${region.text}`}`);
      }
    }
  }

  return lines.join('\n').trimEnd();
}
