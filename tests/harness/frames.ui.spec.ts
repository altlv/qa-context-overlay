import { test, expect } from '@playwright/test';
import { harvestCandidates } from '../../src/tools/heal.js';
import { readAria } from '../../src/tools/aria.js';
import { insideFrame, readFrames, reportFrames } from '../../src/tools/frames.js';

/**
 * Both element sources stop at the iframe boundary, and what lives in a frame lives there by
 * design: a hosted card field is an iframe precisely so the merchant page cannot read the number.
 * So the payment surface of a storefront using one was wholly unperceived.
 *
 * Everything below uses `srcdoc`, so no test here touches the network. A cross-origin frame
 * behaves the same way to Playwright — it is not bound by same-origin policy — and asserting that
 * would make the suite depend on a third party, which `test:external` exists to keep out of CI.
 */

/** A checkout whose card field is a frame, which is how every hosted field is built. */
const CHECKOUT = `<!doctype html><body>
  <h1>Checkout</h1>
  <button>Pay</button>
  <iframe id="card" srcdoc='
    <label for="n">Card number</label><input id="n">
    <div role="alert">Card declined</div>
    <button>Confirm</button>
  '></iframe>
</body>`;

test.describe('what is inside the frames', () => {
  test('should be invisible to both element sources', async ({ page }) => {
    // The premise, asserted rather than assumed. If a future Playwright starts piercing frames
    // in either source, this fails and the module below becomes redundant — which is the good
    // kind of failure and the reason to pin it.
    await page.setContent(CHECKOUT);
    const sweep = await harvestCandidates(page);
    const tree = await readAria(page);

    expect(
      sweep.map((control) => control.fingerprint.name),
      'the selector sweep sees the host page only',
    ).toEqual(['Pay']);
    expect(
      tree.widgets.map((widget) => widget.name),
      'and the accessibility tree reports the frame as a leaf',
    ).toEqual(['Pay']);
    expect(
      tree.announcements,
      'so the alert inside the frame is not an announcement anybody can see',
    ).toEqual([]);
  });

  test('should read the controls and the announcement inside the frame', async ({ page }) => {
    await page.setContent(CHECKOUT);
    const frames = await readFrames(page);

    expect(frames, 'one child frame').toHaveLength(1);
    const frame = frames[0]!;
    expect(frame.failure, 'a frame that read must say so by carrying no failure').toBeNull();
    expect(frame.widgets.map((widget) => widget.role).sort()).toEqual(['button', 'textbox']);
    expect(
      frame.announcements.map((node) => node.role),
      'the declined-card alert, which nothing could see before',
    ).toEqual(['alert']);
  });

  test('should address the frame by its id rather than its position', async ({ page }) => {
    await page.setContent(CHECKOUT);
    const frame = (await readFrames(page))[0]!;

    expect(frame.addressable, 'an id is a hook a person wrote').toBe(true);
    expect(frame.selector).toBe(`frameLocator('#card')`);
    const field = frame.widgets.find((widget) => widget.role === 'textbox')!;
    expect(
      insideFrame(frame, field),
      'a locator reaching into the frame, usable from the host page',
    ).toBe(`frameLocator('#card').getByRole('textbox', { name: "Card number" })`);
  });

  test('should say when a frame can only be reached by position', async ({ page }) => {
    // No id, no name, no src. The locator still works and breaks the moment a frame is added
    // before it, so the honest move is to hand it over labelled rather than withhold it.
    await page.setContent(`<body><iframe srcdoc="<button>Inside</button>"></iframe></body>`);
    const frame = (await readFrames(page))[0]!;

    expect(frame.addressable).toBe(false);
    expect(frame.selector).toBe(`frameLocator('iframe >> nth=0')`);
    expect(
      reportFrames([frame]).join('\n'),
      'the report must say the locator is positional, not just print it',
    ).toContain('Reached only by position');
  });

  test('should skip a frame holding no document', async ({ page }) => {
    // `about:blank` is a frame with nothing in it, and listing it would pad every report on every
    // page that lazily creates one.
    await page.setContent(`<body><iframe></iframe><button>Only me</button></body>`);
    expect(await readFrames(page)).toEqual([]);
  });

  test('should report a frame it could not read as unread, never as empty', async ({ page }) => {
    /**
     * The distinction this module exists to keep. A hosted payment field is both the slowest
     * thing on the page to settle and the least affordable to miss, so a timeout that reported
     * zero controls would be the most expensive kind of wrong.
     */
    await page.setContent(CHECKOUT);
    const frames = await readFrames(page, 0);

    expect(frames, 'the frame is still listed').toHaveLength(1);
    expect(frames[0]?.failure, 'with its reason, not with an empty inventory').toContain(
      'did not answer',
    );
    expect(frames[0]?.widgets, 'and no controls claimed for it').toEqual([]);
    expect(reportFrames(frames).join('\n')).toContain('Not the same as empty');
  });

  test('should report nothing at all for a page with no frames', async ({ page }) => {
    await page.setContent(`<body><button>Alone</button></body>`);
    expect(reportFrames(await readFrames(page)), 'no frames, no noise').toEqual([]);
  });
});
