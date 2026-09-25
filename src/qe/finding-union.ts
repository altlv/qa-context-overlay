/**
 * What five sessions against one target found between them, and what only one ever saw.
 *
 * Two runs under the same charter returned seventeen defect claims each and neither
 * set contained the other: one found a cart overcharging by a flat $100, the other
 * found an unescaped SQL LIKE pattern and a compromised third-party script, and each
 * missed what the other had. Read one run at a time, that looks like noise. Read
 * together, it is the only honest picture of coverage this target has.
 *
 * A session starts blind to every session before it, so the harness has been measuring
 * single-run yield and calling it progress. The numbers that matter are different:
 *
 *  - the **union** — everything anyone has ever found, which is the real coverage
 *  - the **stable core** — what every run finds, which is what a single run is worth
 *  - the **singletons** — found once across every session, and therefore the things
 *    that would have been missed entirely by any other run
 *
 * The singletons are the point. A finding that only one session in five reached is not
 * a lucky accident to be admired; it is evidence about what the other four were not
 * looking at, and the cheapest description of where this role is still blind.
 *
 * **Matching is approximate and says so.** Two sessions describe one defect in
 * different words, and nothing in a report identifies a finding across runs. So
 * findings are clustered on the words they share and every merge is printed for a
 * person to overrule. A silent merge would invent agreement, and a silent miss would
 * inflate the union — both would make the measurement read better than it is.
 */

export interface RunFinding {
  run: string;
  id: string;
  severity: string;
  summary: string;
  where?: string;
}

export interface Cluster {
  /** The longest summary in the cluster, as the label a person reads. */
  label: string;
  severity: string;
  /** Which runs found it, deduplicated. */
  runs: string[];
  members: RunFinding[];
}

/**
 * Words that carry no signal about which defect is being described.
 *
 * Deliberately short. An aggressive list would strip the domain words two reports
 * genuinely share — "cart", "price", "sort" — and turn a real match into a miss.
 */
const NOISE = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'its',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'from',
  'that',
  'this',
  'these',
  'those',
  'as',
  'no',
  'not',
  'any',
  'all',
  'every',
  'each',
  'one',
  'two',
  'has',
  'have',
  'had',
  'does',
  'do',
  'did',
  'so',
  'than',
  'then',
  'there',
  'their',
  'while',
  'when',
  'which',
  'what',
  'who',
  'they',
  'them',
  'you',
  'your',
  'can',
  'cannot',
  'will',
  'would',
  'never',
  'always',
  'own',
  'same',
  'other',
  'into',
  'out',
]);

/** The content words a finding is matched on. */
export function fingerprint(finding: Pick<RunFinding, 'summary' | 'where'>): Set<string> {
  const text = `${finding.summary} ${finding.where ?? ''}`.toLowerCase();
  const words = text.split(/[^a-z0-9$.]+/).filter((word) => {
    if (word.length < 3) return false;
    if (NOISE.has(word)) return false;
    return true;
  });
  return new Set(words);
}

/** Jaccard overlap, normalised by the smaller set so a terse summary can still match. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/**
 * Calibrated against the one case whose answer is known, not chosen by feel.
 *
 * Four of the five sessions plainly found the cart's flat $100 surplus, one of them
 * describing it in yen. That is the ground truth available, so the threshold was swept
 * and read against it:
 *
 *   0.20  union 34   cart in 3 runs   largest cluster 20   — chained, and undercounts
 *   0.25  union 42   cart in 4 runs   largest cluster 13
 *   0.30  union 51   cart in 4 runs   largest cluster  7
 *   0.35  union 57   cart in 4 runs   largest cluster  6   <—
 *   0.40  union 68   cart in 3 runs   largest cluster  4   — splits a known match
 *
 * 0.35 is the loosest value that still recovers the known cluster without the largest
 * cluster running away. It is not correct, only defensible: at this setting a contrast
 * failure still sits beside a page-size control, and a missing h1 beside an image
 * aspect ratio. Roughly four merges in five look right by eye.
 *
 * Which is why every merge is printed. The union is an estimate with a direction — it
 * is a floor for over-merges and a ceiling for splits — and it should be read as
 * "around sixty" rather than as fifty-seven.
 */
export const MATCH_AT = 0.35;

export function cluster(findings: RunFinding[], threshold = MATCH_AT): Cluster[] {
  const clusters: { prints: Set<string>[]; members: RunFinding[] }[] = [];

  for (const finding of findings) {
    const print = fingerprint(finding);
    // Best match wins, not first: a finding that resembles two clusters belongs with
    // the one it resembles most, and first-match would make the result depend on the
    // order reports happened to be read in.
    let best: { at: number; score: number } | null = null;
    clusters.forEach((existing, at) => {
      // Complete linkage: a finding joins only if it resembles EVERY member, not the
      // one member it happens to resemble most. Single linkage chained 25 unrelated
      // findings into one cluster on the first run of this — a missing h1 sat with a
      // sort ordering, a contrast failure and six tile heights, because each matched
      // its neighbour and nothing checked the ends against each other. An over-merged
      // cluster does not merely mislabel: it shrinks the union, which is the number
      // this module exists to report.
      const score = Math.min(...existing.prints.map((other) => similarity(print, other)));
      if (score >= threshold && (best === null || score > best.score)) best = { at, score };
    });
    if (best === null) {
      clusters.push({ prints: [print], members: [finding] });
    } else {
      const chosen = clusters[(best as { at: number }).at]!;
      chosen.prints.push(print);
      chosen.members.push(finding);
    }
  }

  return clusters.map((entry) => {
    const label = entry.members.reduce((longest, member) =>
      member.summary.length > longest.summary.length ? member : longest,
    );
    return {
      label: label.summary,
      severity: worst(entry.members.map((member) => member.severity)),
      runs: [...new Set(entry.members.map((member) => member.run))],
      members: entry.members,
    };
  });
}

const RANK = ['blocker', 'major', 'minor', 'question', 'observation'];

/**
 * The worst severity anyone gave it.
 *
 * Two sessions disagreeing about severity is itself worth seeing, and averaging would
 * hide it. Taking the worst keeps a defect one run called a blocker from being filed
 * as an observation because three other runs shrugged.
 */
function worst(severities: string[]): string {
  return severities.reduce((a, b) => (RANK.indexOf(a) <= RANK.indexOf(b) ? a : b));
}

export interface UnionSummary {
  runs: string[];
  /** Everything anyone found: the real coverage of this target. */
  union: number;
  /** Found by every run. What a single session is reliably worth. */
  core: Cluster[];
  /** Found by exactly one run. What any other session would have missed. */
  singletons: Cluster[];
  /** Per run: how much of the union it reached. */
  recall: { run: string; found: number; of: number }[];
}

export function summarise(clusters: Cluster[], runs: string[]): UnionSummary {
  return {
    runs,
    union: clusters.length,
    core: clusters.filter((entry) => entry.runs.length === runs.length),
    singletons: clusters.filter((entry) => entry.runs.length === 1),
    recall: runs.map((run) => ({
      run,
      found: clusters.filter((entry) => entry.runs.includes(run)).length,
      of: clusters.length,
    })),
  };
}
