import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { composeSystemPrompt } from '../../src/agents/compose.js';
import { roles } from '../../src/agents/roles.js';

/**
 * The context a session actually receives.
 *
 * Instrumentation on 2026-09-24 recorded a session opening **none** of its nine
 * injected skills across 68 tool calls: it ran `ls .claude/skills/`, read nothing, and
 * then cited `visual-inspection` in its own notes. So a skill file is not a delivery
 * mechanism, and anything a session must actually have has to be inline in the prompt.
 *
 * Inlining creates its own failure: two copies that drift apart, with the skill
 * improved and the prompt left behind. These tests read the skill files and assert the
 * prompt still carries what they teach, so adding a twelfth oracle to `oracle-check`
 * fails here until the prompt catches up.
 */

const role = roles['exploratory-tester'];

function prompt(): string {
  if (role === undefined) throw new Error('exploratory-tester is not registered');
  return composeSystemPrompt(role);
}

/** Bold entries in a markdown table's first column, which is how both skills list. */
function boldedRows(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(/^\|\s*\*\*([^*]+)\*\*/gm)].map((match) =>
    (match[1] ?? '').trim(),
  );
}

test.describe('the session is handed its oracles, not a pointer to them', () => {
  test('should carry every oracle the oracle-check skill teaches', () => {
    const skillOracles = boldedRows('.claude/skills/oracle-check/SKILL.md');
    expect(skillOracles.length, 'the skill should list its oracles in a table').toBeGreaterThan(8);

    const composed = prompt();
    const absent = skillOracles.filter((oracle) => !composed.includes(`**${oracle}**`));

    expect(
      absent,
      'an oracle the skill teaches and the prompt omits is one a session will not use, because sessions do not open skills',
    ).toEqual([]);
  });

  test('should say what to do when no oracle applies', () => {
    // Without this the weakest oracle gets stretched to cover anything odd, and an
    // opinion arrives dressed as a defect.
    expect(prompt()).toContain('you have a question, not a defect');
  });

  test('should name where an unsupported opinion hides', () => {
    const composed = prompt();
    expect(composed).toContain('user expectations');
    expect(composed).toContain('familiar problems');
  });
});

test.describe('the session is handed the product dimensions', () => {
  const ELEMENTS = [
    'Structure',
    'Function',
    'Data',
    'Interfaces',
    'Platform',
    'Operations',
    'Time',
  ];

  test('should carry all seven, because a screen is not a dimension', () => {
    // A session that walks screens tests what the builder chose to show it.
    const composed = prompt();
    const absent = ELEMENTS.filter((element) => !composed.includes(`**${element}**`));
    expect(absent, 'each dimension is somewhere behaviour lives that no screen reveals').toEqual(
      [],
    );
  });

  test('should present them as a thinking tool rather than a checklist', () => {
    // The moment they read as a checklist, a session performs them and reports seven
    // paragraphs of nothing.
    expect(prompt()).toContain('thinking tool, not a checklist');
  });
});

test.describe('the distinction the role exists for', () => {
  test('should tell the session it will default to checking', () => {
    // A week of sessions confirmed free candidate actions and called it exploring.
    expect(prompt()).toContain('Testing is not checking');
  });

  test('should give a usable tell rather than a definition', () => {
    // "Know the difference" is unactionable; certainty before looking is observable.
    expect(prompt()).toContain('The tell is your own certainty');
  });

  test('should treat confusion as evidence about the product', () => {
    expect(prompt()).toContain('Confusion is a finding');
  });
});
