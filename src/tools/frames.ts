import type { Frame, Page } from '@playwright/test';
import { ariaLocator, readAria, type AriaNode } from './aria.js';

/**
 * What is inside the iframes, which until now was nothing anybody could see.
 *
 * Both element sources stop at the boundary. `harvestCandidates` never enters a frame, and the
 * accessibility tree reports the host page's frames as a bare `- iframe` with no children —
 * measured 2026-10-02. The scan has always *named* frames as an admitted blind spot, which is
 * better than silence and is still a blind spot.
 *
 * It is the most expensive one left, because of what lives in frames by design rather than by
 * accident. A card field from Stripe, Adyen or Braintree is an iframe — that is the whole point
 * of it, since the merchant page must not be able to read the number. So the payment surface of
 * any storefront using a hosted field is wholly unperceived, and payment is where the money and
 * the compliance both are. The same is true of embedded editors, map widgets, consent managers
 * and iframe-composed micro-frontends.
 *
 * **Entering a frame is reading, not interacting**, and no bound changes here: the exploration
 * policy still decides what a session may do, and a frame pointed at a third-party origin is
 * still subject to the browser guard's host rules when something is *acted on*. This module
 * looks.
 */

export interface FrameReading {
  /** How to reach this frame from the host page, as a Playwright locator expression. */
  selector: string;
  /**
   * False when `selector` is positional — an `nth` index — because the frame offered no id, no
   * name and no usable `src`. A positional frame locator breaks the moment another frame is
   * added above it, and a caller handing this to a role must be able to say so.
   */
  addressable: boolean;
  url: string;
  /** Widgets the browser reports inside this document. */
  widgets: AriaNode[];
  /** Things this document announces. */
  announcements: AriaNode[];
  /** Snapshot lines the parser could not read. Non-zero understates the frame. */
  unreadable: number;
  /**
   * Why this frame could not be read, or null when it was.
   *
   * Carried rather than dropped. A frame that failed to read is not a frame with nothing in it,
   * and reporting the two the same way is the mistake this repository keeps paying for — a
   * cross-origin payment field that times out would otherwise look like an empty one.
   */
  failure: string | null;
}

/** Whether a frame holds a document worth reading at all. */
function worthReading(frame: Frame): boolean {
  if (frame.isDetached()) return false;
  const url = frame.url();
  return url !== '' && url !== 'about:blank';
}

/**
 * A locator for the frame element, best hook first.
 *
 * The same ladder the scan's selector grading uses, for the same reason: an id a person wrote is
 * worth more than a position, and a position is worth saying out loud rather than hiding.
 */
async function addressOf(
  frame: Frame,
  index: number,
): Promise<{ selector: string; addressable: boolean }> {
  try {
    const element = await frame.frameElement();
    const [id, name, src] = await Promise.all([
      element.getAttribute('id'),
      element.getAttribute('name'),
      element.getAttribute('src'),
    ]);
    if (id !== null && id !== '') {
      return { selector: `frameLocator('#${id}')`, addressable: true };
    }
    if (name !== null && name !== '') {
      return { selector: `frameLocator('iframe[name="${name}"]')`, addressable: true };
    }
    if (src !== null && src !== '') {
      return { selector: `frameLocator('iframe[src="${src}"]')`, addressable: true };
    }
  } catch {
    // A frame can detach between being listed and being asked about itself. Falling through to
    // the positional form is right: the frame was there, and we can still say where.
  }
  return { selector: `frameLocator('iframe >> nth=${index}')`, addressable: false };
}

/**
 * Every child frame of this page, and what the browser says is inside each.
 *
 * The main frame is excluded — it is the page, and the scan already covers it. Nesting is
 * handled because `page.frames()` is already flat over the whole tree.
 *
 * Each frame is read under its own timeout and its own try: one frame that will not settle must
 * not cost the reading of the others, and must not cost the scan either.
 */
export async function readFrames(page: Page, timeoutMs = 5000): Promise<FrameReading[]> {
  const children = page.frames().filter((frame) => frame !== page.mainFrame());
  const out: FrameReading[] = [];

  for (let index = 0; index < children.length; index += 1) {
    const frame = children[index]!;
    if (!worthReading(frame)) continue;
    const { selector, addressable } = await addressOf(frame, index);
    const base = { selector, addressable, url: frame.url() };
    try {
      const reading = await Promise.race([
        readAria(frame),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`did not answer within ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      out.push({
        ...base,
        widgets: reading.widgets,
        announcements: reading.announcements,
        unreadable: reading.unparsed,
        failure: null,
      });
    } catch (error) {
      out.push({
        ...base,
        widgets: [],
        announcements: [],
        unreadable: 0,
        failure: (error as Error).message.split('\n')[0] ?? 'unreadable',
      });
    }
  }
  return out;
}

/** A locator reaching a control inside a frame, from the host page. */
export function insideFrame(frame: FrameReading, node: AriaNode): string {
  return `${frame.selector}.${ariaLocator(node)}`;
}

/**
 * The lines a person reads. Empty when the page has no child frames at all.
 *
 * A frame that failed is listed first and with its reason, because an unread frame is the thing
 * most likely to be the interesting one — a payment field is both the slowest to settle and the
 * least affordable to miss.
 */
export function reportFrames(frames: readonly FrameReading[]): string[] {
  if (frames.length === 0) return [];
  const lines = [
    `--- INSIDE THE FRAMES - ${frames.length} document(s) neither element source reaches ---`,
    '',
  ];
  for (const frame of frames.filter((entry) => entry.failure !== null)) {
    lines.push(
      `  COULD NOT READ ${frame.url} — ${frame.failure}`,
      '    Not the same as empty. Whatever is in here is unaccounted for.',
    );
  }
  for (const frame of frames.filter((entry) => entry.failure === null)) {
    lines.push(
      `  ${frame.url}`,
      `    ${frame.widgets.length} control(s), ${frame.announcements.length} announcement(s)` +
        (frame.unreadable > 0
          ? ` — ${frame.unreadable} snapshot line(s) unread, so this is a floor`
          : ''),
    );
    if (!frame.addressable) {
      lines.push(
        '    Reached only by position: this frame carries no id, name or src, so the locator',
        '    below breaks when another frame is added before it.',
      );
    }
    for (const widget of frame.widgets.slice(0, 8)) {
      lines.push(`    ${insideFrame(frame, widget)}`);
    }
    if (frame.widgets.length > 8) lines.push(`    ... and ${frame.widgets.length - 8} more`);
    for (const announcement of frame.announcements.slice(0, 4)) {
      lines.push(
        `    announces ${announcement.role}${announcement.text === null ? '' : `: ${announcement.text}`}`,
      );
    }
  }
  return lines;
}
