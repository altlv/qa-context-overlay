/**
 * Does any test notice if this function stops working?
 *
 * **The failure this answers, five times in one week.** A test passed while the thing its title
 * named was broken, because it asserted a neighbour:
 *
 * 1. The runner's no-look handover branch was unreachable for a commit, while a unit test of
 *    `handoverLine`'s output *for that branch's shape* stayed green.
 * 2. `trapsFocus` destroyed the focus it promised to restore for as long as it existed; the suite
 *    tested `classifySurface`, which consumes the boolean it returns.
 * 3. `exploratory-session: 0/3` was reported four times as a finding, against needles no report
 *    could contain.
 * 4. A repo-wide guard I wrote passed without testing anything, because I scoped it to one role's
 *    skills and the worst-affected skill belonged to no role in that list.
 * 5. A live probe of `stopHook` passed while the shipped hook was broken — it drove a hand-written
 *    imitation.
 *
 * Every one was found by hand: break the thing, see whether anything goes red. That routine works
 * and it does not scale, so this is it mechanised.
 *
 * **Two poisons, because they answer different questions and the pair is the point.**
 *
 * - `throw` replaces a body with a throw. A suite that stays green has **no test that reaches
 *   this function at all** — cases 1 and 2 above.
 * - `empty` replaces a body with nothing, so the function returns `undefined`. A suite that stays
 *   green has tests that call it and **do not depend on what it returns** — which is the shape of
 *   asserting a neighbour: the call happens, and the assertion is about something else.
 *
 * Reached-but-return-ignored is the interesting verdict, and no single mutation shows it.
 *
 * **What this is not.** It is not mutation testing: a body that throws is not a plausible defect,
 * and killing it proves reachability rather than correctness. `mutation-compare` is the tool for
 * "would this suite notice a realistic fault", and it needs a mutation set written by hand. This
 * needs nothing, which is why it can run on a module nobody has prepared.
 */

/**
 * How a function is broken. Two kinds, because they answer different questions — see the header.
 *
 * `throw` makes the body throw; `empty` makes it return undefined. Named for what it does to the
 * code rather than for the practice it belongs to: the practice is poison testing, and
 * `src/qe/gate-poison.ts` already owns that word for the gate.
 */
export type BreakKind = 'throw' | 'empty';

/**
 * Exported function declarations, in source order.
 *
 * Declarations only. An exported `const f = () => …` is not matched, and saying so is better than
 * matching it badly: an arrow body may be an expression rather than a block, so replacing it needs
 * a different edit and a regex that tried both would mangle one of them. The CLI reports what it
 * could not reach, so a module of arrow exports is not silently scored as clean.
 */
export function exportedFunctions(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
    const name = match[1];
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Find the body of a named function declaration: the index just after its `{`, and of its `}`.
 *
 * Counted by brace depth rather than matched by a pattern, because a function body contains
 * braces. Strings, template literals, comments and regexes are skipped — a `{` inside a string
 * would otherwise unbalance the count and the poison would land somewhere arbitrary, which is the
 * one failure mode that would make this tool lie about a whole module.
 */
function bodyOf(source: string, name: string): { open: number; close: number } | null {
  const declaration = new RegExp(
    `^export\\s+(?:async\\s+)?function\\s+${name}\\s*(?:<[^>]*>)?\\s*\\(`,
    'm',
  );
  const found = declaration.exec(source);
  if (found === null) return null;

  // Walk from the declaration to the `{` that opens the body, skipping the parameter list and any
  // return type, both of which can contain braces of their own.
  let index = found.index + found[0].length;
  let depth = 1; // inside the parameter list
  let open = -1;
  while (index < source.length) {
    const char = source[index];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        /**
         * Past the parameters — but the next `{` is not necessarily the body.
         *
         * **This is where the first version lied.** A return type may itself be an object type,
         * and prettier puts its closing brace in column zero:
         *
         *     export function parseSitemap(xml: string): {
         *       urls: string[];
         *       isIndex: boolean;
         *     } {
         *
         * Taking the first brace replaced the *type annotation*, which types-stripped away to
         * nothing, so the function kept working and the tool reported "no test depends on what it
         * returns" for three exports whose tests assert exactly that. A hand-check caught it; the
         * tool had no way to.
         *
         * The rule that holds: consume balanced `{…}` groups while the next thing after one is
         * another `{`. The last brace in that run opens the body. It handles `: string {`,
         * `: { a: b } {` and `: Promise<{ a: b }> {` alike, because it never has to decide what a
         * type *is* — only whether another block follows.
         */
        let scan = index + 1;
        let typeDepth = 0;
        let candidate = -1;
        while (scan < source.length) {
          const next = source[scan];
          if (next === '<' || next === '(' || next === '[') typeDepth += 1;
          else if (next === '>' || next === ')' || next === ']') typeDepth -= 1;
          else if (next === '{' && typeDepth <= 0) {
            candidate = scan;
            const closed = matchingBrace(source, scan);
            if (closed === -1) break;
            let after = closed + 1;
            while (after < source.length && /\s/.test(source[after] ?? '')) after += 1;
            // Another block follows, so what we just consumed was the return type.
            if (source[after] === '{') {
              scan = after;
              continue;
            }
            break;
          }
          scan += 1;
        }
        open = candidate;
        break;
      }
    }
    index += 1;
  }
  if (open === -1) return null;

  let braces = 0;
  for (let scan = open; scan < source.length; scan += 1) {
    const char = source[scan];
    const pair = source.slice(scan, scan + 2);
    if (pair === '//') {
      scan = source.indexOf('\n', scan);
      if (scan === -1) return null;
      continue;
    }
    if (pair === '/*') {
      scan = source.indexOf('*/', scan) + 1;
      if (scan === 0) return null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      scan = endOfString(source, scan);
      if (scan === -1) return null;
      continue;
    }
    if (char === '{') braces += 1;
    else if (char === '}') {
      braces -= 1;
      if (braces === 0) return { open, close: scan };
    }
  }
  return null;
}

/**
 * The index of the `}` that closes the `{` at `start`, or -1.
 *
 * Skips strings, templates and comments for the same reason the body scan does: a brace inside a
 * string would unbalance the count, and a poison that landed on the strength of a miscount is the
 * one failure that would make this tool lie about a whole module rather than one export.
 */
function matchingBrace(source: string, start: number): number {
  let braces = 0;
  for (let scan = start; scan < source.length; scan += 1) {
    const char = source[scan];
    const pair = source.slice(scan, scan + 2);
    if (pair === '//') {
      scan = source.indexOf('\n', scan);
      if (scan === -1) return -1;
      continue;
    }
    if (pair === '/*') {
      const end = source.indexOf('*/', scan);
      if (end === -1) return -1;
      scan = end + 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      scan = endOfString(source, scan);
      if (scan === -1) return -1;
      continue;
    }
    if (char === '{') braces += 1;
    else if (char === '}') {
      braces -= 1;
      if (braces === 0) return scan;
    }
  }
  return -1;
}

/** The index of the quote that closes the string starting at `start`, or -1. */
function endOfString(source: string, start: number): number {
  const quote = source[start];
  for (let scan = start + 1; scan < source.length; scan += 1) {
    if (source[scan] === '\\') {
      scan += 1;
      continue;
    }
    if (source[scan] === quote) return scan;
  }
  return -1;
}

/**
 * The module with one export's body replaced, or null when its body could not be located.
 *
 * Null rather than a best effort: a poison that landed in the wrong place would report a whole
 * module as untested on the strength of an edit nobody can see.
 */
export function breakExport(source: string, name: string, kind: BreakKind): string | null {
  const body = bodyOf(source, name);
  if (body === null) return null;
  const replacement =
    kind === 'throw'
      ? "{\n  throw new Error('poisoned: nothing should reach this');\n}"
      : '{\n  // poisoned: returns undefined\n}';
  return source.slice(0, body.open) + replacement + source.slice(body.close + 1);
}

export interface ExportSensitivity {
  name: string;
  /** Did the suite fail with the body throwing? */
  reached: boolean;
  /** Did the suite fail with the body returning undefined? */
  returnMattered: boolean;
  /** Set when a poison could not be applied, in which case nothing was measured. */
  skipped: string | null;
}

/**
 * What a verdict means, in words a person can act on.
 *
 * The four combinations are genuinely different findings and the names matter more than the
 * booleans: "reached, return ignored" is the one that found four of this week's five.
 */
export function describeSensitivity(verdict: ExportSensitivity): string {
  if (verdict.skipped !== null) {
    return `${verdict.name}: NOT MEASURED — ${verdict.skipped}`;
  }
  /**
   * Every verdict is scoped to the tests that were run, and says so.
   *
   * The runner picks the test files that import the module, which is a heuristic: a module reached
   * only through a CLI that an integration test spawns is not in that set. `formatCrawl` is exactly
   * that case — the first run reported it unreached, and the honest claim is narrower, because the
   * integration test that runs its CLI was never among the files executed. An unqualified "no test
   * reaches it" would be the same overstatement this tool exists to catch.
   */
  if (!verdict.reached) {
    return (
      `${verdict.name}: INSENSITIVE — no test that ran reaches it. Its body was replaced with a ` +
      `throw and they stayed green, so none of them calls it, whatever they are named after. A ` +
      `caller elsewhere — a CLI an integration test spawns — would not show up here.`
    );
  }
  if (!verdict.returnMattered) {
    return (
      `${verdict.name}: INSENSITIVE to its return value. Something calls it and asserts about ` +
      `something else, which is the shape of asserting a neighbour: emptying the body changed ` +
      `nothing the tests look at.`
    );
  }
  return (
    `${verdict.name}: covered — the tests that ran fail both when it throws and when it returns ` +
    `nothing.`
  );
}

/** The headline: how many exports no test would notice breaking. */
export function summariseSensitivity(verdicts: readonly ExportSensitivity[]): string[] {
  const measured = verdicts.filter((verdict) => verdict.skipped === null);
  const unreached = measured.filter((verdict) => !verdict.reached);
  const ignored = measured.filter((verdict) => verdict.reached && !verdict.returnMattered);
  const skipped = verdicts.filter((verdict) => verdict.skipped !== null);

  const lines = [
    `${measured.length} export(s) measured: ${unreached.length} insensitive (never reached), ` +
      `${ignored.length} insensitive to its return value, ` +
      `${measured.length - unreached.length - ignored.length} covered.`,
  ];
  if (skipped.length > 0) {
    lines.push(
      `${skipped.length} not measured — these are NOT clean results, nothing was tried: ` +
        `${skipped.map((verdict) => verdict.name).join(', ')}.`,
    );
  }
  return lines;
}
