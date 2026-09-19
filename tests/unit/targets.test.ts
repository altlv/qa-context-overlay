import { test, expect } from '@playwright/test';
import {
  effectAllowed,
  grepForPolicy,
  targets,
  targetFor,
  validateTargets,
} from '../../apps/targets.js';
import { policyFor } from '../../src/qe/exploration-policy.js';

/**
 * The subject x environment matrix, checked rather than merely printed.
 *
 * An index nothing reads back is write-only. This file is what reads it back:
 * it exists so that pointing a writing test at somebody else's production
 * service fails here, at the cost of one second, instead of succeeding quietly
 * against a real system.
 */

test.describe('the registry itself', () => {
  test('should declare no invalid targets', () => {
    const problems = validateTargets();

    expect(
      problems.map((problem) => `${problem.target}: ${problem.problem}`),
      'every app must name real environments, a default among them, and start a server only locally',
    ).toEqual([]);
  });

  test('should give every app at least one reachable deployment', () => {
    for (const target of targets()) {
      expect(
        target.baseURL,
        `${target.app.name}/${target.environment} must carry a baseURL or nothing can be pointed at it`,
      ).toMatch(/^https?:\/\//);
    }
  });

  test('should never start a web server for a deployment we do not own', () => {
    for (const target of targets()) {
      if (target.webServer === undefined) continue;
      expect(
        target.environment,
        `${target.app.name} would start a server for its ${target.environment} deployment — the harness may only run something locally`,
      ).toBe('local');
    }
  });

  test('should withhold payload bodies everywhere except local', () => {
    for (const target of targets()) {
      if (target.environment === 'local') continue;
      expect(
        target.policy.captureBodies,
        `${target.app.name}/${target.environment} would write request and response bodies to disk — off a local machine that is somebody's real data`,
      ).toBe(false);
    }
  });
});

test.describe('effect permissions', () => {
  test('should refuse a writing test on production', () => {
    const verdict = effectAllowed(policyFor('prod'), ['@writes']);

    expect(verdict.allowed, 'a test that creates or updates must not run against production').toBe(
      false,
    );
    expect(
      verdict.allowed === false ? verdict.reason : '',
      'the refusal must say which environment refused, so the fix is obvious',
    ).toContain('prod');
  });

  test('should refuse a destructive test anywhere but local', () => {
    expect(
      effectAllowed(policyFor('test'), ['@destructive']).allowed,
      'a shared test environment is still somebody else afternoon; deletes stay local',
    ).toBe(false);
    expect(
      effectAllowed(policyFor('local'), ['@destructive']).allowed,
      'a disposable local fixture is exactly where a destructive test belongs',
    ).toBe(true);
  });

  test('should treat an untagged test as unknown rather than harmless', () => {
    expect(
      effectAllowed(policyFor('prod'), []).allowed,
      'an untagged test has an undeclared effect; running it on prod to find out is the mistake this prevents',
    ).toBe(false);
    expect(
      effectAllowed(policyFor('local'), []).allowed,
      'locally an unknown effect is cheap, so untagged tests still run and nobody has to tag a fixture suite',
    ).toBe(true);
  });

  test('should let a read-only test run everywhere', () => {
    for (const environment of ['local', 'test', 'prod'] as const) {
      expect(
        effectAllowed(policyFor(environment), ['@read-only']).allowed,
        `a read-only test must run on ${environment}, or production is untestable by design`,
      ).toBe(true);
    }
  });

  test('should judge by the most dangerous tag present', () => {
    expect(
      effectAllowed(policyFor('prod'), ['@read-only', '@writes']).allowed,
      'a test claiming both must be judged by the write, not excused by the read',
    ).toBe(false);
  });
});

test.describe('the runner filter', () => {
  test('should narrow production to read-only tests', () => {
    const grep = grepForPolicy(policyFor('prod'));

    expect(grep, 'a production run must carry a filter, not run everything').toBeDefined();
    expect(grep?.test('@read-only'), 'read-only tests are what production permits').toBe(true);
    expect(
      grep?.test('a test with no tag at all'),
      'the filter must exclude untagged tests, which is what makes safe-by-default real',
    ).toBe(false);
  });

  test('should stop filtering a test run once that tier allows destructive', () => {
    // **The consequence worth seeing.** `allowDestructive` is one flag governing two
    // different things: which browser tools an agent holds, and which Playwright specs
    // run at all. Flipping it for the test tier on 2026-09-19 did both, so a test
    // deployment now runs `@destructive` specs — and untagged ones, whose effect
    // nobody declared — exactly as local does.
    //
    // Asserted rather than left implied, because the blast radius here is wider than
    // the browser policy that motivated the change. If that is not wanted, the fix is
    // to split the flag, not to quietly narrow this test.
    expect(
      grepForPolicy(policyFor('test')),
      'a test tier that allows destructive runs everything, like local — if this becomes a filter again, the flag was split and that decision should be recorded',
    ).toBeUndefined();
  });

  test('should still refuse destructive and untagged specs on production', () => {
    const grep = grepForPolicy(policyFor('prod'));

    expect(grep?.test('@read-only'), 'reading production is the point of pointing at it').toBe(
      true,
    );
    expect(
      grep?.test('@destructive'),
      'production is where safe-by-default has to survive, whatever the other tiers do',
    ).toBe(false);
    expect(
      grep?.test('a test with no tag at all'),
      'an undeclared effect is unknown, not harmless',
    ).toBe(false);
  });

  test('should not filter a local run at all', () => {
    expect(
      grepForPolicy(policyFor('local')),
      'everything runs locally; a filter there would silently skip tests for no safety gain',
    ).toBeUndefined();
  });
});

test.describe('juice-shop, the two-environment subject', () => {
  test('should permit writes locally and refuse them on the public demo', () => {
    const local = targetFor('juice-shop', 'local');
    const prod = targetFor('juice-shop', 'prod');

    expect(local, 'the local clone must be declared').toBeDefined();
    expect(prod, 'the public demo must be declared').toBeDefined();

    expect(
      effectAllowed(local!.policy, ['@writes']).allowed,
      'a local clone is ours to break, which is the whole reason to run one',
    ).toBe(true);
    expect(
      effectAllowed(prod!.policy, ['@writes']).allowed,
      'the public demo is shared with everyone; writing to it leaves our mess in their session',
    ).toBe(false);
  });

  test('should point the two environments at different hosts', () => {
    expect(
      targetFor('juice-shop', 'local')?.baseURL,
      'the local environment must be a loopback address, or the permissive policy would apply to a remote system',
    ).toMatch(/127\.0\.0\.1|localhost/);
    expect(
      targetFor('juice-shop', 'prod')?.baseURL,
      'the prod environment must be the real hosted demo',
    ).toContain('owasp-juice.shop');
  });
});
