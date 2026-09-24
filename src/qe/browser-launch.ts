import { chromium } from '@playwright/test';
import type { Browser, LaunchOptions } from '@playwright/test';

/**
 * Launching a browser that the machine will actually let us run.
 *
 * Playwright downloads its own Chromium, which is unsigned and has no reputation, and
 * Windows Smart App Control refuses to execute exactly that. A run that worked on one
 * day stopped four days later with `spawn UNKNOWN`, and the real message only appeared
 * when the binary was executed by hand: "An Application Control policy has blocked this
 * file". Nothing about the harness had changed; the machine's policy had.
 *
 * **The policy is not the thing to work around.** A system-installed Chrome or Edge is
 * signed and reputable, so it runs under the same policy, and Playwright drives it
 * through `channel`. That is the supported route and it costs nothing — the pages
 * behave the same, and on a locked-down machine it is the only route.
 *
 * The fallback announces itself. A harness that silently swapped the browser under a
 * session would make every result quietly incomparable with the last one, and "which
 * browser did this run use" is not a question anybody should have to reconstruct.
 */

/** Set `HARNESS_BROWSER=chrome|msedge|bundled` to decide rather than discover. */
export type BrowserChoice = 'bundled' | 'chrome' | 'msedge';

/**
 * What to try, in order.
 *
 * An explicit choice is honoured alone and never silently widened: an operator who
 * named a browser wants that browser, and a fallback would hide its absence.
 */
export function launchPlan(requested: string | undefined): BrowserChoice[] {
  const value = requested?.trim().toLowerCase() ?? '';
  if (value === 'chrome' || value === 'msedge' || value === 'bundled') return [value];
  return ['bundled', 'chrome', 'msedge'];
}

/** True when the failure looks like the machine refusing to run the binary. */
export function blockedByPolicy(message: string): boolean {
  return /spawn UNKNOWN|Application Control|EPERM|access is denied|not a valid win32/i.test(
    message,
  );
}

export interface Launched {
  browser: Browser;
  /** What actually ran, for the run log and the report's platform line. */
  using: BrowserChoice;
  /** Set when the first choice failed and something else was used. */
  note: string | null;
}

/**
 * Launches the first browser this machine permits, and says which one it was.
 *
 * Only a policy-shaped failure is worth falling back from. Anything else — a bad
 * argument, a port already taken — is a real error and must surface as itself rather
 * than be retried against a different browser and reported as that browser's problem.
 */
export async function launchChromium(
  options: LaunchOptions = {},
  requested: string | undefined = process.env.HARNESS_BROWSER,
): Promise<Launched> {
  const plan = launchPlan(requested);
  const refusals: string[] = [];

  for (const choice of plan) {
    try {
      const browser = await chromium.launch(
        choice === 'bundled' ? options : { ...options, channel: choice },
      );
      return {
        browser,
        using: choice,
        note:
          refusals.length === 0
            ? null
            : `the bundled browser would not start here (${refusals[0]}), so this run used ${choice}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!blockedByPolicy(message)) throw error;
      refusals.push(message.split('\n')[0] ?? message);
    }
  }

  throw new Error(
    `No browser could be launched. Tried ${plan.join(', ')}. ` +
      `Last refusal: ${refusals.at(-1) ?? 'none recorded'}. ` +
      'On Windows this is usually Smart App Control refusing an unsigned browser — ' +
      'install Chrome or Edge, or set HARNESS_BROWSER=chrome.',
  );
}
