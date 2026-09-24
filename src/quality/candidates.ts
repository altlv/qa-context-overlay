import { maskStringsAndComments } from './assertions.js';

/**
 * Which exported units are candidates for a unit test.
 *
 * Every other mechanical check in this repo judges tests that already exist —
 * `assert-quality` refuses a spec that asserts nothing, `fault-check` proves a spec
 * notices its server failing, `mutate` proves the harness's own rules are covered.
 * Nothing answers the question that comes first: which parts of this module hold
 * behaviour a unit test could pin, and which parts are I/O wearing a function signature.
 *
 * That judgement was being made by reading, which is how a pure method on an I/O class
 * gets excluded with the class around it — the mistake this file exists to prevent.
 *
 * **What it cannot see, and will not pretend to.** Reach is decided from the symbol's own
 * body, so a pure wrapper that calls a helper which reads a file is reported as a
 * candidate: the read is one call away, and no static scan of one body can follow it. A
 * symbol reached only through another symbol, a dynamic `require`, and a method injected at
 * runtime are all invisible here. Treat the output as a floor and a map, never as a
 * verdict. A `unit` line means "nothing in this body says otherwise", not "this is tested".
 */

export type CandidateKind = 'unit' | 'needs-control' | 'not-unit' | 'unknown';

export type SignalKind = 'io' | 'process' | 'clock' | 'random';

export interface Signal {
  kind: SignalKind;
  why: string;
  line: number;
}

export interface Candidate {
  /** `Class.method` for a method of an exported class. */
  name: string;
  kind: CandidateKind;
  line: number;
  signals: Signal[];
  /** Some test source names this symbol. A mention is not evidence that it is tested. */
  referenced: boolean;
  detail: string;
}

interface Declaration {
  name: string;
  line: number;
  start: number;
  body: [number, number] | null;
  parent: string | null;
}

const SIGNALS: { kind: SignalKind; pattern: RegExp; why: string }[] = [
  {
    kind: 'io',
    pattern:
      /\bfs\b|readFile|writeFile|readdir|readlink|existsSync|mkdir|rmSync|createReadStream|createWriteStream/,
    why: 'touches the filesystem',
  },
  {
    kind: 'io',
    pattern:
      /\bfetch\s*\(|node-fetch|\baxios\b|\bgot\s*\(|https?\.(?:get|request)\s*\(|require\(\s*['"](?:node:)?https?['"]/,
    why: 'crosses the network',
  },
  {
    kind: 'io',
    pattern: /child_process|\bspawn\s*\(|\bexecFile\b|\bfork\s*\(/,
    why: 'spawns a process',
  },
  {
    kind: 'io',
    pattern: /\b(?:sqlite|mongoose|sequelize|knex|mysql|redis|pg)\b|createClient\s*\(/,
    why: 'reaches a database or cache',
  },
  {
    kind: 'io',
    pattern: /require\(\s*['"]express['"]\s*\)|\bexpress\.Router\b/,
    why: 'builds an HTTP surface',
  },
  {
    kind: 'process',
    pattern: /process\.(?:exit|argv|env|cwd|kill|on)\b/,
    why: 'reads or writes process state',
  },
  {
    kind: 'clock',
    pattern: /\bDate\.now\b|\bnew Date\b|\bDate\.parse\b|performance\.now|process\.hrtime/,
    why: 'reads the clock',
  },
  {
    kind: 'random',
    pattern: /Math\.random|crypto\.randomUUID|randomBytes|\buuid\s*\(/,
    why: 'is not reproducible',
  },
];

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) if (source[i] === '\n') line += 1;
  return line;
}

/** The `{...}` range that opens after `from`, brace-matched in the masked copy. */
function braceBody(source: string, from: number): [number, number] | null {
  const open = source.indexOf('{', from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return [open, i];
    }
  }
  return null;
}

/** Index of the `)` that closes the parameter list opening at or after `from`. */
function paramsEnd(source: string, from: number): number {
  const open = source.indexOf('(', from);
  if (open === -1) return from;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return open;
}

/**
 * The body of a function or arrow declaration, or null when it cannot be delimited.
 *
 * An arrow with an expression body has no braces; taking the rest of the statement is
 * enough to see the signals in it, and a body that cannot be found is reported as
 * unknown rather than classified on the signals of its neighbours.
 */
function bodyOf(source: string, from: number): [number, number] | null {
  const arrow = source.indexOf('=>', from);
  const paren = source.indexOf('(', from);
  const brace = source.indexOf('{', from);
  if (brace !== -1 && (arrow === -1 || brace < arrow) && (paren === -1 || brace > paren)) {
    return braceBody(source, from);
  }
  if (arrow !== -1) {
    const next = source.slice(arrow + 2).search(/\S/);
    if (next === -1) return null;
    const at = arrow + 2 + next;
    if (source[at] === '{') return braceBody(source, at);
    const end = source.indexOf(';', at);
    return [at, end === -1 ? Math.min(at + 200, source.length) : end];
  }
  return null;
}

/** Words that are followed by a parenthesised condition, not by a method body. */
const KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'await',
  'do',
  'else',
  'try',
  'finally',
  'throw',
  'typeof',
  'delete',
  'new',
  'function',
  'const',
  'let',
  'var',
  'super',
  'this',
  'case',
  'break',
  'continue',
  'yield',
]);

function methodDeclarations(masked: string, parent: Declaration, bodyStart: number): Declaration[] {
  const methods: Declaration[] = [];
  const classBody = masked.slice(bodyStart, parent.body?.[1] ?? masked.length);
  // The `{` after the parameter list is what separates a method from a call: `flush()`
  // and `if (x)` both look like `name(...)` on an indented line, and reading them as
  // methods reported every branch in the file as a unit of its own.
  const pattern =
    /^[ \t]+(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm;
  for (const match of classBody.matchAll(pattern)) {
    const name = match[1] ?? '';
    if (KEYWORDS.has(name)) continue;
    // Offsets are relative to the sliced class body, not to the file. The brace must be
    // matched from the `{` the pattern consumed — starting one character later grabbed
    // the next block in the file, so every method body was attributed to its neighbour.
    const at = bodyStart + (match.index ?? 0);
    methods.push({
      name: `${parent.name}.${name}`,
      line: lineAt(masked, at),
      start: at,
      body: braceBody(masked, at + match[0].lastIndexOf('{')),
      parent: parent.name,
    });
  }
  return methods;
}

/** Every function, arrow, class and class method, exported or not. */
function declarations(masked: string): Declaration[] {
  const found: Declaration[] = [];

  for (const match of masked.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const at = match.index ?? 0;
    found.push({
      name: match[1] ?? '',
      line: lineAt(masked, at),
      start: at,
      // From the closing paren, so a default parameter holding an object literal is not
      // mistaken for the body.
      body: braceBody(masked, paramsEnd(masked, at)),
      parent: null,
    });
  }

  for (const match of masked.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) {
    const at = match.index ?? 0;
    const body = braceBody(masked, at + match[0].length);
    const declaration: Declaration = {
      name: match[1] ?? '',
      line: lineAt(masked, at),
      start: at,
      body,
      parent: null,
    };
    found.push(declaration);
    if (body) found.push(...methodDeclarations(masked, declaration, body[0]));
  }

  const arrows =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
  for (const match of masked.matchAll(arrows)) {
    const at = match.index ?? 0;
    found.push({
      name: match[1] ?? '',
      line: lineAt(masked, at),
      start: at,
      // From the declaration, so the search for `=>` finds this arrow rather than the
      // next one in the file.
      body: bodyOf(masked, at),
      parent: null,
    });
  }

  const assigned = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g;
  for (const match of masked.matchAll(assigned)) {
    const at = match.index ?? 0;
    found.push({
      name: match[1] ?? '',
      line: lineAt(masked, at),
      start: at,
      body: braceBody(masked, paramsEnd(masked, at)),
      parent: null,
    });
  }

  return found;
}

/** Names the module actually publishes, mapped to the local name behind each. */
function exportedNames(masked: string): Map<string, string> {
  const exported = new Map<string, string>();

  for (const match of masked.matchAll(/\bmodule\.exports\s*=\s*\{([\s\S]*?)\}/g)) {
    for (const entry of (match[1] ?? '').split(',')) {
      const [key, value] = entry.split(':').map((part) => part.trim());
      if (!key || !/^[A-Za-z_$][\w$]*$/.test(key)) continue;
      exported.set(key, value && /^[A-Za-z_$][\w$]*$/.test(value) ? value : key);
    }
  }

  for (const match of masked.matchAll(/\b(?:module\.exports|exports)\.([A-Za-z_$][\w$]*)\s*=/g)) {
    exported.set(match[1] ?? '', match[1] ?? '');
  }

  for (const match of masked.matchAll(
    /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    exported.set(match[1] ?? '', match[1] ?? '');
  }

  for (const match of masked.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const entry of (match[1] ?? '').split(',')) {
      const [local, alias] = entry.split(/\s+as\s+/).map((part) => part.trim());
      if (!local || !/^[A-Za-z_$][\w$]*$/.test(local)) continue;
      exported.set(alias && /^[A-Za-z_$][\w$]*$/.test(alias) ? alias : local, local);
    }
  }

  if (/\bexport\s+default\b/.test(masked)) exported.set('default', 'default');

  return exported;
}

/**
 * Classify every exported unit in one source file.
 *
 * `testSources` is the text of the tests that might reference a symbol — passed in rather
 * than read, so this stays a pure function of its input and can be tested without a
 * filesystem.
 */
export function analyzeCandidates(source: string, testSources: string[] = []): Candidate[] {
  const masked = maskStringsAndComments(source);
  const all = declarations(masked);
  const exported = exportedNames(masked);
  const candidates: Candidate[] = [];

  for (const [name, local] of exported) {
    const declared =
      all.find((d) => d.name === local && d.parent === null) ??
      all.find((d) => d.name === local) ??
      null;

    if (declared === null) {
      candidates.push({
        name,
        kind: 'unknown',
        line: 1,
        signals: [],
        referenced: false,
        detail: 'exported but no declaration found in this file — re-export, computed, or dynamic',
      });
      continue;
    }

    const members = declared.parent === null ? all.filter((d) => d.parent === declared.name) : [];
    for (const symbol of [declared, ...members]) {
      const signals: Signal[] = [];
      if (symbol.body !== null) {
        const body = masked.slice(symbol.body[0], symbol.body[1]);
        const offset = symbol.body[0];
        for (const rule of SIGNALS) {
          const hit = rule.pattern.exec(body);
          if (hit) {
            signals.push({
              kind: rule.kind,
              why: rule.why,
              line: lineAt(masked, offset + (hit.index ?? 0)),
            });
          }
        }
      }

      const blocking = signals.filter((s) => s.kind === 'io' || s.kind === 'process');
      const controlling = signals.filter((s) => s.kind === 'clock' || s.kind === 'random');
      const shortName = symbol.name.includes('.') ? (symbol.name.split('.')[1] ?? '') : symbol.name;

      candidates.push({
        name: symbol.name,
        kind:
          symbol.body === null
            ? 'unknown'
            : blocking.length > 0
              ? 'not-unit'
              : controlling.length > 0
                ? 'needs-control'
                : 'unit',
        line: symbol.line,
        signals,
        referenced: testSources.some((text) => new RegExp(`\\b${shortName}\\b`).test(text)),
        detail:
          symbol.body === null
            ? 'body not delimited — signals in it cannot be attributed'
            : blocking.length > 0
              ? blocking.map((s) => s.why).join('; ')
              : controlling.length > 0
                ? `${controlling.map((s) => s.why).join('; ')} — inject it to keep the test reproducible`
                : 'nothing in this body reaches outside it',
      });
    }
  }

  return candidates;
}

export function formatCandidates(file: string, candidates: Candidate[]): string {
  if (candidates.length === 0) return `${file}\n  no exported units found\n`;

  const lines = candidates.map((candidate) => {
    const signals = candidate.signals.map((s) => `${s.kind}@${s.line}`).join(' ');
    const tested = candidate.referenced ? 'named in tests' : 'not named in any test';
    return `  ${candidate.kind.padEnd(14)} ${candidate.name.padEnd(28)} line ${String(
      candidate.line,
    ).padEnd(5)} ${tested.padEnd(22)} ${signals}`;
  });

  const count = (kind: CandidateKind) => candidates.filter((c) => c.kind === kind).length;
  return [
    file,
    ...lines,
    `  ${candidates.length} exported unit(s): ${count('unit')} unit, ${count(
      'needs-control',
    )} needs-control, ${count('not-unit')} not-unit, ${count('unknown')} unknown`,
  ].join('\n');
}
