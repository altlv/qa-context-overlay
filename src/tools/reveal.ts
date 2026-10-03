import type { Page } from '@playwright/test';
import { INTERACTIVE_SELECTOR } from './controls.js';

/**
 * Controls a static scan cannot see.
 *
 * A scan is a photograph of one moment, at one viewport, with the pointer
 * nowhere and focus on nothing. Real applications hide a great deal behind those
 * assumptions: menus that need a hover, skip links that need focus, a whole
 * mobile navigation that only exists under 768px, and content that simply had
 * not arrived yet. All of it is testable, and none of it appears in a snapshot.
 *
 * Every pass here is the same shape — observe, act, observe again, diff — which
 * is the exploration loop in miniature, and deliberately the primitive the driver
 * will need.
 *
 * All four are **read-only**: hovering, focusing, resizing and waiting change no
 * server state and submit nothing, so they are the passes that can run against
 * production when clicking cannot.
 */

export interface Reveal {
  /** What was done, e.g. `hover "User Avatar"` or `viewport 375x812`. */
  by: string;
  /** Controls that appeared, as selectors a test could reuse. */
  revealed: string[];
  /** Controls that disappeared. Only meaningful for the responsive pass. */
  hidden?: string[];
}

export interface RevealOptions {
  /** How many elements to probe. Bounded: real time against a real page. */
  maxProbes?: number;
  /** Pause after each action, for transitions and lazily-built menus. */
  settleMs?: number;
}

const INTERACTIVE = INTERACTIVE_SELECTOR;

const CONTAINER =
  'img, figure, li, tr, td, [class*="card"], [class*="item"], [class*="tile"], [class*="figure"], [class*="thumb"], [title]';

const PROBE_ATTRIBUTE = 'data-harness-probe';

/**
 * Signatures of every *visible* interactive control, shadow roots included.
 *
 * Deliberately lighter than `scanPage`: this runs once per probe, so it collects
 * only what is needed to tell "this appeared" from "this was already here".
 */
async function visibleSignatures(page: Page): Promise<string[]> {
  return page.evaluate((selector: string) => {
    const roots: (Document | ShadowRoot)[] = [document];
    const seen: string[] = [];

    for (let index = 0; index < roots.length; index += 1) {
      const root = roots[index];
      if (root === undefined) continue;

      for (const el of Array.from(root.querySelectorAll(selector))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        if (style.opacity === '0') continue;

        // Visually-hidden patterns. An element parked at left:-9999px, or clipped
        // to a single pixel, has a bounding box and passes every check above — so
        // a skip link counted as already visible, and focusing it revealed nothing.
        //
        // The test is deliberately "parked far off to the left", not simply
        // "outside the viewport": scrolling pushes real content above the top and
        // past the left edge, and treating that as hidden made the scroll pass lose
        // the very element it had just found.
        if (rect.right <= 0 && rect.left < -1_000) continue;
        if (rect.width <= 1 && rect.height <= 1) continue;

        const name =
          el.getAttribute('aria-label') ??
          (el as HTMLElement).innerText?.trim().slice(0, 60) ??
          el.getAttribute('placeholder') ??
          '';
        seen.push(
          `${el.tagName.toLowerCase()}|${el.getAttribute('role') ?? ''}|${el.getAttribute('id') ?? ''}|${name}`,
        );
      }

      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (el.shadowRoot !== null) roots.push(el.shadowRoot);
      }
    }

    return seen;
  }, INTERACTIVE);
}

/** Turns a signature back into something a reader can act on. */
function describe(signature: string): string {
  const [tag = '', role = '', id = '', name = ''] = signature.split('|');
  if (id !== '') return `locator('#${id}')`;
  if (name !== '') {
    const effectiveRole = role !== '' ? role : tag === 'a' ? 'link' : tag;
    return `getByRole('${effectiveRole}', { name: ${JSON.stringify(name)} })`;
  }
  return `locator('${tag}')${role === '' ? '' : ` [role=${role}]`}`;
}

// --- 1. Hover ---------------------------------------------------------------

/**
 * Hovers candidates and records what appeared.
 *
 * Containers are probed as well as controls. The first version hovered only
 * interactive elements and found nothing on a page built entirely around hover —
 * the classic reveal is triggered by something inert: an image, a card, a row.
 *
 * Candidates are tagged with a temporary attribute so a container with no
 * selector of its own can still be addressed. That mutates the DOM, which is
 * worth stating plainly: client-side only, removed afterwards, reaching no
 * server. A read-only policy forbids changing the *system*, not repainting a page.
 */
/**
 * Parks the pointer somewhere that is hovering nothing.
 *
 * `mouse.move(0, 0)` reads as "no longer hovering" and is not: the top-left
 * corner is over whatever the page put there, and a control anchored at the
 * origin stays hovered — which makes a genuine hover reveal look like something
 * that was on screen all along. So find a point the browser resolves to the page
 * background and park there instead.
 */
async function restHover(page: Page): Promise<void> {
  const free = await page
    .evaluate(() => {
      for (let x = window.innerWidth - 2; x > 0; x -= 40) {
        for (let y = window.innerHeight - 2; y > 0; y -= 40) {
          const at = document.elementFromPoint(x, y);
          if (at === null || at === document.body || at === document.documentElement) {
            return { x, y };
          }
        }
      }
      return null;
    })
    .catch(() => null);

  // No free point means the page covers its whole viewport. Falling back is
  // honest — the control below then simply has less to say, which is better than
  // pretending the pointer is nowhere.
  await page.mouse.move(free?.x ?? 0, free?.y ?? 0).catch(() => undefined);
}

export async function detectHoverReveals(
  page: Page,
  options: RevealOptions = {},
): Promise<Reveal[]> {
  const maxProbes = options.maxProbes ?? 25;
  const settleMs = options.settleMs ?? 150;

  const baseline = new Set(await visibleSignatures(page));

  const marked = await page.evaluate(
    ([containerSelector, interactiveSelector, probeAttribute, limit]: [
      string,
      string,
      string,
      number,
    ]) => {
      const found: { index: number; label: string }[] = [];
      const elements = Array.from(
        document.querySelectorAll(`${containerSelector}, ${interactiveSelector}`),
      );

      for (const el of elements) {
        if (found.length >= limit) break;
        const rect = el.getBoundingClientRect();
        if (rect.width < 16 || rect.height < 16) continue;
        if (rect.top > window.innerHeight || rect.bottom < 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;

        const index = found.length;
        el.setAttribute(probeAttribute, String(index));
        const label =
          el.getAttribute('alt') ??
          el.getAttribute('aria-label') ??
          el.getAttribute('title') ??
          (el as HTMLElement).innerText?.trim().slice(0, 40) ??
          '';
        found.push({ index, label: label === '' ? el.tagName.toLowerCase() : label });
      }

      return found;
    },
    [CONTAINER, INTERACTIVE, PROBE_ATTRIBUTE, maxProbes] as [string, string, string, number],
  );

  // Raw signatures are kept rather than descriptions, because they still have to
  // survive the control below.
  const claims: { by: string; signatures: string[] }[] = [];

  for (const candidate of marked) {
    try {
      await page
        .locator(`[${PROBE_ATTRIBUTE}="${candidate.index}"]`)
        .first()
        .hover({ timeout: 1_000 });
    } catch {
      // A control that cannot be hovered is one we learn nothing from, not a
      // reason to abandon the pass.
      continue;
    }

    // The ban on sleeping exists because in a test a sleep replaces an assertion.
    // Here the wait IS the measurement: the question is "what appears after
    // hovering", and there is no web-first assertion for something whose name you
    // do not yet know.
    // eslint-disable-next-line no-restricted-syntax
    await page.waitForTimeout(settleMs);
    const appeared = (await visibleSignatures(page)).filter(
      (signature) => !baseline.has(signature),
    );

    if (appeared.length > 0) {
      claims.push({
        by: `hover ${JSON.stringify(candidate.label)}`,
        signatures: [...new Set(appeared)],
      });
    }
  }

  await page.evaluate((probeAttribute: string) => {
    for (const el of Array.from(document.querySelectorAll(`[${probeAttribute}]`))) {
      el.removeAttribute(probeAttribute);
    }
  }, PROBE_ATTRIBUTE);
  await restHover(page);

  // The control group, and the whole reason this pass can be believed.
  //
  // Without it, anything that appeared *during* the pass was attributed *to* the
  // pass. Against a real site that meant a promotional button which arrives on its
  // own after about sixteen seconds was reported as revealed by hovering six
  // different links — confidently, specifically wrong, six times over.
  //
  // A hover reveal is defined by disappearing when the hover stops. Anything still
  // on screen with nothing hovered arrived by itself, and belongs to
  // `detectLateArrivals`, which is the pass that exists to find exactly that.
  //
  // eslint-disable-next-line no-restricted-syntax
  await page.waitForTimeout(settleMs);
  const withoutHover = new Set(await visibleSignatures(page));

  const reveals: Reveal[] = [];
  for (const claim of claims) {
    const stillHoverOnly = claim.signatures.filter((signature) => !withoutHover.has(signature));
    if (stillHoverOnly.length > 0) {
      reveals.push({ by: claim.by, revealed: stillHoverOnly.map(describe) });
    }
  }

  return reveals;
}

// --- 2. Keyboard ------------------------------------------------------------

export interface KeyboardProfile {
  /** Accessible names in tab order — the sequence a keyboard user experiences. */
  tabOrder: string[];
  /** Controls that only became visible once something was focused. */
  focusReveals: string[];
  /**
   * Focusable controls with no outline or box-shadow while focused.
   *
   * Evidence, not proof: an indicator implemented purely as a colour or
   * background change is invisible to this check, so it is a reason to look
   * rather than a finding to file.
   */
  noFocusIndicator: string[];
  /** Suspected keyboard trap: the tab cycle closed over very few controls. */
  trapped: boolean;
}

/**
 * Walks the page with Tab.
 *
 * Two things fall out that a snapshot cannot give. First, controls that exist
 * only under focus — skip links are the canonical case, and they are invisible to
 * every other pass here. Second, the keyboard experience itself: the order,
 * whether focus is *visible*, and whether it can escape.
 *
 * A focusable control with no visible focus indicator is a real finding under our
 * own definition of testability: you can reach it and cannot observe that you
 * have.
 */
export async function detectKeyboardProfile(
  page: Page,
  options: RevealOptions = {},
): Promise<KeyboardProfile> {
  const maxProbes = options.maxProbes ?? 30;
  const baseline = new Set(await visibleSignatures(page));

  const tabOrder: string[] = [];
  const focusReveals = new Set<string>();
  const noFocusIndicator: string[] = [];
  const seen = new Set<string>();
  let trapped = false;

  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });

  for (let step = 0; step < maxProbes; step += 1) {
    await page.keyboard.press('Tab').catch(() => undefined);

    const focused = await page.evaluate(() => {
      // activeElement stops at a shadow host, so on a Web Components page every
      // tab stop looks like the same element and the walk decides it is trapped.
      // Third browser API in this file that needs manual piercing, after
      // elementFromPoint and querySelectorAll.
      let el = document.activeElement as HTMLElement | null;
      while (el !== null && el.shadowRoot !== null && el.shadowRoot.activeElement !== null) {
        el = el.shadowRoot.activeElement as HTMLElement;
      }
      if (el === null || el === document.body) return null;

      const style = getComputedStyle(el);
      // No outline, no ring, no border change: nothing tells a sighted keyboard
      // user where they are.
      const hasIndicator =
        (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
        style.boxShadow !== 'none' ||
        style.borderStyle !== 'none';

      return {
        signature: `${el.tagName.toLowerCase()}|${el.getAttribute('role') ?? ''}|${el.getAttribute('id') ?? ''}|${
          el.getAttribute('aria-label') ?? el.innerText?.trim().slice(0, 60) ?? ''
        }`,
        label:
          el.getAttribute('aria-label') ??
          el.innerText?.trim().slice(0, 40) ??
          el.tagName.toLowerCase(),
        hasIndicator,
      };
    });

    if (focused === null) continue;

    if (seen.has(focused.signature) && tabOrder.length > 1) {
      // Returning to a visited stop is normal — it means the tab cycle closed.
      // A trap is the narrower case: the cycle closed over a handful of controls
      // while the page has many more, so focus is circling inside a region. Even
      // then it is reported as suspicion, not fact; confirming it needs a human.
      trapped = tabOrder.length <= 3;
      break;
    }
    seen.add(focused.signature);
    tabOrder.push(focused.label);
    if (!focused.hasIndicator) noFocusIndicator.push(focused.label);

    for (const signature of await visibleSignatures(page)) {
      if (!baseline.has(signature)) focusReveals.add(describe(signature));
    }
  }

  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });

  return {
    tabOrder,
    focusReveals: [...focusReveals],
    noFocusIndicator: [...new Set(noFocusIndicator)],
    trapped,
  };
}

// --- 3. Responsive ----------------------------------------------------------

/**
 * Re-measures at a phone viewport.
 *
 * A desktop scan misses an entire parallel interface. Mobile navigation usually
 * lives behind a hamburger that does not exist above a breakpoint, and desktop
 * navigation usually vanishes below it — so half the app's controls can be
 * absent from a report that looks complete.
 *
 * Restores the original viewport, because leaving a page 375px wide would quietly
 * corrupt every measurement taken after it.
 */
export async function detectResponsiveDiff(
  page: Page,
  options: { width?: number; height?: number; settleMs?: number } = {},
): Promise<Reveal | null> {
  const original = page.viewportSize();
  const width = options.width ?? 375;
  const height = options.height ?? 812;

  const before = new Set(await visibleSignatures(page));

  try {
    await page.setViewportSize({ width, height });
    // Waiting out the media-query reflow; there is no element to assert on until
    // we know what appeared.
    // eslint-disable-next-line no-restricted-syntax
    await page.waitForTimeout(options.settleMs ?? 300);
    const after = await visibleSignatures(page);
    const afterSet = new Set(after);

    const revealed = [...new Set(after.filter((signature) => !before.has(signature)))];
    const hidden = [...before].filter((signature) => !afterSet.has(signature));

    if (revealed.length === 0 && hidden.length === 0) return null;

    return {
      by: `viewport ${width}x${height}`,
      revealed: revealed.map(describe),
      hidden: hidden.map(describe),
    };
  } finally {
    if (original !== null) await page.setViewportSize(original).catch(() => undefined);
  }
}

// --- 4. Late arrivals -------------------------------------------------------

/**
 * Records controls that were not there a moment ago.
 *
 * These are where flake lives. A control that arrives after the page reports
 * itself loaded is one that a test will sometimes miss, and naming them is more
 * useful than any amount of advice about waiting: it says *which* elements need
 * a web-first assertion rather than telling everyone to be careful.
 */
export async function detectLateArrivals(
  page: Page,
  options: { waitMs?: number } = {},
): Promise<Reveal | null> {
  const before = new Set(await visibleSignatures(page));
  // Same reasoning, more so: this pass exists precisely to measure what arrives
  // late. Replacing the wait with an assertion would presuppose the answer it is
  // looking for.
  // eslint-disable-next-line no-restricted-syntax
  await page.waitForTimeout(options.waitMs ?? 2_000);
  const appeared = (await visibleSignatures(page)).filter((signature) => !before.has(signature));

  if (appeared.length === 0) return null;
  return {
    by: `waited ${(options.waitMs ?? 2_000) / 1000}s after the page looked settled`,
    revealed: [...new Set(appeared)].map(describe),
  };
}

// --- Formatting -------------------------------------------------------------

export function formatReveals(
  hover: Reveal[],
  keyboard: KeyboardProfile | null,
  responsive: Reveal | null,
  late: Reveal | null,
  scroll: Awaited<ReturnType<typeof detectScrollReveals>> | null = null,
  zoom: ZoomResult | null = null,
): string {
  const lines: string[] = ['--- What a static scan cannot see ---', ''];

  if (hover.length === 0) {
    lines.push('Hover: nothing appeared. Either the page hides nothing behind a mouseover,');
    lines.push('or what it hides opens on focus or click instead.');
  } else {
    lines.push('Hidden until hovered:');
    for (const reveal of hover) {
      lines.push(`  ${reveal.by}`);
      for (const revealed of reveal.revealed.slice(0, 5)) lines.push(`    reveals ${revealed}`);
    }
  }
  lines.push('');

  if (keyboard !== null) {
    lines.push(`Keyboard: ${keyboard.tabOrder.length} stop(s) in tab order`);
    if (keyboard.focusReveals.length > 0) {
      lines.push('  visible only under focus — a skip link or focus menu:');
      for (const revealed of keyboard.focusReveals.slice(0, 5)) lines.push(`    ${revealed}`);
    }
    if (keyboard.noFocusIndicator.length > 0) {
      lines.push(
        `  ${keyboard.noFocusIndicator.length} focusable control(s) with no outline or box-shadow under focus:`,
      );
      for (const label of keyboard.noFocusIndicator.slice(0, 5)) lines.push(`    "${label}"`);
      lines.push('    Reachable by keyboard with nothing observable marking arrival — though');
      lines.push('    an indicator done purely with colour would not be detected here, so');
      lines.push('    treat this as a prompt to look rather than a confirmed defect.');
    }
    if (keyboard.trapped) {
      lines.push('  FOCUS TRAP — tabbing returned early; focus may not be able to leave.');
    }
    lines.push('');
  }

  if (responsive !== null) {
    lines.push(`Responsive (${responsive.by}):`);
    for (const revealed of responsive.revealed.slice(0, 6)) {
      lines.push(`  appears  ${revealed}`);
    }
    for (const hiddenItem of (responsive.hidden ?? []).slice(0, 6)) {
      lines.push(`  hides    ${hiddenItem}`);
    }
    if (responsive.revealed.length > 0) {
      lines.push('  A desktop-only scan reports none of the above.');
    }
    lines.push('');
  }

  if (late !== null) {
    lines.push(`Late arrivals — ${late.by}:`);
    for (const revealed of late.revealed.slice(0, 6)) lines.push(`  ${revealed}`);
    lines.push('  These need a web-first assertion; a test that looks too early will flake.');
    lines.push('');
  }

  if (scroll !== null) {
    if (scroll.reveal !== null) {
      lines.push(`Scroll — ${scroll.reveal.by}:`);
      for (const revealed of scroll.reveal.revealed.slice(0, 6)) lines.push(`  ${revealed}`);
    } else {
      lines.push('Scroll: nothing new appeared on the way down.');
    }
    if (scroll.grew) {
      lines.push(
        `  Page grew ${scroll.heightBefore}px -> ${scroll.heightAfter}px while scrolling:`,
        '  lazy loading or infinite scroll. No fixed-count assertion survives that.',
      );
    }
    lines.push('');
  }

  if (zoom !== null) {
    lines.push(`Zoom ${zoom.percent}%:`);
    if (zoom.horizontalOverflow) {
      lines.push(
        `  HORIZONTAL OVERFLOW — content runs ${zoom.overflowPx}px past the viewport.`,
        '  A WCAG 1.4.10 reflow failure: anyone who needs magnification has to scroll',
        '  sideways to read a line. Responsive design does not prevent this.',
      );
    } else {
      lines.push('  Reflows without horizontal scrolling.');
    }
    if (zoom.lost.length > 0) {
      lines.push(`  ${zoom.lost.length} control(s) stopped being visible when zoomed:`);
      for (const lost of zoom.lost.slice(0, 5)) lines.push(`    ${lost}`);
    }
    if (zoom.tiny.length > 0) {
      lines.push(`  ${zoom.tiny.length} target(s) under 24x24 CSS px:`);
      for (const tiny of zoom.tiny.slice(0, 5)) lines.push(`    "${tiny}"`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// --- 5. Scroll --------------------------------------------------------------

/**
 * Scrolls the page and records what arrives.
 *
 * Lazy loading, infinite scroll and sticky bars that only materialise once you
 * leave the top are all invisible to a scan taken at scroll position zero. On a
 * long page that can be most of the content.
 *
 * Also reports whether the page grew while scrolling, which is the tell for
 * infinite scroll — a pattern no fixed-size assertion can survive.
 */
export async function detectScrollReveals(
  page: Page,
  options: { steps?: number; settleMs?: number } = {},
): Promise<{ reveal: Reveal | null; grew: boolean; heightBefore: number; heightAfter: number }> {
  const steps = options.steps ?? 4;
  const settleMs = options.settleMs ?? 400;

  const before = new Set(await visibleSignatures(page));
  const heightBefore = await page.evaluate(() => document.body.scrollHeight);

  for (let step = 1; step <= steps; step += 1) {
    await page.evaluate((fraction: number) => {
      window.scrollTo(0, document.body.scrollHeight * fraction);
    }, step / steps);
    // Waiting out lazy-load; there is no element to assert on until we know what
    // arrived, which is the whole question.
    // eslint-disable-next-line no-restricted-syntax
    await page.waitForTimeout(settleMs);
  }

  const heightAfter = await page.evaluate(() => document.body.scrollHeight);
  const appeared = (await visibleSignatures(page)).filter((signature) => !before.has(signature));

  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });

  return {
    reveal:
      appeared.length === 0
        ? null
        : {
            by: `scrolled to the bottom in ${steps} steps`,
            revealed: [...new Set(appeared)].map(describe),
          },
    grew: heightAfter > heightBefore * 1.1,
    heightBefore,
    heightAfter,
  };
}

// --- 6. Zoom ----------------------------------------------------------------

export interface ZoomResult {
  /** Effective zoom applied, e.g. 200 for 200%. */
  percent: number;
  /** Content forced wider than the viewport: WCAG 1.4.10 reflow failure. */
  horizontalOverflow: boolean;
  /** How far past the viewport edge the widest content reaches, in pixels. */
  overflowPx: number;
  /** Controls that stopped being visible once zoomed. */
  lost: string[];
  /** Controls whose click target fell below the 24x24 minimum. */
  tiny: string[];
}

/**
 * Zooms in and looks for content that breaks.
 *
 * Distinct from the responsive pass: a narrow viewport triggers a media query and
 * the app is *designed* for that, whereas zoom scales everything and frequently is
 * not. The classic failure is horizontal scrolling appearing at 200% — WCAG 1.4.10
 * — which makes a page genuinely unusable for anyone who needs magnification, and
 * which no amount of responsive design guarantees against.
 */
export async function detectZoomReflow(
  page: Page,
  options: { percent?: number; settleMs?: number } = {},
): Promise<ZoomResult> {
  const percent = options.percent ?? 200;
  const before = new Set(await visibleSignatures(page));

  const measured = await page.evaluate((zoomPercent: number) => {
    const root = document.documentElement;
    root.style.setProperty('zoom', String(zoomPercent / 100));
    const overflowPx = Math.max(0, root.scrollWidth - root.clientWidth);

    const tiny: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll('button, a[href], input, select, [role=button]'),
    )) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.width < 24 || rect.height < 24) {
        const name =
          el.getAttribute('aria-label') ?? (el as HTMLElement).innerText?.trim().slice(0, 40) ?? '';
        tiny.push(name === '' ? el.tagName.toLowerCase() : name);
      }
    }

    return { overflowPx, tiny: [...new Set(tiny)].slice(0, 8) };
  }, percent);

  // Waiting out reflow before re-measuring what survived.
  // eslint-disable-next-line no-restricted-syntax
  await page.waitForTimeout(options.settleMs ?? 300);
  const after = new Set(await visibleSignatures(page));
  const lost = [...before].filter((signature) => !after.has(signature)).map(describe);

  await page.evaluate(() => {
    document.documentElement.style.removeProperty('zoom');
  });

  return {
    percent,
    horizontalOverflow: measured.overflowPx > 4,
    overflowPx: measured.overflowPx,
    lost: lost.slice(0, 8),
    tiny: measured.tiny,
  };
}
