import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import { conformance, summarise } from '../../src/tools/conformance.js';

/**
 * The instrument must be able to give both answers, and the page it is given decides which.
 *
 * A conformance checker that always finds something is as useless as one that never does, and this
 * repository has shipped both shapes before: a predicate nothing called, a score whose needles no
 * report could contain, a focus probe that always blurred. So the pair below is the point — a page
 * with a known failure, and a page without it — and the clean case asserts not just zero
 * violations but that the output **refuses to read as a clean bill of health**.
 *
 * A real browser is required. axe runs inside the page; there is nothing to measure without one.
 */

/** One unlabelled image: `image-alt` is a WCAG 2 A rule and about as unambiguous as they come. */
const FAILS = `data:text/html,<!doctype html><html lang="en"><head><title>Shop</title></head>
<body><main><h1>Shop</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>`;

/** The same page with the image described. */
const PASSES = `data:text/html,<!doctype html><html lang="en"><head><title>Shop</title></head>
<body><main><h1>Shop</h1><img alt="A blue hoodie, folded" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>`;

test.describe('holding a page to a published standard', () => {
  test('should name the rule, the standard and the count when a page fails', async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(FAILS);

      const result = await conformance(page);

      expect(result.refused, 'the check has to have run for anything else to mean something').toBe(
        null,
      );
      const rules = (result.violations ?? []).map((violation) => violation.rule);
      expect(rules, 'an image with no alt text is the least arguable failure there is').toContain(
        'image-alt',
      );

      const found = (result.violations ?? []).find((violation) => violation.rule === 'image-alt')!;
      expect(found.count, 'the count is the finding; one image, one failure').toBe(1);
      expect(
        found.standards.join(' '),
        'a rule without its standard is an opinion — this is what makes it citable',
      ).toContain('wcag');
    } finally {
      await browser.close();
    }
  });

  test('should find nothing on the same page once the image is described', async () => {
    /**
     * The other half of the pair. Without it, "image-alt was found" could be an instrument that
     * reports `image-alt` whatever it is shown.
     */
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(PASSES);

      const result = await conformance(page);

      expect(
        (result.violations ?? []).map((violation) => violation.rule),
        'the one difference between the two fixtures is the alt attribute',
      ).not.toContain('image-alt');
      expect(
        result.passed,
        'and rules did apply, so the zero is measured and not vacuous',
      ).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  });

  test('should refuse to let a clean run read as an accessible page', async () => {
    /**
     * The rule this exists to protect, and it is a documentation rule as much as a code one:
     * automated checks catch a minority of WCAG failures, and none of the judgement ones. A
     * coverage line reading "accessibility: axe clean" would be the drift `CLAUDE.md` forbids in
     * its status table — a number that rots into a claim.
     */
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(PASSES);

      const lines = summarise(await conformance(page)).join(' ');

      expect(lines, 'a pass is "no automated violations", never "accessible"').toContain(
        'no automated violations',
      );
      expect(lines, 'and what the automated rules cannot see is named beside it').toMatch(
        /cannot tell you/i,
      );
    } finally {
      await browser.close();
    }
  });

  test('should report a refusal as NOT RUN rather than as a clean page', async () => {
    // `violations: null` and `violations: []` are opposite findings, and this repository has
    // already confused the two once — an empty report file that read as a report which existed.
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    await page.goto(PASSES);
    await browser.close();

    const result = await conformance(page);
    const lines = summarise(result).join(' ');

    expect(result.violations, 'nothing was measured, so there is no list').toBeNull();
    expect(lines, 'and the output has to say so in the words the gate uses').toContain('NOT RUN');
    expect(lines).toContain('This is not a clean result');
  });
});
