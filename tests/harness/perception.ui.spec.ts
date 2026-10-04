import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readAnnouncements } from '../../src/tools/announcements.js';
import { harvestCandidates } from '../../src/tools/heal.js';
import { StateModel, stateKey } from '../../src/qe/state-model.js';
import {
  announcedWithin,
  classifyArrival,
  coversContent,
  describeSurface,
} from '../../src/tools/surfaces.js';

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

test.describe('what kind of surface arrived', () => {
  /**
   * The properties `classifySurface` decides on, observed against a real browser rather than
   * supplied by a caller — which is the half the unit tests cannot reach and the half that was
   * missing while the module had no caller at all.
   *
   * Every fixture here carries **no role and no class name a matcher could recognise**. That is
   * the claim the module rests on: a surface is named by how it behaves, so deleting the word
   * `dialog` must not change the answer. A fixture with `role="dialog"` on it would prove nothing,
   * because it could be passing on a name match.
   */

  const UNDER = '<main style="height:600px"><p>page content</p><button>In the page</button></main>';

  /** Harvest, then harvest again, and return the paths of whatever arrived between the two. */
  const arrivedPaths = async (page: Page, act: () => Promise<void>): Promise<string[]> => {
    const model = new StateModel();
    const before = await harvestCandidates(page);
    model.observe({
      url: page.url(),
      fingerprints: before.map((c) => c.fingerprint),
      announcements: await readAnnouncements(page),
    });
    await act();
    const after = await harvestCandidates(page);
    const transition = model.observe({
      url: page.url(),
      fingerprints: after.map((c) => c.fingerprint),
      announcements: await readAnnouncements(page),
    });
    // Exactly what `src/qe/observer.ts` does: the indices index the array just passed in, so the
    // candidate record for an arrival is the one at the same position.
    return transition.appearedAt.map((index) => after[index]!.path);
  };

  test('should see that a floating panel covers the content under it', async ({ page }) => {
    await page.setContent(`<!doctype html><body>${UNDER}
      <div id="panel" style="position:fixed;top:0;left:0;width:320px;height:320px;background:#fff">
        <button>Confirm</button><button>Cancel</button>
      </div></body>`);

    expect(
      await coversContent(page, '#panel'),
      'the surface-side question: something was readable at that point and this is there instead',
    ).toBe(true);
  });

  test('should not call a panel in the flow a cover', async ({ page }) => {
    // Instrument liveness. A `coversContent` that always said true would pass the assertion above
    // and make `overlays` a constant, which would turn every in-flow arrival into a popover.
    await page.setContent(`<!doctype html><body>${UNDER}
      <div id="panel"><button>Confirm</button><button>Cancel</button></div></body>`);

    expect(
      await coversContent(page, '#panel'),
      'placed after the content rather than over it, so it covers nothing',
    ).toBe(false);
  });

  test('should attribute an announcement to the surface making it', async ({ page }) => {
    /**
     * The discrimination `readAnnouncements` cannot make. It answers "what is the page saying",
     * which is a page-level fact, and a classification needs "is *this* surface the thing saying
     * it" — otherwise a floating panel on a page that happens to have a live region elsewhere
     * would be labelled a toast.
     */
    await page.setContent(`<!doctype html><body>
      <div role="status" style="position:fixed;top:0"><button id="undo">Undo</button></div>
      <div id="quiet"><button>Ordinary</button></div>
      <div aria-live="polite">Saved automatically</div></body>`);

    expect(
      await announcedWithin(page, '[role=status]'),
      'a control inside an announcing region is part of what the page is saying',
    ).toBe(true);
    expect(
      await announcedWithin(page, '#quiet'),
      'and a panel beside one is not, however loud the rest of the page is',
    ).toBe(false);
  });

  test('should name a floating overlay a popover with no role to go on', async ({ page }) => {
    await page.setContent(`<!doctype html><body>${UNDER}<div id="host"></div></body>`);

    const paths = await arrivedPaths(page, () =>
      page.evaluate(() => {
        document.getElementById('host')!.innerHTML =
          '<div style="position:fixed;top:0;left:0;width:300px;height:300px;background:#eee">' +
          '<button>Profile</button><button>Sign out</button></div>';
      }),
    );
    const arrival = await classifyArrival(page, paths);

    expect(
      arrival?.classification.kind,
      'a menu covering content, holding no focus and announcing nothing — named without the word "menu" appearing anywhere',
    ).toBe('popover');
    expect(
      arrival?.container,
      'and the container is the panel the two controls share, not either button',
    ).toMatch(/div:nth-child\(1\)$/);
  });

  test('should name an announced floating arrival a toast, provisionally', async ({ page }) => {
    await page.setContent(`<!doctype html><body>${UNDER}<div id="host"></div></body>`);

    const paths = await arrivedPaths(page, () =>
      page.evaluate(() => {
        document.getElementById('host')!.innerHTML =
          '<div role="status" style="position:fixed;bottom:0;left:0">Added to cart ' +
          '<button>Undo</button><button>View cart</button></div>';
      }),
    );
    const arrival = await classifyArrival(page, paths);

    expect(arrival?.classification.kind).toBe('toast');
    expect(
      arrival?.classification.provisional,
      'nothing waited to see whether it left, and an unpaid observation must not read as a confident label',
    ).toBe(true);
    expect(
      arrival?.properties.vanishedUnprompted,
      'not observed, which is a third value and not a quiet false',
    ).toBeNull();
  });

  test('should pay for the lifetime when asked, and change its mind', async ({ page }) => {
    /**
     * The property that costs wall-clock, and the one place in this file where it is bought. A
     * banner that stays and a toast that leaves differ **only** in this, so a run that never pays
     * cannot tell them apart — which is what `provisional` is admitting above.
     */
    await page.setContent(`<!doctype html><body>${UNDER}<div id="host"></div></body>`);

    const paths = await arrivedPaths(page, () =>
      page.evaluate(() => {
        const host = document.getElementById('host')!;
        host.innerHTML =
          '<div role="status" style="position:fixed;bottom:0;left:0">Saved ' +
          '<button>Undo</button><button>Dismiss</button></div>';
        setTimeout(() => (host.innerHTML = ''), 300);
      }),
    );
    const arrival = await classifyArrival(page, paths, { watchLifetime: true, lifetimeMs: 3_000 });

    expect(
      arrival?.properties.vanishedUnprompted,
      'it went away with nobody acting on it, and that was observed rather than assumed',
    ).toBe(true);
    expect(
      arrival?.classification.provisional,
      'so nothing about this label is hedged any more',
    ).toBe(false);
    expect(
      describeSurface(arrival!.classification),
      'and the line a person reads must say the lifetime was paid for',
    ).toContain('went away with nobody acting');
  });

  test('should refuse to name a page change as a surface', async ({ page }) => {
    /**
     * The guard that keeps this from labelling every navigation. Controls arriving at both ends of
     * `body` share nothing but the document, and classifying `body` would hand the classifier the
     * layout of the whole page — in the flow, covering nothing, announcing nothing — so every page
     * load would be reported as an `inline` arrival. A confident label on everything is worth less
     * than no label.
     */
    await page.setContent(`<!doctype html><body><header id="top"></header>${UNDER}
      <footer id="bottom"></footer></body>`);

    const paths = await arrivedPaths(page, () =>
      page.evaluate(() => {
        document.getElementById('top')!.innerHTML = '<a href="/one">One</a>';
        document.getElementById('bottom')!.innerHTML = '<a href="/two">Two</a>';
      }),
    );

    expect(paths.length, 'two controls really did arrive').toBe(2);
    expect(
      await classifyArrival(page, paths),
      'but they name no surface, and saying so is the honest answer',
    ).toBeNull();
  });
});
