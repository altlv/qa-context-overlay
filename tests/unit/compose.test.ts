import { test, expect } from '@playwright/test';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import {
  SKILLS_HEADING,
  composeRoles,
  composeSystemPrompt,
  skillFile,
} from '../../src/agents/compose.js';
import { roles } from '../../src/agents/roles.js';

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
  const subject = {
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
  };

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
});
