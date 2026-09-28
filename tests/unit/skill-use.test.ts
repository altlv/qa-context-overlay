import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { methodsTaught, reportSkillUse, searchable, skillUse } from '../../src/qe/skill-use.js';
import { exploratoryTester } from '../../src/agents/roles/exploratory-tester.js';
import { skillFile } from '../../src/agents/compose.js';

/**
 * The runner inlines roughly 21k tokens of skill text into every exploratory session.
 * For three runs the only thing measuring that was a count of SKILL.md file reads,
 * which the composed prompt forbids and which could therefore only ever be zero.
 *
 * This measures the question that was actually open: did any of it change the work.
 */

const readSkill = (skill: string): string => readFileSync(skillFile(skill), 'utf8');

test.describe('the methods a skill teaches', () => {
  test('should come out of the skill file, not a list kept here', () => {
    // Extracted rather than listed so a skill that grows a ninth technique is measured
    // on nine the next time it runs, with nobody having to remember this file.
    const taught = methodsTaught(readSkill('test-techniques')).map((method) => method.name);
    expect(
      taught,
      'extracted from the skill file so a ninth technique is measured without anyone remembering this module',
    ).toContain('Equivalence partitioning');
    expect(taught).toContain('Decision tables');
    expect(taught).toContain('Pairwise');
    expect(taught.length).toBeGreaterThanOrEqual(8);
  });

  test('should drop the explanatory clause after a dash', () => {
    // "Sequence probes — what static input testing cannot reach". The clause is prose
    // about the method; matching on it would make the needle unfindable in any report.
    const taught = methodsTaught('## 8. Sequence probes — what static input cannot reach');
    expect(taught).toEqual([{ name: 'Sequence probes', needle: 'sequence probes' }]);
  });

  test('should ignore headings that are not numbered methods', () => {
    expect(methodsTaught('## When to use\n## Notes\n### Output')).toEqual([]);
  });
});

test.describe('matching a report against them', () => {
  const teaches = '## 1. Decision tables\n## 2. Pairwise\n';
  const read = (): string => teaches;

  test('should match a method named in passing, not only verbatim', () => {
    // A report writes "a decision table over the discount rule", never the heading.
    const [use] = skillUse(['t'], 'I built a decision tables pass over the rule.', read);
    expect(use?.named).toEqual(['Decision tables']);
  });

  test('should match a one-word method only as a whole word', () => {
    // Guards against a short needle matching by accident inside a longer word.
    expect(skillUse(['t'], 'we ran pairwise over the modes', read)[0]?.named).toContain('Pairwise');
    expect(skillUse(['t'], 'the pairwiseness of it', read)[0]?.named).not.toContain('Pairwise');
  });

  test('should count a skill it cannot read as teaching nothing, never throw', () => {
    // This prints after the session is kept and the gate has run. It must not be what
    // ends a run.
    const broken = (): string => {
      throw new Error('gone');
    };
    expect(skillUse(['t'], 'anything', broken)).toEqual([
      { skill: 't', taught: [], named: [], namedItself: false },
    ]);
  });
});

test.describe('what the measurement reads', () => {
  test('should prefer the method a finding declares', () => {
    // The strong signal: short, deliberate, and it survives a skill whose headings are
    // steps ("Write it as a table") rather than names ("Decision tables").
    const text = searchable(
      { findings: [{ method: 'decision tables over the discount rule' }, {}] },
      'prose that names nothing',
    );
    expect(text).toContain('decision tables');
  });

  test('should keep the prose too, so older reports are not scored as zero', () => {
    expect(searchable({ findings: [] }, 'we used pairwise here')).toContain('pairwise');
  });
});

test.describe('what the runner prints', () => {
  const read = (skill: string): string =>
    skill === 'named' ? '## 1. Decision tables\n' : '## When to use\n';

  test('should leave out skills that teach no numbered method', () => {
    // honesty-check and work-discipline shape how a session behaves rather than which
    // technique it reaches for. Scoring them 0 would read as a shortfall in the
    // session instead of a fact about the skill.
    const lines = reportSkillUse(skillUse(['named', 'dispositional'], 'nothing', read));
    expect(lines.join('\n')).not.toContain('dispositional');
  });

  test('should say plainly when a skill left no trace', () => {
    const lines = reportSkillUse(skillUse(['named'], 'nothing here', read)).join('\n');
    expect(
      lines,
      'silence about an unused skill is how 21k tokens go on being paid for unnoticed',
    ).toContain('named: 0/1 — nothing from this skill reached the report');
    expect(lines).toContain('inlined on every run whether or not that changes');
  });

  test('should print nothing at all when no skill is procedural', () => {
    expect(reportSkillUse(skillUse(['dispositional'], 'x', read))).toEqual([]);
  });
});

test.describe('against the role as it is actually configured', () => {
  test('should find procedural methods in the skills the role declares', () => {
    // Pins the wiring: if a skill is renamed or its headings restructured so no method
    // can be recovered, the measurement silently becomes all-zero and means nothing.
    const uses = skillUse(exploratoryTester.skills ?? [], '', readSkill);
    const procedural = uses.filter((use) => use.taught.length > 0);
    expect(procedural.length, 'no skill teaches a recoverable method').toBeGreaterThanOrEqual(4);
  });
});

test.describe('telling a method name from a procedure step', () => {
  test('should skip a heading that opens with an imperative verb', () => {
    // "Write it" is step 6 of bug-report and it matched a report that never opened the
    // skill, because prose reaches for that phrase anyway — use claimed where there was
    // none. Steps are instructions to the tester, not labels for what was done.
    expect(
      methodsTaught('### 6. Write it'),
      'a step is an instruction to the tester, and prose reaches for "write it" anyway — it credited a skill never opened',
    ).toEqual([]);
    expect(methodsTaught('### 1. Reproduce and reduce')).toEqual([]);
    expect(methodsTaught('### 5. Probe the four failure shapes')).toEqual([]);
  });

  test('should keep a short method name, because length is the wrong filter', () => {
    // "Pairwise" is eight characters and a real technique. A length rule dropped it.
    expect(methodsTaught('## 5. Pairwise').map((m) => m.name)).toEqual(['Pairwise']);
  });

  test('should drop a skill whose headings are all steps, rather than score it zero', () => {
    // rule-modelling scored 0/6 against a session that demonstrably modelled a rule,
    // built a table and chose an independent oracle. That was our phrasing, not its
    // method, and reporting it as a shortfall was a measurement claiming to know
    // something it could not see.
    const taught = methodsTaught(readSkill('rule-modelling'));
    expect(taught, 'every heading here is a step, so nothing is measurable').toEqual([]);
  });
});

test.describe('a skill the session names outright', () => {
  const stepsOnly = (): string => '### 1. Write it\n### 2. Probe the four failure shapes\n';

  test('should credit a skill whose steps are unmatchable when the report names it', () => {
    // rule-modelling teaches only steps, so nothing of it is matchable by heading —
    // and a session then named it five times in its declared methods while the score
    // read "unmeasurable". Crediting the skill's own name recovers exactly the case
    // the heading rule cannot see.
    const [use] = skillUse(['rule-modelling'], 'rule-modelling, boundary-leakage probe', stepsOnly);
    expect(
      use?.namedItself,
      'rule-modelling teaches only steps, and a session named it five times while the score read unmeasurable',
    ).toBe(true);
    expect(reportSkillUse([use!]).join('\n')).toContain('named by the session');
  });

  test('should still drop a steps-only skill the report never mentions', () => {
    // Silence about an unmatchable skill is honest. Scoring it 0 would be a claim the
    // measurement cannot support.
    expect(reportSkillUse(skillUse(['rule-modelling'], 'nothing here', stepsOnly))).toEqual([]);
  });

  test('should not count it as silent once it has been named', () => {
    const lines = reportSkillUse(skillUse(['rule-modelling'], 'I used rule-modelling', stepsOnly));
    expect(lines.join('\n')).not.toContain('left no trace');
  });
});
