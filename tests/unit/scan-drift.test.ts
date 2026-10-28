import { test, expect } from '@playwright/test';
import {
  countDrift,
  describeDrift,
  pickBaseline,
  readScanPayload,
  scanDrift,
} from '../../src/quality/scan-drift.js';
import type { PageScan, ScannedElement, TestabilityIssue } from '../../src/tools/page-scanner.js';

/**
 * Does drift detection tell the three answers apart?
 *
 * The answers are "the page moved", "it did not", and "I could not look", and the third is the one
 * worth testing hardest: an unreadable scan reported as drift sends a reader hunting a change that
 * never happened. Every case below pins one answer *and* excludes the other two, because a suite
 * that only checks the happy path passes against an implementation that always says the same
 * thing — the failure this repo keeps finding, and the reason the earlier version of this file was
 * rejected: it asserted three kinds of drift and never once asserted a refusal.
 */

const control = (suggested: string, role = 'button'): ScannedElement =>
  ({ tag: 'button', type: null, role, suggested }) as unknown as ScannedElement;

const issue = (kind: string, element: string): TestabilityIssue =>
  ({
    kind,
    element,
    problem: `${kind} on ${element}`,
    severity: 'medium',
  }) as unknown as TestabilityIssue;

const scanOf = (over: Partial<PageScan> = {}): PageScan =>
  ({
    url: 'http://example.com',
    title: 'Example',
    scannedAt: '2026-10-01T10:00:00.000Z',
    interactive: [],
    endpoints: [],
    testability: [],
    ...over,
  }) as unknown as PageScan;

test.describe('scanDrift', () => {
  test('reports no drift when the surface is unchanged', () => {
    const scan = scanOf({
      interactive: [control('#save')],
      endpoints: [{ method: 'GET', path: '/api/items' }] as PageScan['endpoints'],
      testability: [issue('unlabelled', '#name')],
    });

    expect(scanDrift(scan, scanOf({ ...scan })).kind, 'an unchanged surface is not drift').toBe(
      'no-drift',
    );
  });

  test('names controls that appeared and disappeared', () => {
    const outcome = scanDrift(
      scanOf({ interactive: [control('#save'), control('#cancel')] }),
      scanOf({ interactive: [control('#save'), control('#submit')] }),
    );

    expect(outcome.kind, 'a changed control set is drift').toBe('drift-found');
    if (outcome.kind !== 'drift-found') return;
    expect(outcome.result.controlsAppeared.map((c) => c.suggested)).toEqual(['#submit']);
    expect(outcome.result.controlsDisappeared.map((c) => c.suggested)).toEqual(['#cancel']);
  });

  test('matches controls by their locator, not by position in the list', () => {
    /**
     * B2's guard. Inserting one control at the front shifts every later index, so a
     * position-matched diff reports the whole tail as changed. Three controls survive here and
     * only the inserted one is new — a positional implementation reports four changes instead of
     * one, which is what this asserts against.
     */
    const outcome = scanDrift(
      scanOf({ interactive: [control('#a'), control('#b'), control('#c')] }),
      scanOf({ interactive: [control('#new'), control('#a'), control('#b'), control('#c')] }),
    );

    expect(outcome.kind).toBe('drift-found');
    if (outcome.kind !== 'drift-found') return;
    expect(outcome.result.controlsAppeared.map((c) => c.suggested)).toEqual(['#new']);
    expect(outcome.result.controlsDisappeared, 'nothing moved away, only one arrived').toEqual([]);
    expect(countDrift(outcome.result), 'one insertion is one change, not four').toBe(1);
  });

  test('names endpoints that appeared and disappeared', () => {
    const outcome = scanDrift(
      scanOf({ endpoints: [{ method: 'GET', path: '/a' }] as PageScan['endpoints'] }),
      scanOf({ endpoints: [{ method: 'POST', path: '/b' }] as PageScan['endpoints'] }),
    );

    expect(outcome.kind).toBe('drift-found');
    if (outcome.kind !== 'drift-found') return;
    expect(
      outcome.result.endpointsAppeared,
      'a new endpoint is drift the baseline cannot describe',
    ).toEqual([{ method: 'POST', path: '/b' }]);
    expect(outcome.result.endpointsDisappeared).toEqual([{ method: 'GET', path: '/a' }]);
  });

  test('tells a new testability finding from a resolved one', () => {
    const outcome = scanDrift(
      scanOf({ testability: [issue('unlabelled', '#name')] }),
      scanOf({ testability: [issue('ambiguous', '#save')] }),
    );

    expect(outcome.kind).toBe('drift-found');
    if (outcome.kind !== 'drift-found') return;
    expect(
      outcome.result.testabilityAppeared.map((i) => i.kind),
      'a finding that is new since the baseline',
    ).toEqual(['ambiguous']);
    expect(outcome.result.testabilityResolved.map((i) => i.kind)).toEqual(['unlabelled']);
  });

  test('a drift verdict carries no refusal, and a clean verdict carries no result', () => {
    // The union must not be able to express "I compared nothing and found nothing wrong".
    const clean = scanDrift(scanOf(), scanOf());
    expect(clean).toEqual({ kind: 'no-drift' });
    expect('result' in clean, 'no-drift carries no diff to misread as a measurement').toBe(false);
  });
});

test.describe('readScanPayload', () => {
  test('accepts the shape npm run scan writes', () => {
    const raw = JSON.stringify({
      stack: {},
      scan: scanOf({ interactive: [control('#x')] }),
      dictionary: [],
    });

    const read = readScanPayload(raw);

    expect(read.kind, 'the wrapped shape is the one on disk today').toBe('scan');
    if (read.kind !== 'scan') return;
    expect(read.scan.interactive.map((c) => c.suggested)).toEqual(['#x']);
  });

  test('refuses the older bare-PageScan format by name', () => {
    /**
     * The only committed scan is this shape, and the first version of this feature accepted it
     * silently while crashing on the format `scan` actually writes — exactly backwards. The
     * refusal has to name the format, or a reader cannot tell it from a corrupt file.
     */
    const read = readScanPayload(JSON.stringify(scanOf({ interactive: [control('#x')] })));

    expect(read.kind, 'the old format is recognised and refused, not diffed').toBe('not-usable');
    if (read.kind !== 'not-usable') return;
    expect(read.reason, 'says which format it is').toContain('older bare-PageScan');
    expect(read.reason, 'and what to do instead').toContain('npm run scan');
  });

  test('refuses a file that is not JSON, naming that as the reason', () => {
    const read = readScanPayload('not json at all {');

    expect(read.kind).toBe('not-usable');
    if (read.kind !== 'not-usable') return;
    expect(read.reason, 'names the reason, so it is not mistaken for a missing file').toContain(
      'not valid JSON',
    );
  });

  test('refuses JSON that is not a scan', () => {
    const read = readScanPayload('{"hello":"world"}');

    expect(read.kind).toBe('not-usable');
    if (read.kind !== 'not-usable') return;
    expect(read.reason, 'valid JSON is not the same as a scan').toContain('not a scan');
  });

  test('refuses a wrapper whose scan is not a scan', () => {
    const read = readScanPayload('{"scan":{"nope":true}}');

    expect(read.kind, 'a scan key is not enough — it has to hold a scan').toBe('not-usable');
    if (read.kind !== 'not-usable') return;
    expect(read.reason).toContain('scan.interactive');
  });

  test('reads a scan saved with a byte-order mark', () => {
    const raw = `\uFEFF${JSON.stringify({ scan: scanOf({ interactive: [control('#x')] }) })}`;

    expect(readScanPayload(raw).kind, 'a BOM is not corruption').toBe('scan');
  });
});

test.describe('pickBaseline', () => {
  test('picks the newest archive by the timestamp in the name', () => {
    const names = [
      '2026-10-01T10-00-00-000Z.json',
      '2026-10-03T10-00-00-000Z.json',
      '2026-10-02T10-00-00-000Z.json',
    ];

    expect(pickBaseline(names), 'newest wins, whatever order the directory lists them in').toBe(
      '2026-10-03T10-00-00-000Z.json',
    );
  });

  test('ignores files that are not archives of ours', () => {
    const picked = pickBaseline(['notes.txt', 'README.md', '2026-10-01T10-00-00-000Z.json']);

    expect(picked, "a person's file in the directory is not a baseline").toBe(
      '2026-10-01T10-00-00-000Z.json',
    );
  });

  test('returns null when there is no archive, rather than inventing one', () => {
    expect(pickBaseline([]), 'an empty history is not a baseline').toBeNull();
    expect(pickBaseline(['notes.txt']), 'nor is a directory of unrelated files').toBeNull();
  });
});

test.describe('describeDrift', () => {
  test('names what changed, grouped, with a total', () => {
    const outcome = scanDrift(
      scanOf({ interactive: [control('#gone')] }),
      scanOf({
        interactive: [control('#new')],
        endpoints: [{ method: 'POST', path: '/orders' }] as PageScan['endpoints'],
      }),
    );
    if (outcome.kind !== 'drift-found') throw new Error('expected drift');

    const text = describeDrift(outcome.result);

    expect(text, 'the total is stated').toContain('3 change(s)');
    expect(text).toContain('Controls that appeared');
    expect(text).toContain('#new');
    expect(text).toContain('Controls that disappeared');
    expect(text).toContain('#gone');
    expect(text).toContain('POST /orders');
    expect(text, 'empty groups are left out rather than printed as zero').not.toContain(
      'Testability findings that appeared',
    );
  });
});

test.describe('scanDrift — the dimensions beyond controls and endpoints', () => {
  test('reports a changed url or title first, since it may mean a different page', () => {
    const outcome = scanDrift(
      scanOf({ url: 'http://example.com/cart', title: 'Cart' }),
      scanOf({ url: 'http://example.com/basket', title: 'Basket' }),
    );

    expect(outcome.kind, 'the page identity moving is drift').toBe('drift-found');
    if (outcome.kind !== 'drift-found') return;
    expect(outcome.result.identityChanged.map((c) => c.field)).toEqual(['url', 'title']);
    expect(
      describeDrift(outcome.result).indexOf('not the same'),
      'and is reported before anything else, because it reframes the rest',
    ).toBeLessThan(describeDrift(outcome.result).indexOf('change(s) since') + 200);
  });

  test('a finding escalating in severity is drift, not silence', () => {
    /**
     * Identity is kind + element, so an escalation changes neither key: without its own category
     * a medium becoming a high neither appears nor resolves, and the diff reports nothing.
     */
    const was = issue('ambiguous', '#save');
    const now = { ...issue('ambiguous', '#save'), severity: 'high' } as TestabilityIssue;

    const outcome = scanDrift(scanOf({ testability: [was] }), scanOf({ testability: [now] }));

    expect(outcome.kind, 'the same finding getting worse is a change').toBe('drift-found');
    if (outcome.kind !== 'drift-found') return;
    expect(outcome.result.testabilityAppeared, 'it did not appear — it was already there').toEqual(
      [],
    );
    expect(outcome.result.testabilityResolved, 'nor did it resolve').toEqual([]);
    expect(outcome.result.testabilityChanged.map((c) => c.after.severity)).toEqual(['high']);
  });

  test('a new frame or shadow root is reported as a region nothing describes', () => {
    const outcome = scanDrift(
      scanOf({ frames: [], shadowHosts: [] }),
      scanOf({ frames: ['https://pay.example.com/card'], shadowHosts: ['my-widget'] }),
    );

    expect(outcome.kind).toBe('drift-found');
    if (outcome.kind !== 'drift-found') return;
    expect(
      outcome.result.blindRegionsAppeared,
      'a payment iframe arriving is the case this exists for',
    ).toEqual(['frame https://pay.example.com/card', 'shadow root my-widget']);
  });

  test('a control the selector sweep starts missing is drift, though it is still on the page', () => {
    const widget = { role: 'combobox', name: 'Country', locator: 'getByRole("combobox")' };

    const outcome = scanDrift(
      scanOf({ aria: { widgetsMissedBySelectors: [], announcing: [], unreadable: 0 } }),
      scanOf({ aria: { widgetsMissedBySelectors: [widget], announcing: [], unreadable: 0 } }),
    );

    expect(outcome.kind, 'specs are built on the sweep, so this invalidates them').toBe(
      'drift-found',
    );
    if (outcome.kind !== 'drift-found') return;
    expect(outcome.result.ariaBlindSpotsAppeared).toEqual([
      'combobox "Country" at getByRole("combobox")',
    ]);
  });

  test('countDrift counts every category, including ones added later', () => {
    /**
     * `countDrift` sums the result's arrays rather than naming them, so a category that is
     * computed but left out of a hand-written list cannot report as no drift. This asserts the
     * property rather than a number: every array in the result contributes.
     */
    const outcome = scanDrift(scanOf(), scanOf({ url: 'http://elsewhere.test', frames: ['f1'] }));
    if (outcome.kind !== 'drift-found') throw new Error('expected drift');

    const summed = Object.values(outcome.result).reduce(
      (total, entries) => total + (Array.isArray(entries) ? entries.length : 0),
      0,
    );
    expect(countDrift(outcome.result), 'the count is over all categories').toBe(summed);
    expect(countDrift(outcome.result), 'a url change and a new frame are two changes').toBe(2);
  });

  test('a scan missing the optional projections is not drift against another like it', () => {
    // Older scans may lack `aria`, `frames` or `shadowHosts`. Absent must not read as changed.
    const bare = { url: 'http://x', title: 'x', interactive: [], endpoints: [], testability: [] };

    expect(
      scanDrift(bare as unknown as PageScan, bare as unknown as PageScan).kind,
      'two equally sparse scans have not drifted',
    ).toBe('no-drift');
  });
});
