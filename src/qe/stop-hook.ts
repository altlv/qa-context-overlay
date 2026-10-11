import type {
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * The last thing that can stop a session finishing without a readable report.
 *
 * **The failure this exists for.** Reporting is the most common way a run of this harness produces
 * nothing. Measured across the reports kept to 2026-10-11: **29 total — 19 parse, 3 are prose, 7
 * are empty files.** The worst of them cost a session's whole output: a run against
 * `webtestingcourse` reported seven findings including three majors, wrote them to a file that
 * lacked frontmatter, and only the closing summary survived. Everything built before this was
 * *advice* — the role prompt asks for a report, `report-skeleton` hands over the shape, and neither
 * can stop a session signing off without one.
 *
 * `Stop` can. The SDK's hook output carries `decision: 'block'` with a `reason`, and the reason
 * reaches the model, so a session about to finish with no readable report is told exactly what is
 * wrong and gets its turn back to fix it.
 *
 * **It blocks once and never twice.** `stop_hook_active` is true when a stop has already been
 * blocked, and ignoring it is how a hook like this becomes an infinite loop that burns a budget on
 * the same refusal. A session that is told once and still cannot produce a report has a real
 * problem, and the gate is the right place for it to land — not a loop.
 *
 * **It never blocks a run the budget stopped.** A truncated run did not choose to finish, so
 * refusing to let it end would be the harness arguing with its own ceiling; `budgetStopped` is
 * passed in for exactly that case. Item 48 is the precedent: a run cut short is a budget finding
 * and must not be reported as a formatting one.
 */
export function stopHook(
  /** The reason a report cannot be read, or null when one can. Evaluated at stop time, not before. */
  reportProblem: () => string | null,
  /**
   * Where the report belongs, named in the refusal.
   *
   * **Measured on 2026-10-11, and this parameter is the fix.** The first version of this reason
   * named the command and said "write one before you finish", with no path. Driven against a live
   * agent it blocked correctly, and the session then spent **12 turns to the turn limit** writing
   * nothing, at twice the cost of a probe whose refusal named an exact file. A refusal that cannot
   * be acted on is not a guard, it is a budget leak: the agent retried because it had no target,
   * not because it declined. Found by testing the shipped hook rather than an imitation of it —
   * the first probe used a hand-written hook and passed, which is the neighbouring claim again.
   */
  reportPath: string,
  /** True when the run was already ended by a budget limit, in which case nothing is blocked. */
  budgetStopped: () => boolean,
  /** For the operator's log, so a block is visible in the run output and not only in the session. */
  onBlock: (reason: string) => void = () => undefined,
): HookCallbackMatcher {
  return {
    hooks: [
      async (input: HookInput): Promise<HookJSONOutput> => {
        if (input.hook_event_name !== 'Stop') return { continue: true };
        // Already blocked once. Saying it again would only spend the budget that writing the
        // report needs.
        if (input.stop_hook_active) return { continue: true };
        if (budgetStopped()) return { continue: true };

        let problem: string | null;
        try {
          problem = reportProblem();
        } catch {
          // A check that could not decide must not block a session from ending: the gate still
          // runs, and holding a finished session hostage to our own bookkeeping is worse than
          // letting it close.
          return { continue: true };
        }
        if (problem === null) return { continue: true };

        const reason =
          `This session has no report that can be read: ${problem}. Write one to ` +
          `\`${reportPath}\` before you finish — that exact path. ` +
          `\`npm run -s report-skeleton -- --target "<url> (<env>)" --author <role>\` prints a ` +
          `valid empty report that passes \`npm run check-report\` with zero errors; redirect it ` +
          `to that path and fill in what you found. Findings live inside the frontmatter, so it ` +
          `is one file rewritten rather than appended to. Everything you have already confirmed ` +
          `is worth more written down than remembered: a session whose report cannot be parsed ` +
          `is counted as a session that found nothing.`;
        onBlock(problem);
        return { continue: true, decision: 'block', reason };
      },
    ],
  };
}
