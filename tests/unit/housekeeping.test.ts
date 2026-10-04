import { test, expect } from '@playwright/test';
import {
  ALWAYS,
  uncataloguedSkills,
  CONSEQUENCES,
  commandsNamedIn,
  obligationsFor,
  pathsNamedIn,
  planFreshness,
  undocumentedCommands,
} from '../../src/qe/housekeeping.js';

/**
 * These rules used to live inside the CLI, where the only way to exercise one was to
 * damage the real repository. A mutation that disabled the undocumented-command rule
 * survived, because the only test asserted the README happened to be honest rather
 * than that the rule could fail on a bad input. These give it bad inputs.
 */

test.describe('what a document claims', () => {
  test('should find every command a document tells a reader to run', () => {
    const found = commandsNamedIn('Run `npm run gate`, then `npm run check-report -- x`.');
    expect(found, 'both commands must be found, including the one with arguments').toEqual([
      'gate',
      'check-report',
    ]);
  });

  test('should find repo paths and ignore prose that merely looks like one', () => {
    const found = pathsNamedIn('See `src/qe/gate.ts` and `apps/<app>/coverage.md` and `foo/bar`.');
    expect(
      found,
      'a placeholder and a path outside the known roots must both be left alone',
    ).toEqual(['src/qe/gate.ts']);
  });

  test('should not treat a glob as a path', () => {
    // `tests/unit/*.test.ts` describes a set, not a file that must exist.
    expect(pathsNamedIn('Specs live in `tests/unit/*.test.ts`.')).toEqual([]);
  });
});

test.describe('capability that nobody documented', () => {
  test('should report a command the README never mentions', () => {
    // The direction of drift the first version of this gate missed entirely, and which
    // it then demonstrated on itself: `precommit` was added and left undocumented.
    const found = undocumentedCommands(['gate', 'precommit'], 'Run `npm run gate`.', {});
    expect(
      found,
      'a command that exists and is never mentioned is a capability nobody can find',
    ).toEqual(['precommit']);
  });

  test('should stay silent when everything is documented', () => {
    // A gate that fires on a clean tree gets switched off within a week.
    expect(
      undocumentedCommands(['gate', 'scan'], 'Run `npm run gate` and `npm run scan`.', {}),
      'no finding is correct here, and a false one would make the whole command noise',
    ).toEqual([]);
  });

  test('should accept a command declared internal with a reason', () => {
    // The escape hatch that keeps this from demanding a README entry for `typecheck`.
    expect(
      undocumentedCommands(['typecheck'], 'nothing here', { typecheck: 'composed by check' }),
      'an explicitly internal command must not be reported',
    ).toEqual([]);
  });

  test('should never demand documentation for the bare test command', () => {
    expect(undocumentedCommands(['test'], 'nothing here', {})).toEqual([]);
  });
});

test.describe('a skill nobody can find', () => {
  test('should report a skill the catalogue never lists', () => {
    // Twice in two messages: test-techniques and visual-inspection were written,
    // wired into roles, enforced against orphaning — and in neither README.
    expect(
      uncataloguedSkills(['oracle-check', 'visual-inspection'], 'see `oracle-check`'),
      'a skill absent from the catalogue is loadable but not findable',
    ).toEqual(['visual-inspection']);
  });

  test('should stay silent when the catalogue is complete', () => {
    expect(
      uncataloguedSkills(['oracle-check'], 'see [`oracle-check`](oracle-check/SKILL.md)'),
      'a linked entry counts as listed; firing here would make the gate noise',
    ).toEqual([]);
  });
});

test.describe('whether the plan is current', () => {
  const stamp = (over: Partial<Parameters<typeof planFreshness>[0]>) =>
    planFreshness({
      recorded: 'aaaaaaa',
      head: 'bbbbbbb',
      parent: 'aaaaaaa',
      planChangedInHead: true,
      planChangedInWorkingTree: false,
      dirtyWorkingTree: false,
      ...over,
    });

  test('should accept a plan updated against HEAD and not yet committed', () => {
    expect(
      stamp({ recorded: 'bbbbbbb', planChangedInHead: false }).fresh,
      'this is the state just before a commit, and refusing it would block every commit',
    ).toBe(true);
  });

  test('should accept a plan updated in the latest commit and stamped with its parent', () => {
    // A file cannot contain the hash of the commit that includes it. The first
    // version of this rule refused exactly this state, on the plan committed one
    // commit earlier, and so demanded a hash bump before every commit.
    expect(
      stamp({}).fresh,
      'a plan committed a moment ago is current; failing here trains people to bump the hash and nothing else',
    ).toBe(true);
  });

  test('should refuse a plan the latest commit left untouched', () => {
    // The drift worth refusing: code moved on in a commit that never updated the plan.
    const result = stamp({ planChangedInHead: false });
    expect(result.fresh, 'a code-only commit after a plan commit leaves the plan behind').toBe(
      false,
    );
    expect(result.reason, 'the refusal must say which head to name').toContain('bbbbbbb');
  });

  test('should refuse a plan stamped with an older commit even if it was touched', () => {
    expect(
      stamp({ recorded: 'ccccccc' }).fresh,
      'editing the plan without re-checking it against the current tree is not freshness',
    ).toBe(false);
  });

  test('should refuse a parent stamp once the plan is edited again', () => {
    /**
     * The state that approved a commit and then failed it. CI caught it on `3b8cea1`: HEAD had
     * updated the plan, so `planChangedInHead` was true and the parent-stamp branch called the
     * tree fresh — while `PLAN.md` sat modified on disk, naming the commit before the one it was
     * about to be committed on top of. Green locally, red in CI, where the same rule read the
     * committed tree rather than the prepared one.
     *
     * It fires whenever two consecutive commits touch the plan, which is this file's normal
     * rhythm, so the gap was open for as long as the rule was.
     */
    const result = stamp({ planChangedInWorkingTree: true });
    expect(
      result.fresh,
      'the commit being prepared has HEAD as its parent, so a stamp of HEAD’s parent is stale by one',
    ).toBe(false);
    expect(result.reason, 'and the refusal must name the head to use').toContain('bbbbbbb');
    expect(
      result.reason,
      'said as the one-off-by-one it is, not as the generic drift message',
    ).toContain('stale by one');
  });

  test('should still accept a plan edited to name HEAD itself', () => {
    // The ordinary pre-commit state, and the one the fix above must not break: the plan is
    // dirty *and* already names HEAD, which is exactly what a correct update looks like.
    expect(
      stamp({ recorded: 'bbbbbbb', planChangedInWorkingTree: true }).fresh,
      'refusing this would make the plan impossible to update at all',
    ).toBe(true);
  });

  test('should refuse a code-only commit before it is made, not after', () => {
    /**
     * The second time this rule failed CI, and the one the first fix missed. A plan updated in
     * HEAD and naming its parent is a *committed* state that is fine — and committing code on
     * top of it without touching the plan produces a tree where the stamp names the
     * grandparent and the latest commit did not update it, which is the code-only-commit case
     * this rule exists to refuse. CI then refused what precommit had approved.
     *
     * Caught on 27cdbf9. The first fix handled a **dirty** plan naming the parent; this is a
     * **clean** one, with other files staged.
     */
    const result = stamp({ planChangedInWorkingTree: false, dirtyWorkingTree: true });
    expect(
      result.fresh,
      'committing code without re-verifying the plan is the drift the rule is for, and it must be refused at the desk',
    ).toBe(false);
    expect(result.reason, 'and the refusal must name the head to stamp').toContain('bbbbbbb');
  });

  test('should stay quiet about a clean tree nobody is committing', () => {
    // Asking whether the plan is current must not be refused just for asking. A check that
    // rejects a question it was not asked is worse than one that answers it.
    expect(
      stamp({ planChangedInWorkingTree: false, dirtyWorkingTree: false }).fresh,
      'a committed state that is fine reads as fine',
    ).toBe(true);
  });

  test('should refuse a plan that names no head at all', () => {
    expect(stamp({ recorded: undefined }).fresh, 'a plan with no stamp cannot be checked').toBe(
      false,
    );
  });

  test('should treat short hashes of different lengths as the same commit', () => {
    expect(
      stamp({ recorded: 'bbbbbbbbbb', planChangedInHead: false }).fresh,
      'git abbreviates to different lengths; a longer form of HEAD is still HEAD',
    ).toBe(true);
  });
});

test.describe('obligations derived from the diff', () => {
  test('should name the document a change implicates', () => {
    const obligations = obligationsFor(['package.json']);
    expect(
      obligations.join(' '),
      'changing package.json means a command or dependency changed, and the README lists both',
    ).toContain('README Commands table');
  });

  test('should stay quiet about areas the change did not touch', () => {
    const obligations = obligationsFor(['README.md']);
    expect(
      obligations.join(' '),
      'a README-only change must not lecture about roles — an irrelevant item is how a list stops being read',
    ).not.toContain('a role changed');
  });

  test('should always include what applies to any change at all', () => {
    for (const changed of [[], ['README.md'], ['src/qe/gate.ts']]) {
      expect(
        obligationsFor(changed),
        `the always-on items must survive a change set of ${JSON.stringify(changed)}`,
      ).toEqual(expect.arrayContaining(ALWAYS));
    }
  });

  test('should give every consequence a document to go and look at', () => {
    // An obligation that names no file is a feeling, not an instruction.
    for (const rule of CONSEQUENCES) {
      expect(
        rule.obligation,
        `"${String(rule.touches)}" produces an obligation that names no document`,
      ).toMatch(/README|PLAN\.md|HANDOFF\.md|docs\/|TOOLBOX|roles\.ts/);
    }
  });
});
