import { test, expect } from '@playwright/test';
import { readAnnouncements } from '../../src/tools/announcements.js';
import { harvestCandidates } from '../../src/tools/heal.js';
import { stateKey } from '../../src/qe/state-model.js';

/**
 * What the agent can and cannot perceive about the page in front of it.
 *
 * **Characterisation tests, not aspirations.** They pin what the perception layer sees *today*,
 * because the two numbers below were measured on 2026-10-02 and a measurement that lives only in
 * prose goes stale and keeps being quoted — which this repository has already done once, with a
 * clean quality-gate number that stayed in `PLAN.md` for a fortnight after it stopped being true.
 *
 * So these tests are **expected to change**, and their failing is the good outcome: it means the
 * discovery layer got better and the recorded number needs raising. They are not a specification
 * of correct behaviour, and nothing here should be read as endorsing one of eleven.
 *
 * See `PLAN.md`, "How the agent sees the app — the discovery layer", and items 4 and 80.
 */

/** Controls a real application ships, of which only the first carries a listed tag or role. */
const ELEVEN_CONTROLS = `<!doctype html><body>
  <button id="known">plain button</button>
  <div id="handler" onclick="void 0">div with an inline click handler</div>
  <div id="tabbed" tabindex="0">div in the tab order</div>
  <span id="listener">span with addEventListener</span>
  <my-widget id="custom">custom element with onclick</my-widget>
  <div id="dragger" draggable="true">drag source</div>
  <details><summary id="disclosure">details summary</summary>body</details>
  <div id="opt" role="option">option in a listbox</div>
  <div id="combo" role="combobox">combobox</div>
  <canvas id="cv" width="40" height="40"></canvas>
  <label id="lbl" for="known">label that activates its control</label>
  <script>
    document.getElementById('listener').addEventListener('click', function () {});
    customElements.define('my-widget', class extends HTMLElement {
      connectedCallback() { this.onclick = function () {}; }
    });
  </script>
</body>`;

/** A page whose only changes are things it says, rather than things it offers. */
const TEXT_SURFACES = `<!doctype html><body>
  <button id="buy">Buy</button>
  <button id="toast">Show toast</button>
  <button id="banner">Show error</button>
  <div id="host"></div>
  <script>
    document.getElementById('toast').onclick = function () {
      document.getElementById('host').innerHTML =
        '<div role="status" style="position:fixed;top:0">Added to cart</div>';
    };
    document.getElementById('banner').onclick = function () {
      document.getElementById('host').innerHTML =
        '<div role="alert">Card declined. Try another card.</div>';
    };
  </script>
</body>`;

test.describe('what the agent can see on the page in front of it', () => {
  test('should find only the control that carries a listed tag or role', async ({ page }) => {
    await page.setContent(ELEVEN_CONTROLS);
    const found = await harvestCandidates(page);

    // One of eleven, as of 2026-10-02. A div with a click handler, a div in the tab order, a
    // span with a listener, a custom element, a drag source, a <summary>, role=option,
    // role=combobox, a canvas and an activating <label> are all invisible — two of those are
    // standard ARIA and one is plain HTML. Raise this number when the layer improves; never
    // lower it to make a change pass.
    expect(
      found.length,
      'an element is interactive here if it resembles a list, not if acting on it does anything',
    ).toBe(1);
  });

  test('should tell a toast and an error banner from the page at rest', async ({ page }) => {
    /**
     * **This assertion was inverted on 2026-10-04, and the inversion is the point.** It used to
     * assert that a toast and a banner left the state key *unchanged*, which was true and was the
     * confirmed blindness: a state was a URL and a set of control signatures, so what the page
     * said was outside what the agent could perceive as a change.
     *
     * `src/tools/announcements.ts` is the projection that closes it. A characterisation test
     * failing because the thing it characterised got better is the outcome this file was written
     * hoping for — see its header.
     *
     * **`announcements` is read here, deliberately and with a warning.** The field on
     * `Observation` is optional, and when the inversion was first made this test still passed,
     * because it built an observation without the projection and so measured one that was never
     * read. An optional field lets a caller omit a projection silently, which is the
     * blind-instrument problem in a new costume: the observer passes it, a test did not, and
     * nothing complained. Any new caller of `stateKey` has to pass it or it is measuring the old
     * world.
     */
    await page.setContent(TEXT_SURFACES);
    const look = async (): Promise<string> =>
      stateKey({
        url: page.url(),
        // `.fingerprint`, the way `src/qe/observer.ts` does it. Passing the `Candidate` wrapper
        // straight in makes `controlSignature` read `undefined` from every field, so each
        // signature collapses to four pipe characters, every key matches, and the test passes
        // having measured nothing. That is how the first version of this file was written, and
        // it also produced a retracted finding about polymer-shop being told apart by URL alone.
        fingerprints: (await harvestCandidates(page)).map((c) => c.fingerprint),
        announcements: await readAnnouncements(page),
      });

    const atRest = await look();
    await page.click('#toast');
    await expect(page.locator('[role=status]')).toBeVisible();
    const withToast = await look();
    await page.click('#banner');
    await expect(page.locator('[role=alert]')).toBeVisible();
    const withBanner = await look();

    expect(
      withToast,
      'a toast on screen is now a change the agent can perceive — errors, validation and confirmations with it',
    ).not.toBe(atRest);
    expect(withBanner, 'and so is an error announced as role=alert').not.toBe(atRest);
    expect(
      withBanner,
      'and the two say different things, so they must not fold into one state',
    ).not.toBe(withToast);
  });

  test('should keep naming its own blind spots, which is the one honest part', async ({ page }) => {
    // Not a blind spot — the piece already shaped the way the rest of the layer needs to be, and
    // the only part of perception that fails honestly today. Asserted so a refactor cannot
    // quietly drop the admission and leave the layer with no honest-failure path at all.
    await page.setContent(`<!doctype html><body>
      <iframe id="f" srcdoc="<button>inside a frame</button>"></iframe>
      <my-host id="h"></my-host>
      <script>
        customElements.define('my-host', class extends HTMLElement {
          connectedCallback() {
            this.attachShadow({ mode: 'open' }).innerHTML = '<button>in a shadow root</button>';
          }
        });
      </script>
    </body>`);
    const { scanPage } = await import('../../src/tools/page-scanner.js');
    const scan = await scanPage(page);

    expect(
      scan.frames.length,
      'a frame is not scanned, and the scan says so rather than reporting an empty page',
    ).toBeGreaterThan(0);
    expect(
      scan.shadowHosts.length,
      'likewise an open shadow root — named, not silently skipped',
    ).toBeGreaterThan(0);
  });
});

test.describe('what the page says, as a projection', () => {
  test('should read a live region that carries no role at all', async ({ page }) => {
    // The half the accessibility tree cannot see: measured 2026-10-02, `aria-live` on an element
    // with no role renders in the tree as a bare text node. That is why this projection reads the
    // DOM rather than being a fourth use of `readAria`.
    await page.setContent(
      `<body><button>A</button><div aria-live="polite">Saved automatically</div></body>`,
    );
    expect(await readAnnouncements(page)).toEqual(['saved automatically']);
  });

  test('should ignore a region that is present but empty', async ({ page }) => {
    // Most live regions sit on the page from load and fill only when something happens. Counting
    // them would make the projection a constant, and a constant in a state key is decoration.
    await page.setContent(`<body><button>A</button><div role="status"></div></body>`);
    expect(await readAnnouncements(page)).toEqual([]);
  });

  test('should ignore a region that is hidden', async ({ page }) => {
    // A toast container that exists but is not displayed is not saying anything. Reporting it
    // would claim an announcement nobody could read — the mirror of missing one they could.
    await page.setContent(
      `<body><div role="alert" style="display:none">Card declined</div></body>`,
    );
    expect(await readAnnouncements(page)).toEqual([]);
  });

  test('should deduplicate two regions saying the same thing', async ({ page }) => {
    // A page that announces into both a polite and an assertive region — which is a real pattern
    // — would otherwise make one message look like two.
    await page.setContent(
      `<body><div role="status">Saved</div><div aria-live="assertive">saved</div></body>`,
    );
    expect(await readAnnouncements(page)).toEqual(['saved']);
  });

  test('should be able to come back empty and come back full', async ({ page }) => {
    // Instrument liveness: a reader that always returns nothing would have passed every assertion
    // above except this one, and would have made the whole projection decoration.
    await page.setContent(`<body><button>Alone</button></body>`);
    expect(await readAnnouncements(page), 'empty when the page says nothing').toEqual([]);
    await page.setContent(`<body><div role="alert">Something broke</div></body>`);
    expect(await readAnnouncements(page), 'and full when it does').toEqual(['something broke']);
  });
});
