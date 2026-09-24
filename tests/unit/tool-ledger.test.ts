import { test, expect } from '@playwright/test';
import { ToolLedger, describeTarget, skillFrom } from '../../src/qe/tool-ledger.js';

const INJECTED = [
  'work-discipline',
  'honesty-check',
  'exploratory-session',
  'test-techniques',
  'rule-modelling',
  'visual-inspection',
  'oracle-check',
  'bug-report',
  'risk-assessment',
];

test.describe('reading a skill is what loading a skill looks like', () => {
  test('should recognise a skill from the path a Read call carries', () => {
    expect(skillFrom('.claude/skills/oracle-check/SKILL.md')).toBe('oracle-check');
  });

  test('should recognise it through a Windows path and an absolute prefix', () => {
    expect(skillFrom('C:\\work\\tree\\.claude\\skills\\rule-modelling\\SKILL.md')).toBe(
      'rule-modelling',
    );
  });

  test('should not mistake an ordinary file for a skill', () => {
    expect(skillFrom('src/qe/report.ts')).toBeNull();
    expect(skillFrom('docs/skills-overview.md')).toBeNull();
  });
});

test.describe('what a tool call was aimed at', () => {
  test('should prefer the file path for a read', () => {
    expect(describeTarget('Read', { file_path: '.claude/skills/bug-report/SKILL.md' })).toContain(
      'bug-report',
    );
  });

  test('should keep a Bash command, which is the whole point of the call', () => {
    expect(describeTarget('Bash', { command: 'npm run check-report -- x.md' })).toBe(
      'npm run check-report -- x.md',
    );
  });

  test('should flatten and truncate something enormous rather than storing it whole', () => {
    const long = describeTarget('browser_type', { text: 'x'.repeat(500) });
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('…')).toBe(true);
  });

  test('should survive a call whose input carries nothing identifying', () => {
    expect(describeTarget('browser_snapshot', {})).toBe('');
  });
});

test.describe('the ledger', () => {
  test('should count calls per tool, most used first', () => {
    const ledger = new ToolLedger(INJECTED);
    ledger.record('browser_click', { element: 'Check' }, true);
    ledger.record('browser_click', { element: 'Check' }, true);
    ledger.record('Read', { file_path: 'src/x.ts' }, true);

    const summary = ledger.summary();
    expect(summary.totalCalls).toBe(3);
    expect(summary.byTool[0]).toEqual({ tool: 'browser_click', calls: 2 });
  });

  test('should record a refusal with its reason, so the bound is evidenced', () => {
    const ledger = new ToolLedger();
    ledger.record('Bash', { command: 'curl https://elsewhere.test' }, false, 'host is refused');

    const [call] = ledger.entries();
    expect(call?.allowed).toBe(false);
    expect(call?.reason).toBe('host is refused');
    expect(ledger.summary().refused).toBe(1);
  });

  test('should name the skills a session opened and the ones it never did', () => {
    // The question this exists to answer: eight skills are injected on every turn at
    // roughly 16k tokens, and until now nothing could say whether any were read.
    const ledger = new ToolLedger(INJECTED);
    ledger.record('Read', { file_path: '.claude/skills/visual-inspection/SKILL.md' }, true);
    ledger.record('Read', { file_path: '.claude/skills/oracle-check/SKILL.md' }, true);
    ledger.record('Read', { file_path: '.claude/skills/oracle-check/SKILL.md' }, true);

    const summary = ledger.summary();
    expect(summary.skillsLoaded, 'each skill once, in the order first opened').toEqual([
      'visual-inspection',
      'oracle-check',
    ]);
    expect(summary.skillsUnopened).toContain('rule-modelling');
    expect(summary.skillsUnopened).not.toContain('oracle-check');
  });

  test('should say plainly when a session opened no skill at all', () => {
    // The silence that matters most. A model will not volunteer that it ignored
    // everything it was given, so the runner has to say it.
    const ledger = new ToolLedger(INJECTED);
    ledger.record('browser_click', { element: 'Submit' }, true);

    expect(ledger.report().join('\n')).toContain('Skills opened: NONE');
  });

  test('should emit one JSON object per line, parseable back', () => {
    const ledger = new ToolLedger();
    ledger.record('Read', { file_path: 'a.md' }, true);
    ledger.record('Write', { file_path: 'b.md' }, true);

    const lines = ledger.asJsonl().split('\n');
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[1] ?? '{}') as { seq: number }).seq).toBe(2);
  });

  test('should report nothing recorded rather than inventing a clean session', () => {
    expect(new ToolLedger(INJECTED).report().join('\n')).toContain('none recorded');
  });
});

test.describe('a skill loaded through a Skill tool counts too', () => {
  test('should count a Skill tool call by name, not only a file read', () => {
    // Counting Read calls alone would under-report on any host that provides a Skill
    // tool, and "the session ignored its skills" is too damning a claim to get wrong.
    const ledger = new ToolLedger(INJECTED);
    ledger.record('Skill', { skill: 'rule-modelling' }, true);

    expect(ledger.summary().skillsLoaded).toEqual(['rule-modelling']);
    expect(ledger.summary().skillsUnopened).not.toContain('rule-modelling');
  });

  test('should not credit a Skill call naming something this role was never given', () => {
    const ledger = new ToolLedger(INJECTED);
    ledger.record('Skill', { skill: 'some-other-plugin' }, true);

    expect(
      ledger.summary().skillsLoaded,
      'only the skills this role actually carries can count as its skills',
    ).toEqual([]);
  });
});
