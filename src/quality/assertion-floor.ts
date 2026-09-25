import { maskStringsAndComments } from './assertions.js';

/**
 * The assertion floor for a subject's tests — the part of the gate that applies whatever
 * the stack.
 *
 * `analyzeSpec` reads Playwright specs: `expect(`, `page.goto(`, `network.waitForCall(`.
 * A subject we do not own writes `node:test` and `assert/strict`, so every rule there
 * reads nothing and reports no findings — which is indistinguishable from a clean file.
 * This is the check that survives the subject being swapped, and the rule it carries is
 * the one AD3 names: **every test must hold at least one assertion that the code under
 * test can change the outcome of**.
 *
 * A floor, not a review. It decides three things mechanically — no assertion at all, an
 * assertion that only runs when a branch is taken, and an assertion on a literal that no
 * input can falsify — and every other judgement is left to a reader. What it cannot see
 * is exported beside it rather than left to be inferred from a silent pass.
 */

export type FloorKind = 'no-assertion' | 'conditional-only' | 'constant-assertion';

export interface FloorFinding {
  kind: FloorKind;
  testName: string;
  line: number;
  detail: string;
}

export interface FloorReport {
  /** Declarations judged against the floor. Zero is not a pass — nothing was read. */
  tests: number;
  /** Declarations marked skip/todo/fixme. Excluded, because a test that never runs has not passed. */
  skipped: number;
  assertions: number;
  findings: FloorFinding[];
}

/**
 * What this floor does not read, said out loud.
 *
 * Printed on every run, passing or failing, because a floor that reports "OK" and means
 * "I read nothing you would need to worry about" is the failure this project keeps
 * meeting: a verification that cannot fail reports as checked.
 */
export const FLOOR_BLIND_SPOTS: string[] = [
  'only call-shaped assertions are read — a helper that wraps one, such as expectOk(response), is invisible here',
  'an assertion inside a callback is read as unconditional, so items.forEach(() => assert(x)) passes this floor even when the collection is empty',
  'an assertion behind a ternary, x ? assert(a) : assert(b), is read as unconditional',
  'a value the test computed for itself is above this floor: nothing here says an asserted value came from the code under test',
];

/** A test declaration, without its arguments: the call is matched, the body read from it. */
const DECL = /(?<![\w.$])(?:test|it)(?:\.(?!describe\b)[\w$]+)*\s*\(/g;

/** Something whose contents run only when a condition holds. */
const CONTROL = /\b(?:if|for|while|switch|catch)\s*\(/g;

/**
 * A call, so its root identifier can be compared with the names a stack asserts through.
 * The lookbehind rejects `x.assert(` and the `.toBe(` half of `expect(x).toBe(y)`, which is
 * a continuation of an assertion rather than another one.
 */
const ASSERTION = /(?<![\w.$])([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;

const LITERAL =
  /^(?:true|false|null|undefined|NaN|[-+]?(?:\d+(?:\.\d+)?|\.\d+)|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`$\\]*`)$/;

/**
 * The names a stack asserts through, from the line its config declares.
 *
 * `const assert = require('node:assert/strict')` and `import { expect } from '@playwright/test'`
 * both reduce to the identifier a test file calls, which is the only fact this floor needs
 * from the stack. The two universal names are always in the set, so a stack that declares
 * nothing still gets read.
 */
export function assertionNames(declaration?: string): string[] {
  const names = new Set(['assert', 'expect']);
  if (declaration === undefined) return [...names];
  for (const pattern of [
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/,
    /\{\s*([A-Za-z_$][\w$]*)/,
    /^\s*import\s+([A-Za-z_$][\w$]*)\s+from/m,
  ]) {
    const name = pattern.exec(declaration)?.[1];
    if (name !== undefined) names.add(name);
  }
  return [...names];
}

function matchDelimiter(code: string, open: number, opener: string, closer: string): number | null {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const char = code[i];
    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return null;
}

const matchParen = (code: string, open: number): number | null =>
  matchDelimiter(code, open, '(', ')');

/**
 * Where the statement or block starting at `from` ends.
 *
 * A branch is conditional whether or not it has braces, so `if (x) assert(y)` must be read
 * as guarded — the shape a person writes when they know the value may be absent, which is
 * exactly the shape that asserts nothing on the run where it is.
 */
function statementEnd(code: string, from: number): number {
  let i = from;
  while (i < code.length && /\s/.test(code[i] as string)) i += 1;

  const nested = /^(?:if|for|while|switch)\b\s*\(/.exec(code.slice(i));
  if (nested !== null) {
    const close = matchParen(code, i + nested[0].length - 1);
    return close === null ? code.length : statementEnd(code, close + 1);
  }

  if (code[i] === '{') {
    const close = matchDelimiter(code, i, '{', '}');
    return close === null ? code.length : close + 1;
  }

  let depth = 0;
  for (; i < code.length; i += 1) {
    const char = code[i];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === '}') {
      if (depth === 0) return i;
      depth -= 1;
    } else if (char === ';' && depth === 0) return i + 1;
  }
  return code.length;
}

/** Ranges in a test body whose contents run only if a condition holds. */
function conditionalRanges(code: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const match of code.matchAll(CONTROL)) {
    const close = matchParen(code, match.index + match[0].length - 1);
    if (close === null) continue;

    const bodyStart = close + 1;
    const bodyEnd = statementEnd(code, bodyStart);
    ranges.push([bodyStart, bodyEnd]);

    // The consequent is marked above; an `else` after it is a second guarded branch.
    if (/^if\b/.test(match[0])) {
      let elseAt = bodyEnd;
      while (elseAt < code.length && /\s/.test(code[elseAt] as string)) elseAt += 1;
      if (code.startsWith('else', elseAt)) {
        const branchStart = elseAt + 'else'.length;
        ranges.push([branchStart, statementEnd(code, branchStart)]);
      }
    }
  }
  return ranges;
}

/** Arguments of a call, split at top-level commas. */
function splitArguments(code: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < code.length; i += 1) {
    const char = code[i];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(code.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(code.slice(start));
  return parts.filter((part) => part.trim() !== '');
}

/**
 * Whether every argument of an assertion, and of the chain hung off it, is a literal.
 *
 * `assert.equal(1, 1)` and `expect(true).toBe(true)` cannot fail for any input, so they
 * are a test that runs green forever. Read in the masked copy, so a string's *contents*
 * are blank wherever they appear and a quoted literal is still recognised as one.
 */
function isConstant(code: string, open: number): boolean {
  const groups: [number, number][] = [];
  let close = matchParen(code, open);
  if (close === null) return false;
  groups.push([open, close]);

  for (;;) {
    let at = close + 1;
    while (at < code.length && /\s/.test(code[at] as string)) at += 1;
    if (code[at] !== '.') break;
    const name = /^\.[A-Za-z_$][\w$]*/.exec(code.slice(at));
    if (name === null) break;
    let open2 = at + name[0].length;
    while (open2 < code.length && /\s/.test(code[open2] as string)) open2 += 1;
    if (code[open2] !== '(') break;
    const close2 = matchParen(code, open2);
    if (close2 === null) break;
    groups.push([open2, close2]);
    close = close2;
  }

  const parts = groups.flatMap(([from, to]) => splitArguments(code.slice(from + 1, to)));
  return parts.length > 0 && parts.every((part) => LITERAL.test(part.trim()));
}

/** The test's name: its first argument when that is a string, read from the raw text. */
function testNameAt(raw: string, code: string, from: number): string | null {
  let at = from;
  while (at < code.length && /\s/.test(code[at] as string)) at += 1;
  const quote = raw[at];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  const close = raw.indexOf(quote, at + 1);
  if (close === -1) return null;
  return raw.slice(at + 1, close);
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

/**
 * Every test in a file, held to the floor.
 *
 * Structure is located in the masked copy so a `test(...)` written inside a fixture string
 * is not read as one — this repository's own quality tests carry example specs as strings,
 * and a gate that fires on those teaches people to ignore it.
 */
export function analyzeAssertionFloor(
  source: string,
  options: { assertions?: string } = {},
): FloorReport {
  const code = maskStringsAndComments(source);
  const names = new Set(assertionNames(options.assertions));
  const findings: FloorFinding[] = [];
  let tests = 0;
  let skipped = 0;
  let assertions = 0;

  for (const declaration of code.matchAll(DECL)) {
    let open = declaration.index + declaration[0].length - 1;
    let close = matchParen(code, open);
    if (close === null) continue;

    // `it.each([...])(...)` calls the case from a table, so the first argument list holds
    // the data and the second is the case. Read as one, the table is an empty body and every
    // table-driven test is reported as asserting nothing — a detector firing on correct code,
    // which is how a gate teaches people to ignore it.
    if (/\.each\b/.test(declaration[0])) {
      let next = close + 1;
      while (next < code.length && /\s/.test(code[next] as string)) next += 1;
      if (code[next] !== '(') continue;
      open = next;
      close = matchParen(code, open);
      if (close === null) continue;
    }

    // A skipped or todo case never runs, so it cannot pass having asserted nothing. Judging
    // it would fail a run over a declaration the agent did not write and cannot act on.
    if (/\.(?:skip|todo|fixme)\b/.test(declaration[0])) {
      skipped += 1;
      continue;
    }
    tests += 1;

    // The body is the whole argument list: a callback with no braces returns a promise
    // instead of opening a block, and reading for `=> {` would skip that test silently.
    const body = code.slice(open + 1, close);
    const line = lineAt(source, declaration.index);
    const name = testNameAt(source, code, open + 1) ?? `(unnamed case at line ${line})`;

    const guarded = conditionalRanges(body);
    const calls: { at: number; open: number }[] = [];
    for (const call of body.matchAll(ASSERTION)) {
      if (!names.has(call[1] as string)) continue;
      calls.push({ at: call.index, open: call.index + call[0].length - 1 });
    }
    assertions += calls.length;

    if (calls.length === 0) {
      findings.push({
        kind: 'no-assertion',
        testName: name,
        line,
        detail:
          'No assertion call — this test cannot fail on a regression, whatever the code does.',
      });
      continue;
    }

    const unguarded = calls.filter(
      (call) => !guarded.some(([from, to]) => from <= call.at && call.at < to),
    );
    if (unguarded.length === 0) {
      findings.push({
        kind: 'conditional-only',
        testName: name,
        line,
        detail:
          'Every assertion is inside a conditional or a loop, so the test passes having ' +
          'asserted nothing whenever that branch is not taken.',
      });
      continue;
    }

    // Judged on the whole test, not on the unguarded calls: an assertion on a literal is
    // not made meaningful by another one beside it being constant too.
    if (calls.every((call) => isConstant(body, call.open))) {
      findings.push({
        kind: 'constant-assertion',
        testName: name,
        line,
        detail:
          `Assert${calls.length === 1 ? 's' : ''} only on literal values, which no input can ` +
          'falsify. Assert something the code under test produced.',
      });
    }
  }

  return { tests, skipped, assertions, findings };
}

export function formatFloorFindings(file: string, report: FloorReport): string {
  if (report.findings.length === 0) return `${file}: OK`;
  return report.findings
    .map((f) => `${file}:${f.line}  [${f.kind}] ${f.testName}\n    ${f.detail}`)
    .join('\n');
}
