import type { BrowserAccess } from '../agents/roles.js';
import { PLAYWRIGHT_MCP_CLI } from '../tool-paths.js';
import type { ExplorationPolicy } from './exploration-policy.js';

/**
 * Compiles an `ExplorationPolicy` into the browser tools an agent may hold.
 *
 * `exploration-policy.ts` says the policy is "enforced, not advertised — an agent
 * that reads a checklist and promises to behave has made a claim; a bound it cannot
 * exceed is evidence". Until this file existed the policy was a data structure with
 * no way to bind anything. Handing a role the Playwright MCP server grants it eighty
 * tools including `browser_click` and `browser_fill_form`, and a prompt asking it not
 * to submit forms on production is exactly the claim that file rejects.
 *
 * The output goes into the SDK's `allowedTools`, which is checked by the runtime
 * rather than by the model. A tool the agent does not hold is not a tool it can
 * decline to use.
 *
 * **Allowlist, never denylist.** Playwright MCP ships eighty tools today and adds
 * more each release. A denylist grants every future tool by default, which means a
 * new destructive one arrives already permitted. Anything unclassified is refused,
 * and `tests/unit/browser-tools.test.ts` fails when the package ships a tool this
 * file has not sorted — so a new release is a decision rather than a surprise.
 */

/** The MCP server name the tools are registered under. */
export const BROWSER_MCP_SERVER = 'playwright';

/** Fully-qualified name as the SDK's allowedTools expects it. */
export function qualify(tool: string): string {
  return `mcp__${BROWSER_MCP_SERVER}__${tool}`;
}

/**
 * Observation. Permitted in every environment, production included, because none of
 * it changes server state and without it there is nothing to explore.
 *
 * Hover and wheel are here deliberately: revealing a menu and scrolling are how a
 * page is looked at, and `visual-inspection` cannot run its position sweep without
 * them. Both can trigger a GET, which is the same exposure as loading the page.
 */
export const OBSERVE = [
  'browser_snapshot',
  'browser_take_screenshot',
  'browser_find',
  'browser_generate_locator',
  'browser_console_messages',
  'browser_network_requests',
  'browser_navigate',
  'browser_navigate_back',
  'browser_navigate_forward',
  'browser_reload',
  'browser_resize',
  'browser_wait_for',
  'browser_tabs',
  'browser_hover',
  'browser_mouse_move_xy',
  'browser_mouse_wheel',
  'browser_highlight',
  'browser_hide_highlight',
  'browser_verify_element_visible',
  'browser_verify_list_visible',
  'browser_verify_text_visible',
  'browser_verify_value',
  'browser_get_config',
];

/** `allowWrites` — anything that can change what the server holds. */
export const INTERACT = [
  'browser_click',
  'browser_mouse_click_xy',
  'browser_mouse_down',
  'browser_mouse_up',
  'browser_check',
  'browser_uncheck',
  'browser_select_option',
  'browser_drag',
  'browser_drop',
  'browser_mouse_drag_xy',
  // Enter on a focused control submits. Tabbing to check focus order therefore
  // costs allowWrites, which is the honest price rather than a special case.
  'browser_press_key',
  'browser_keydown',
  'browser_keyup',
  // A dialog only appears after something was already done; accepting one can
  // confirm it.
  'browser_handle_dialog',
  // Rewriting responses is fault injection — powerful, and a change to what the
  // page does.
  'browser_route',
  'browser_unroute',
  'browser_route_list',
  'browser_network_state_set',
];

/** `allowFormSubmit` — the highest-risk ordinary action on a real system. */
export const FILL = [
  'browser_type',
  'browser_press_sequentially',
  'browser_fill_form',
  'browser_file_upload',
  // Issues an arbitrary request, so it can POST without a form at all.
  'browser_network_request',
];

/**
 * `allowAuthentication` — replaying a session captured by a person.
 *
 * This is the route in that keeps an agent away from a password: see queue item 7.
 * Note the asymmetry with `browser_storage_state`, which *reads* auth state back out
 * and is never granted.
 */
export const AUTHENTICATE = ['browser_set_storage_state'];

/** `allowDestructive` — throwing away state the application or a person put there. */
export const RESET = [
  'browser_cookie_set',
  'browser_cookie_delete',
  'browser_cookie_clear',
  'browser_localstorage_set',
  'browser_localstorage_delete',
  'browser_localstorage_clear',
  'browser_sessionstorage_set',
  'browser_sessionstorage_delete',
  'browser_sessionstorage_clear',
  'browser_console_clear',
  'browser_network_clear',
];

/**
 * Refused in every environment, whatever the policy says, each for a stated reason.
 *
 * The first group is the important one: **an allowlist is only a bound if nothing
 * inside it can execute arbitrary code.** A single `browser_evaluate` reaches every
 * capability the other tiers gate — `document.forms[0].submit()` needs no
 * `browser_fill_form` — so granting it would turn this whole file into decoration.
 */
export const NEVER: Record<string, string> = {
  browser_evaluate:
    'arbitrary JavaScript reaches every capability the tiers gate, so granting it voids the allowlist',
  browser_run_code_unsafe: 'arbitrary code, and it says so in its own name',
  browser_cookie_get:
    'reads browser auth state — guardrail: check a credential exists, never read it',
  browser_cookie_list: 'reads browser auth state',
  browser_localstorage_get: 'reads browser auth state; tokens live here',
  browser_localstorage_list: 'reads browser auth state',
  browser_sessionstorage_get: 'reads browser auth state',
  browser_sessionstorage_list: 'reads browser auth state',
  browser_storage_state: 'dumps the whole authenticated session, credentials included',
};

/**
 * Shipped but not sorted into a tier, so not granted. Listed rather than ignored:
 * the test that catches new tools would otherwise fail on every one of these, and a
 * failing test people expect to fail teaches nothing.
 */
export const UNCLASSIFIED: Record<string, string> = {
  browser_close: 'ends the session; no reason for an agent to hold it',
  // Missed on the first pass and caught by the test below rather than by reading the
  // package, which is exactly the job that test exists to do.
  browser_resume: 'resumes a paused session, and nothing in this harness pauses one',
  browser_pdf_save: 'nothing here reads a PDF; grant it when a report wants one',
  browser_annotate: 'recording and reporting aids, wanted only once sessions are replayed',
  browser_start_recording: 'see browser_annotate',
  browser_stop_recording: 'see browser_annotate',
  browser_start_tracing: 'worth granting when traces are collected from agent runs',
  browser_stop_tracing: 'see browser_start_tracing',
  browser_start_video: 'see browser_annotate',
  browser_stop_video: 'see browser_annotate',
  browser_video_chapter: 'see browser_annotate',
  browser_video_hide_actions: 'see browser_annotate',
  browser_video_show_actions: 'see browser_annotate',
};

/**
 * The browser tools a role may hold here: the **intersection** of what the role needs
 * and what the environment permits.
 *
 * Observation is unconditional. Everything else is added only by the flag that names
 * it, so a policy with every flag false still leaves an agent able to look — which
 * is the point: reading production is fine, changing it is not.
 *
 * `access` is the role's own ceiling and the environment cannot lift it. An auditing
 * role stays observation-only on a disposable local fixture, because the reason it
 * should not submit a form is its job, not the blast radius.
 */
export function browserToolsFor(
  policy: ExplorationPolicy,
  access: BrowserAccess = 'full',
): string[] {
  const granted = [...OBSERVE];
  if (access === 'full') {
    if (policy.allowWrites) granted.push(...INTERACT);
    if (policy.allowFormSubmit) granted.push(...FILL);
    if (policy.allowAuthentication) granted.push(...AUTHENTICATE);
    if (policy.allowDestructive) granted.push(...RESET);
  }
  return granted.map(qualify);
}

/**
 * How much accessibility tree rides along with every tool response.
 *
 * `full` is Playwright MCP's default and attaches a complete snapshot to the result
 * of **every** call — `browser_navigate` pays for the whole tree before the agent has
 * asked for anything. `none` stops that; the explicit `browser_snapshot` tool still
 * works, so the tree becomes something a session buys when it needs one.
 *
 * Measured on 2026-09-13, same role, same four turns, one page each:
 *
 * | page          | mode                    | cost    |
 * | ------------- | ----------------------- | ------- |
 * | academybugs   | snapshot (a11y tree)    | $0.2345 |
 * | academybugs   | screenshot (image)      | $0.0738 |
 * | example.com   | snapshot (a11y tree)    | $0.0675 |
 *
 * The tree scales with page complexity and the image does not, so on a real page the
 * image is the cheap option — the reverse of the usual intuition, and the reverse of
 * what this file would have assumed if nobody had measured it. About $0.067 of each
 * figure is the fixed cost of the role prompt and skills.
 *
 * **What `none` did NOT save.** The same screenshot run with `--snapshot-mode none`
 * cost $0.0742 against $0.0738 with it left at `full` — no difference. The expensive
 * thing was the *explicit* `browser_snapshot` call, not the automatic attachment,
 * because a screenshot response carries no tree to begin with. This option was added
 * on the theory that auto-attachment was the cost driver; the measurement did not
 * support it, and the theory is recorded here so nobody re-derives it.
 *
 * It is kept because a session that **acts** is a different shape: every click and
 * navigate response would carry a tree, and none of those has been measured — the
 * only environment tested so far is read-only. Treat `none` as unproven for
 * interactive sessions rather than as a known saving.
 */
export type SnapshotMode = 'full' | 'none';

/**
 * Playwright MCP's own configuration, derived from the same policy.
 *
 * The tool allowlist bounds what the agent may ask for; `allowedOrigins` bounds where
 * the browser may go regardless of which tool asks. Two layers, because
 * `stayOnOrigin` had no teeth at all before this and a `browser_navigate` the policy
 * permits can still point anywhere.
 */
export function browserMcpConfig(
  policy: ExplorationPolicy,
  origins: string | readonly string[],
  outputDir = 'artifacts/browser',
  snapshots: SnapshotMode = 'full',
  cdpEndpoint?: string,
): { command: string; args: string[] } {
  return {
    command: process.execPath,
    args: [
      mcpCliPath(),
      // Two shapes, and which one is in force decides whether the harness can see the
      // page at all.
      //
      // Without an endpoint, MCP launches and owns a browser nothing else can reach,
      // so the only account of what happened is the model's own text.
      //
      // With one, MCP attaches to a browser this run launched, and the harness keeps
      // its own Playwright connection to it — which is how `state-model.ts` gets real
      // fingerprints off the live DOM instead of parsing a snapshot. Proven on
      // 2026-09-19: MCP's `browser_navigate` produced a page the observer connection
      // then read.
      //
      // The fresh-profile guarantee moves with the launch rather than disappearing:
      // `chromium.launch()` uses a throwaway profile per run, which is what
      // `--isolated` was buying. One session's cookies are still never the next
      // session's starting state.
      ...(cdpEndpoint === undefined
        ? ['--isolated', '--headless']
        : ['--cdp-endpoint', cdpEndpoint]),
      '--output-dir',
      outputDir,
      '--snapshot-mode',
      snapshots,
      // Semicolon-separated, per the CLI's own `--allowed-origins` documentation. More
      // than one only when the app's config lists extra hosts.
      ...(policy.stayOnOrigin ? ['--allowed-origins', [origins].flat().join(';')] : []),
    ],
  };
}

/**
 * Resolved by walking up from this module, never from the working directory — the same
 * reason `src/env.ts` is anchored, and the lookup that also works from a run worktree.
 */
function mcpCliPath(): string {
  return PLAYWRIGHT_MCP_CLI;
}
