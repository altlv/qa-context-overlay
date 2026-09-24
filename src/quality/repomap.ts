import { analyzeCandidates, type Candidate } from './candidates.js';

/**
 * A map of the repository under test: what exists, what uses what, what is tested, and
 * where nothing is.
 *
 * The unit-testing skill shapes one test; `candidates` classifies one file's exports.
 * Neither can answer the question that opens a piece of work — *what am I standing in?*
 * For a change, that means the file itself plus its callers and callees; for an
 * integration test, it means the neighbours a unit shares I/O behaviour with. Reading the
 * tree to find that out costs a whole context and is done again on every run.
 *
 * **What it cannot see, and will not pretend to.** These are imports, not calls: a
 * function can reach anything through a variable, a factory, or injection, and none of
 * that leaves an edge here. A dynamic `require` or a computed export resolves to
 * `unresolved` rather than a guess. A test file that merely *names* a source file is
 * recorded as a mention, which is weaker evidence than importing it and is labelled
 * differently for that reason. No parser is involved: the extraction is lexical, so
 * unusual syntax degrades to "not seen" instead of being silently misread.
 *
 * Every function here takes text and an `exists` predicate rather than reading a
 * filesystem, so the whole map is a pure function of its inputs and can be tested on
 * fixtures of three lines.
 */

export interface SourceFile {
  /** Repo-relative, forward slashes. */
  path: string;
  text: string;
}

export interface SurveyArgs {
  roots: string[];
  tests: string | null;
  changed: string | null;
  save: string | null;
}

/**
 * Parse the survey's arguments.
 *
 * Here rather than in the CLI so it can be tested without spawning a process. The first
 * version marked the argument after an absent flag as consumed — `indexOf` returns -1 and
 * -1 + 1 is 0 — so `survey <path>` swallowed the path, mapped the current directory and
 * reported success. A tool whose purpose is to say what you are standing in cannot be
 * wrong about where to look.
 */
export function parseSurveyArgs(argv: string[]): SurveyArgs {
  const value = (name: string): string | null => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };

  const consumed = new Set(
    ['tests', 'changed', 'save']
      .map((name) => argv.indexOf(`--${name}`))
      .filter((index) => index !== -1)
      .map((index) => index + 1),
  );

  return {
    roots: argv.filter((arg, i) => !arg.startsWith('--') && !consumed.has(i)),
    tests: value('tests'),
    changed: value('changed'),
    save: value('save'),
  };
}

export interface RepoFile {
  path: string;
  /** Local files this one imports. */
  imports: string[];
  /** Local files that import this one — the callers a change puts at risk. */
  importedBy: string[];
  /** Test files that import this one. */
  testedBy: string[];
  /** Test files that name this file's basename without importing it. Weaker evidence. */
  mentionedBy: string[];
  /** Local specifiers that point at a real file outside the roots this run was given. */
  outside: string[];
  /** Local specifiers that resolved to nothing at all — a broken path. */
  unresolved: string[];
  /** Non-local specifiers: the outside world this file depends on. */
  external: string[];
  symbols: Candidate[];
}

export interface RepoMap {
  files: RepoFile[];
  /** Local specifiers in the repository that point at no file at all. */
  brokenImports: { from: string; specifier: string }[];
  gaps: { path: string; why: string }[];
}

export interface Scope {
  changed: string[];
  callers: string[];
  callees: string[];
}

/**
 * Blanks comments only, preserving offsets and newlines.
 *
 * `maskStringsAndComments` from the quality module masks strings *and* comments, which is
 * right for judging the shape of code and wrong here: an import specifier lives inside a
 * string, so that masker would erase exactly what this reads.
 */
function maskComments(source: string): string {
  let out = '';
  let quote: string | null = null;
  let block = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] ?? '';
    const next = source[i + 1] ?? '';
    if (block) {
      if (char === '*' && next === '/') {
        out += '  ';
        i += 1;
        block = false;
      } else {
        out += char === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (quote !== null) {
      // A single or double quoted string cannot span a line, so a newline ends it whether
      // or not a closing quote was seen. This matters because a regex literal contains
      // quote characters — `['"]` inside a pattern opened a string here, and the rest of
      // the file was then read as string content. That is how this tool reported nonsense
      // for its own source, and why the rule is here rather than left to the reader.
      if (char === '\n' && quote !== '`') {
        quote = null;
        out += char;
        continue;
      }
      out += char;
      if (char === '\\') {
        out += next;
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      out += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      out += '  ';
      i += 1;
      block = true;
      continue;
    }
    out += char;
  }
  return out;
}

const SPECIFIERS: RegExp[] = [
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\bimport\s+[^;\n]*?from\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*['"]([^'"\n]+)['"]/g,
  /\bexport\s+[^;\n]*?from\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
];

/** Every module specifier a file names, de-duplicated, comments ignored. */
export function extractSpecifiers(source: string): string[] {
  const text = maskComments(source);
  const found = new Set<string>();
  for (const pattern of SPECIFIERS) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      // A module specifier never contains whitespace. A capture that does came from a
      // quote character inside a regex literal being read as a string delimiter, and
      // reporting it would invent an import that does not exist.
      if (specifier && !/\s/.test(specifier)) found.add(specifier);
    }
  }
  return [...found];
}

export function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/** Splits a repo-relative path into the directory part and the file name. */
function splitPath(path: string): { dir: string; base: string } {
  const cut = path.lastIndexOf('/');
  return cut === -1
    ? { dir: '', base: path }
    : { dir: path.slice(0, cut), base: path.slice(cut + 1) };
}

function normalise(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      // A leading `..` has nothing to cancel. Dropping it pointed every resolution of a
      // path outside the scanned root at a file that does not exist, so an import of a
      // real sibling reported as unresolved.
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
      else parts.push('..');
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

const SWAPPED_EXTENSION: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
  '.ts': ['.js'],
};

/**
 * The file a local specifier points at, or null.
 *
 * The extension swap is not decoration: this repo's own TypeScript is NodeNext ESM, where
 * `./assertions.js` in a `.ts` file means `assertions.ts`. Without it every internal edge
 * in the harness's own source would be reported as broken.
 */
export function resolveSpecifier(
  fromPath: string,
  specifier: string,
  exists: (path: string) => boolean,
): string | null {
  const { dir } = splitPath(fromPath);
  const target = normalise(dir === '' ? specifier : `${dir}/${specifier}`);

  const candidates: string[] = [target];
  const dot = target.lastIndexOf('.');
  const slash = target.lastIndexOf('/');
  const extension = dot > slash ? target.slice(dot) : '';
  for (const swap of SWAPPED_EXTENSION[extension] ?? []) {
    candidates.push(`${target.slice(0, dot)}${swap}`);
  }
  if (extension === '') {
    for (const suffix of ['.js', '.ts', '.mjs', '.cjs', '.mts', '.cts', '.json']) {
      candidates.push(`${target}${suffix}`);
    }
  }
  for (const suffix of ['.js', '.ts', '.mjs', '.cjs', '.mts', '.cts', '.json']) {
    candidates.push(`${target}/index${suffix}`);
  }

  return candidates.find((candidate) => exists(candidate)) ?? null;
}

/**
 * Build the map from source text and test text.
 *
 * `tests` are separated from `sources` because the map needs to distinguish "a test
 * imports this" from "a test mentions this", and because a test file has no business
 * appearing in the gap list as untested code.
 */
export function buildRepoMap(
  sources: SourceFile[],
  tests: SourceFile[],
  onDisk?: (path: string) => boolean,
): RepoMap {
  const known = new Set(sources.map((file) => file.path));
  const exists = (path: string): boolean => known.has(path);
  const testTexts = tests.map((file) => file.text);

  const files: RepoFile[] = sources.map((source) => {
    const specifiers = extractSpecifiers(source.text);
    const local = specifiers.filter(isLocalSpecifier);
    const external = specifiers.filter((specifier) => !isLocalSpecifier(specifier));

    const imports: string[] = [];
    const outside: string[] = [];
    const unresolved: string[] = [];
    for (const specifier of local) {
      const resolved = resolveSpecifier(source.path, specifier, exists);
      if (resolved !== null) {
        if (resolved !== source.path) imports.push(resolved);
      } else if (onDisk && resolveSpecifier(source.path, specifier, onDisk) !== null) {
        // A real file, outside the roots this run was given: not a broken path, just an
        // edge the map cannot follow.
        outside.push(specifier);
      } else {
        unresolved.push(specifier);
      }
    }

    const testedBy: string[] = [];
    const mentionedBy: string[] = [];
    const base = splitPath(source.path).base.replace(/\.[cm]?[jt]sx?$/, '');
    for (const test of tests) {
      const localSpecifiers = extractSpecifiers(test.text).filter(isLocalSpecifier);
      const importsThis = localSpecifiers.some(
        (specifier) => resolveSpecifier(test.path, specifier, exists) === source.path,
      );
      if (importsThis) testedBy.push(test.path);
      else if (base.length > 2 && new RegExp(`\\b${base}\\b`).test(test.text)) {
        mentionedBy.push(test.path);
      }
    }

    return {
      path: source.path,
      imports: [...new Set(imports)].sort(),
      importedBy: [],
      testedBy,
      mentionedBy,
      outside: [...new Set(outside)].sort(),
      unresolved,
      external: [...new Set(external)].sort(),
      symbols: analyzeCandidates(source.text, testTexts),
    };
  });

  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const file of files) {
    for (const dependency of file.imports) byPath.get(dependency)?.importedBy.push(file.path);
  }
  for (const file of files) file.importedBy.sort();

  // A local import that points at no file in the set is either a broken path or a file
  // this run was not given. Both are worth naming; neither is worth guessing at.
  const brokenImports = files.flatMap((file) =>
    file.unresolved.map((specifier) => ({ from: file.path, specifier })),
  );

  const gaps = files
    .filter((file) => file.testedBy.length === 0 && file.mentionedBy.length === 0)
    .map((file) => ({
      path: file.path,
      why:
        file.importedBy.length === 0
          ? 'nothing imports it and no test names it — dead code, an entry point, or an orphan'
          : `imported by ${file.importedBy.length} file(s) and named by no test`,
    }));

  return { files, brokenImports, gaps };
}

/** The changed files plus one hop in each direction: the work in front of you. */
export function scopeOf(map: RepoMap, changed: string[]): Scope {
  const byPath = new Map(map.files.map((file) => [file.path, file]));
  const changedFiles = changed.filter((path) => byPath.has(path)).sort();
  const callers = new Set<string>();
  const callees = new Set<string>();

  for (const path of changedFiles) {
    const file = byPath.get(path);
    for (const caller of file?.importedBy ?? []) callers.add(caller);
    for (const callee of file?.imports ?? []) callees.add(callee);
  }
  for (const path of changedFiles) {
    callers.delete(path);
    callees.delete(path);
  }

  return { changed: changedFiles, callers: [...callers].sort(), callees: [...callees].sort() };
}

function formatFile(file: RepoFile, marker: string): string[] {
  const symbols = file.symbols.map((symbol) => {
    const tested = symbol.referenced ? 'named' : 'unnamed';
    return `${symbol.kind.padEnd(14)} ${symbol.name} (${tested})`;
  });
  return [
    `${marker} ${file.path}`,
    ...(file.importedBy.length > 0 ? [`    used by:  ${file.importedBy.join(', ')}`] : []),
    ...(file.imports.length > 0 ? [`    uses:     ${file.imports.join(', ')}`] : []),
    ...(file.testedBy.length > 0 ? [`    tested by: ${file.testedBy.join(', ')}`] : []),
    ...(file.testedBy.length === 0 && file.mentionedBy.length > 0
      ? [`    mentioned by (not imported): ${file.mentionedBy.join(', ')}`]
      : []),
    ...(file.external.length > 0 ? [`    outside:  ${file.external.join(', ')}`] : []),
    ...(file.outside.length > 0
      ? [`    outside the scanned roots: ${file.outside.join(', ')}`]
      : []),
    ...(file.unresolved.length > 0 ? [`    unresolved: ${file.unresolved.join(', ')}`] : []),
    ...symbols.map((line) => `    ${line}`),
  ];
}

/** The whole map, or one change's scope when a scope is given. */
export function formatRepoMap(map: RepoMap, scope?: Scope): string {
  const lines: string[] = [];

  if (scope) {
    lines.push(
      `Scope: ${scope.changed.length} changed, ${scope.callers.length} caller(s), ${scope.callees.length} callee(s)`,
      '',
    );
    const byPath = new Map(map.files.map((file) => [file.path, file]));
    for (const path of scope.changed) {
      const file = byPath.get(path);
      if (file) lines.push(...formatFile(file, 'changed '), '');
    }
    for (const path of scope.callers) {
      const file = byPath.get(path);
      if (file) lines.push(...formatFile(file, 'caller  '), '');
    }
    for (const path of scope.callees) {
      const file = byPath.get(path);
      if (file) lines.push(...formatFile(file, 'callee  '), '');
    }
  } else {
    for (const file of map.files) lines.push(...formatFile(file, 'file    '), '');
  }

  lines.push(`${map.files.length} source file(s), ${map.gaps.length} with no test pointing at it.`);
  if (map.brokenImports.length > 0) {
    lines.push(
      'Imports that resolved to nothing:',
      ...map.brokenImports.map((entry) => `  ${entry.from} → ${entry.specifier}`),
    );
  }
  if (map.gaps.length > 0) {
    lines.push('No test points at:', ...map.gaps.map((gap) => `  ${gap.path} — ${gap.why}`));
  }

  lines.push(
    '',
    'Imports are not calls: a function can reach anything through a variable, a factory or',
    'injection, and the graph will not show it. A mention in a test is weaker than an import',
    'and is labelled as such. Extraction is lexical, so unusual syntax is missed rather than',
    'misread — read the file before trusting an edge that decides where a test goes.',
  );

  return lines.join('\n');
}
