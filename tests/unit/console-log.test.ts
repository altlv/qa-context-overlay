import { test, expect } from '@playwright/test';
import {
  originOf,
  parseConsoleLog,
  reportConsole,
  summariseConsole,
} from '../../src/qe/console-log.js';

/** Verbatim lines from captured runs. The format is the contract. */
const REAL = `[     944ms] [ERROR] Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector @ https://fonts.googleapis.com/css?family=Montserrat:100:0
[    1151ms] [ERROR] Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector @ https://cdn.polyfill.io/v2/polyfill.min.js:0
[    2056ms] [LOG] JQMIGRATE: Migrate is installed with logging active, version 3.4.1 @ https://academybugs.com/wp-includes/js/jquery/jquery-migrate.js?ver=3.4.1:103
[     535ms] [ERROR] TypeError: Failed to fetch
[     152ms] [ERROR] Failed to load resource: the server responded with a status of 404 () @ https://bugeater.web.app/game/this-route-does-not-exist-q
[     300ms] [WARNING] Deprecated API used`;

test.describe('reading the console log', () => {
  test('should parse the captured format, timestamp, level, message and source', () => {
    const entries = parseConsoleLog(REAL);
    expect(entries).toHaveLength(6);
    expect(entries[0]?.atMs).toBe(944);
    expect(entries[0]?.level).toBe('ERROR');
    expect(entries[0]?.url).toContain('fonts.googleapis.com');
  });

  test('should ignore lines that are not console entries', () => {
    expect(parseConsoleLog('some preamble\n\n[not a real line]')).toEqual([]);
  });
});

test.describe('whose fault is this error', () => {
  test('should attribute a blocked request to our own guard, never to the product', () => {
    // 116 of 120 captured errors were this. Counting them as product findings would
    // manufacture defects out of the harness's own confinement.
    const [blocked] = parseConsoleLog(REAL);
    expect(originOf(blocked!)).toBe('confinement');
  });

  test('should refuse to attribute a bare fetch failure either way', () => {
    // A refused host and a broken server look identical here. Guessing would either
    // invent a defect or hide one.
    const failed = parseConsoleLog(REAL).find((e) => e.message.startsWith('TypeError'));
    expect(originOf(failed!)).toBe('consequence');
  });

  test('should treat a real server error as the product speaking', () => {
    const notFound = parseConsoleLog(REAL).find((e) => e.message.includes('404'));
    expect(originOf(notFound!)).toBe('product');
  });
});

test.describe('what the runner reports', () => {
  test('should separate our noise from the product signal', () => {
    const summary = summariseConsole(parseConsoleLog(REAL));
    expect(summary.errors).toBe(4);
    expect(summary.fromConfinement).toBe(2);
    expect(summary.unattributed).toBe(1);
    expect(summary.fromProduct).toHaveLength(1);
  });

  test('should call a product-origin error a finding until explained', () => {
    const lines = reportConsole(summariseConsole(parseConsoleLog(REAL))).join('\n');
    expect(lines).toContain('FROM THE PRODUCT');
    expect(lines).toContain('finding until explained');
    expect(lines, 'and say plainly which errors were ours').toContain("run's own origin guard");
  });

  test('should say zero from the product rather than staying silent', () => {
    // Silence reads as "clean". Only a stated zero is evidence.
    const onlyOurs = parseConsoleLog(REAL).filter((e) => e.message.includes('BLOCKED'));
    expect(reportConsole(summariseConsole(onlyOurs)).join('\n')).toContain('0 from the product');
  });

  test('should report nothing captured rather than inventing a clean console', () => {
    expect(reportConsole(summariseConsole([])).join('\n')).toContain('nothing captured');
  });
});
