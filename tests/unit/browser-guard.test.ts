import { test, expect } from '@playwright/test';
import { browserGuard } from '../../src/qe/browser-guard.js';
import { policyFor } from '../../src/qe/exploration-policy.js';

/**
 * The half of the policy the tool allowlist cannot express. `denyLabels`,
 * `maxActions` and `maxStates` had been written, unit-tested and enforced against
 * nothing for months — `actionAllowed` had no caller outside its own tests.
 */

const click = (element: string): [string, Record<string, unknown>] => [
  'mcp__playwright__browser_click',
  { element, ref: 'e12' },
];

test.describe('what may be clicked', () => {
  test('should refuse a control that commits to something, on every environment', () => {
    // The policy says these are never clicked anywhere — not "discouraged on prod".
    for (const environment of ['local', 'test', 'prod'] as const) {
      const guard = browserGuard(policyFor(environment));
      const verdict = guard.check(...click('Subscribe now button'));
      expect(
        verdict.allowed,
        `${environment} permitted a click on "Subscribe now" — denyLabels lists it in every preset`,
      ).toBe(false);
      expect(verdict.reason).toContain('subscribe');
    }
  });

  test('should refuse a destructive label where the policy denies it', () => {
    // Was asserted against `test` until 2026-09-19, when that tier gained
    // allowDestructive. The rule is unchanged; the tier that carries it moved, so the
    // case moved with it rather than being weakened to keep passing.
    const verdict = browserGuard(policyFor('prod')).check(...click('Delete account link'));
    expect(verdict.allowed, 'production is where a destructive label must never be pressed').toBe(
      false,
    );
  });

  test('should permit a destructive label on a test environment, by decision', () => {
    // The other half of that change, pinned so a silent revert is visible. A control
    // named "Reset" is usually the safest thing on a practice app, and refusing it cost
    // a session the ability to return to a known state.
    const verdict = browserGuard(policyFor('test')).check(...click('Reset the app'));
    expect(
      verdict.allowed,
      'test tier permits destructive controls as of 2026-09-19 — if this fails, the preset changed and the reason should be recorded',
    ).toBe(true);
  });

  test('should allow an ordinary control', () => {
    // A guard that refuses everything is as useless as one that refuses nothing, and
    // it looks safe, which is worse.
    const verdict = browserGuard(policyFor('local')).check(...click('Add to cart button'));
    expect(verdict.allowed, `an ordinary click was refused: ${verdict.reason}`).toBe(true);
  });

  test('should not count or judge an observation', () => {
    const guard = browserGuard(policyFor('prod'));
    for (let i = 0; i < 200; i += 1) {
      guard.check('mcp__playwright__browser_take_screenshot', {});
    }
    expect(
      guard.spent(),
      'looking is not acting; a screenshot must not consume the action budget',
    ).toBe(0);
  });
});

test.describe('how many times', () => {
  test('should stop at the action ceiling for the environment', () => {
    const policy = policyFor('prod');
    const guard = browserGuard(policy);
    for (let i = 0; i < policy.maxActions; i += 1) {
      expect(guard.check(...click('Next page')).allowed, `action ${i + 1} was refused early`).toBe(
        true,
      );
    }
    const oneTooMany = guard.check(...click('Next page'));
    expect(
      oneTooMany.allowed,
      `the ${policy.maxActions + 1}th action was permitted — the ceiling counts nothing`,
    ).toBe(false);
    expect(oneTooMany.reason).toContain('ceiling');
  });

  test('should give production a tighter ceiling than local', () => {
    expect(
      policyFor('prod').maxActions,
      'production must not be explored as hard as a disposable fixture',
    ).toBeLessThan(policyFor('local').maxActions);
  });

  test('should not spend budget on a refused action', () => {
    // Otherwise a run could be talked out of its budget by proposing forbidden
    // clicks, and the refusals would look like progress.
    const guard = browserGuard(policyFor('local'));
    guard.check(...click('Pay now'));
    guard.check(...click('Subscribe'));
    expect(guard.spent(), 'a refusal is not an action').toBe(0);
  });

  test('should let a disposable fixture be destroyed but not commit anything outward', () => {
    // The distinction the local preset actually draws, and one this test got wrong
    // first time: local denies only the OUTBOUND labels. Deleting a record on a
    // fixture is the point of having a fixture; sending a real invite from one is
    // still someone else's inbox.
    const guard = browserGuard(policyFor('local'));
    expect(
      guard.check(...click('Delete account')).allowed,
      'local is disposable — refusing to delete there costs coverage for nothing',
    ).toBe(true);
    expect(
      guard.check(...click('Send invite')).allowed,
      'an invite leaves the machine whatever environment sent it',
    ).toBe(false);
  });
});

test.describe('what the guard cannot do', () => {
  test('should be honest that a mis-described target evades the label check', () => {
    // Playwright MCP identifies a target by an opaque ref plus a description the
    // model writes. This documents the limit rather than pretending it away: the
    // guard catches the honest case, and the tool allowlist is the layer that does
    // not depend on the model's description at all.
    const guard = browserGuard(policyFor('prod'));
    const honest = guard.check(...click('Delete account'));
    const evasive = guard.check(...click('the third button'));
    expect(honest.allowed, 'the honest description must be refused').toBe(false);
    expect(
      evasive.allowed,
      'a vague description passes the label check — if this ever starts failing, the guard got stronger and this test should be rewritten rather than deleted',
    ).toBe(true);
  });
});

test.describe('the state ceiling', () => {
  const source = (count: number) => ({
    count: () => count,
    atCeiling: (max: number) => count >= max,
  });

  test('should refuse an action once the session has visited its states', () => {
    // maxStates was in the policy from the beginning and enforced by nothing, because
    // a per-call guard cannot tell a new page from a return. The state model can, and
    // this is the refusal that makes the bound real.
    const policy = policyFor('prod');
    const guard = browserGuard(policy, source(policy.maxStates));

    const decision = guard.check('mcp__playwright__browser_click', { element: 'Next page' });

    expect(
      decision.allowed,
      'a bound that never refuses is advice, and this one had been advice since it was written',
    ).toBe(false);
    expect(decision.reason, 'the refusal must name the ceiling it hit').toContain('state ceiling');
  });

  test('should let an action through while states remain', () => {
    const policy = policyFor('local');
    const guard = browserGuard(policy, source(policy.maxStates - 1));

    expect(
      guard.check('mcp__playwright__browser_click', { element: 'Open menu' }).allowed,
      'one state short of the ceiling must still act, or exploration stops a step early',
    ).toBe(true);
  });

  test('should not count observation against the state ceiling', () => {
    const policy = policyFor('prod');
    const guard = browserGuard(policy, source(policy.maxStates));

    expect(
      guard.check('mcp__playwright__browser_take_screenshot', {}).allowed,
      'looking changes nothing and must stay available for the session to report what it saw',
    ).toBe(true);
  });

  test('should say plainly when maxStates is not being enforced', () => {
    // The hole this closes: a guard with no state source silently enforces two of
    // three bounds, and a run summary that did not say so would read as all three.
    expect(
      browserGuard(policyFor('local')).enforcing().join(' '),
      'an unenforced bound must announce itself, not be inferred from its absence',
    ).toContain('NOT enforced');
    expect(
      browserGuard(policyFor('local'), source(0)).enforcing().join(' '),
      'and a guard that does enforce it must say the number',
    ).toContain('40 states');
  });
});
