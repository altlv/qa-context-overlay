/**
 * What a session actually did, recorded rather than inferred.
 *
 * Four live runs produced reports full of claims about method — a pre-flight swept,
 * techniques applied, oracles consulted — and there was no way to check any of it
 * except by reading the agent's own prose about itself. That is the weakest evidence
 * in the building, and this repo's first rule is that evidence beats memory.
 *
 * The data was already passing through: `guardHook` sees every `PreToolUse` call and
 * discarded all of it except refusals. This keeps it.
 *
 * It used to claim it answered a second question — **are the injected skills being
 * used?** — on the premise that "a skill is loaded by reading
 * `.claude/skills/<name>/SKILL.md`, so a ledger of Read calls is a ledger of skills."
 *
 * **That premise was false, and this ledger spent three runs reporting a failure that
 * was correct behaviour.** `composeSystemPrompt` inlines the full text of every
 * declared skill into the system prompt — 85k characters for this role, roughly 21k
 * tokens — and then tells the agent in as many words: "it is already here — do not
 * spend a turn reading its SKILL.md." A session that opens none of them is obeying the
 * prompt. "Skills opened: NONE" could never have read anything else.
 *
 * A count of Read calls cannot measure whether a skill was used, because using one
 * costs no tool call. What the ledger can honestly say is how the skills were
 * delivered and what they cost, so it says that instead and leaves the question of use
 * to the report's own techniques and oracles, where the evidence actually is.
 */

export interface ToolCall {
  /** Order within the session, from 1. */
  seq: number;
  /** Milliseconds since the session started. */
  atMs: number;
  tool: string;
  /** A short, readable description of what the call was aimed at. */
  target: string;
  allowed: boolean;
  /** Present only when refused. */
  reason?: string;
}

/** Pulls the most useful identifying string out of a tool's input. */
export function describeTarget(_tool: string, input: Record<string, unknown>): string {
  const text = (key: string): string | null => {
    const value = input[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };

  // Ordered by how specific each field is, not alphabetically: `element` names the
  // thing a person would recognise, `url` says where, and `command` is the whole point
  // of a Bash call.
  const candidate =
    // `skill` first: a skill invoked through a Skill tool names itself here, and that
    // is a load just as much as reading the file is. Counting only Read calls would
    // under-report skill use on any host that provides such a tool.
    text('skill') ??
    text('file_path') ??
    text('path') ??
    text('element') ??
    text('url') ??
    text('command') ??
    text('pattern') ??
    text('selector') ??
    text('text') ??
    '';

  const flat = candidate.replace(/\s+/g, ' ');
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
}

/** The skill a path refers to, or null. `.claude/skills/oracle-check/SKILL.md`. */
export function skillFrom(target: string): string | null {
  const match = /[\\/]?\.claude[\\/]skills[\\/]([a-z0-9-]+)[\\/]/i.exec(target.replace(/\\/g, '/'));
  return match?.[1] ?? null;
}

export interface LedgerSummary {
  totalCalls: number;
  refused: number;
  /** Call counts per tool, most used first. */
  byTool: { tool: string; calls: number }[];
  /** Skills whose SKILL.md the session actually opened, in the order first opened. */
  skillsLoaded: string[];
  /** Skills injected into the prompt that the session never opened. */
  skillsUnopened: string[];
}

export class ToolLedger {
  private readonly calls: ToolCall[] = [];
  private readonly startedAt = Date.now();

  constructor(private readonly injectedSkills: string[] = []) {}

  record(tool: string, input: Record<string, unknown>, allowed: boolean, reason?: string): void {
    this.calls.push({
      seq: this.calls.length + 1,
      atMs: Date.now() - this.startedAt,
      tool,
      target: describeTarget(tool, input),
      allowed,
      ...(allowed ? {} : { reason }),
    });
  }

  entries(): readonly ToolCall[] {
    return this.calls;
  }

  summary(): LedgerSummary {
    const counts = new Map<string, number>();
    for (const call of this.calls) counts.set(call.tool, (counts.get(call.tool) ?? 0) + 1);

    const skillsLoaded: string[] = [];
    for (const call of this.calls) {
      // Two ways a skill gets loaded: its file is read, or a Skill tool is called with
      // its bare name. Both count, and missing either would flatter or damn a session
      // for the wrong reason.
      const skill =
        skillFrom(call.target) ??
        (call.tool === 'Skill' && this.injectedSkills.includes(call.target) ? call.target : null);
      if (skill !== null && !skillsLoaded.includes(skill)) skillsLoaded.push(skill);
    }

    return {
      totalCalls: this.calls.length,
      refused: this.calls.filter((call) => !call.allowed).length,
      byTool: [...counts.entries()]
        .map(([tool, calls]) => ({ tool, calls }))
        .sort((left, right) => right.calls - left.calls || left.tool.localeCompare(right.tool)),
      skillsLoaded,
      skillsUnopened: this.injectedSkills.filter((skill) => !skillsLoaded.includes(skill)),
    };
  }

  /** One line per call, for the session's own folder. */
  asJsonl(): string {
    return this.calls.map((call) => JSON.stringify(call)).join('\n');
  }

  /**
   * What a person reads at the end of a run.
   *
   * Skill lines report delivery and cost, never "use". A session cannot open an
   * inlined skill, so a read count is evidence about our own wiring and nothing about
   * the session. Reporting it as a shortfall taught three debriefs the wrong lesson.
   */
  report(): string[] {
    const summary = this.summary();
    if (summary.totalCalls === 0) return ['Tools used: none recorded.'];

    const lines = [
      `Tools used: ${summary.totalCalls} call(s)` +
        (summary.refused > 0 ? `, ${summary.refused} refused` : ''),
    ];
    for (const { tool, calls } of summary.byTool.slice(0, 12)) {
      lines.push(`  ${String(calls).padStart(4)} × ${tool}`);
    }
    if (summary.byTool.length > 12) {
      lines.push(`  … and ${summary.byTool.length - 12} more tool(s)`);
    }

    if (this.injectedSkills.length > 0) {
      lines.push(
        `  Skills: ${this.injectedSkills.length} inlined into the system prompt by the runner` +
          ' — delivery is not in question. Whether they were USED shows in the report’s' +
          ' techniques, oracles and coverage, not in tool calls.',
      );
    }
    // Only worth a line when it happened: a session re-reading a file it was already
    // given is either a wiring fault or a prompt that contradicts itself, and both are
    // worth seeing. Silence is the expected case, not a shortfall.
    if (summary.skillsLoaded.length > 0) {
      lines.push(
        `  Re-read despite being inlined: ${summary.skillsLoaded.join(', ')}` +
          ' — the prompt says not to; find out what sent it to the file.',
      );
    }
    return lines;
  }
}
