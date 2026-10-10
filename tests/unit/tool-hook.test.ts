import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { HookInput } from '@anthropic-ai/claude-agent-sdk';
import { decideToolUse, guardHook, observerHook, type ToolCheck } from '../../src/qe/tool-hook.js';

/**
 * The hook is the only path by which a guard reaches a live run. It must deny in the
 * shape the SDK acts on, allow without interfering, and refuse when its own check
 * throws.
 */

const preToolUse = (toolName: string, toolInput: unknown): HookInput =>
  ({
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: 'id',
    session_id: 's',
    transcript_path: 't',
    cwd: '.',
  }) as unknown as HookInput;

const refuseBash: ToolCheck = (toolName, input) =>
  toolName === 'Bash' && String(input.command).includes('git push')
    ? { allowed: false, reason: 'no pushing' }
    : { allowed: true, reason: 'fine' };

const signal = new AbortController().signal;

test.describe('the guard hook', () => {
  test('should deny in the shape the SDK acts on', async () => {
    const denied: string[] = [];
    const hook = guardHook(refuseBash, (tool, reason) => denied.push(`${tool}: ${reason}`));
    const output = await hook.hooks[0]!(preToolUse('Bash', { command: 'git push' }), 'id', {
      signal,
    });
    expect(output, 'anything but permissionDecision "deny" lets the call through').toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'no pushing',
      },
    });
    expect(denied).toEqual(['Bash: no pushing']);
  });

  test('should let an allowed call continue untouched', async () => {
    const hook = guardHook(refuseBash);
    const output = await hook.hooks[0]!(preToolUse('Bash', { command: 'git status' }), 'id', {
      signal,
    });
    expect(output).toEqual({ continue: true });
  });

  test('should refuse when the check itself throws', () => {
    const broken: ToolCheck = () => {
      throw new Error('boom');
    };
    const { decision } = decideToolUse(broken, preToolUse('Bash', { command: 'ls' }));
    expect(
      decision.allowed,
      'a guard that failed to decide must not read as a guard that allowed',
    ).toBe(false);
  });

  test('should ignore events that are not tool calls', () => {
    const { decision } = decideToolUse(refuseBash, {
      hook_event_name: 'SessionStart',
    } as unknown as HookInput);
    expect(decision.allowed).toBe(true);
  });
});

const postToolUse = (toolName: string, toolInput: unknown): HookInput =>
  ({
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: {},
    tool_use_id: 'id',
    session_id: 's',
    transcript_path: 't',
    cwd: '.',
  }) as unknown as HookInput;

test.describe('the observer hook, as a channel back to the agent', () => {
  /**
   * **The hole a poison test found.** Everything the observer learned went to `console.error` and a
   * post-run summary — the operator, and a report — while the session that could act on an untried
   * control was told nothing after its opening prompt. The fix returns `additionalContext` from this
   * hook, which reaches the model; proven live on 2026-10-07 with a code word the agent read back.
   *
   * Nothing tested the return path, so deleting it restored the original bug with all 981 unit tests
   * green. These are the tests that would have noticed.
   */

  test('should carry what the observer said into the model’s context', async () => {
    const hook = observerHook(
      async () => '[harness] 2 control(s) here nothing has acted on yet.',
      () => true,
    );

    const output = (await hook.hooks[0]!(postToolUse('browser_click', { element: 'Buy' }), 'id', {
      signal,
    })) as { hookSpecificOutput?: { hookEventName?: string; additionalContext?: string } };

    expect(
      output.hookSpecificOutput?.additionalContext,
      'without this the discovery reaches a terminal and never the thing that can act on it',
    ).toContain('nothing has acted on yet');
    expect(
      output.hookSpecificOutput?.hookEventName,
      'and the SDK only honours it under the matching event name',
    ).toBe('PostToolUse');
  });

  test('should send nothing when the observer has nothing to say', async () => {
    // Silence is a budget decision: a run is bounded by tokens, so an empty handover must cost
    // nothing rather than sending an empty string into the context after every action.
    const hook = observerHook(
      async () => null,
      () => true,
    );

    const output = (await hook.hooks[0]!(postToolUse('browser_click', {}), 'id', {
      signal,
    })) as { hookSpecificOutput?: unknown; continue?: boolean };

    expect(output.hookSpecificOutput, 'nothing to say, nothing sent').toBeUndefined();
    expect(output.continue, 'and the run carries on either way').toBe(true);
  });

  test('should pass the tool’s arguments through, not just its name', async () => {
    /**
     * `tool_input` was received from the SDK and discarded for the whole life of this harness. Without
     * it an edge can only be labelled by tool name, so every edge read `browser_click`, `triedFrom`
     * could not tell one control from another, and the untried half of the frontier did not exist.
     */
    const seen: { name: string; input: unknown }[] = [];
    const hook = observerHook(
      async (name, input) => {
        seen.push({ name, input });
        return null;
      },
      () => true,
    );

    await hook.hooks[0]!(postToolUse('browser_click', { element: 'Add to cart' }), 'id', {
      signal,
    });

    expect(seen[0]?.input, 'the arguments name the control that was acted on').toEqual({
      element: 'Add to cart',
    });
  });

  test('should not look at a tool that cannot move the page', async () => {
    // A look costs a harvest and a handover costs tokens. Spending both on a `Read` would charge
    // the session for bookkeeping about a file.
    const looks: string[] = [];
    const hook = observerHook(
      async (name) => {
        looks.push(name);
        return 'something';
      },
      (name) => name.startsWith('browser_'),
    );

    const output = await hook.hooks[0]!(postToolUse('Read', { file_path: 'x' }), 'id', { signal });

    expect(looks, 'not interested, so not observed').toEqual([]);
    expect(
      (output as { hookSpecificOutput?: unknown }).hookSpecificOutput,
      'and nothing is sent to the model either',
    ).toBeUndefined();
  });

  test('should keep the run going when the observer throws', async () => {
    // The action has already happened. Throwing here would surface as a tool failure to the model,
    // which would make the harness's bookkeeping look like the app misbehaving.
    const hook = observerHook(
      async () => {
        throw new Error('page mid-navigation');
      },
      () => true,
    );

    const output = await hook.hooks[0]!(postToolUse('browser_click', {}), 'id', { signal });

    expect((output as { continue?: boolean }).continue).toBe(true);
  });
});

test.describe('which tools the observer is woken for', () => {
  /**
   * Caught by a live run on 2026-10-09, after a commit that claimed to have fixed it.
   *
   * The runner's callback branches on whether the page may have changed: look and hand over
   * everything, or take no look and hand over only the budget warning. That second branch is how a
   * warning reaches a session that has stopped touching the browser — the last ten tool calls of
   * the 2026-10-08 run were Read, Bash, Write, Edit and Grep, which is where a run ends.
   *
   * It was passed `mayChangeThePage` as `interestedIn`, so **the hook returned before the
   * callback and the whole branch was unreachable**. The live run's last two tool calls landed at
   * 384.6s and 387.5s of 480s, both inside the 20% band, and no warning was sent.
   *
   * The unit test written for it asserted `handoverLine`'s output for the shape that branch
   * builds — the neighbouring claim, not this one. This is the test that distinguishes them: it
   * asks whether the callback is reached at all for a tool that cannot have changed the page.
   */

  test('should wake for a tool that touches no page, so a warning can still arrive', async () => {
    const woken: string[] = [];
    const hook = observerHook(
      async (toolName) => {
        woken.push(toolName);
        return '[harness] about 15% of this run’s wall clock budget is left.';
      },
      () => true,
    );

    const output = (await hook.hooks[0]!(postToolUse('Bash', { command: 'ls' }), 'id', {
      signal,
    })) as { hookSpecificOutput?: { additionalContext?: string } };

    expect(woken, 'the callback has to be reached before it can decide anything').toEqual(['Bash']);
    expect(
      output.hookSpecificOutput?.additionalContext,
      'and what it returns has to reach the model, or the warning is an operator’s log line',
    ).toContain('15%');
  });

  test('should still honour a predicate that narrows it', async () => {
    // The gate is not useless — it is simply the wrong place for this decision. A caller that does
    // want to be woken selectively must still get that.
    const woken: string[] = [];
    const hook = observerHook(
      async (toolName) => {
        woken.push(toolName);
        return null;
      },
      (toolName) => toolName.startsWith('browser_'),
    );

    await hook.hooks[0]!(postToolUse('Bash', { command: 'ls' }), 'id', { signal });
    expect(woken, 'filtered out').toEqual([]);

    await hook.hooks[0]!(postToolUse('browser_click', {}), 'id', { signal });
    expect(woken, 'and let through').toEqual(['browser_click']);
  });
});

test.describe('how the runner registers the observer', () => {
  /**
   * **A test of the call site, because the call site is where this broke.**
   *
   * The two tests above pass `() => true` themselves, so they prove the hook forwards to its
   * callback — not that `role.ts` asks it to. That gap is exactly the defect of 2026-10-09: the
   * hook was registered with `mayChangeThePage`, the no-look branch was unreachable, and a unit
   * test of the *callback's output* for that branch passed the whole time.
   *
   * Reading the source is a blunt instrument and it is the honest one available here: `role.ts` is
   * a CLI script that builds this registration inline, so there is no seam to call. `npm run
   * assert-quality` and `repo-hygiene.test.ts` already check claims this way. If the
   * registration ever gains a seam worth testing directly, this test should be replaced by one.
   */

  test('should wake the observer for every tool, and decide inside the callback', () => {
    const source = readFileSync('src/cli/role.ts', 'utf8');
    const call = source.slice(source.indexOf('observerHook('));
    // A window after the call rather than a precise slice: the callback carries its reasoning in
    // comments and runs to several thousand characters, and what matters is the argument that
    // closes it. Generous enough to contain that, bounded so it cannot reach another hook.
    const registration = call.slice(0, 20_000);
    // Whitespace removed, because the formatter decides where the argument sits: it has already
    // moved this from `}, () => true)` onto a line of its own once, and a test that fails over
    // formatting is a test that gets deleted rather than read.
    const flat = registration.split(String.fromCharCode(10)).join('').split(' ').join('');

    expect(
      flat.includes('},()=>true'),
      'the hook must be woken for every tool, or the branch that warns a session away from the ' +
        'browser cannot run',
    ).toBe(true);
    expect(
      flat.includes('},mayChangeThePage'),
      'gating the hook on a page predicate is the 2026-10-09 defect: it makes the no-look branch ' +
        'dead code while its unit test stays green',
    ).toBe(false);
    expect(
      flat.includes('if(!mayChangeThePage(toolName))'),
      'and the decision belongs inside the callback, where both branches are reachable',
    ).toBe(true);
  });
});
