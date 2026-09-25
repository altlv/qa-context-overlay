import '../env.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseReport } from '../qe/report.js';
import { cluster, summarise, type RunFinding } from '../qe/finding-union.js';

/**
 * `npm run findings -- <app>` — what every session against one app found between them.
 *
 * Single-run yield was the only number this harness produced, and two runs under one
 * charter returned seventeen findings each with neither set containing the other. The
 * union is the coverage; the findings only one session ever reached are the map of
 * where the role is still blind.
 */

const app = process.argv[2];
if (app === undefined) {
  console.error('usage: npm run findings -- <app>            e.g. npm run findings -- academybugs');
  process.exit(2);
}

const home = join('sessions', app);
if (!existsSync(home)) {
  console.error(`No kept sessions for "${app}". \`npm run sessions\` lists what there is.`);
  process.exit(1);
}

const findings: RunFinding[] = [];
const runs: string[] = [];

for (const entry of readdirSync(home).sort()) {
  const path = join(home, entry, 'report.md');
  if (!existsSync(path)) continue;
  const parsed = parseReport(readFileSync(path, 'utf8'));
  if (!parsed.ok) {
    // A report that will not parse is named, never skipped in silence: a run missing
    // from the union makes every number below look better than it is.
    console.error(`  ! ${entry}: report did not parse, so it is NOT in these numbers`);
    continue;
  }
  // Short, sortable, and enough to tell two runs on the same day apart.
  const run = entry
    .replace(/^exploratory-tester-/, '')
    .replace(/[TZ]/g, ' ')
    .trim()
    .slice(0, 16);
  runs.push(run);
  for (const finding of parsed.report.findings) {
    findings.push({
      run,
      id: finding.id,
      severity: finding.severity,
      summary: finding.summary,
      ...(finding.where === undefined ? {} : { where: finding.where }),
    });
  }
}

if (runs.length === 0) {
  console.error(`No readable reports under ${home}.`);
  process.exit(1);
}

const clusters = cluster(findings);
const summary = summarise(clusters, runs);

console.log(`\n${app}: ${runs.length} session(s), ${findings.length} finding(s) filed\n`);
console.log(`  UNION        ${summary.union} distinct — everything anyone has found`);
console.log(`  STABLE CORE  ${summary.core.length} — found by every session`);
console.log(
  `  SEEN ONCE    ${summary.singletons.length} — any other session would have missed these`,
);

console.log('\nWhat each session reached of the union:');
for (const { run, found, of } of summary.recall) {
  const percent = Math.round((found / of) * 100);
  console.log(`  ${run}  ${String(found).padStart(3)}/${of}  ${String(percent).padStart(3)}%`);
}

if (summary.core.length > 0) {
  console.log('\nFound by every session — what one run is reliably worth:');
  for (const entry of summary.core) {
    console.log(`  [${entry.severity}] ${entry.label.slice(0, 110)}`);
  }
}

console.log('\nSeen by one session only — the map of where the role is blind:');
for (const entry of summary.singletons.sort((a, b) => a.severity.localeCompare(b.severity))) {
  console.log(`  [${entry.severity}] (${entry.runs[0]}) ${entry.label.slice(0, 100)}`);
}

// Every merge, printed. Clustering is approximate and a silent merge invents agreement.
const merged = clusters.filter((entry) => entry.members.length > 1);
console.log(`\n${merged.length} cluster(s) merged from more than one filing — check these:`);
for (const entry of merged) {
  console.log(`  ${entry.members.map((m) => `${m.run}/${m.id}`).join(' = ')}`);
  for (const member of entry.members) console.log(`      ${member.summary.slice(0, 96)}`);
}
console.log('');
