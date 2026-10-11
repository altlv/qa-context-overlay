import { reportSkeleton } from '../qe/report-skeleton.js';

/**
 * Print a valid, empty exploratory report for a session to write out and then fill in.
 *
 * `npm run report-skeleton -- --target "<url> (test)" --author exploratory-tester > artifacts/run/report.md`
 *
 * Printed to stdout rather than written to a path, so the caller decides where it lands and
 * nothing here can overwrite a report a session already wrote — the failure of 2026-10-10, where
 * the runner's own fallback replaced a session's work, came from a harness writing to that path
 * without being asked.
 */

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const target = flag('--target');
const author = flag('--author');

if (target === undefined || author === undefined) {
  console.error(
    'Usage: npm run report-skeleton -- --target "<url> (<env>)" --author <role> ' +
      '[--explore "<what>"] [--timebox "<n> minutes"]\n' +
      '\n' +
      'Prints a report that passes `npm run check-report` with zero errors and no findings in it. ' +
      'Redirect it to artifacts/run/report.md at the start of a session, then rewrite that file as ' +
      'each finding is confirmed.',
  );
  process.exit(2);
}

process.stdout.write(
  reportSkeleton({
    target,
    author,
    // The real clock here, injected into the pure function so that one stays testable.
    date: new Date().toISOString().slice(0, 10),
    ...(flag('--explore') === undefined ? {} : { explore: flag('--explore')! }),
    ...(flag('--timebox') === undefined ? {} : { timebox: flag('--timebox')! }),
  }),
);
