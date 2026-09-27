/**
 * The line a run prints about the budget it is about to spend.
 *
 * A pure function so it can be tested at all: printing it inline in `role.ts` needed a paid run to
 * observe, which is why a real defect lived here unremarked. On 2026-09-25 the first live run of
 * `unit-coder` was stopped at 180 seconds while the role declares 600, because `AGENT_TIMEOUT_MS`
 * was set in the ambient environment — and the banner still read as if the role’s own budget were in
 * use. An operator's variable wins by design; saying so is the reader's business.
 *
 * The same lesson as `session-briefing.ts`: prompt- or output-shaped logic with branches belongs in
 * a module with tests, not inline in a CLI where no test can reach it.
 */

export interface BudgetLine {
  /** The role’s name, as invoked. */
  role: string;
  modelId: string;
  tier: string;
  /** What the role declares, before any scaling or override. */
  declaredTurns: number;
  declaredSeconds: number;
  /** What the run will actually enforce. */
  maxTurns: number;
  maxUsd: number;
  timeoutSeconds: number;
  /** Spend is measured against a reference rather than capped. */
  measuringSpendOnly: boolean;
  /** Which limits an environment variable replaced. Each is said out loud. */
  overrodeTurns: boolean;
  overrodeUsd: boolean;
  overrodeTimeout: boolean;
}

export function describeBudget(line: BudgetLine): string {
  const spend = line.measuringSpendOnly
    ? `spend MEASURED not capped (reference $${line.maxUsd.toFixed(2)})`
    : `$${line.maxUsd.toFixed(2)}`;

  const notes = [
    line.overrodeTurns
      ? `AGENT_MAX_TURNS overrides the role’s ${line.declaredTurns}`
      : `role asks ${line.declaredTurns} × ${line.tier}`,
    line.overrodeUsd ? 'AGENT_MAX_USD overrides the tier scale' : null,
    line.overrodeTimeout ? `AGENT_TIMEOUT_MS overrides the role’s ${line.declaredSeconds}s` : null,
  ].filter((note): note is string => note !== null);

  return (
    `Running ${line.role} on ${line.modelId} (${line.tier}) — ` +
    `max ${line.maxTurns} turns, ${spend}, ${line.timeoutSeconds}s (${notes.join(' · ')})`
  );
}

/**
 * What the run cost, as the run reports it afterwards.
 *
 * The defect this closes: a run stopped by its wall clock printed `0 turns, $0.0000`, because the
 * spend is recorded from the SDK's result message and an abort means no result message ever
 * arrived. The session was not free — it was **unmeasured**, and a report that says a five-minute
 * session cost nothing is believed.
 *
 * The signal is zero turns *together with* a stop. Every completed run reports at least one turn,
 * so a stopped run reporting none is one whose numbers were never collected. Stated as an
 * assumption because it is one: if the SDK ever reports a result with zero turns, this would call a
 * cheap run unmeasured rather than wrong.
 */
export interface SpendLine {
  turns: number;
  costUsd: number;
  elapsedMs: number;
  stoppedBy: string | null;
}

export function describeSpend(line: SpendLine): string {
  const seconds = Math.round(line.elapsedMs / 1000);
  const unmeasured = line.turns === 0 && line.stoppedBy !== null;

  // The "spend was measured, not capped" case is reported separately by the runner, because it is a
  // paragraph rather than a number: this line says what was spent, and refuses to invent a figure.
  const spend = unmeasured
    ? 'cost unmeasured (stopped before any result message arrived)'
    : `$${line.costUsd.toFixed(4)}`;

  return (
    `${line.turns} turns, ${spend}, ${seconds}s` +
    (line.stoppedBy === null ? '' : ` — STOPPED: ${line.stoppedBy}`)
  );
}
