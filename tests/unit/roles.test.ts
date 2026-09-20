import { test, expect } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { families, roles, rolesIn } from '../../src/agents/roles.js';

const SKILLS_DIR = '.claude/skills';

/**
 * These roles have never been executed against the API. That is recorded honestly in
 * .ai/state/PLAN.md and must not be claimed otherwise.
 *
 * What can be verified without a live run is the contract: that every role says when
 * NOT to use it, that the skills it declares actually exist, that its prose and its
 * declared skills agree, that it is bounded, and that it is required to hand back a
 * checkable report. Those are the properties that make the difference between a role
 * and a paragraph.
 */

const entries = Object.entries(roles);

/** Skill folders on disk — the denominator for the orphan check. */
function skillsOnDisk(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SKILLS_DIR, entry.name, 'SKILL.md')))
    .map((entry) => entry.name);
}

/**
 * Skill names a prompt points at. A path may name a file inside a skill —
 * `pwtest/patterns/api-test.md` — so the skill is the first segment, not the file.
 */
function skillsNamedInProse(prompt: string): Set<string> {
  return new Set(
    [...prompt.matchAll(/\.claude\/skills\/([\w-]+)\//g)].map((match) => match[1] ?? ''),
  );
}

test.describe('agent role contracts', () => {
  test('should define a role for every test level, plus planning and investigation', () => {
    expect(Object.keys(roles).sort()).toEqual(
      [
        'unit-coder',
        'integration-coder',
        'api-coder',
        'e2e-coder',
        'testability-reviewer',
        'test-planner',
        'exploratory-tester',
        'failure-investigator',
      ].sort(),
    );
  });

  for (const [name, role] of entries) {
    test.describe(name, () => {
      test('should say when NOT to use it — that is what makes selection reliable', () => {
        expect(
          // Deliberately strict. A looser regex including "rather than" passed a
          // mutation that stripped the negative scope entirely — "rather than" occurs
          // in ordinary prose, so it asserted nothing.
          /\bnot for\b/i.test(role.description),
          `"${name}" must say what it is NOT for, in those words — vague scoping is
how the wrong agent gets selected`,
        ).toBe(true);
      });

      test('should be bounded by a turn limit', () => {
        expect(
          role.maxTurns,
          `"${name}" has no maxTurns — an agent that cannot solve a
problem keeps trying`,
        ).toBeDefined();
        expect(role.maxTurns ?? 0).toBeGreaterThan(0);
        // The ceiling exists to catch an unbounded role, not to pick the number. It
        // was 40, written before any role had run; the first live exploratory session
        // spent 30 turns in 127 seconds and died with an empty report, so 40 was not a
        // safety bound but a gag. Spend is the real bound — `budgetForTier` caps every
        // run in dollars — and this only asserts nobody typed a five-digit number.
        expect(role.maxTurns ?? 0).toBeLessThanOrEqual(300);
      });

      test('should carry the guardrails', () => {
        expect(
          role.prompt,
          `"${name}" lost the guardrails — an unguarded agent can claim a check ran when it did not`,
        ).toContain('Evidence beats memory');
        expect(role.prompt).toContain('did not execute is not evidence');
      });

      test('should require a checkable report as its output', () => {
        expect(role.prompt).toContain('docs/report-format.md');
        expect(role.prompt, 'a role must verify its own output, not just produce it').toContain(
          'check-report',
        );
      });

      test('should declare skills that exist on disk', () => {
        const declared = role.skills ?? [];
        expect(
          declared.length,
          `"${name}" declares no skills — roles and skills are then two
disconnected halves`,
        ).toBeGreaterThan(0);
        for (const skill of declared) {
          expect(
            existsSync(join(SKILLS_DIR, skill, 'SKILL.md')),
            `"${name}" declares skill "${skill}", which does not exist`,
          ).toBe(true);
        }
      });

      test('should name the same skills in its prose as it declares', () => {
        // Two mechanisms, two jobs: `skills` preloads, prose says when to reach for it.
        // They drift apart silently, and a skill named in only one place is either
        // loaded and unexplained or explained and never loaded.
        const declared = [...(role.skills ?? [])].sort();
        const inProse = [...skillsNamedInProse(role.prompt)].sort();
        expect(
          inProse,
          `"${name}" declares [${declared.join(', ')}] but its prose names
[${inProse.join(', ')}] — the skills field and the prompt must agree`,
        ).toEqual(declared);
      });

      test('should restrict its tools', () => {
        expect(role.tools, `"${name}" inherits every tool`).toBeDefined();
        expect((role.tools ?? []).length).toBeGreaterThan(0);
      });

      test('should not pin a model — the harness chooses one centrally', () => {
        // A subagent that names no model inherits its parent's, which is what keeps a
        // delegated planner on the same model as the coder that called it. Every role
        // used to pin 'sonnet' in a field the runner never read; setting
        // HARNESS_MODEL=opus would then have run the coder on opus and its planner on
        // sonnet, silently.
        expect(
          role.model,
          `"${name}" pins a model — HARNESS_MODEL and src/agents/models.ts decide,
so a pinned role would ignore the tier and its budget`,
        ).toBeUndefined();
      });

      test('should belong to a family', () => {
        expect(
          families[name],
          `"${name}" has no family — coding or testing decides which skills and
tools it may hold`,
        ).toBeDefined();
      });
    });
  }

  test('no testing role should be able to edit code', () => {
    // The testing family produces judgement: a design, a session, a localisation.
    // Give it Edit and it stops arguing and starts patching, which is how a product
    // defect quietly becomes a widened selector.
    for (const name of rolesIn('testing')) {
      expect(
        roles[name]?.tools ?? [],
        `"${name}" is a testing role — it must not hold Edit`,
      ).not.toContain('Edit');
    }
  });

  test('the reviewer should audit rather than fix', () => {
    // In the coding family by purpose — everything it produces exists to make
    // automation possible — but it writes findings, not code.
    expect(
      roles['testability-reviewer']?.tools ?? [],
      'testability-reviewer reviews; a reviewer holding Edit fixes what it should be reporting',
    ).not.toContain('Edit');
  });

  test('judgement skills should reach the testing family only', () => {
    // `risk-assessment` decides how much a thing deserves and `oracle-check` decides
    // whether behaviour is wrong. Both are thinking work. They sat on coder roles
    // until the families were written down, which is how a coder ends up justifying
    // the scope of the code it is already writing.
    for (const skill of ['risk-assessment', 'oracle-check']) {
      const readers = entries
        .filter(([, role]) => (role.skills ?? []).includes(skill))
        .map(([name]) => name);
      expect(readers.length, `nobody declares "${skill}"`).toBeGreaterThan(0);
      for (const name of readers) {
        expect(
          families[name],
          `"${name}" declares "${skill}" but is in the ${families[name]} family —
judgement skills belong with the roles that produce judgement`,
        ).toBe('testing');
      }
    }
  });

  test('every skill should be declared by at least one role', () => {
    // The per-role check catches a role declaring a skill that does not exist. This is
    // the inverse, and it was the one that went unchecked: two skills sat in
    // .claude/skills/ that no role ever loaded. A skill nothing reads is a skill that
    // does not exist, and `honesty-check` — written because agents overclaim — was one.
    const onDisk = skillsOnDisk();
    expect(
      onDisk.length,
      `no skills found under ${SKILLS_DIR} — this test would pass vacuously`,
    ).toBeGreaterThan(0);

    const declared = new Set(entries.flatMap(([, role]) => role.skills ?? []));
    const orphans = onDisk.filter((skill) => !declared.has(skill)).sort();
    expect(
      orphans,
      `no role declares: ${orphans.join(', ')} — either wire it into the role that
needs it, or into SHARED_SKILLS in src/agents/common.ts if it is cross-cutting`,
    ).toEqual([]);
  });

  test('only the coding family should be able to delegate', () => {
    // A coder handed no design calls the planner rather than inventing one. Giving the
    // Agent tool to a testing role instead would let a planner spawn a planner.
    for (const [name, role] of entries) {
      if ((role.tools ?? []).includes('Agent')) {
        expect(
          families[name],
          `"${name}" holds the Agent tool but is in the ${families[name]} family`,
        ).toBe('coding');
        expect(role.prompt, `"${name}" can delegate but is never told to whom`).toContain(
          'test-planner',
        );
      }
    }
  });

  test('every level named in the shared contract should have a role', () => {
    const contract = roles['unit-coder']?.prompt ?? '';
    for (const level of ['unit', 'integration', 'api', 'e2e', 'exploratory']) {
      expect(contract, `the shared level table omits ${level}`).toContain(level);
    }
  });
});
