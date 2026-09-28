import { test, expect } from '@playwright/test';
import { blockedByPolicy, launchPlan } from '../../src/qe/browser-launch.js';

test.describe('which browser to try', () => {
  test('should try the bundled one first, then system browsers', () => {
    expect(launchPlan(undefined)).toEqual(['bundled', 'chrome', 'msedge']);
  });

  test('should honour an explicit choice alone, never widening it', () => {
    // An operator who named a browser wants that browser. Falling back would hide its
    // absence and quietly make the run incomparable with the one before it.
    expect(
      launchPlan('chrome'),
      'falling back past an explicit choice hides the browser’s absence and makes the run incomparable with the one before',
    ).toEqual(['chrome']);
    expect(launchPlan('  MSEDGE ')).toEqual(['msedge']);
    expect(launchPlan('bundled')).toEqual(['bundled']);
  });

  test('should ignore a value it does not recognise rather than failing the run', () => {
    expect(launchPlan('safari')).toEqual(['bundled', 'chrome', 'msedge']);
  });
});

test.describe('telling a blocked binary from a broken call', () => {
  test('should recognise the failure Smart App Control actually produced', () => {
    // Verbatim from the run that stopped working on 2026-09-24.
    expect(
      blockedByPolicy('browserType.launch: spawn UNKNOWN'),
      'verbatim from the run that stopped working; miss this string and no fallback ever fires',
    ).toBe(true);
    expect(blockedByPolicy('An Application Control policy has blocked this file')).toBe(true);
  });

  test('should not treat an ordinary launch error as a policy block', () => {
    // Falling back on a real error would retry against a different browser and then
    // report that browser's behaviour as the problem.
    expect(
      blockedByPolicy('Unknown option --nope'),
      'falling back on a real error retries against a different browser and reports that browser’s behaviour as the problem',
    ).toBe(false);
    expect(blockedByPolicy('listen EADDRINUSE: address already in use')).toBe(false);
  });
});
