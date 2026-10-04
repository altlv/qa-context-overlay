/**
 * The rules behind `npm run precommit`, as pure functions.
 *
 * They lived inside the CLI, where the only way to test one was to stage drift in the
 * real repository — and the first attempt at that left `docs/conventions.md` dirty
 * whenever a run was interrupted. Worse, a mutation disabling the undocumented-command
 * rule **survived**, because the only test asserted the README was currently honest
 * rather than that the rule could fail. A rule that cannot be given a bad input has
 * not been tested.
 */

/** Commands a document tells a reader to run. */
export function commandsNamedIn(text: string): string[] {
  return [...new Set([...text.matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1] ?? ''))];
}

/**
 * Repo paths a document points at.
 *
 * Deliberately narrow. A detector that cries wolf is worse than none, so this only
 * accepts a path under a known root, skips globs, and requires a file extension —
 * `apps/<app>/coverage.md` is a pattern, not a claim.
 */
export function pathsNamedIn(text: string): string[] {
  const candidates = [
    ...[...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? ''),
    ...[...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? ''),
  ];
  return [
    ...new Set(
      candidates.filter(
        (candidate) =>
          /^(src|tests|apps|docs|scripts|\.claude|\.ai|\.github)\/[\w./-]+\.\w+$/.test(candidate) &&
          !candidate.includes('*'),
      ),
    ),
  ];
}

/**
 * Commands that exist and the README never mentions.
 *
 * The drift that actually happened, and the direction the first version of this gate
 * missed entirely: it checked that documented commands exist, not that existing
 * commands are documented. `npm run precommit` slipped through on the run that
 * introduced it, one message after five README fixes.
 *
 * `internal` is why this is not a blanket rule. Demanding a README entry for
 * `typecheck` and `format:check` — parts that `check` composes — would cry wolf on ten
 * commands to catch the one that matters, and then get ignored.
 */
export function undocumentedCommands(
  scripts: string[],
  readme: string,
  internal: Record<string, string>,
): string[] {
  return scripts
    .filter((name) => name !== 'test' && !(name in internal) && !readme.includes(`npm run ${name}`))
    .sort();
}

/**
 * Skills that exist and the catalogue never lists.
 *
 * The same drift as an undocumented command, and it happened twice in two messages:
 * `test-techniques` and `visual-inspection` were written, wired into roles, enforced
 * by a test that nothing is orphaned — and absent from both READMEs. Being loadable
 * is not the same as being findable.
 */
export function uncataloguedSkills(skills: string[], catalogue: string): string[] {
  return skills.filter((name) => !catalogue.includes(`\`${name}\``)).sort();
}

export interface Consequence {
  touches: RegExp;
  obligation: string;
}

/**
 * What changed, and which document talks about that kind of thing.
 *
 * A static checklist asks an agent to remember what it did, which is precisely what an
 * agent does not reliably do — this repo has the evidence. Reading the diff turns
 * "think about the README" into "you changed package.json, and the README lists
 * commands".
 */
export const CONSEQUENCES: Consequence[] = [
  {
    touches: /^package\.json$/,
    obligation:
      'package.json changed — a new command belongs in the README Commands table and ' +
      'usually in TOOLBOX (src/agents/common.ts); a new dependency may belong in the ' +
      'README Stack list, and in docs/sources.md if an idea came with it',
  },
  {
    touches: /^src\/agents\/roles\//,
    obligation:
      'a role changed — check families and BROWSER_ACCESS in roles.ts, the README ' +
      'status row, and whether PLAN.md still says how many roles have never run',
  },
  {
    touches: /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
    obligation:
      'a skill changed — it must be declared by a role (roles.test.ts enforces it) ' +
      'and listed in .claude/skills/README.md and the README Practices paragraph',
  },
  {
    touches: /^src\/(cli|tools)\//,
    obligation:
      'a capability changed — if it is something a person or an agent would invoke, ' +
      'the README and TOOLBOX are where they will look for it',
  },
  {
    touches: /^\.env\.example$/,
    obligation:
      '.env.example changed — the README has repeated its values before, and was ' +
      'still recommending an AGENT_MAX_TURNS that had been deleted for good reason',
  },
  {
    touches: /^src\/qe\//,
    obligation:
      'a rule changed — does it have a mutation proving the test can fail, and does ' +
      'PLAN.md still describe it correctly under Proven or Not proven?',
  },
];

export interface PlanStamp {
  /** The hash `PLAN.md` names as its head, if it names one. */
  recorded: string | undefined;
  head: string;
  /** HEAD's parent; absent on a repository's first commit. */
  parent: string | undefined;
  planChangedInHead: boolean;
  /**
   * Whether `PLAN.md` is edited in the working tree, and so part of the commit being prepared.
   *
   * Without this the check **passes the very commit it then refuses.** CI proved it on
   * `3b8cea1`: HEAD was `e9bc107`, which had updated `PLAN.md`, so `planChangedInHead` was true
   * and the parent-stamp branch below called a stamp of `ba8acf3` fresh — while `PLAN.md` sat
   * modified on disk, naming the commit before the one it was about to be committed on top of.
   * The commit went out green locally and failed in CI, where the same rule read the committed
   * tree instead of the prepared one.
   *
   * It bites whenever two consecutive commits touch the plan, which is the normal rhythm of
   * this file, so the gap had been open for as long as the rule has.
   */
  planChangedInWorkingTree: boolean;
  /**
   * Whether **anything** is staged or modified — i.e. whether a commit is actually being
   * prepared.
   *
   * Without it this check could not tell "about to commit code without the plan" from "just
   * looking at a clean tree", and refusing the second would make the command unusable for
   * asking whether the plan is current. Undefined means the caller did not say, and the
   * permissive reading is taken — a check that refuses a question it was not asked is worse
   * than one that answers it.
   */
  dirtyWorkingTree?: boolean;
}

/**
 * Whether `PLAN.md` was checked against the tree being committed.
 *
 * **A file cannot contain the hash of the commit that includes it.** The first version
 * of this rule demanded the stamp equal HEAD, so it failed on every plan that had just
 * been updated and committed, and forced a hash bump before every later commit whether
 * anything had changed or not. A check that fires every time gets satisfied by editing
 * the hash, not by re-verifying the plan.
 *
 * So there are two fresh states: updated against HEAD and not yet committed, or updated
 * in HEAD itself and stamped with its parent. A code-only commit after a plan commit is
 * neither, and that is the drift worth refusing.
 *
 * **The parent-stamp state is only fresh while the plan is unedited.** Once `PLAN.md` is
 * modified in the working tree it belongs to the commit being prepared, whose parent will be
 * the current HEAD — so it must name HEAD, and a stamp of HEAD's parent is stale by one. Before
 * that distinction existed, this function approved a tree and then refused the commit made from
 * it, which is the worst thing a pre-commit check can do: it moves a failure from the desk,
 * where it costs a minute, to CI, where it costs a red build and a second commit.
 */
export function planFreshness(stamp: PlanStamp): { fresh: boolean; reason: string } {
  const { recorded, head, parent, planChangedInHead, planChangedInWorkingTree, dirtyWorkingTree } =
    stamp;
  if (recorded === undefined) {
    return { fresh: false, reason: 'PLAN.md names no head — expected: Head is `<sha>`' };
  }
  if (sameCommit(recorded, head)) {
    return { fresh: true, reason: `updated against HEAD ${head}` };
  }
  const sameAsParent = parent !== undefined && sameCommit(recorded, parent);
  if (sameAsParent && planChangedInHead && !planChangedInWorkingTree) {
    /**
     * Fresh as a **committed** state and stale as a **pending** one, which is the distinction
     * that let this rule fail CI twice.
     *
     * The committed tree at HEAD is fine: the plan was updated in HEAD and names its parent. But
     * a commit made from here with the plan untouched produces a tree where the stamp names the
     * grandparent and the latest commit did not update the plan — the code-only-commit case this
     * rule exists to refuse. CI then refuses what this command had just approved, which is the
     * worst thing a pre-commit check can do.
     *
     * It happened on `3b8cea1` with a dirty plan, which `planChangedInWorkingTree` fixed, and
     * again on `27cdbf9` with a clean one, which it did not. So the honest form of the check is
     * about the commit being prepared rather than the one that exists: **the plan must be part of
     * it and must name HEAD.** That is also what this file's own first line asks for — before
     * every commit, every fact re-verified — so the rule and the doctrine now agree.
     */
    if (dirtyWorkingTree === true) {
      return {
        fresh: false,
        reason:
          `it names ${recorded}, which is HEAD's parent, and this commit does not touch it. ` +
          `Once committed, ${recorded} becomes the grandparent and the plan reads as left behind ` +
          `— the code-only-commit case. Re-verify it and name ${head} as the head.`,
      };
    }
    return { fresh: true, reason: `updated in HEAD ${head}, stamped with its parent` };
  }
  if (sameAsParent && planChangedInHead && planChangedInWorkingTree) {
    return {
      fresh: false,
      reason:
        `it names ${recorded}, which is HEAD's parent, and it is edited again in the working ` +
        `tree. The commit you are about to make has ${head} as its parent, so the stamp is ` +
        `stale by one — name ${head} as the head.`,
    };
  }
  return {
    fresh: false,
    reason:
      `it names ${recorded}, HEAD is ${head}, and the latest commit did not update it. ` +
      `Re-run the commands, update what changed, delete what is no longer true, and ` +
      `name ${head} as the head.`,
  };
}

/** Short hashes of different lengths name the same commit when one prefixes the other. */
function sameCommit(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

/** Items that apply to any change at all, however small. */
export const ALWAYS = [
  'README — does the Status table still describe what is true, in both columns?',
  'PLAN.md — did anything move between Proven and Not proven?',
  'HANDOFF.md — did this work earn a trap, or make one stop being true?',
];

export function obligationsFor(changed: string[]): string[] {
  const derived = CONSEQUENCES.filter((rule) =>
    changed.some((file) => rule.touches.test(file)),
  ).map((rule) => rule.obligation);
  return [...derived, ...ALWAYS];
}
