import '../env.js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  commandsNamedIn,
  obligationsFor,
  pathsNamedIn,
  planFreshness,
  uncataloguedSkills,
  undocumentedCommands,
} from '../qe/housekeeping.js';

/**
 * The housekeeping pass, run before a commit.
 *
 * Documentation drifts because nothing checks it. In one session the README ended up
 * recommending an `AGENT_MAX_TURNS=12` that the same session had deleted for silently
 * overriding every role's budget, telling people `npm run role` "needs a key" after a
 * measurement proved it does not, and listing ten of the twelve skills. None of that
 * was carelessness; it was a document nobody had a reason to open.
 *
 * A checklist in a file would be skipped the same way. So this is a command, and the
 * mechanical half of it exits non-zero.
 *
 * **What it cannot check is listed too.** "Needs a key" was a true sentence that
 * became false — no scanner catches that, so the judgement half is printed rather
 * than enforced. Printing it at the moment of the commit is the point: it is the one
 * moment someone is already looking.
 */

const FAILURES: string[] = [];

function fail(check: string, detail: string): void {
  FAILURES.push(`${check}\n    ${detail}`);
}

/**
 * Planning documents are exempt, and deliberately.
 *
 * A plan names things that do not exist — that is what a plan is. The first run of
 * this command flagged `.ai/state/triage.json`, `apps/todo-fixture/coverage.md` and
 * `npm run plan:facts`, all three of which are queue items *because* they are
 * missing. Checking it would train everyone to ignore this command.
 *
 * Exempt by class rather than by list: `PLAN.md` covers the repository and a `POC-*.md`
 * covers one piece of work, and a proof of concept names the files it has not reached yet
 * as the point of it. The brief for such a piece names a conditional deliverable that may
 * be the right decision *not* to produce — the `test-doubles` skill was deliberately not
 * split out — and a checker insisting it exist would be arguing against the judgement the
 * document asks for.
 */
const EXEMPT = /^\.ai\/state\/(?:PLAN|POC-[A-Za-z0-9-]+)\.md$/;

/**
 * The documents to check: every tracked `.md`, or the ones named as arguments.
 *
 * The argument form exists for the tests. They used to stage drift by appending to a
 * real tracked file and restoring it afterwards, which left the repo dirty the first
 * time something interrupted them — and `npm run mutate` runs this suite against
 * deliberately broken source, so an interruption was not a risk but a certainty.
 * A test that can corrupt the repository it is testing is the wrong test.
 */
function documentsToCheck(): string[] {
  const named = process.argv.slice(2).filter((argument) => argument.endsWith('.md'));
  if (named.length > 0) return named;

  return execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8', windowsHide: true })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !EXEMPT.test(file.replace(/\\/g, '/')));
}

/**
 * NodeNext makes a relative import carry a `.js` extension while the file on disk is
 * `.ts`, and `docs/conventions.md` requires exactly that. So `src/fixtures/harness.js`
 * is a correct thing for a document to say and a wrong thing to look for on disk.
 */
function resolves(path: string): boolean {
  if (existsSync(path)) return true;
  return path.endsWith('.js') && existsSync(path.replace(/\.js$/, '.ts'));
}

// ---------------------------------------------------------------- mechanical

const scripts = new Set<string>(
  Object.keys(
    (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> })
      .scripts ?? {},
  ),
);

for (const file of documentsToCheck()) {
  const text = readFileSync(file, 'utf8');

  const deadCommands = [...new Set(commandsNamedIn(text))].filter((name) => !scripts.has(name));
  if (deadCommands.length > 0) {
    fail(`${file} names commands that do not exist`, deadCommands.join(', '));
  }

  // Relative links resolve against the file's own directory, which this does not
  // model — only repo-rooted paths are checked, and that is where renames bite.
  const deadPaths = [...new Set(pathsNamedIn(text))].filter((path) => !resolves(path));
  if (deadPaths.length > 0) {
    fail(`${file} points at paths that do not exist`, deadPaths.join(', '));
  }
}

function git(...argv: string[]): string {
  return execFileSync('git', argv, { encoding: 'utf8', windowsHide: true }).trim();
}

const head = git('rev-parse', '--short', 'HEAD');
let parent: string | undefined;
let planChangedInHead = false;
try {
  parent = git('rev-parse', '--short', 'HEAD~1');
  planChangedInHead = git('diff', '--name-only', 'HEAD~1', 'HEAD')
    .split('\n')
    .some((file) => file.trim() === '.ai/state/PLAN.md');
} catch {
  // A repository's first commit has no parent; only the HEAD form can be fresh.
  parent = undefined;
}

// Staged and unstaged both: either way the file is part of the commit being prepared, whose
// parent will be HEAD — so a stamp of HEAD's parent is stale by one. Without this the check
// approved `3b8cea1` and CI then refused it.
// Whether a commit is being prepared at all. A clean tree is somebody asking whether the plan
// is current; a dirty one is somebody about to commit, and that is when the plan must name HEAD.
const dirtyWorkingTree = git('status', '--porcelain') !== '';

const planChangedInWorkingTree = git('status', '--porcelain', '--', '.ai/state/PLAN.md') !== '';

const recorded = /Head is `([0-9a-f]+)`/.exec(readFileSync('.ai/state/PLAN.md', 'utf8'))?.[1];
const planStatus = planFreshness({
  recorded,
  head,
  parent,
  planChangedInHead,
  planChangedInWorkingTree,
  dirtyWorkingTree,
});
if (!planStatus.fresh) {
  fail('PLAN.md is not current', planStatus.reason);
}

/**
 * Commands deliberately absent from the README, each with a reason.
 *
 * The alternative to a list like this is a blanket rule, and a blanket rule here would
 * demand a README entry for `typecheck` and `format:check` — parts that `check`
 * composes and nobody runs alone. It would cry wolf on ten commands to catch the one
 * that matters, and then get ignored.
 */
const INTERNAL: Record<string, string> = {
  posttest: 'an npm hook, not a command — it archives the run that  just finished',
  typecheck: 'composed by `check`; nobody runs it alone',
  lint: 'composed by `check`',
  'lint:fix': 'composed by `check`',
  format: 'composed by `check`',
  'format:check': 'composed by `check`',
  'test:unit': 'a --project variant of `test`',
  'test:watch': 'interactive UI; agents are told not to run it',
  'test:failed': 'a --last-failed variant of `test`',
  'serve:fixture': 'started automatically by the Playwright config',
};

// -------------------------------------------- capability without documentation

const readme = readFileSync('README.md', 'utf8');
const undocumented = undocumentedCommands([...scripts], readme, INTERNAL);
if (undocumented.length > 0) {
  fail(
    'commands exist that the README never mentions',
    `${undocumented.join(', ')} — add each to the Commands table, or to INTERNAL in ` +
      'this file with the reason it does not belong there. Adding a capability and ' +
      'not saying so is the drift that this whole command exists for, and it caught ' +
      '`precommit` itself on the run that introduced it.',
  );
}

const SKILLS_DIR = '.claude/skills';
const skillNames = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(SKILLS_DIR, entry.name, 'SKILL.md')))
  .map((entry) => entry.name);

const uncatalogued = uncataloguedSkills(
  skillNames,
  readFileSync(join(SKILLS_DIR, 'README.md'), 'utf8'),
);
if (uncatalogued.length > 0) {
  fail(
    'skills exist that the catalogue never lists',
    `${uncatalogued.join(', ')} — add each to .claude/skills/README.md. A test already ` +
      'proves no skill is orphaned by a role; being loadable is not the same as being ' +
      'findable by a person.',
  );
}

// ---------------------------------------------------------------- judgement

function changedFiles(): string[] {
  const args = [
    ['diff', '--name-only', 'HEAD'],
    ['ls-files', '--others', '--exclude-standard'],
  ];
  return [
    ...new Set(
      args.flatMap((argv) =>
        execFileSync('git', argv, { encoding: 'utf8', windowsHide: true })
          .split('\n')
          .map((line) => line.trim().replace(/\\/g, '/'))
          .filter(Boolean),
      ),
    ),
  ];
}

const JUDGEMENT = obligationsFor(changedFiles());

console.log('Pre-commit housekeeping\n');

if (FAILURES.length > 0) {
  console.log('Checked and wrong:\n');
  for (const failure of FAILURES) console.log(`  ✗ ${failure}\n`);
} else {
  console.log('  ✓ every command named in a tracked .md exists');
  console.log('  ✓ every repo path named in a tracked .md exists');
  console.log('  ✓ every command and every skill is documented somewhere findable');
  console.log(`  ✓ PLAN.md is current — ${planStatus.reason}\n`);
}

console.log('Not checkable — read these yourself:\n');
for (const item of JUDGEMENT) console.log(`  · ${item}`);
console.log(
  '\n"npm run role needs a key" was a true sentence that quietly became false.\n' +
    'No scanner catches that kind of drift; a person reading the line does.\n',
);

if (FAILURES.length > 0) {
  console.error(`${FAILURES.length} housekeeping problem(s). Fix them before committing.`);
  process.exit(1);
}
