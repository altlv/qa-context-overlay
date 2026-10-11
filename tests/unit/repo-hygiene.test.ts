import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Guards the class of bug that broke the first CI run: a file that exists locally,
 * is silently gitignored, and therefore does not exist on a fresh checkout. Every
 * check passed on the developer machine and the pipeline failed on a path that was
 * never committed.
 */

function isIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isTracked(path: string): boolean {
  const out = execFileSync('git', ['ls-files', '--', path], { encoding: 'utf8' });
  return out.trim().length > 0;
}

/** Paths the CI workflow passes to a script. If one is missing, the job dies. */
function pathsReferencedByCi(): string[] {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const paths = new Set<string>();
  for (const match of workflow.matchAll(/run:\s*npm run [\w:-]+ -- ([^\s]+)/g)) {
    const candidate = match[1];
    if (candidate !== undefined && !candidate.startsWith('-')) paths.add(candidate);
  }
  return [...paths];
}

test.describe('repo hygiene', () => {
  test('every path the CI workflow references should exist', () => {
    const referenced = pathsReferencedByCi();
    expect(referenced.length, 'expected CI to reference at least one path').toBeGreaterThan(0);
    for (const path of referenced) {
      expect(existsSync(path), `CI references ${path}, which does not exist`).toBe(true);
    }
  });

  test('every path the CI workflow references should be committed', () => {
    for (const path of pathsReferencedByCi()) {
      expect(isIgnored(path), `CI references ${path}, but .gitignore excludes it`).toBe(false);
      expect(isTracked(path), `CI references ${path}, but it is not tracked by git`).toBe(true);
    }
  });

  // Regression: `.gitignore` had `reports/` with no leading slash, which git matches
  // at any depth — so it silently swallowed examples/reports/ as well.
  test('the reports ignore rule should be anchored to the repo root', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    expect(
      gitignore.includes('/reports/'),
      'anchor the rule as /reports/ — an unanchored reports/ also ignores examples/reports/',
    ).toBe(true);
    expect(isIgnored('examples/reports'), 'examples/reports must not be ignored').toBe(false);
  });

  test('the worked example report should be committed', () => {
    const example = 'examples/reports/testability-countdown-timer.md';
    expect(existsSync(example)).toBe(true);
    expect(isTracked(example), 'the example is what CI validates the format against').toBe(true);
  });

  // The example report cites this scan as its evidence. A report citing a file that
  // does not exist is the exact failure the report format exists to prevent.
  test('evidence cited by the example report should exist', () => {
    const report = readFileSync('examples/reports/testability-countdown-timer.md', 'utf8');
    for (const match of report.matchAll(/(apps\/[\w-]+\/scans\/[\w.-]+\.json)/g)) {
      const cited = match[1] as string;
      expect(existsSync(cited), `the example report cites ${cited}, which does not exist`).toBe(
        true,
      );
      expect(isTracked(cited), `${cited} is cited as evidence but is not committed`).toBe(true);
    }
  });
});

test.describe('npm scripts', () => {
  // Two scripts rotted unnoticed when files moved: serve:fixture still pointed at
  // fixtures-app/ after the per-app restructure, and test:example at a tests/example
  // directory that no longer existed. Both fail only when someone runs them.
  test('every script should point at a path that exists', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    const stale: string[] = [];
    for (const [name, command] of Object.entries(pkg.scripts)) {
      const match = /(?:tsx|node|playwright test)\s+([^\s]+)/.exec(command);
      const target = match?.[1];
      if (target === undefined || target.startsWith('-') || !/[/.]/.test(target)) continue;
      if (!existsSync(target)) stale.push(`${name} -> ${target}`);
    }

    expect(
      stale,
      `these scripts reference paths that no longer exist: ${stale.join(', ')}`,
    ).toEqual([]);
  });

  test('README should not promise a command that package.json does not define', () => {
    const scripts = Object.keys(
      (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> })
        .scripts,
    );
    // Digits belong in the class: `a11y` is a legal script name, and without `0-9` this read it
    // as a command called `a` and failed on a command that exists. `precommit`'s own extractor
    // allows them, so the two disagreed — which is the more interesting half of the bug.
    const promised = [...readFileSync('README.md', 'utf8').matchAll(/`npm run ([a-z0-9:-]+)/g)].map(
      (m) => m[1] as string,
    );
    const missing = [...new Set(promised)].filter((name) => !scripts.includes(name));

    expect(missing, `README documents commands that do not exist: ${missing.join(', ')}`).toEqual(
      [],
    );
  });
});
