import { test, expect } from '@playwright/test';
import {
  DEFAULT_TIER,
  MODEL_IDS,
  TIER_BUDGET,
  budgetForTier,
  resolveModel,
  TOKENS_PER_USD,
} from '../../src/agents/models.js';

/**
 * The model was chosen in three places that disagreed: a default id in `client.ts`,
 * a `model` field on every role that the runner never read, and an
 * `AGENT_MAX_TURNS` in `.env.example` that silently overrode every role's budget.
 * These tests pin the behaviour of the one place that now decides.
 */

test.describe('model resolution', () => {
  test('should default to sonnet when HARNESS_MODEL is unset or blank', () => {
    for (const raw of [undefined, '', '   ']) {
      const resolved = resolveModel(raw);
      expect(
        resolved.tier,
        `HARNESS_MODEL=${JSON.stringify(raw)} must fall back to ${DEFAULT_TIER}, not to nothing`,
      ).toBe(DEFAULT_TIER);
      expect(resolved.id).toBe(MODEL_IDS[DEFAULT_TIER]);
      expect(resolved.warning, 'the documented default is not something to warn about').toBeNull();
    }
  });

  test('should expand a tier alias to a pinned model id', () => {
    for (const tier of ['haiku', 'sonnet', 'opus'] as const) {
      const resolved = resolveModel(tier);
      expect(resolved.id, `alias "${tier}" must resolve to a real id, not stay an alias`).toBe(
        MODEL_IDS[tier],
      );
      expect(resolved.tier).toBe(tier);
    }
  });

  test('should keep a full model id and infer its tier', () => {
    const resolved = resolveModel('claude-opus-5-20260101');
    expect(
      resolved.id,
      'a pinned snapshot must be passed through, not rewritten to the tier default',
    ).toBe('claude-opus-5-20260101');
    expect(resolved.tier).toBe('opus');
    expect(resolved.warning).toBeNull();
  });

  test('should pass an unknown model through, but say so', () => {
    // Refusing would break the day a new model ships. Guessing a tier silently would
    // apply the wrong budget, and a run that ends early for no visible reason is
    // worse than one that prints a warning.
    const resolved = resolveModel('some-future-model');
    expect(resolved.id).toBe('some-future-model');
    expect(resolved.tier).toBe(DEFAULT_TIER);
    expect(resolved.warning, 'an unrecognised model must warn').not.toBeNull();
    expect(resolved.warning).toContain('some-future-model');
  });
});

test.describe('tier budgets', () => {
  test('should leave a sonnet role on exactly what it declared', () => {
    // Role budgets are written for sonnet. If this drifts, every role's declaration
    // starts meaning something other than what it says.
    expect(
      TIER_BUDGET.sonnet.turns,
      'sonnet is the baseline every role budget is written against; scaling it changes what every declaration means',
    ).toBe(1);
    expect(budgetForTier('sonnet', 30, 1, 600)).toEqual({
      maxTurns: 30,
      maxUsd: 1,
      // The dollar figure converted into the only spend bound that can stop a run mid-flight.
      // Derived rather than declared, so it follows the dollars wherever they come from.
      maxTokens: TOKENS_PER_USD,
      timeoutMs: 600_000,
    });
  });

  test('should give a role the wall clock it declares, whatever the tier', () => {
    // Time goes to the tools a run calls, and a stronger model does not make a test
    // run faster. Every role used to share one 180-second limit.
    const seconds = [
      budgetForTier('haiku', 20, 1, 900).timeoutMs,
      budgetForTier('sonnet', 20, 1, 900).timeoutMs,
      budgetForTier('opus', 20, 1, 900).timeoutMs,
    ];
    expect(seconds, 'wall clock is declared per role and must not move with the tier').toEqual([
      900_000, 900_000, 900_000,
    ]);
  });

  test('should give a weaker model more turns and a stronger one fewer', () => {
    const declared = 20;
    const haiku = budgetForTier('haiku', declared, 1).maxTurns;
    const sonnet = budgetForTier('sonnet', declared, 1).maxTurns;
    const opus = budgetForTier('opus', declared, 1).maxTurns;
    expect(haiku, 'a weaker model needs more attempts, not fewer').toBeGreaterThan(sonnet);
    expect(opus, 'a stronger model should not need more attempts than sonnet').toBeLessThan(sonnet);
  });

  test('should let spend rise with capability while turns fall', () => {
    // The two move in opposite directions on purpose: opus costs more per turn, so
    // scaling turns down without scaling spend up would starve it mid-task.
    expect(
      TIER_BUDGET.opus.usd,
      'opus costs more per turn — fewer turns at the same spend cap starves it mid-task',
    ).toBeGreaterThan(TIER_BUDGET.sonnet.usd);
    expect(TIER_BUDGET.haiku.usd).toBeLessThan(TIER_BUDGET.sonnet.usd);
  });

  test('should round turns up, never down to zero', () => {
    // A short role on a tier with a fractional multiplier must still get a turn.
    expect(
      budgetForTier('opus', 1, 1).maxTurns,
      'a fractional multiplier must never round a role down to zero turns',
    ).toBeGreaterThanOrEqual(1);
    expect(budgetForTier('opus', 12, 1).maxTurns).toBe(Math.ceil(12 * TIER_BUDGET.opus.turns));
  });
});
