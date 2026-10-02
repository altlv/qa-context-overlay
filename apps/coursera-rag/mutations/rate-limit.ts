/**
 * Mutations for the rate limiter — `server/rate-limit.js` in `coursera-rag`.
 *
 * Written from the source alone, before `test/unit/rate-limit.test.mjs` was opened, which is
 * the order AD4 requires: a mutation written after reading the tests grades the author's
 * memory of the tests rather than the tests. Each entry removes exactly one rule and names
 * it, and the rules were taken from what the code does, not from what its comments claim —
 * a comment is a claim about the code and an oracle to check, not a source of truth.
 *
 * Kept here rather than in the subject, because the subject is never modified. The subject's
 * own suite for this seam is the bar: `mutation-compare --against` asks whether an agent's
 * new file kills what that file kills, and the score means nothing without that comparison.
 *
 * Why this seam. It is the only one in the subject that is pure, fully injected (the clock is
 * a parameter) and reachable with no API key, so a mutation run costs nothing and cannot be
 * confounded by a live model. It is also security-relevant: every mutation below makes the
 * limiter more permissive than configured, which is the direction a limiter fails in.
 *
 * **What this set cannot see, stated because the number will be believed.** All fourteen
 * loosen the limiter. A suite could score fourteen of fourteen and still miss a rule that
 * makes it *stricter* than configured — refusing a caller inside its allowance, say. The
 * set has a direction and the fraction does not show it.
 *
 * **The holdout.** Five entries are marked `holdout` and never reach the role's briefing;
 * all fourteen are scored. The split is one rule from each family the seam has — identity,
 * threshold, reported allowance, state-on-refusal, sweep — rather than a run of adjacent
 * ones, so it measures the effect of briefing rather than one family's difficulty. Whether
 * these five are rules the subject's own suite already covers is unknown until the first
 * score: a holdout the baseline kills tells the two runs apart in no way, and
 * `holdoutPower` prints that so the split can be moved.
 */
import type { Mutation } from '../../../src/qe/mutation-compare.js';

const FILE = 'server/rate-limit.js';

export const MUTATIONS: Mutation[] = [
  {
    file: FILE,
    find: '      if (!enabled) return { allowed: true, remaining: Infinity, retryAfterMs: 0 };',
    replace: '      if (true) return { allowed: true, remaining: Infinity, retryAfterMs: 0 };',
    breaks: 'a limiter that was enabled actually limits',
  },
  {
    file: FILE,
    find: "      const key = rawKey ?? '@anonymous';",
    replace: '      const key = rawKey ?? String(Math.random());',
    breaks: 'callers with no address share one bucket rather than each getting a fresh allowance',
    holdout: true,
  },
  {
    file: FILE,
    find: '      const bucket = buckets.get(key) ?? { tokens: burst, updated: current };',
    replace: '      const bucket = { tokens: burst, updated: current };',
    breaks: 'a caller seen before is charged against the bucket it already has',
  },
  {
    file: FILE,
    find: '      const refilled = Math.min(burst, bucket.tokens + (current - bucket.updated) * refillPerMs);',
    replace: '      const refilled = bucket.tokens + (current - bucket.updated) * refillPerMs;',
    breaks: 'refill never exceeds the burst size, so an idle caller banks no unbounded allowance',
  },
  {
    file: FILE,
    find: '      if (refilled < 1) {',
    replace: '      if (refilled < 0) {',
    breaks: 'a request needs a whole token, not a fraction of one',
    holdout: true,
  },
  {
    file: FILE,
    find: '          retryAfterMs: Math.ceil((1 - refilled) / refillPerMs),',
    replace: '          retryAfterMs: 0,',
    breaks: 'a refused caller is told how long until a token exists',
  },
  {
    file: FILE,
    find: '        buckets.set(key, { tokens: refilled, updated: current });',
    replace: '        buckets.set(key, { tokens: refilled, updated: bucket.updated });',
    breaks:
      'a refused call still advances the bucket clock, so refusal does not silently credit the elapsed time twice',
    holdout: true,
  },
  {
    file: FILE,
    find: '      buckets.set(key, { tokens: refilled - 1, updated: current });',
    replace: '      buckets.set(key, { tokens: refilled, updated: current });',
    breaks: 'an allowed request spends a token',
  },
  {
    file: FILE,
    find: '      return { allowed: true, remaining: Math.floor(refilled - 1), retryAfterMs: 0 };',
    replace: '      return { allowed: true, remaining: burst, retryAfterMs: 0 };',
    breaks: 'the remaining count reported is the allowance that is actually left',
    holdout: true,
  },
  {
    file: FILE,
    find: '      if (current - bucket.updated > fullRefillMs) buckets.delete(key);',
    replace: '      buckets.delete(key);',
    breaks: 'the sweep drops only buckets that are full, never one a live caller is spending',
  },
  {
    file: FILE,
    find: '      if (current - bucket.updated > fullRefillMs) buckets.delete(key);',
    replace: '      if (false) buckets.delete(key);',
    breaks: 'a bucket idle long enough to be full is dropped, so the map does not grow forever',
    holdout: true,
  },
  {
    file: FILE,
    find: '      sweep(current);',
    replace: '      if (false) sweep(current);',
    breaks: 'the sweep runs at all',
  },
  {
    file: FILE,
    find: '    if (current - lastSweep < IDLE_SWEEP_MS) return;',
    replace: '    if (current - lastSweep < 0) return;',
    breaks: 'the sweep is rate limited to once per IDLE_SWEEP_MS rather than running every call',
  },
  {
    file: FILE,
    find: '  const fullRefillMs = burst / refillPerMs;',
    replace: '  const fullRefillMs = 0;',
    breaks: 'staleness is measured against the time a bucket needs to refill completely',
  },
];
