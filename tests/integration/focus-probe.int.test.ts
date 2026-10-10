import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trapsFocus } from '../../src/tools/surfaces.js';

/**
 * The focus probe must give focus back, and must still be able to answer both ways.
 *
 * `trapsFocus` presses Tab from the last control inside a surface to tell a real focus trap from a
 * missing one. That is a read, so its own doc promises focus is restored: "A session whose focus
 * moved because the harness looked at the page would be debugging the harness."
 *
 * It did the opposite. The restore was keyed on a `data-qco-focus-probe` attribute that is set
 * **nowhere in this repository**, so the check always came back null and the `finally` always took
 * the blur path — every call moved the session's focus to the body. Nothing caught it because
 * `trapsFocus` had no test at all: what was tested was `classifySurface`, which consumes the
 * boolean this returns and knows nothing about how it was obtained.
 *
 * Found on 2026-10-09 while auditing the widening of the observer trigger, which made this fire
 * after every `browser_evaluate` — 7 to 11 calls in a run rather than the 2 or 3 that used to reach
 * it. A real browser is required: focus is the thing under test, and no fake page has any.
 *
 * Both answers are exercised on purpose. A probe that always returned false would satisfy "restores
 * focus" perfectly and measure nothing, so the trapping fixture is what keeps the instrument
 * honest — the same rule the surface classifier's own tests follow.
 */

/** A panel that does not trap: Tab from its last control escapes to the page. */
const LEAKY =
  '<main><input id="typed"><div id="panel"><button>One</button><button>Two</button></div>' +
  '<a href="/after">After</a></main>';

/** A panel that does trap, by sending Tab from its last control back to its first. */
const TRAPPING =
  '<main><input id="typed"><div id="panel"><button id="first">One</button>' +
  '<button id="last">Two</button></div><a href="/after">After</a></main>' +
  '<script>document.getElementById("last").addEventListener("keydown", function (event) {' +
  'if (event.key === "Tab" && !event.shiftKey) { event.preventDefault();' +
  'document.getElementById("first").focus(); } });</script>';

async function pageWith(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  body: string,
): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent(body);
  return page;
}

test.describe('what the focus probe leaves behind', () => {
  test('should give focus back after reporting no trap', async () => {
    const browser = await chromium.launch();
    try {
      const page = await pageWith(browser, LEAKY);
      // What a session does: put the caret in a field and expect it to still be there.
      await page.locator('#typed').focus();

      const trapped = await trapsFocus(page, '#panel');

      expect(trapped, 'a plain div traps nothing, and Tab escapes to the link after it').toBe(
        false,
      );
      expect(
        await page.evaluate(() => document.activeElement?.id ?? null),
        'the harness looked at the page and the session lost its caret',
      ).toBe('typed');
    } finally {
      await browser.close();
    }
  });

  test('should give focus back after reporting a trap', async () => {
    /**
     * The same guarantee on the other branch, and the only test that shows the probe can say
     * `true` at all. Without it, an implementation that never pressed Tab would pass everything
     * above — the instrument would be dead and the suite would be green.
     */
    const browser = await chromium.launch();
    try {
      const page = await pageWith(browser, TRAPPING);
      await page.locator('#typed').focus();

      const trapped = await trapsFocus(page, '#panel');

      expect(
        trapped,
        'Tab from the last control wraps to the first, which is what a modal does',
      ).toBe(true);
      expect(
        await page.evaluate(() => document.activeElement?.id ?? null),
        'and the probe still hands the caret back, not to the control it tabbed onto',
      ).toBe('typed');
    } finally {
      await browser.close();
    }
  });
});
