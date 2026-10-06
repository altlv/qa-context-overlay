export interface BudgetLimits {
  maxTurns: number;
  maxUsd: number;
  timeoutMs: number;
  /**
   * Whether `maxUsd` stops the run, or is only something to measure against.
   *
   * Set false and the run continues past the figure, still recording what it spent.
   * The reason to want that: a session cut off at a dollar amount cannot be judged,
   * because "it found little" and "it was stopped before it finished" look identical
   * in the output. Measuring first tells you what a session of this kind actually
   * costs — including a bad one — and a limit set from that number means something,
   * where one set from a guess only hides the evidence needed to replace it.
   *
   * Turns and wall clock stay enforced regardless: they are the backstop against a
   * loop, and an agent that cannot solve a problem does not stop on its own.
   */
  enforceSpend?: boolean;
  /**
   * The only spend-shaped limit that can actually stop a run.
   *
   * **`maxUsd` cannot, and this was proved rather than reasoned about.** Cost reaches this
   * class through `record()`, which `client.ts` calls only on a `result` message — and the SDK
   * emits exactly one of those, at the end. Instrumented on 2026-10-06: a run produced
   * `system`, `assistant` and `rate_limit_event` messages throughout and then one
   * `result num_turns=1 cost=0.13895`. So for the whole of a run `costUsd` is 0, `worstTurnUsd`
   * is 0, and `wouldExceed()` returns null by its own guard. The dollar limit is not a trailing
   * stop as the comment below used to say — it is a **post-mortem**, and it has never bounded
   * anything.
   *
   * Tokens can. `usage` rides on every `assistant` message — `input_tokens`,
   * `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens` — so a running
   * total exists while the run is still going, and a ceiling on it fires mid-flight.
   *
   * Deliberately an **unweighted** sum. Weighting the four kinds by price would need a price
   * table in this repository, and a price table is exactly the sort of number that rots in
   * place while being believed. The conversion from an operator’s dollar figure lives in
   * `models.ts` as one measured, dated rate instead.
   */
  maxTokens?: number;
}

export const DEFAULT_LIMITS: BudgetLimits = {
  maxTurns: 12,
  maxUsd: 1,
  timeoutMs: 180_000,
  enforceSpend: true,
  // No default ceiling here. A number invented in this file would bound every caller at once,
  // which is the mistake `.env.example` records against `AGENT_MAX_TURNS` and
  // `AGENT_TIMEOUT_MS`. `role.ts` derives one from the dollar limit the operator or the tier
  // already chose; a direct caller of `runAgent` passes one or goes unbounded knowingly.
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** The four kinds of token a message can be billed for. Two of them arrive as null. */
export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * What one message cost in tokens, across all four kinds.
 *
 * **Pulled out of the client loop because a poison test walked straight through it.** Zeroing
 * the cache-creation term left every unit test green: they exercise `Budget`, and the summation
 * lived inline in a `for await` over the SDK stream where no test could reach it. That term is
 * the one that matters — the measured run was 42,551 cache-creation tokens against 2 input and 2
 * output, so dropping it undercounts by three orders of magnitude and the ceiling never fires.
 * A limit that silently never fires is worse than no limit, because the banner says it is there.
 *
 * Nullable rather than absent for two of the four: a run with no cache writes reports
 * `cache_creation_input_tokens: null`, and arithmetic on that gives NaN — which no comparison
 * ever exceeds, so the ceiling would again never fire.
 */
export function tokensIn(usage: TokenUsage): number {
  const count = (value: number | null | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return (
    count(usage.input_tokens) +
    count(usage.output_tokens) +
    count(usage.cache_creation_input_tokens) +
    count(usage.cache_read_input_tokens)
  );
}

/**
 * The token ceiling, from an explicit override or the environment, or nothing at all.
 *
 * Returned as a spreadable fragment so "no ceiling" stays **absent** rather than becoming zero.
 * A `maxTokens` of 0 is a ceiling of nothing and would abort every run on its first message,
 * which is the shape of bug that reads as "the new limit works".
 */
function tokenCeiling(override: number | undefined): { maxTokens?: number } {
  const named = override ?? envNumber('AGENT_MAX_TOKENS', 0);
  return named > 0 ? { maxTokens: named } : {};
}

/**
 * Hard stop on agent runs.
 *
 * An agent that cannot find the answer will keep looking, and the failure mode
 * is a long expensive loop rather than an error. Every run is bounded by turns,
 * spend, and wall time; whichever trips first ends the run and the caller gets a
 * partial result that says so.
 */
export class Budget {
  private readonly startedAt = Date.now();
  private turns = 0;
  private costUsd = 0;
  private worstTurnUsd = 0;
  /** Every token the run has been billed for so far, across all four kinds. */
  private tokens = 0;
  readonly controller = new AbortController();

  constructor(readonly limits: BudgetLimits = DEFAULT_LIMITS) {}

  static fromEnv(overrides: Partial<BudgetLimits> = {}): Budget {
    return new Budget({
      maxTurns: overrides.maxTurns ?? envNumber('AGENT_MAX_TURNS', DEFAULT_LIMITS.maxTurns),
      maxUsd: overrides.maxUsd ?? envNumber('AGENT_MAX_USD', DEFAULT_LIMITS.maxUsd),
      timeoutMs: overrides.timeoutMs ?? envNumber('AGENT_TIMEOUT_MS', DEFAULT_LIMITS.timeoutMs),
      // Omitted rather than zeroed when neither source names one: `maxTokens: 0` would read as a
      // ceiling of nothing and stop every run on its first message.
      ...tokenCeiling(overrides.maxTokens),
      // `AGENT_SPEND=measure` runs past maxUsd and only records the cost. Anything
      // else, including unset, enforces — a typo must not silently uncap spending.
      enforceSpend:
        overrides.enforceSpend ?? process.env.AGENT_SPEND?.trim().toLowerCase() !== 'measure',
    });
  }

  /** True when spend is being recorded rather than enforced. */
  measuringSpendOnly(): boolean {
    return this.limits.enforceSpend === false;
  }

  record(update: { turns?: number; costUsd?: number; tokens?: number }): void {
    // Added, not replaced: `tokens` arrives throughout the run and `costUsd` only at the end,
    // so the two cannot be folded into one update.
    if (update.tokens !== undefined) this.tokens += update.tokens;
    if (update.turns !== undefined) this.turns = update.turns;
    if (update.costUsd !== undefined) {
      // The most expensive single turn seen so far, which is what makes the forecast below a
      // measurement rather than a guess. Taken from the jump in cumulative cost, because that
      // is the only per-turn figure the SDK gives: `total_cost_usd` is a running total.
      const step = update.costUsd - this.costUsd;
      if (step > this.worstTurnUsd) this.worstTurnUsd = step;
      this.costUsd = update.costUsd;
    }
  }

  /**
   * Whether one more turn could carry the run past its spend limit.
   *
   * **This forecast never fires, and the reason is in `BudgetLimits.maxTokens`.** It needs a
   * per-turn cost, cost arrives once at the end of the run, and `worstTurnUsd <= 0` returns null
   * until then. It is kept because it is correct for any caller that does feed `record()` cost
   * mid-run, and because deleting it would hide that the dollar limit is a post-mortem.
   *
   * `exceeded()` is consulted after a turn completes, so the dollar limit is a post-mortem and
   * not a ceiling. Measured on 2026-09-20: opus spent **$5.3834 against `AGENT_MAX_USD=4`** — 35%
   * over — because one expensive turn carried the run past the line and the check only noticed
   * afterwards. The overshoot scales with per-turn cost, so the pricier the tier the further it
   * runs, which is exactly where it is least affordable, and nothing in the output said the
   * number was approximate.
   *
   * So the forecast is the honest form of the same limit: stop when the worst turn observed so
   * far would not fit in what is left. It is deliberately pessimistic — a run is more likely to
   * stop a turn early than a turn late, and stopping early costs a partial session while stopping
   * late costs money nobody authorised.
   *
   * **It cannot bound the first turn.** With no turn yet observed there is nothing to forecast
   * from, so a single turn more expensive than the entire budget still overshoots, and no
   * after-the-fact check could prevent that either. Said here rather than left to be discovered.
   */
  wouldExceed(): string | null {
    if (this.limits.enforceSpend === false) return null;
    if (this.worstTurnUsd <= 0) return null;
    const left = this.limits.maxUsd - this.costUsd;
    if (this.worstTurnUsd <= left) return null;
    return (
      `spend limit would be passed by another turn ($${this.costUsd.toFixed(2)} spent of ` +
      `$${this.limits.maxUsd.toFixed(2)}, and the most expensive turn so far cost ` +
      `$${this.worstTurnUsd.toFixed(2)})`
    );
  }

  /** Reason the run must stop, or null to continue. */
  exceeded(): string | null {
    const elapsed = Date.now() - this.startedAt;
    if (elapsed >= this.limits.timeoutMs) {
      return `timeout after ${Math.round(elapsed / 1000)}s (limit ${this.limits.timeoutMs / 1000}s)`;
    }
    if (this.turns >= this.limits.maxTurns) {
      return `turn limit reached (${this.turns}/${this.limits.maxTurns})`;
    }
    /**
     * The token ceiling first, because it is the only one of the three that can stop a run
     * before the money is gone. Checked while `maxUsd` is still reading zero.
     */
    if (
      this.limits.enforceSpend !== false &&
      this.limits.maxTokens !== undefined &&
      this.tokens >= this.limits.maxTokens
    ) {
      return (
        `token limit reached (${this.tokens.toLocaleString()}/` +
        `${this.limits.maxTokens.toLocaleString()} tokens) — the spend bound that can act ` +
        `mid-run, see BudgetLimits.maxTokens`
      );
    }
    if (this.limits.enforceSpend !== false && this.costUsd >= this.limits.maxUsd) {
      return `spend limit reached (${this.costUsd.toFixed(2)}/${this.limits.maxUsd.toFixed(2)})`;
    }
    return null;
  }

  /** Stops the underlying query and returns the reason. */
  abort(reason: string): string {
    this.controller.abort();
    return reason;
  }

  spent(): { turns: number; costUsd: number; tokens: number; elapsedMs: number } {
    return {
      turns: this.turns,
      costUsd: this.costUsd,
      tokens: this.tokens,
      elapsedMs: Date.now() - this.startedAt,
    };
  }
}
