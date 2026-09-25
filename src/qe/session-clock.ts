import type { HookCallbackMatcher, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';

/**
 * The clock a session cannot invent.
 *
 * Two measured runs against the same target stopped at 13 minutes of a 45-minute
 * timebox, with 135 turns and 88 actions unspent, and the runner printed no `STOPPED`
 * either time — nothing cut them off. The ledgers say why. Each called `date` exactly
 * once, at tool call #1, and estimated every timestamp after it. One wrote
 * "14:36 Timebox nearly spent. Stopping exploration" at a real elapsed of 779s, and
 * closed its notes claiming "~37 minutes of the 45".
 *
 * A session with no clock does not run over. It runs *short*, because an estimate of
 * elapsed time drifts in the direction that ends the work. Nothing in a prompt fixes
 * this: the model has no way to know, so telling it to be careful about time asks it
 * to be careful about a number it is making up.
 *
 * So the harness reports the time instead. `PostToolBatch` fires exactly once after
 * every batch of tool calls resolves and before the next model request, which makes it
 * the one place a reading can be attached to every turn without being paid for on each
 * parallel call inside it.
 *
 * **It is a floor, not a warning.** The failure being corrected is stopping early, so
 * the line leads with what remains and says plainly that remaining budget is to be
 * spent. Nothing here ends a session — `BudgetGuard` already does that, and this hook
 * deliberately holds no power to stop anything.
 */

export interface ClockReading {
  elapsedMs: number;
  /** The wall-clock budget the run was given. */
  timeboxMs: number;
  turns: number;
  maxTurns: number;
  costUsd: number;
  /** State-changing actions used and permitted, when a browser is in play. */
  actions?: number;
  maxActions?: number;
}

function minutes(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins === 0 ? `${secs}s` : `${mins}m${String(secs).padStart(2, '0')}s`;
}

/**
 * What reaches the model. One line, because it arrives on every turn.
 *
 * The spend is stated without a limit beside it on purpose. Runs are measured, not
 * capped, and printing a reference next to a number invites the session to treat the
 * reference as a boundary — which is the same mistake as the invented clock, paid for
 * in dollars instead of minutes.
 */
export function clockLine(reading: ClockReading): string {
  const left = reading.timeboxMs - reading.elapsedMs;
  const parts = [
    `SESSION CLOCK (measured, not estimated): ${minutes(reading.elapsedMs)} elapsed,` +
      ` ${minutes(left)} of the timebox REMAINING.`,
    `Turns ${reading.turns}/${reading.maxTurns}.`,
  ];
  if (reading.actions !== undefined && reading.maxActions !== undefined) {
    parts.push(`State-changing actions ${reading.actions}/${reading.maxActions}.`);
  }
  parts.push(`Spent $${reading.costUsd.toFixed(2)} — measured, not capped.`);

  const spentFraction = reading.elapsedMs / Math.max(1, reading.timeboxMs);
  if (left <= 0) {
    parts.push('The timebox is spent. Stop exploring and write the report now.');
  } else if (spentFraction < 0.8) {
    parts.push(
      'This is a floor to spend, not a ceiling to avoid. Do NOT close the session,' +
        ' write the debrief, or declare the timebox nearly over while this much' +
        ' remains — keep exploring, and go deeper where you already found something.',
    );
  } else {
    parts.push('Begin closing: finish the current thread, then write the report.');
  }
  return parts.join(' ');
}

/**
 * The hook itself.
 *
 * `read` is a callback rather than a value because the reading has to be taken when
 * the batch resolves. Passing a snapshot would hand every turn the same numbers from
 * the moment the run was configured, which is the bug this module exists to remove.
 *
 * Fail-soft, like the observer beside it: a clock that throws must not surface to the
 * model as a tool failure, because a session cannot tell our bookkeeping from the
 * product misbehaving and has filed the difference as a defect before.
 */
export function clockHook(read: () => ClockReading): HookCallbackMatcher {
  return {
    hooks: [
      async (input): Promise<HookJSONOutput> => {
        if (input.hook_event_name !== 'PostToolBatch') return { continue: true };
        try {
          return {
            continue: true,
            hookSpecificOutput: {
              hookEventName: 'PostToolBatch',
              additionalContext: clockLine(read()),
            },
          };
        } catch {
          return { continue: true };
        }
      },
    ],
  };
}
