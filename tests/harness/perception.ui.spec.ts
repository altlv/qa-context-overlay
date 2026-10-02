import { test, expect } from '@playwright/test';
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

  test('should not tell a toast or an error banner from the page at rest', async ({ page }) => {
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
      } as never);

    const atRest = await look();
    await page.click('#toast');
    await expect(page.locator('[role=status]')).toBeVisible();
    const withToast = await look();
    await page.click('#banner');
    await expect(page.locator('[role=alert]')).toBeVisible();
    const withBanner = await look();

    // A state is the URL plus the set of interactive-control signatures, so content is not part
    // of it. Every surface made of text rather than controls is therefore outside what the agent
    // can perceive as a change: error messages, validation, confirmations, empty states, loading
    // states. `PLAN.md` called this fold "by design", which made a hole sound survivable.
    expect(withToast, 'a toast that is visibly on screen is not a change the agent can see').toBe(
      atRest,
    );
    expect(
      withBanner,
      'nor is an error message announced as role=alert — and that is where defects live',
    ).toBe(atRest);
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
