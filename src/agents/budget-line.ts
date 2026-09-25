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
