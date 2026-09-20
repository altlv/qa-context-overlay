import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { Budget } from './budget.js';
import { resolveModel } from './models.js';

export interface AgentRunResult {
  /** Final assistant text. Empty when the run was cut short before answering. */
  text: string;
  turns: number;
  costUsd: number;
  elapsedMs: number;
  /** Budget limit that ended the run, or null if it finished on its own. */
  stoppedBy: string | null;
}

export interface AgentRunOptions {
  prompt: string;
  systemPrompt: string;
  budget?: Budget;
  allowedTools?: string[];
  mcpServers?: Options['mcpServers'];
  /** Role definitions the run may delegate to. See src/agents/roles.ts. */
  agents?: Options['agents'];
  /**
   * Model id. Defaults to whatever HARNESS_MODEL resolves to. A delegated subagent
   * that names no model of its own inherits this one, which is what keeps a planner
   * on the same model as the coder that called it.
   */
  model?: string;
  /**
   * Hooks, and in particular the `PreToolUse` guard every run is given.
   *
   * This replaced `canUseTool`. That is a permission handler, and runs here use
   * `bypassPermissions`, which the SDK documents as "Bypass all permission checks" —
   * so the handler may never have been consulted. A hook runs before a tool executes
   * whatever the permission mode. See `src/qe/tool-hook.ts`.
   */
  hooks?: Options['hooks'];
  cwd?: string;
}

export class AgentAuthError extends Error {}

/**
 * The SDK resolves credentials itself — ANTHROPIC_API_KEY, an apiKeyHelper, a
 * managed key, or the OAuth session from a Claude Code login.
 *
 * So do not pre-check for an API key. An earlier version of this file gated every
 * run on `ANTHROPIC_API_KEY` being set, which refuses to run for anyone signed in
 * through Claude Code — the most common setup. Attempt the run and report whatever
 * the SDK actually says.
 */
/**
 * Exported for its test. The patterns are a list of messages actually seen, not a
 * guess at the shape of the SDK's errors, and it grows when a new one is observed.
 *
 * `not logged in` and `/login` were added after the first live run: the SDK reported
 * `Claude Code returned an error result: Not logged in · Please run /login`, which
 * matched none of the original patterns, so an ordinary "you are signed out" came
 * back as a minified stack trace out of `sdk.mjs` — and a person reading that has no
 * reason to suspect the cause is a login.
 */
export function isAuthFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /authenticat|oauth|api key|unauthorized|401|not logged in|\/login/i.test(message);
}

export const AUTH_HINT =
  'Agent auth failed. Either sign in with `claude login`, or set ANTHROPIC_API_KEY in .env.';

/**
 * The default model id for callers that do not choose one. Tier and budgets live in
 * `models.ts`; this is only the id.
 */
export function model(): string {
  return resolveModel().id;
}

/**
 * Runs one bounded agent turn-loop and returns its final text.
 *
 * `settingSources: []` keeps the run hermetic — without it the SDK would pick up
 * whatever CLAUDE.md and settings the developer happens to have locally, so the
 * same harness would behave differently on two machines and in CI.
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const budget = options.budget ?? Budget.fromEnv();
  // The per-message check below only fires when a message arrives; this catches a
  // run that goes quiet mid-tool-call and would otherwise hang past the limit.
  const timer = setTimeout(() => budget.abort('wall-clock timeout'), budget.limits.timeoutMs);
  timer.unref();

  let text = '';
  let stoppedBy: string | null = null;

  try {
    const response = query({
      prompt: options.prompt,
      options: {
        model: options.model ?? model(),
        systemPrompt: options.systemPrompt,
        maxTurns: budget.limits.maxTurns,
        allowedTools: options.allowedTools,
        mcpServers: options.mcpServers,
        agents: options.agents,
        hooks: options.hooks,
        cwd: options.cwd,
        // Permission prompts would stall an unattended run, so they are bypassed —
        // the SDK requires saying so explicitly. What bounds a run is the tool
        // allowlist and the PreToolUse guard, never a prompt nobody is there to answer.
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: [],
        abortController: budget.controller,
      },
    });

    for await (const message of response) {
      if (message.type === 'result') {
        budget.record({ turns: message.num_turns, costUsd: message.total_cost_usd });
        if (message.subtype === 'success') {
          text = message.result;
        } else {
          stoppedBy = `agent ended with subtype "${message.subtype}"`;
        }
      }
      // Keep the last assistant text, so a run that is cut short still returns what
      // it had reached rather than an empty string.
      if (message.type === 'assistant') {
        const said = message.message.content
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join('\n');
        if (said.trim() !== '') text = said;
      }

      const limit = budget.exceeded();
      if (limit !== null && stoppedBy === null) {
        stoppedBy = budget.abort(limit);
        break;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (budget.controller.signal.aborted) {
      stoppedBy ??= 'aborted';
    } else if (isAuthFailure(error)) {
      throw new AgentAuthError(`${AUTH_HINT}\n  ${message}`);
    } else if (/maximum number of turns/i.test(message)) {
      // The SDK throws rather than yielding a result when it exhausts maxTurns.
      // That is the budget working, not a crash: the caller should get a partial
      // result that says so. Letting it escape as a stack trace was the difference
      // between "bounded" as a documented promise and as a real behaviour.
      stoppedBy = `turn limit reached (${budget.limits.maxTurns})`;
    } else {
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }

  const spent = budget.spent();
  return {
    text,
    turns: spent.turns,
    costUsd: spent.costUsd,
    elapsedMs: spent.elapsedMs,
    stoppedBy,
  };
}
