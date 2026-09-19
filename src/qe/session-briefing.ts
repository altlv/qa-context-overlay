import type { BrowserAccess } from '../agents/roles.js';
import type { ExplorationPolicy } from './exploration-policy.js';

/**
 * What a browser-driving agent is told before it starts.
 *
 * Lived inline in `src/cli/role.ts`, where nothing could test it — and it turned out
 * to carry decisions worth several times the cost of a session. Two of them were
 * wrong, and both were found by running a real agent rather than by reading the code:
 *
 *  - The first version configured the browser and never named the target, so the
 *    agent replied "I don't have a target URL" and stopped.
 *  - The version with a pre-computed scan said "do not re-derive this from the page"
 *    three sentences after "Begin with browser_navigate". The agent obeyed the second
 *    and rebuilt the map by hand: 4 turns and $0.2613, against 1 turn and $0.1871
 *    once the contradiction was removed.
 *
 * A prompt is behaviour. This one is now a pure function with tests, because the
 * difference between its branches is measured in turns and dollars.
 */

export interface BriefingInput {
  target: string;
  policy: ExplorationPolicy;
  access: BrowserAccess;
  /** A pre-computed scan, or empty when the session must look for itself. */
  map: string;
  /**
   * The candidate actions the policy permits here, or empty when none were computed.
   *
   * Separate from `map` because they answer different questions and a session can
   * have one without the other: the map says what is on the page, the plan says what
   * may be done to it. Joining them into one string would have made "was a plan
   * offered?" untestable, which is the measurement item 30 exists to take.
   */
  actions?: string;
}

/** The opening move, which differs entirely depending on whether a map was supplied. */
function opening(hasMap: boolean): string {
  if (!hasMap) {
    return (
      'You have a real browser through the Playwright MCP server. Begin with' +
      ' browser_navigate to the target, then browser_take_screenshot to see it —' +
      ' prefer a screenshot over browser_snapshot, which costs several times more on a' +
      ' real page. Ask for a snapshot when you need element refs in order to act.'
    );
  }
  return (
    'You have a real browser through the Playwright MCP server, and a scan of the' +
    ' target below. Do not open the page to learn what is on it — that is already' +
    ' answered, exactly, for free. Go to the browser only for what the scan cannot' +
    ' say: whether it LOOKS wrong (browser_take_screenshot) or BEHAVES wrong. A' +
    ' session that only confirms the scan has spent its budget agreeing with a free' +
    ' tool.'
  );
}

function reach(policy: ExplorationPolicy, access: BrowserAccess): string {
  if (access === 'observe') {
    return (
      'Yours is an auditing role, so you hold observation tools only, on every' +
      ' environment — clicking and typing are absent by design rather than by policy,' +
      ' and a disposable fixture is no argument for widening that. Report what it put' +
      ' out of reach.'
    );
  }
  if (!policy.allowWrites) {
    return (
      `The ${policy.environment} policy grants observation only — no clicking, typing` +
      ' or form submission. Those tools are not discouraged, they are absent. Report' +
      ' what you could not reach rather than working around it.'
    );
  }
  return 'You may interact with the page.';
}

export function sessionBriefing(input: BriefingInput): string {
  const { target, policy, access, map } = input;
  const actions = input.actions ?? '';

  const lines = [
    `Target: ${target} (environment: ${policy.environment}).`,
    opening(map !== ''),
    reach(policy, access),
    policy.stayOnOrigin ? 'The browser is confined to that origin; requests elsewhere fail.' : '',
    // Deliberately never phrased as "you have N actions". A stated allowance reads as
    // a target and gets spent; this is a backstop for a session that has lost its
    // way, and saying so is the difference between a limit and a quota.
    'Stop when you have answered the question you were given. Spending fewer actions is' +
      ' a better session, not a lesser one.' +
      ` A hard backstop of ${policy.maxActions} actions exists, and reaching it means the` +
      ' session was unfocused.',
    'Controls whose label reads as committing to something — pay, checkout, subscribe,' +
      ' invite — are refused wherever you are, and destructive labels are refused' +
      ' outside a local fixture. A refusal is a finding: report the control as' +
      ' unexplored rather than looking for another route to it.',
    // Named only when one exists. A briefing that mentions a list the session was not
    // given is the same contradiction that cost 3 turns and $0.07 the first time:
    // the agent goes looking for it.
    actions === ''
      ? ''
      : 'Candidate actions generated from the scan follow the map. They are values and' +
        ' targets, already filtered to what this policy permits — not a checklist and not' +
        ' a ranking. Pick the ones the risk here justifies, and say which you left.',
  ].filter(Boolean);

  return [lines.join(' '), map, actions].filter((section) => section !== '').join('\n\n');
}
