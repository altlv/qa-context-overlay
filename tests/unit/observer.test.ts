import { test, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { activePage, pageObserver } from '../../src/qe/observer.js';

/**
 * The observer is the only thing standing between `maxStates` and a number nobody
 * checked. Two properties matter more than the happy path, and both are here: it must
 * never end a session by throwing, and it must never let a missed look pass as a
 * complete count.
 *
 * The happy path needs a real browser and lives in
 * `tests/integration/observer.int.test.ts`.
 */

const fakePage = (url: string, closed = false): Page =>
  ({ url: () => url, isClosed: () => closed }) as unknown as Page;

const fakeBrowser = (pages: Page[]): Browser =>
  ({ contexts: () => [{ pages: () => pages }] }) as unknown as Browser;

test.describe('finding the page the agent is working in', () => {
  test('should skip the blank page a CDP launch starts with', async () => {
    const found = await activePage(fakeBrowser([fakePage('about:blank'), fakePage('http://app/')]));

    expect(
      found?.url(),
      'a browser launched for CDP opens about:blank, and reading that instead of the app records an empty state',
    ).toBe('http://app/');
  });

  test('should take the most recent page, because MCP opens tabs as it goes', async () => {
    const found = await activePage(
      fakeBrowser([fakePage('http://app/one'), fakePage('http://app/two')]),
    );

    expect(
      found?.url(),
      'a handle captured once points at the page that was open then, which is the wrong one from the second action on',
    ).toBe('http://app/two');
  });

  test('should ignore a page that has been closed', async () => {
    const found = await activePage(
      fakeBrowser([fakePage('http://app/one'), fakePage('http://app/two', true)]),
    );

    expect(
      found?.url(),
      'reading a closed page throws, and the newest page is often the closed one',
    ).toBe('http://app/one');
  });

  test('should return null rather than invent a page when there is none', async () => {
    // waitMs 0: a fake browser never gains a page, and the default bounded poll is
    // there for a real CDP connection that has not been told about one yet.
    expect(
      await activePage(fakeBrowser([fakePage('about:blank')]), 0),
      'null is a miss the observer can count; a blank page would be recorded as a real state',
    ).toBeNull();
  });

  test('should wait briefly for a page a CDP connection has not been told about yet', async () => {
    // The race that made observer.int.test.ts fail about one run in four: MCP creates
    // the target, and this connection learns of it a moment later. A single look
    // returned null and the run counted a miss on the first action of the session.
    const pages: Page[] = [];
    const browser = fakeBrowser(pages);
    setTimeout(() => pages.push(fakePage('http://app/late')), 60);

    expect(
      (await activePage(browser, 2_000))?.url(),
      'giving up on the first look undercounts every session by at least one state',
    ).toBe('http://app/late');
  });

  test('should give up rather than hang when no page ever arrives', async () => {
    const started = Date.now();

    expect(await activePage(fakeBrowser([]), 120), 'no page is a real answer too').toBeNull();
    expect(
      Date.now() - started,
      'a wait with no ceiling would hang a run on a browser that opened nothing',
    ).toBeLessThan(2_000);
  });
});

test.describe('when a look cannot be taken', () => {
  test('should count a miss instead of throwing when there is no page', async () => {
    const observer = pageObserver(async () => null);

    expect(
      await observer.observe(),
      'the action has already happened — throwing here would end a session over bookkeeping',
    ).toBeNull();
    expect(observer.missed(), 'a look that did not happen has to be counted').toBe(1);
  });

  test('should count a miss instead of throwing when the page errors', async () => {
    const observer = pageObserver(async () => {
      throw new Error('Execution context was destroyed, most likely because of a navigation');
    });

    expect(
      await observer.observe(),
      'a page mid-navigation is the normal case after a click, not an exceptional one',
    ).toBeNull();
    expect(observer.missed(), 'the miss must still be recorded').toBe(1);
  });

  test('should call the state count a floor once anything was missed', async () => {
    // The hole this closes: a ceiling enforced on an undercount is a permissive
    // ceiling, and a summary that printed a bare number would read as exact.
    const observer = pageObserver(async () => null);
    await observer.observe();

    const summary = observer.summary().join(' ');
    expect(summary, 'an undercount must announce itself').toContain('FLOOR');
    expect(
      summary,
      'and it must say what the consequence was, not merely that a look failed',
    ).toMatch(/ceiling was therefore enforced on an undercount/i);
  });

  test('should not add a floor caveat when every look was taken', async () => {
    // A caveat that is always present is a caveat nobody reads.
    expect(
      pageObserver(async () => null)
        .summary()
        .join(' '),
      'a run that missed nothing must report a clean count',
    ).not.toContain('FLOOR');
  });

  test('should report no states visited before anything is observed', async () => {
    const observer = pageObserver(async () => null);

    expect(observer.count(), 'nothing has been seen yet').toBe(0);
    expect(
      observer.atCeiling(1),
      'an observer that claimed its ceiling before looking once would refuse the first action of every session',
    ).toBe(false);
  });
});
