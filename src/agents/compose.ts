import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONVENTIONS, TEST_LEVELS } from './common.js';
import { subjectConventions, subjectLevels, type SubjectRun } from './subject-prompt.js';

/**
 * A role's prompt as the agent receives it: the role's own text, plus the full text of
 * every skill it declares.
 *
 * A role's `skills` field never reached a top-level run — `runAgent` is handed a system
 * prompt and a tool list, and the field only means something to a subagent, if even
 * there under `settingSources: []`. So a skill loaded only if the agent chose to spend
 * a turn reading the file its "Load:" line named. On 2026-09-11 `oracle-check` held
 * the exact oracle a session needed and went unread for exactly that reason.
 *
 * Injected, not indexed: the runner puts the text in, so reading a skill is never a
 * decision the agent can skip. It costs tokens on every run, and that cost is the
 * price of the skill being there.
 *
 * Given a `subject`, the two sections describing *this* repository's stack are replaced by
 * the subject's own. Replaced, not overridden underneath: a role told to import
 * `src/fixtures/harness.js` and then told to ignore that is reading a contradiction, and the
 * plan's acceptance test asks for the Playwright instruction to be absent, not subordinated.
 */

const REPO = fileURLToPath(new URL('../../', import.meta.url));

export const SKILLS_HEADING = '# Skills loaded for this run';

export function skillFile(name: string): string {
  return `.claude/skills/${name}/SKILL.md`;
}

function readFromRepo(path: string): string {
  return readFileSync(`${REPO}${path}`, 'utf8');
}

function withoutFrontmatter(text: string): string {
  // A byte-order mark would stop the frontmatter matching. Checked by char code, as
  // parseReport does, because the character is invisible wherever it is written.
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return cleaned.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
}

/**
 * The role's prompt with this repository's stack sections replaced by the subject's.
 *
 * Matched on the exported constants themselves. They are interpolated verbatim into every
 * coder's prompt, so the replacement is exact; a rewrite of eight role files to parameterise
 * the same two strings would be the copy that drifts.
 */
function forSubject(prompt: string, subject: SubjectRun): string {
  return prompt
    .replace(CONVENTIONS, subjectConventions(subject))
    .replace(TEST_LEVELS, subjectLevels(subject));
}

/**
 * The skills a run will actually inline, from the role's own list and an operator's subset.
 *
 * **Why this is a capability rather than a hand edit.** The skills are the most expensive thing
 * in a run: nine of them inline into a ~316k-token system prompt, charged as cache reads on every
 * message. Measured on 2026-10-07, the first complete run's own accounting said
 * `exploratory-session: 0/3`, `test-techniques: 0/8`, `risk-assessment: 0/1` — two of five
 * procedural skills left no trace in the report at all. The README leads with "context the agent
 * is given rather than pays to re-derive", and most of that context did not reach the output.
 *
 * So the comparison worth running is nine skills against three, and it has to be repeatable to
 * mean anything — a temporary edit to a role file produces a number nobody can reproduce. Item 87.
 *
 * **A subset only, never an addition.** Granting a skill the role does not declare would be
 * measuring a different role, and `roles.test.ts` enforces that every skill is declared by one.
 * An unknown name is refused rather than ignored, because a typo that silently changed nothing
 * would read as "the skills made no difference".
 */
export function skillsFor(
  declared: readonly string[],
  wanted: readonly string[] | null,
): { skills: string[]; refused: string[] } {
  if (wanted === null) return { skills: [...declared], refused: [] };
  const refused = wanted.filter((name) => !declared.includes(name));
  return { skills: declared.filter((name) => wanted.includes(name)), refused };
}

export function composeSystemPrompt(
  role: AgentDefinition,
  read: (path: string) => string = readFromRepo,
  subject?: SubjectRun,
  only?: readonly string[] | null,
): string {
  const prompt = subject === undefined ? role.prompt : forSubject(role.prompt, subject);
  const skills = skillsFor(role.skills ?? [], only ?? null).skills;
  if (skills.length === 0) return prompt;

  const sections = skills.map((name) => {
    const path = skillFile(name);
    let text: string;
    try {
      text = read(path);
    } catch (error) {
      throw new Error(
        `role declares skill "${name}" but ${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return `## Skill: ${name}\n\n_From ${path}._\n\n${withoutFrontmatter(text)}`;
  });

  return [
    prompt,
    SKILLS_HEADING,
    'The runner put the full text of every skill this role declares below. Where your instructions say "Load:" a skill, it is already here — do not spend a turn reading its SKILL.md. Files a skill points to beyond its SKILL.md, such as patterns, are not included; read those when you need them.',
    ...sections,
  ].join('\n\n');
}

/** Every role composed, for delegation: a subagent gets its skills the same way. */
export function composeRoles(
  roles: Record<string, AgentDefinition>,
  read: (path: string) => string = readFromRepo,
  subject?: SubjectRun,
): Record<string, AgentDefinition> {
  return Object.fromEntries(
    Object.entries(roles).map(([name, role]) => [
      name,
      { ...role, prompt: composeSystemPrompt(role, read, subject) },
    ]),
  );
}
