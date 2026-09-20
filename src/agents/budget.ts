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
    if (update.costUsd !== undefined) this.costUsd = update.costUsd;
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
