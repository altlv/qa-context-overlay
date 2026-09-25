/**
 * Whether the skills a run pays for actually reached the work.
 *
 * The runner inlines the full text of every skill a role declares — roughly 21k tokens
 * of the exploratory-tester's 85k system prompt — and for three runs the only thing
 * measuring that investment was a count of SKILL.md file reads. That count could never
 * be anything but zero: the composed prompt tells the agent the skills are already
 * present and not to open the files. It reported correct behaviour as a failure, and
 * the real question went unasked.
 *
 * The real question is not delivery, which is guaranteed, but **use** — did 21k tokens
 * of method change what the session did? Using a skill costs no tool call, so no
 * ledger of calls can see it. What it does leave behind is vocabulary: a session that
 * applied a decision table says so, and a session that did not cannot.
 *
 * So the methods are read out of the skill files themselves, at their numbered
 * headings, and matched against what the report claims. Extracting rather than listing
 * them is the point — a skill that grows a ninth technique is measured on nine the
 * next time it runs, and nobody has to remember to update a constant here.
 *
 * **This measures a claim, not a fact.** A report naming a decision table is evidence
 * the session had the idea, not proof it applied it well. That is still worth having:
 * across every session before `coverage.techniques` existed, the reports mentioned
 * boundary values repeatedly and equivalence partitioning, decision tables, state
 * transitions and pairwise not once.
 */

/** A method a skill teaches, as its own heading names it. */
export interface Method {
  /** The heading text, cleaned of its number and any trailing clause. */
  name: string;
  /** The words a report must carry to count as naming it. */
  needle: string;
}

/** `## 3. Decision tables` and `### 5. Probe the four failure shapes`. */
/**
 * Verbs that open an instruction rather than name a technique.
 *
 * A skill's numbered headings are two different things wearing one shape. Some name a
 * method — "Equivalence partitioning", "Decision tables", "Pairwise" — and a report
 * that used it will say the name. Others are steps in a procedure — "Write it",
 * "Reproduce and reduce", "Probe the four failure shapes" — and no report echoes those,
 * because they are instructions to the tester, not labels for what was done.
 *
 * Scoring a step is worse than skipping it in both directions. "Write it" is step 6 of
 * bug-report and it matched a report that never opened the skill, because prose reaches
 * for that phrase anyway — use claimed where there was none. And rule-modelling, whose
 * six headings are all steps, scored 0/6 against a session that demonstrably modelled a
 * rule, built a table and chose an independent oracle — use denied where there was some.
 *
 * Length cannot separate them: "Pairwise" is eight characters and a real method.
 * The grammar can. A heading that opens with an imperative verb is a step.
 */
const STEP_VERBS = new Set([
  'write',
  'reproduce',
  'find',
  'generalise',
  'generalize',
  'name',
  'assess',
  'recover',
  'choose',
  'enumerate',
  'probe',
  'test',
  'run',
  'check',
  'look',
  'decide',
  'read',
  'record',
  'report',
  'rank',
  'start',
  'keep',
  'make',
  'ask',
  'take',
  'pick',
  'apply',
]);

function isStep(name: string): boolean {
  const first = (name.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return STEP_VERBS.has(first);
}

const NUMBERED = /^#{2,3}\s+\d+\.\s+(.+?)\s*$/gm;

/**
 * The methods a skill teaches.
 *
 * A heading may carry an explanatory clause after a dash — "Sequence probes — what
 * static input testing cannot reach", "Pre-flight — five checks, under two minutes".
 * The clause is prose about the method, not part of its name, and matching on it would
 * make the needle unfindable in any report written by a human or a model.
 */
export function methodsTaught(skillText: string): Method[] {
  const methods: Method[] = [];
  for (const match of skillText.matchAll(NUMBERED)) {
    const heading = (match[1] ?? '').trim();
    const name = (heading.split(/\s+[—–-]\s+/)[0] ?? heading).trim();
    if (name === '') continue;
    if (isStep(name)) continue;
    const needle = name.toLowerCase();
    if (!methods.some((method) => method.needle === needle)) methods.push({ name, needle });
  }
  return methods;
}

export interface SkillUse {
  skill: string;
  /** Every method the skill teaches. */
  taught: string[];
  /** The ones the report names. */
  named: string[];
}

/**
 * Match loosely, and deliberately so.
 *
 * A report writes "equivalence partitioning on the quantity field", not the heading
 * verbatim. Requiring an exact heading would measure transcription rather than use.
 * The risk runs the other way — a short needle matching by accident — so a method
 * whose name is a single common word is matched only as a whole word.
 */
function names(text: string, method: Method): boolean {
  const haystack = text.toLowerCase();
  if (method.needle.includes(' ')) return haystack.includes(method.needle);

  // Whole-word only, checked by hand rather than by a built regex: the needle comes
  // from a heading somebody else writes, so it is untrusted input to a pattern.
  const isWordChar = (char: string): boolean => /[a-z0-9]/.test(char);
  let at = haystack.indexOf(method.needle);
  while (at !== -1) {
    const before = at === 0 ? '' : haystack[at - 1]!;
    const afterAt = at + method.needle.length;
    const after = afterAt >= haystack.length ? '' : haystack[afterAt]!;
    if (!isWordChar(before) && !isWordChar(after)) return true;
    at = haystack.indexOf(method.needle, at + 1);
  }
  return false;
}

/**
 * What the report says about the methods each skill teaches.
 *
 * `read` is injected so the measurement can be tested against fixed text, but the
 * runner passes the real files: the whole value is that the vocabulary comes from the
 * skills as they are now, not from a list written once and left behind.
 */
/**
 * The text a measurement should look at.
 *
 * Findings declare the method that produced them, and that declaration is the strong
 * signal: it is short, it is deliberate, and it survives a skill whose headings are
 * steps rather than names. The surrounding prose is kept alongside it as a weak
 * signal, because a session may apply a technique and describe it without ever filling
 * the field, and counting that as nothing would understate the skills on every report
 * written before the field existed.
 */
export function searchable(report: { findings?: { method?: string }[] }, prose: string): string {
  const declared = (report.findings ?? [])
    .map((finding) => finding.method ?? '')
    .filter((method) => method !== '');
  return [...declared, prose].join('\n');
}

export function skillUse(
  skills: string[],
  reportText: string,
  read: (skill: string) => string,
): SkillUse[] {
  return skills.map((skill) => {
    let taught: Method[];
    try {
      taught = methodsTaught(read(skill));
    } catch {
      // A skill we cannot read is reported as teaching nothing, rather than failing the
      // run. The gate has already passed by the time this prints.
      taught = [];
    }
    return {
      skill,
      taught: taught.map((method) => method.name),
      named: taught.filter((method) => names(reportText, method)).map((method) => method.name),
    };
  });
}

/**
 * What the runner prints.
 *
 * Skills that teach no numbered method are left out entirely. Several are dispositional
 * rather than procedural — honesty-check and work-discipline shape how a session
 * behaves, not which technique it reaches for — and listing them with an empty score
 * would read as a shortfall in the session instead of a fact about the skill.
 */
export function reportSkillUse(uses: SkillUse[]): string[] {
  const procedural = uses.filter((use) => use.taught.length > 0);
  if (procedural.length === 0) return [];

  const lines = ['Skill methods the report names (a claim of use, not proof of it):'];
  for (const use of procedural) {
    const score = `${use.named.length}/${use.taught.length}`;
    lines.push(
      use.named.length === 0
        ? `  ${use.skill}: ${score} — nothing from this skill reached the report`
        : `  ${use.skill}: ${score} — ${use.named.join(', ')}`,
    );
  }
  const silent = procedural.filter((use) => use.named.length === 0).length;
  if (silent > 0) {
    lines.push(
      `  ${silent} of ${procedural.length} procedural skill(s) left no trace. They are inlined` +
        ' on every run whether or not that changes.',
    );
  }
  return lines;
}
