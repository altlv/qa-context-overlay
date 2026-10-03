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
}

export const DEFAULT_LIMITS: BudgetLimits = {
  maxTurns: 12,
  maxUsd: 1,
  timeoutMs: 180_000,
  enforceSpend: true,
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  readonly controller = new AbortController();

  constructor(readonly limits: BudgetLimits = DEFAULT_LIMITS) {}

  static fromEnv(overrides: Partial<BudgetLimits> = {}): Budget {
    return new Budget({
      maxTurns: overrides.maxTurns ?? envNumber('AGENT_MAX_TURNS', DEFAULT_LIMITS.maxTurns),
      maxUsd: overrides.maxUsd ?? envNumber('AGENT_MAX_USD', DEFAULT_LIMITS.maxUsd),
      timeoutMs: overrides.timeoutMs ?? envNumber('AGENT_TIMEOUT_MS', DEFAULT_LIMITS.timeoutMs),
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

  record(update: { turns?: number; costUsd?: number }): void {
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
   * `exceeded()` is consulted **after** a turn completes, so the limit is a trailing stop and not
   * a ceiling. Measured on 2026-09-20: opus spent **$5.3834 against `AGENT_MAX_USD=4`** — 35%
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
    if (this.limits.enforceSpend !== false && this.costUsd >= this.limits.maxUsd) {
      return `spend limit reached ($${this.costUsd.toFixed(2)}/$${this.limits.maxUsd.toFixed(2)})`;
    }
    return null;
  }

  /** Stops the underlying query and returns the reason. */
  abort(reason: string): string {
    this.controller.abort();
    return reason;
  }

  spent(): { turns: number; costUsd: number; elapsedMs: number } {
    return { turns: this.turns, costUsd: this.costUsd, elapsedMs: Date.now() - this.startedAt };
  }
}
