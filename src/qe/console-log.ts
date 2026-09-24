/**
 * Reading the browser console as evidence, once our own noise is taken out of it.
 *
 * The console is the cheapest oracle a session has: an error thrown on every keystroke
 * costs nothing to notice and is a defect wherever it appears. Four live sessions
 * essentially ignored it, and the captured logs say why. Across those runs the harness
 * recorded **120 console errors, of which 116 were produced by its own origin guard** —
 * `ERR_BLOCKED_BY_CLIENT` on fonts, CDNs and the app's own backend, refused because the
 * run may reach one origin only.
 *
 * A session told to watch the console would have spent its attention on us. One of them
 * worked this out unaided and recorded the blocked fonts as "environment noise and not
 * a product finding", which was the right call and should not have been necessary.
 *
 * **A guard that pollutes the evidence channel it shares costs more than it looks.**
 * So: classify first, report the remainder, and never present our own refusals to a
 * session as though the product had produced them.
 */

export type ConsoleLevel = 'ERROR' | 'WARNING' | 'LOG' | 'INFO' | 'DEBUG';

export interface ConsoleEntry {
  /** Milliseconds from the capture's start, as the log records it. */
  atMs: number;
  level: ConsoleLevel;
  message: string;
  /** Where it came from, when the line carries one. */
  url: string | null;
}

/**
 * Why an entry is, or is not, evidence about the product.
 *
 * `consequence` is deliberately separate from `confinement`: a fetch that fails
 * because we blocked its host is our doing, but it reaches the console wearing the
 * product's clothes. Calling it `product` would manufacture defects; calling it
 * `confinement` would assert a cause we have not established. It is neither, and the
 * count is reported as an unknown rather than folded into whichever number flatters.
 */
export type Origin = 'confinement' | 'consequence' | 'product';

/** `[     944ms] [ERROR] message @ https://host/path:0` */
const LINE = /^\[\s*(\d+)ms\]\s*\[([A-Z]+)\]\s*(.*?)(?:\s+@\s+(\S+))?$/;

export function parseConsoleLog(text: string): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = LINE.exec(line.trim());
    if (match === null) continue;
    const level = (match[2] ?? '') as ConsoleLevel;
    entries.push({
      atMs: Number(match[1] ?? 0),
      level,
      message: (match[3] ?? '').trim(),
      url: match[4] ?? null,
    });
  }
  return entries;
}

/**
 * Whether the run's own confinement produced this, or the product did.
 *
 * `ERR_BLOCKED_BY_CLIENT` is definitive — nothing but a blocking client emits it, and
 * in a run the blocking client is us. A bare fetch failure is not: it looks identical
 * whether we refused the host or the server fell over, so it is reported as a
 * consequence and counted separately rather than guessed at.
 */
export function originOf(entry: ConsoleEntry): Origin {
  if (/ERR_BLOCKED_BY_CLIENT/i.test(entry.message)) return 'confinement';
  if (/^TypeError: Failed to fetch$|NetworkError|ERR_FAILED/i.test(entry.message)) {
    return 'consequence';
  }
  return 'product';
}

export interface ConsoleSummary {
  total: number;
  errors: number;
  warnings: number;
  /** Errors our own guard caused. Not evidence about anything but the harness. */
  fromConfinement: number;
  /** Errors that may be ours and may be the product's. Reported, never assumed. */
  unattributed: number;
  /** Errors the product produced. This is the number that means something. */
  fromProduct: ConsoleEntry[];
}

export function summariseConsole(entries: ConsoleEntry[]): ConsoleSummary {
  const errors = entries.filter((entry) => entry.level === 'ERROR');
  return {
    total: entries.length,
    errors: errors.length,
    warnings: entries.filter((entry) => entry.level === 'WARNING').length,
    fromConfinement: errors.filter((entry) => originOf(entry) === 'confinement').length,
    unattributed: errors.filter((entry) => originOf(entry) === 'consequence').length,
    fromProduct: errors.filter((entry) => originOf(entry) === 'product'),
  };
}

/**
 * What the runner prints, so a product-origin console error cannot pass unnoticed.
 *
 * The session may legitimately decide an error does not matter. It may not leave the
 * question unasked, and until now nothing made it visible either way.
 */
export function reportConsole(summary: ConsoleSummary): string[] {
  if (summary.total === 0) return ['Console: nothing captured.'];

  const lines = [
    `Console: ${summary.errors} error(s), ${summary.warnings} warning(s) in ${summary.total} message(s)`,
  ];
  if (summary.fromConfinement > 0) {
    lines.push(
      `  ${summary.fromConfinement} caused by this run's own origin guard — harness noise, not the product`,
    );
  }
  if (summary.unattributed > 0) {
    lines.push(
      `  ${summary.unattributed} network failure(s) that could be either — a refused host looks like a broken one`,
    );
  }

  if (summary.fromProduct.length === 0) {
    lines.push('  0 from the product itself.');
    return lines;
  }

  lines.push(
    `  ${summary.fromProduct.length} FROM THE PRODUCT — each is a finding until explained:`,
  );
  for (const entry of summary.fromProduct.slice(0, 10)) {
    const where = entry.url === null ? '' : ` @ ${entry.url}`;
    lines.push(`    [${entry.atMs}ms] ${entry.message}${where}`.slice(0, 160));
  }
  if (summary.fromProduct.length > 10) {
    lines.push(`    … and ${summary.fromProduct.length - 10} more`);
  }
  return lines;
}
