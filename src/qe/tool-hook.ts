import type {
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';
import type { GuardDecision } from './browser-guard.js';

/**
 * Every guard reaches the agent through one `PreToolUse` hook.
 *
 * The browser guard used to be passed as `canUseTool`, a permission handler. Runs use
 * `permissionMode: 'bypassPermissions'`, which the SDK documents as "Bypass all
 * permission checks" — so the handler may never have been consulted, and the guard
 * listed as proven may never have refused a call in a live run. Hooks run as their own
 * step before a tool executes, whatever the permission mode, and can deny. One hook,
 * one path: two guards for one rule would leave neither shown to be doing the work.
 *
 * Fail-closed. A check that throws denies, because an exception here is a guard that
 * did not decide, and "did not decide" must not read as "allowed".
 */

export type ToolCheck = (toolName: string, input: Record<string, unknown>) => GuardDecision;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function decideToolUse(
  check: ToolCheck,
  input: HookInput,
): { decision: GuardDecision; toolName: string | null } {
  if (input.hook_event_name !== 'PreToolUse') {
    return { decision: { allowed: true, reason: 'not a tool call' }, toolName: null };
  }
  try {
    return {
      decision: check(input.tool_name, asRecord(input.tool_input)),
      toolName: input.tool_name,
    };
  } catch (error) {
    return {
      decision: {
        allowed: false,
        reason: `the guard failed to decide (${error instanceof Error ? error.message : String(error)}), so the call is refused`,
      },
      toolName: input.tool_name,
    };
  }
}

/**
 * The other half of the pair: a `PostToolUse` hook that looks at the page afterwards.
 *
 * `PreToolUse` decides and `PostToolUse` observes, and the split is not incidental —
 * only the second one can exist after the page has changed, which is the only moment
 * a state model can be told anything true. Keeping them apart also keeps the guard
 * unable to advance the model, so what refuses and what records stay separately
 * testable.
 *
 * **This hook never denies.** It has nothing to deny — the tool has already run. It
 * returns `continue: true` whatever happens, including when the look fails, because
 * the alternative is ending a session over a page that was mid-navigation. The cost
 * of a missed look is an undercount, and `observer.ts` reports that as a floor rather
 * than swallowing it.
 */
export function observerHook(
  observe: (toolName: string) => Promise<void>,
  interestedIn: (toolName: string) => boolean,
): HookCallbackMatcher {
  return {
    hooks: [
      async (input): Promise<HookJSONOutput> => {
        if (input.hook_event_name !== 'PostToolUse') return { continue: true };
        if (!interestedIn(input.tool_name)) return { continue: true };
        try {
          await observe(input.tool_name);
        } catch {
          // Already fail-soft inside the observer; this is the belt to that braces.
          // An exception escaping here would surface as a tool failure to the model,
          // which would make the harness's bookkeeping look like the app misbehaving.
        }
        return { continue: true };
      },
    ],
  };
}

export function guardHook(
  check: ToolCheck,
  onDeny: (toolName: string, reason: string) => void = () => undefined,
): HookCallbackMatcher {
  return {
    hooks: [
      async (input): Promise<HookJSONOutput> => {
        const { decision, toolName } = decideToolUse(check, input);
        if (decision.allowed || toolName === null) return { continue: true };
        onDeny(toolName, decision.reason);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: decision.reason,
          },
        };
      },
    ],
  };
}
