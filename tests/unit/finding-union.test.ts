import { test, expect } from '@playwright/test';
import {
  MATCH_AT,
  cluster,
  fingerprint,
  similarity,
  summarise,
} from '../../src/qe/finding-union.js';

/**
 * Two runs under one charter returned seventeen findings each and neither set
 * contained the other. Single-run yield was the only number the harness produced, and
 * it turned out to measure roughly a third of what is there.
 */

const f = (run: string, id: string, summary: string, severity = 'major') => ({
  run,
  id,
  severity,
  summary,
});

test.describe('matching one defect described twice', () => {
  test('should ignore words that say nothing about which defect it is', () => {
    const print = fingerprint({ summary: 'The cart is not in the total of it' });
    expect([...print].sort()).toEqual(['cart', 'total']);
  });

  test('should normalise by the smaller summary, so a terse filing still matches', () => {
    // "The cart's Grand Total exceeds its own subtotal plus shipping by exactly $100"
    // and a two-paragraph version of the same thing are the same defect.
    const terse = fingerprint({ summary: 'cart grand total wrong' });
    const full = fingerprint({
      summary: 'cart grand total wrong by a flat hundred dollars at every subtotal tested',
    });
    expect(similarity(terse, full)).toBe(1);
  });

  test('should score nothing against an empty fingerprint rather than dividing by zero', () => {
    expect(similarity(new Set(), new Set(['cart']))).toBe(0);
  });
});

test.describe('clustering across runs', () => {
  test('should not chain unrelated findings through a shared neighbour', () => {
    // Single linkage put 25 findings in one cluster on the first run of this — a
    // missing h1 sat with a sort ordering, a contrast failure and six tile heights,
    // because each matched its neighbour and nothing compared the ends. An over-merged
    // cluster shrinks the union, which is the number this module exists to report.
    const clusters = cluster([
      f('a', 'F1', 'the listing page has no h1 heading element'),
      f('b', 'F1', 'the h1 heading is missing and images have no alt attribute'),
      f('c', 'F1', 'images have no alt attribute anywhere on the page'),
    ]);
    const chained = clusters.find((entry) => entry.members.length === 3);
    expect(chained, 'the ends must be compared, not only each neighbour').toBeUndefined();
  });

  test('should place a finding with the cluster it resembles most, not the first it clears', () => {
    // First-match would make the result depend on the order reports were read in.
    const clusters = cluster([
      f('a', 'F1', 'cart grand total exceeds subtotal plus shipping'),
      f('b', 'F1', 'sort by price returns the wrong order entirely'),
      f('c', 'F1', 'cart grand total exceeds subtotal plus shipping by a flat amount'),
    ]);
    const cart = clusters.find((entry) => entry.members.length > 1);
    expect(cart?.runs.sort()).toEqual(['a', 'c']);
  });

  test('should keep the worst severity anyone gave it', () => {
    // Two sessions disagreeing about severity is worth seeing, and averaging hides it.
    // A defect one run called a blocker must not be filed as an observation because
    // three other runs shrugged.
    const clusters = cluster([
      f('a', 'F1', 'cart grand total exceeds subtotal plus shipping', 'observation'),
      f('b', 'F1', 'cart grand total exceeds subtotal plus shipping', 'blocker'),
    ]);
    expect(clusters[0]?.severity).toBe('blocker');
  });

  test('should label a cluster with its fullest description', () => {
    const clusters = cluster([
      f('a', 'F1', 'cart total wrong somehow'),
      f('b', 'F1', 'cart total wrong somehow by a flat one hundred dollars every time'),
    ]);
    expect(clusters[0]?.label).toContain('flat one hundred dollars');
  });
});

test.describe('what the numbers mean', () => {
  const clusters = cluster([
    f('a', 'F1', 'cart grand total exceeds subtotal plus shipping'),
    f('b', 'F1', 'cart grand total exceeds subtotal plus shipping'),
    f('a', 'F2', 'the currency selector changes nothing at all on any page'),
  ]);
  const summary = summarise(clusters, ['a', 'b']);

  test('should count the union as everything anyone found', () => {
    expect(summary.union).toBe(2);
  });

  test('should call the core what every run reached', () => {
    expect(summary.core).toHaveLength(1);
  });

  test('should name the singletons, which are the map of where the role is blind', () => {
    // Not a lucky accident to be admired — evidence about what the other runs were
    // not looking at.
    expect(
      summary.singletons,
      'the singletons are the map of where the role is blind, and losing them is losing the point of reading runs together',
    ).toHaveLength(1);
    expect(summary.singletons[0]?.label).toContain('currency selector');
  });

  test('should report each run against the union, not against itself', () => {
    expect(summary.recall).toEqual([
      { run: 'a', found: 2, of: 2 },
      { run: 'b', found: 1, of: 2 },
    ]);
  });
});

test('the threshold stays where it was calibrated', () => {
  // Swept against the one known case: four of five sessions found the cart's flat $100
  // surplus. 0.40 splits that known cluster; 0.20 chains 20 findings into one. Changing
  // this silently moves every number the tool prints.
  expect(MATCH_AT).toBe(0.35);
});
