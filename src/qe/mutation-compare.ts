/**
 * The comparator: one mutation, a named suite, killed or survived — and whether a change made a
 * suite weaker.
 *
 * `npm run mutate` grades *this* repository's rules, because its mutation list lives inside its
 * own CLI and runs this repository's suites. It cannot grade a file an agent wrote, and it cannot
 * grade a subject at all: the subject's own `scripts/mutate-app.mjs` runs a fixed list of five
 * suite files, so a new file is not in it. That is the gap this closes — a named mutation set,
 * applied to a named suite command, wherever that suite lives.
 *
 * Restoring is not a detail here. A run that dies mid-mutation leaves the source broken, and a
 * source left broken looks exactly like a suite that caught the mutation. The caller restores in
 * a `finally` and once more at the end; this module only decides what to apply.
 */

export interface Mutation {
  /** Path relative to the repository under test. */
  file: string;
  find: string;
  replace: string;
  /** What rule this breaks, in words. A mutation that cannot name one is not worth running. */
  breaks: string;
}

export type SuiteOutcome = 'passed' | 'failed' | 'unstartable';

export interface MutationOutcome extends Mutation {
  killed: boolean;
}

/** One mutation applied to a source, or null when its anchor does not resolve to exactly one place. */
export function applyMutation(source: string, mutation: Mutation): string | null {
  const hits = source.split(mutation.find).length - 1;
  if (hits !== 1) return null;
  return source.replace(mutation.find, mutation.replace);
}

/**
 * Why an anchor was refused, or null when it is sound.
 *
 * An anchor matching several places is the same defect as one matching none: `String.replace`
 * takes the first, so the mutation lands somewhere other than the rule, and the score reports a
 * rule as checked that nothing checked. Two rules were silently unchecked this way until the
 * runner started refusing.
 */
export function anchorProblem(mutation: Mutation): string | null {
  if (mutation.breaks.trim() === '') return 'names no rule it breaks';
  if (mutation.find === '') return 'has an empty anchor';
  if (mutation.find === mutation.replace) return 'replaces the anchor with itself';
  return null;
}

/** Every mutation that must be run, with the problem that stops it or null. */
export function anchorProblems(mutations: readonly Mutation[]): string[] {
  return mutations
    .map((mutation) => {
      const problem = anchorProblem(mutation);
      return problem === null ? null : `${mutation.file}: ${mutation.breaks} — ${problem}`;
    })
    .filter((line): line is string => line !== null);
}

export function summarise(outcomes: readonly MutationOutcome[]): {
  killed: number;
  total: number;
  survivors: string[];
} {
  const survivors = outcomes.filter((outcome) => !outcome.killed).map((outcome) => outcome.breaks);
  return { killed: outcomes.length - survivors.length, total: outcomes.length, survivors };
}

/**
 * The survivors a second suite has that the first did not — §9's strength delta.
 *
 * A change to a test file may never leave the suite weaker than it found it, and the mechanical
 * form of that is `survivors(after) ⊆ survivors(before)`. Anything this returns is a mutation the
 * old suite caught and the new one does not: a rule that just stopped being tested, which is what
 * a deleted assertion looks like from the outside.
 */
export function newSurvivors(before: readonly string[], after: readonly string[]): string[] {
  const known = new Set(before);
  return after.filter((name) => !known.has(name));
}

export function formatCompare(label: string, outcomes: readonly MutationOutcome[]): string {
  const { killed, total, survivors } = summarise(outcomes);
  const lines = [`${label}: ${killed}/${total} killed`];
  for (const survivor of survivors) lines.push(`  survived: ${survivor}`);
  return lines.join('\n');
}

export interface CompareArgs {
  /** The module or JSON file holding the mutation set. */
  mutations: string | null;
  /** The repository to mutate, relative to the working directory. */
  repo: string;
  /** The command that runs the suite, as argv: everything after `--suite`. */
  suite: string[];
  /** A second suite command, for the strength delta: `survivors(against) ⊆ survivors(suite)`. */
  against: string[] | null;
  help: boolean;
}

/**
 * Flags are read by hand because a suite command is a list, not a string: splitting a command line
 * on spaces breaks on the first quoted path, and this repository has folders with spaces in them.
 * `--suite` and `--against` therefore swallow every following argument until the next flag *of this
 * command* — not until any `--` token, because the command being wrapped has flags of its own and
 * `node --test test/x.js` is the normal shape.
 */
const KNOWN_FLAGS = new Set(['--mutations', '--repo', '--suite', '--against', '--help']);

export function parseCompareArgs(argv: readonly string[]): CompareArgs {
  const args: CompareArgs = { mutations: null, repo: '.', suite: [], against: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--help') {
      args.help = true;
    } else if (arg === '--mutations' || arg === '--repo') {
      const value = argv[i + 1];
      if (value !== undefined && !KNOWN_FLAGS.has(value)) {
        if (arg === '--mutations') args.mutations = value;
        else args.repo = value;
        i += 1;
      }
    } else if (arg === '--suite' || arg === '--against') {
      const rest: string[] = [];
      let j = i + 1;
      while (j < argv.length && !KNOWN_FLAGS.has(argv[j] as string)) {
        rest.push(argv[j] as string);
        j += 1;
      }
      if (arg === '--suite') args.suite = rest;
      else args.against = rest;
      i = j - 1;
    }
  }
  return args;
}

/** What a mutation set must look like before anything is applied. */
export function readMutations(value: unknown): { mutations: Mutation[]; problems: string[] } {
  const problems: string[] = [];
  if (!Array.isArray(value)) {
    return { mutations: [], problems: ['the mutation set is not an array'] };
  }
  const mutations: Mutation[] = [];
  value.forEach((entry, index) => {
    const record = entry as Partial<Mutation> | null;
    const fields = ['file', 'find', 'replace', 'breaks'] as const;
    const missing = fields.filter(
      (field) => typeof record?.[field] !== 'string' || (record[field] as string).trim() === '',
    );
    if (record === null || typeof record !== 'object' || missing.length > 0) {
      problems.push(
        `entry ${index + 1} is not a mutation: ${missing.length > 0 ? `missing ${missing.join(', ')}` : 'not an object'}`,
      );
      return;
    }
    mutations.push({
      file: record.file as string,
      find: record.find as string,
      replace: record.replace as string,
      breaks: record.breaks as string,
    });
  });
  return { mutations, problems };
}
