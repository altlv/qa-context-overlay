import { test, expect } from '@playwright/test';
import { sessionBriefing } from '../../src/qe/session-briefing.js';
import { policyFor } from '../../src/qe/exploration-policy.js';

/**
 * A prompt is behaviour, and this one's branches were measured at 4 turns and $0.2613
 * against 1 turn and $0.1871. It lived inline in a CLI where nothing could reach it;
 * these are the assertions that were impossible to write before it moved.
 */

const MAP = '--- THE MAP ---\n3 controls, 1 fragile';

const brief = (over: Partial<Parameters<typeof sessionBriefing>[0]> = {}): string =>
  sessionBriefing({
    target: 'https://example.com',
    policy: policyFor('local'),
    access: 'full',
    map: '',
    ...over,
  });

test.describe('naming the target', () => {
  test('should always say where the session is pointed', () => {
    // The first browser run replied "I don't have a target URL" and stopped: --target
    // reached the MCP server and never reached the prompt.
    expect(
      brief({ target: 'https://shop.example/cart' }),
      'a briefing that does not name the target wastes the whole run',
    ).toContain('https://shop.example/cart');
  });

  test('should name the environment, so the agent knows which rules it is under', () => {
    expect(brief({ policy: policyFor('prod') }), 'the policy in force must be stated').toContain(
      'prod',
    );
  });
});

test.describe('the opening move', () => {
  test('should send an unscanned session to the browser first', () => {
    const text = brief({ map: '' });
    expect(text, 'with no map, looking is the only way to start').toContain('browser_navigate');
  });

  test('should NOT tell a pre-scanned session to go and look first', () => {
    // The regression that cost 4 turns. The briefing said "do not re-derive this from
    // the page" three sentences after "Begin with browser_navigate", and the agent
    // obeyed the second.
    const text = brief({ map: MAP });
    expect(
      text,
      'a pre-scanned session told to begin with browser_navigate will rebuild the map by hand — measured at 4 turns and $0.2613 against 1 turn and $0.1871',
    ).not.toContain('Begin with browser_navigate');
  });

  test('should include the map and say what it is for', () => {
    const text = brief({ map: MAP });
    expect(text, 'the map has to actually be in the prompt').toContain(MAP);
    expect(text, 'the agent must be told the scan is exact, or it will verify it').toMatch(
      /already\s+answered/,
    );
  });

  test('should point an unscanned session at the cheaper way to look', () => {
    // A screenshot cost $0.07 on a page whose accessibility tree cost $0.23.
    const text = brief({ map: '' });
    expect(
      text,
      'left to itself an agent reaches for the tree, which is the expensive one',
    ).toMatch(/prefer a screenshot/i);
  });
});

test.describe('what the session may do', () => {
  test('should tell a read-only session the tools are absent, not discouraged', () => {
    const text = brief({ policy: policyFor('prod') });
    expect(
      text,
      'an agent that thinks a tool is discouraged will try it and burn a turn discovering the policy',
    ).toContain('absent');
  });

  test('should say so for an auditing role even where the environment is permissive', () => {
    // local grants every tier; the ceiling is the role's own, so the reason given has
    // to be the role rather than the environment.
    const text = brief({ policy: policyFor('local'), access: 'observe' });
    expect(text, 'an observe-ceiling role must be told why it cannot click here').toMatch(
      /auditing role/i,
    );
  });

  test('should let a full role on a disposable fixture know it can act', () => {
    expect(
      brief({ policy: policyFor('local'), access: 'full' }),
      'a full role on local must not be told it is read-only',
    ).toContain('You may interact');
  });
});

test.describe('how the limits are phrased', () => {
  test('should present the action limit as a backstop, never as an allowance', () => {
    // Stating "you have 200 actions" anchors the model toward spending them. Same
    // number, opposite pull.
    const text = brief({ policy: policyFor('local') });
    expect(text, 'a stated allowance gets spent').not.toMatch(/you have \d+ actions/i);
    expect(text, 'the limit must read as a failure signal, not a quota').toContain('backstop');
    expect(text).toMatch(/fewer actions is a better session/i);
  });

  test('should tell the agent a refusal is a finding', () => {
    // Otherwise it looks for another route to the same control, which is the one
    // behaviour the label guard cannot stop.
    expect(brief(), 'an agent that treats a refusal as an obstacle will work around it').toMatch(
      /refusal is a finding/i,
    );
  });
});

test.describe('candidate actions', () => {
  const ACTIONS = '--- Candidate actions: 4 the local policy permits here ---';

  test('should include the plan and say it is not a checklist', () => {
    const text = brief({ map: MAP, actions: ACTIONS });
    expect(text, 'the plan has to actually be in the prompt').toContain(ACTIONS);
    // A list handed to an agent reads as a quota unless something says otherwise —
    // the same failure the action ceiling is phrased around three lines above.
    expect(text).toMatch(/not a checklist/i);
  });

  test('should keep the map and the plan both, and in that order', () => {
    const text = brief({ map: MAP, actions: ACTIONS });
    expect(text.indexOf(MAP), 'the map must survive once a plan is also supplied').toBeGreaterThan(
      -1,
    );
    expect(
      text.indexOf(ACTIONS),
      'what is on the page has to come before what may be done to it, or the candidates arrive with nothing to read them against',
    ).toBeGreaterThan(text.indexOf(MAP));
  });

  test('should never mention a plan the session was not given', () => {
    // The measured failure this repeats: a briefing that named something absent sent
    // the agent looking for it, at 3 extra turns.
    expect(
      brief({ map: MAP }),
      'a scanned session with no plan must not be told one exists — it will go looking',
    ).not.toMatch(/candidate actions/i);
    expect(
      brief({ map: '' }),
      'an unscanned session has no plan either, and naming one is the same contradiction',
    ).not.toMatch(/candidate actions/i);
  });

  test('should offer a plan even when no map was computed', () => {
    // The two are separable inputs; nothing should make one depend on the other.
    expect(brief({ map: '', actions: ACTIONS })).toContain(ACTIONS);
  });
});
