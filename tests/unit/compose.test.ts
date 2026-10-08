import { test, expect } from '@playwright/test';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import {
  SKILLS_HEADING,
  composeRoles,
  composeSystemPrompt,
  skillFile,
  skillsFor,
} from '../../src/agents/compose.js';
import { roles } from '../../src/agents/roles.js';
import { levelOfRole, type SubjectRun } from '../../src/agents/subject-prompt.js';

/**
 * A declared skill must reach the agent as text. Before this, it reached a top-level
 * run not at all, and only if the agent chose to read the file.
 */

const role = (skills: string[]): AgentDefinition => ({
  description: 'd',
  prompt: 'You are a role.',
  skills,
});

const files: Record<string, string> = {
  [skillFile('alpha')]: '---\nname: alpha\ndescription: frontmatter line\n---\n\nAlpha body.',
  [skillFile('beta')]: 'Beta body with no frontmatter.',
};

const read = (path: string): string => {
  const text = files[path];
  if (text === undefined) throw new Error('ENOENT');
  return text;
};

test.describe('composing a role prompt', () => {
  test('should carry the full text of every declared skill', () => {
    const prompt = composeSystemPrompt(role(['alpha', 'beta']), read);
    expect(prompt, 'the role’s own prompt comes first').toMatch(/^You are a role\./);
    expect(prompt).toContain(SKILLS_HEADING);
    expect(prompt).toContain('Alpha body.');
    expect(prompt, 'a skill left out is a skill the agent may never read').toContain(
      'Beta body with no frontmatter.',
    );
  });

  test('should drop frontmatter, which is metadata for the loader, not instruction', () => {
    const prompt = composeSystemPrompt(role(['alpha']), read);
    expect(prompt, 'frontmatter is not instruction').not.toContain('description: frontmatter line');
  });

  test('should refuse a declared skill that cannot be read', () => {
    expect(
      () => composeSystemPrompt(role(['missing']), read),
      'a run must not start without a skill it declares',
    ).toThrow(/missing/);
  });

  test('should leave a role that declares no skills unchanged', () => {
    expect(composeSystemPrompt(role([]), read)).toBe('You are a role.');
  });
});

test.describe('composing the real roles', () => {
  test('should give every role the text of its skills from disk', () => {
    const composed = composeRoles(roles);
    for (const [name, definition] of Object.entries(roles)) {
      const prompt = composed[name]?.prompt ?? '';
      for (const skill of definition.skills ?? []) {
        expect(prompt, `"${name}" declares "${skill}" but its text did not arrive`).toContain(
          `## Skill: ${skill}`,
        );
      }
    }
  });
});

test.describe('composing a role whose work lands in a subject', () => {
  const subject: SubjectRun = {
    app: 'mcpa',
    repo: '../mcpa-training-bot',
    stack: {
      runner: 'node --test',
      runAll: 'node --test test/*.test.js',
      runOne: 'node --test ',
      testsDir: 'test',
      testFilePattern: '*.test.js',
      moduleSystem: 'commonjs',
      assertions: "const assert = require('node:assert/strict');",
      exemplar: 'test/specIndexer.test.js',
    },
    level: 'unit',
  };

  const composed = (role: string, over: Partial<SubjectRun> = {}): string =>
    composeRoles(roles, undefined, { ...subject, ...over })[role]?.prompt ?? '';

  test('should carry no Playwright instruction and no tests/unit path', () => {
    // The plan's acceptance test for a portable role, in its own words. A role following
    // this repository's conventions writes a file the subject cannot run at all: the wrong
    // runner, the wrong directory, the wrong import. Skills are inside the string under
    // test on purpose — the runner inlines them, so an instruction in a skill is an
    // instruction the agent reads.
    const prompt = composeRoles(roles, undefined, subject)['unit-coder']?.prompt ?? '';
    expect(prompt, 'the Playwright conventions must be gone, not subordinated').not.toMatch(
      /playwright/i,
    );
    expect(prompt, 'and the harness test path with them').not.toContain('tests/unit');
    expect(prompt, 'nor the harness fixtures a role would import').not.toContain(
      'src/fixtures/harness.js',
    );
    expect(prompt, 'nor the command it would run instead of the subject runner').not.toContain(
      'npx playwright',
    );
    expect(prompt, 'the subject runner has to arrive in their place').toContain('node --test');
    expect(prompt, 'and the file to read as the house style').toContain('test/specIndexer.test.js');
  });

  test('should leave a run in this repository with its own conventions', () => {
    const prompt = composeRoles(roles)['unit-coder']?.prompt ?? '';
    expect(prompt, 'a harness run keeps the conventions it was written against').toMatch(
      /playwright/i,
    );
  });

  test('should give an integration run the integration level, not the unit one', () => {
    const prompt = composed('integration-coder', { level: 'integration' });

    // The bug this closes: the level block was written for the unit PoC, so composed for an
    // integration run it told the role that anything needing a process or a file "is not this
    // level" — a prompt arguing against the job it had just been started for.
    expect(prompt, 'the integration level has to arrive in the subject’s terms').toContain(
      'exercise the real entry point rather than importing around it',
    );
    expect(prompt, 'and the unit boundary must not be there telling it to stop').not.toContain(
      'doubling the world to reach it',
    );
    expect(prompt, 'nor the harness integration path').not.toContain('tests/integration');
    expect(prompt, 'nor the harness runner it would use instead of the subject’s').not.toContain(
      'npx playwright',
    );
    expect(prompt, 'the subject runner has to arrive in their place').toContain('node --test');
  });

  test('should keep the unit level for a unit run', () => {
    const prompt = composed('unit-coder');

    expect(prompt, 'the unit run still gets its own boundary').toContain(
      'doubling the world to reach it',
    );
    expect(
      prompt,
      'and the integration definition would invite tests this level has to refuse',
    ).not.toContain('exercise the real entry point rather than importing around it');
  });

  test('should not tell an e2e role there is no browser', () => {
    // True for three levels and a lie for the fourth, so it is asserted in both directions: a
    // block that dropped it everywhere would otherwise pass.
    expect(
      composed('e2e-coder', { level: 'e2e' }),
      'a level block denying the browser tells an e2e coder its own job is out of scope',
    ).not.toContain('There is no browser in this run');
    expect(composed('api-coder', { level: 'api' }), 'an api run still drives no page').toContain(
      'There is no browser in this run',
    );
    expect(composed('api-coder', { level: 'api' }), 'and is told what its level is').toContain(
      'a request, a response, a status code',
    );
  });

  test('should give a role that works at no level no level at all', () => {
    const prompt = composed('test-planner', { level: null });

    expect(
      prompt,
      'the planner used to be handed the unit definition as if it were the planner’s own job',
    ).toContain('does not work at one of the four test levels');
    expect(prompt, 'and no unit definition with it').not.toContain('pinned on its own');
  });
});

test.describe('the level a subject run works at', () => {
  test('should read the level from every coder role, and only from those', () => {
    const named = Object.keys(roles)
      .filter((name) => levelOfRole(name) !== null)
      .sort();

    expect(
      named,
      'the four coders are the roles named for a level; a fifth has to be added here deliberately',
    ).toEqual(['api-coder', 'e2e-coder', 'integration-coder', 'unit-coder']);
    expect(levelOfRole('test-planner'), 'the planner works at no level').toBeNull();
    expect(levelOfRole('exploratory-tester')).toBeNull();
  });
});

test.describe('narrowing the skills a run inlines', () => {
  /**
   * Item 87. The skills are the most expensive thing in a run — nine of them make a ~316k-token
   * system prompt, charged as cache reads on every message — and the first complete run reported
   * `exploratory-session: 0/3`, `test-techniques: 0/8`, `risk-assessment: 0/1`: two of five
   * procedural skills left no trace in its output.
   *
   * The README leads with "context the agent is given rather than pays to re-derive". This is how
   * that gets tested rather than asserted, and it has to be repeatable — a hand edit to a role file
   * produces a number nobody can reproduce.
   */

  const declared = ['work-discipline', 'honesty-check', 'exploratory-session', 'test-techniques'];

  test('should leave a run without the flag exactly as it was', () => {
    // The default has to be a no-op, or every existing measurement becomes incomparable.
    expect(skillsFor(declared, null)).toEqual({ skills: declared, refused: [] });
  });

  test('should keep the role’s own order when narrowing', () => {
    // The prompt is assembled in order, so honouring the operator's order instead would make two
    // runs with the same set differ in their system prompt and in what they cost to cache.
    expect(skillsFor(declared, ['test-techniques', 'work-discipline']).skills).toEqual([
      'work-discipline',
      'test-techniques',
    ]);
  });

  test('should allow none at all', () => {
    // The floor of the comparison: what does this role find with the prompt and no skills?
    expect(
      skillsFor(declared, []).skills,
      'the role keeps its prompt, and inlines nothing',
    ).toEqual([]);
  });

  test('should refuse a skill the role does not declare', () => {
    /**
     * Granting one would be measuring a different role, and `roles.test.ts` enforces that every
     * skill belongs to one. Reported rather than dropped: a typo passed over in silence would
     * inline fewer skills than asked for, and the result would read as "the skills made no
     * difference" — the exact conclusion this experiment exists to test honestly.
     */
    const narrowed = skillsFor(declared, ['test-techniques', 'rule-modelling']);

    expect(narrowed.refused, 'the name the role does not hold is named back').toEqual([
      'rule-modelling',
    ]);
    expect(narrowed.skills, 'and the ones it does hold are still chosen').toEqual([
      'test-techniques',
    ]);
  });

  test('should refuse a typo rather than silently inlining nothing', () => {
    expect(skillsFor(declared, ['test-techniqes']).refused).toEqual(['test-techniqes']);
  });
});
