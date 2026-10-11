import { launchChromium } from '../qe/browser-launch.js';
import { conformance, summarise } from '../tools/conformance.js';

/**
 * `npm run a11y -- <url>` — hold a page to WCAG 2.2 A and AA and print what fails.
 *
 * Separate from `npm run scan` on purpose. The scan answers "can this be driven and will it rot",
 * which is a testability question; this answers "can it be used", which is a product question with
 * a published standard behind it. Running them together would also make every scan pay for an axe
 * injection it may not want.
 *
 * Reads a URL rather than taking a page, unlike `conformance` itself, because a person at a
 * terminal has a URL. A session already holds a page and should call the module against it — the
 * page as the session left it, dialog open, is a different page from a fresh load of the same URL.
 */

const url = process.argv[2];

if (url === undefined) {
  console.error(
    'Usage: npm run a11y -- <url>\n' +
      '\n' +
      'Holds the page to WCAG 2.2 A and AA and prints the rules it fails. Exits 1 when any rule ' +
      'fails, 2 when the check could not run — a refusal is not a pass.',
  );
  process.exit(2);
}

const { browser, using, note } = await launchChromium();
if (note !== null) console.error(note);
console.error(`Holding ${url} to WCAG 2.2 A and AA, in ${using}.\n`);

try {
  // An explicit context: axe refuses a page from the implicit one with "Please use
  // browser.newContext()", which the integration test caught before this command ever ran.
  const page = await (await browser.newContext()).newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Let a client-rendered page finish adding to itself, the same reason the scanner waits: axe
  // measures the DOM in front of it, and a framework that has not mounted yet is a clean page.
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const result = await conformance(page);
  for (const line of summarise(result)) console.log(line);

  if (result.violations === null) process.exit(2);
  process.exit(result.violations.length === 0 ? 0 : 1);
} finally {
  await browser.close();
}
