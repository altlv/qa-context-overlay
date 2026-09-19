import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { PLAYWRIGHT_CLI } from '../tool-paths.js';
import { promisify } from 'node:util';

const run = promisify(execFile);

// The harness project is included because the detection passes can only be tested
// against a real DOM; leaving it out let a mutation survive that the suite would
// have caught, which is precisely the blind spot mutation testing exists to find.
const PROJECTS = ['--project=unit', '--project=integration', '--project=harness'];

/**
 * Mutation testing for the harness's own logic.
 *
 * A green suite proves the tests ran, not that they check anything. Each mutation
 * below deliberately breaks a rule the harness claims to enforce; if the unit suite
 * still passes, that rule is not actually tested and the confidence it gives is
 * false.
 *
 * **A mutation that cannot fail is worse than no mutation**, because it reports as
 * caught. Two in this list were like that until they were fixed: one removed an
 * `await` whose work a later line still did, and one targeted a rule whose only
 * test called the pure function directly rather than through the real path. When
 * adding one, confirm it fails for the right reason before trusting the score.
 *
 * Deliberately a hand-written list rather than a generic mutation engine. Nine
 * targeted mutations against the rules that matter say more than a thousand random
 * operator flips, and this runs in under a minute.
 */
interface Mutation {
  file: string;
  find: string;
  replace: string;
  breaks: string;
}

const MUTATIONS: Mutation[] = [
  {
    file: 'src/qe/gate.ts',
    find: 'blockers.push(`${input.stats.unexpected} failing test(s)`);',
    replace: '// mutated: failing tests no longer block',
    breaks: 'Failing tests should block the release',
  },
  {
    file: 'src/qe/gate.ts',
    find: 'blockers.push(`${vacuous.length} test(s) with no assertion`);',
    replace: '// mutated: vacuous tests no longer block',
    breaks: 'A test that asserts nothing should block',
  },
  {
    file: 'src/qe/gate.ts',
    find: "blockers.length > 0 ? 'FAIL' : risks.length > 0 ? 'CONDITIONAL' : 'PASS'",
    replace: "'PASS'",
    breaks: 'The gate should not always say PASS',
  },
  {
    file: 'src/quality/assertions.ts',
    find: "kind: 'no-assertion',",
    replace: "kind: 'banned-wait',",
    breaks: 'A test with no assertion should be reported as such',
  },
  {
    file: 'src/qe/report.ts',
    find: "if (finding.severity === 'blocker' && finding.evidence !== 'direct') {",
    replace: 'if (false) {',
    breaks: 'A blocker must rest on direct evidence',
  },
  {
    file: 'src/qe/report.ts',
    find: "if (report.verdict === 'PASS' && claimed > 0) {",
    replace: 'if (false) {',
    breaks: 'A PASS verdict must not rest on claimed evidence',
  },
  {
    file: 'src/agents/budget.ts',
    find: 'if (this.turns >= this.limits.maxTurns) {',
    replace: 'if (false) {',
    breaks: 'The turn limit should stop an agent',
  },
  {
    file: 'src/agents/budget.ts',
    find: 'if (this.costUsd >= this.limits.maxUsd) {',
    replace: 'if (false) {',
    breaks: 'The spend limit should stop an agent',
  },
  {
    file: 'src/cli/check-report.ts',
    find: '  if (explicit !== undefined) {',
    replace: '  if (false) {',
    breaks: 'A named report path that does not exist must be an error, not a pass',
  },
  {
    file: 'src/cli/gate.ts',
    find: '  if (newest > ranAt) {',
    replace: '  if (false) {',
    breaks: 'The gate must refuse test results older than the source',
  },
  {
    file: 'src/agents/roles/integration-coder.ts',
    find: 'Not for pure logic (unit-coder) or anything needing a browser (e2e-coder).',
    replace: 'It is generally useful.',
    breaks: 'A role description must say when NOT to use it',
  },
  {
    // Anchored on the `skills` array rather than the prose, because the array is what
    // the SDK preloads and what the orphan check counts. testability-audit has exactly
    // one declarer, so removing it here orphans the skill outright.
    file: 'src/agents/roles/testability-reviewer.ts',
    find: "skills: [...SHARED_SKILLS, 'testability-audit', 'visual-inspection', 'bug-report'],",
    replace: "skills: [...SHARED_SKILLS, 'visual-inspection', 'bug-report'],",
    breaks: 'A skill that no role declares must be reported as orphaned',
  },
  {
    file: 'src/agents/roles/failure-investigator.ts',
    // maxTurns 25 is unique to this role, which is what keeps the anchor from
    // matching one of the other seven `tools:` lines. The previous anchor spanned the
    // description and a `model: 'sonnet'` line; deleting that line rotted it, and the
    // anchor guard refused the whole run rather than quietly skipping the rule.
    find: "  maxTurns: 25,\n  tools: ['Read', 'Grep', 'Glob', 'Bash'],",
    replace: "  maxTurns: 25,\n  tools: ['Read', 'Grep', 'Glob', 'Bash', 'Edit'],",
    breaks: 'A testing-family role must not be able to edit code',
  },
  {
    // A role pairs with a skill twice: the `skills` array preloads it, the prose says
    // when to reach for it. This strips the prose half while the array keeps claiming
    // it, which is the drift that leaves a skill loaded and unexplained. Anchored in
    // the shared OUTPUT block because honesty-check is cross-cutting — a per-role
    // anchor would leave the other seven roles still explaining it.
    file: 'src/agents/common.ts',
    find: 'Before you write it, run .claude/skills/honesty-check/SKILL.md over your own work.',
    replace: 'Before you write it, check your own work honestly.',
    breaks: "A role's declared skills and the skills its prose names must agree",
  },
  {
    // Judgement skills on a coder is how a coder ends up justifying the scope of the
    // code it is already writing. api-coder is in the coding family, so declaring
    // oracle-check must be refused.
    file: 'src/agents/roles/api-coder.ts',
    find: "skills: [...SHARED_SKILLS, 'test-techniques', 'pwtest'],",
    replace: "skills: [...SHARED_SKILLS, 'test-techniques', 'pwtest', 'oracle-check'],",
    breaks: 'A judgement skill must not reach the coding family',
  },
  {
    // A weaker model needs more attempts, not fewer. Flipping the multiplier the
    // wrong way is silent: the run just ends early and reports a partial result.
    file: 'src/agents/models.ts',
    find: '  haiku: { turns: 1.5, usd: 0.4 },',
    replace: '  haiku: { turns: 0.5, usd: 0.4 },',
    breaks: 'A weaker model must be given more turns than sonnet, not fewer',
  },
  {
    // Passing an alias straight through would send "sonnet" to the API as a model id.
    file: 'src/agents/models.ts',
    find: '    if (value === tier) return { id: MODEL_IDS[tier], tier, warning: null };',
    replace: '    if (value === tier) return { id: value, tier, warning: null };',
    breaks: 'A tier alias must expand to a real model id',
  },
  {
    // Silently defaulting an unknown model to sonnet budgets is how a run ends early
    // for no visible reason.
    file: 'src/agents/models.ts',
    find: '    warning: `HARNESS_MODEL=',
    replace: '    warning: null as unknown as string, unusedWarning: `HARNESS_MODEL=',
    breaks: 'An unrecognised HARNESS_MODEL must warn rather than pass silently',
  },
  {
    // The regression this exists for: loading `.env` relative to cwd reads a
    // subject's environment into the harness process the moment a CLI is run from
    // inside one. Silent — the values simply appear in process.env.
    file: 'src/env.ts',
    find: '  process.loadEnvFile(harnessEnvFile());',
    replace: "  process.loadEnvFile('.env');",
    breaks: "The harness must load its own .env, never the working directory's",
  },
  {
    // The safety boundary. Ungating this hands production browser_click.
    file: 'src/qe/browser-tools.ts',
    find: '  if (policy.allowWrites) granted.push(...INTERACT);',
    replace: '  granted.push(...INTERACT);',
    breaks: 'A policy that forbids writes must not grant interaction tools',
  },
  {
    // An allowlist containing arbitrary code execution is not an allowlist.
    file: 'src/qe/browser-tools.ts',
    find: "  'browser_get_config',\n];",
    replace: "  'browser_get_config',\n  'browser_evaluate',\n];",
    breaks: 'A tool that runs arbitrary JavaScript must never be granted',
  },
  {
    // The role ceiling. Without it an auditing role holds browser_fill_form on any
    // environment permissive enough to grant it.
    file: 'src/qe/browser-tools.ts',
    find: "  if (access === 'full') {",
    replace: '  if (true) {',
    breaks: 'A role ceiling must narrow the grant even where the environment is permissive',
  },
  {
    // denyLabels enforced against nothing was the state for months.
    file: 'src/qe/browser-guard.ts',
    find: '        if (!verdict.allowed) {',
    replace: '        if (false) {',
    breaks: 'A control whose label commits to something must be refused',
  },
  {
    file: 'src/qe/browser-guard.ts',
    find: '      if (actions >= policy.maxActions) {',
    replace: '      if (false) {',
    breaks: 'The action ceiling must stop a session that has done enough',
  },
  {
    // The branch measured at 4 turns and $0.2613 against 1 turn and $0.1871. Ignoring
    // the map sends a pre-scanned session to rebuild it by hand, and nothing about
    // the run looks wrong while it happens.
    file: 'src/qe/session-briefing.ts',
    find: '  if (!hasMap) {',
    replace: '  if (true) {',
    breaks: 'A session handed a scan must not be told to go and look first',
  },
  {
    // An auditing role stays observation-only wherever it runs; saying otherwise on a
    // permissive environment invites it to try tools it does not hold.
    file: 'src/qe/session-briefing.ts',
    find: "  if (access === 'observe') {",
    replace: '  if (false) {',
    breaks: 'An auditing role must be told its ceiling is the role, not the environment',
  },
  {
    // Caught itself on the run that introduced it: `npm run precommit` was added and
    // not documented, one message after five README drift fixes.
    file: 'src/qe/housekeeping.ts',
    find: '    .filter((name) => name !== ',
    replace: '    .filter((name) => false && name !== ',
    breaks: 'A command the README never mentions must be reported',
  },
  {
    file: 'src/qe/housekeeping.ts',
    find: '  return skills.filter((name) => !catalogue.includes(',
    replace: '  return [].filter((name) => !catalogue.includes(',
    breaks: 'A skill the catalogue never lists must be reported',
  },
  {
    // Without the second condition, a code-only commit after a plan commit reads as
    // current, and the plan can lag the code indefinitely.
    file: 'src/qe/housekeeping.ts',
    find: '  if (sameAsParent && planChangedInHead) {',
    replace: '  if (sameAsParent) {',
    breaks: 'A plan the latest commit did not update must not count as current',
  },
  {
    // The check a hand-typed count lacked: it read an old results file and quoted it.
    file: 'src/qe/facts.ts',
    find: '  if (Math.floor(newestSource) > ranAt) {',
    replace: '  if (false) {',
    breaks: 'Results older than the code must never be quotable',
  },
  {
    file: 'src/quality/assertions.ts',
    find: 'if (assertions > 1 && explained === 0) {',
    replace: 'if (false) {',
    breaks: 'A multi-assertion test with no failure message must be flagged',
  },
  {
    file: 'src/quality/assertions.ts',
    find: 'const source = maskStringsAndComments(rawSource);',
    replace: 'const source = rawSource;',
    breaks: 'Fixture strings must not be analysed as though they were code',
  },
  {
    file: 'src/quality/assertions.ts',
    find: 'const value = block.raw.slice(valueStart, valueStart + valueLength);',
    replace: "const value = '';",
    breaks: 'The selector rule must read the real selector, not the masked blank',
  },
  {
    file: 'src/tools/page-scanner.ts',
    // Anchored on the comment above the line, because the alternatives are all
    // ambiguous: `severity: 'high'` matches five places, and `unaddressable` is
    // raised from two branches of which only this one is reachable in practice —
    // the other needs a fragile input that somehow has an accessible name. A
    // mutation aimed at a branch nothing reaches survives forever and teaches
    // nothing, which is how this one wasted two full runs.
    find: "        // with no accessible name announces as nothing to a screen reader.\n        audience: ['product', 'automation'],",
    replace:
      "        // with no accessible name announces as nothing to a screen reader.\n        audience: ['product'],",
    breaks: 'An untargetable element must reach the automator, not only the product owner',
  },
  {
    file: 'src/tools/page-scanner.ts',
    find: 'unique: (occurrences.get(element.suggested) ?? 0) === 1,',
    replace: 'unique: true,',
    breaks: 'A selector matching several elements must be reported as ambiguous',
  },
  {
    file: 'src/tools/identity.ts',
    find: '  if (/^:r[0-9a-z]+:$/i.test(id)) return false;',
    replace: '  // generated-id check removed',
    breaks: 'A framework-generated id must not count as identity',
  },
  {
    file: 'src/tools/identity.ts',
    find: '  const total = Math.max(weighted, floor);',
    replace: '  const total = weighted;',
    breaks: 'A decisive signal must carry a match, not be outvoted by weak disagreements',
  },
  {
    file: 'src/tools/identity.ts',
    find: '    if (usedBefore.has(candidate.beforeIndex) || usedAfter.has(candidate.afterIndex))',
    replace: '    if (false)',
    breaks: 'One element must never be matched to two',
  },
  {
    file: 'src/tools/identity.ts',
    find: '  if (result.confident && result.score >= threshold) {',
    replace: '  if (result.score >= threshold) {',
    breaks: 'Pairing must require confidence, not merely a score above the threshold',
  },
  {
    file: 'src/tools/identity.ts',
    find: "  add('name', bothHave(nameBefore, nameAfter), namesMatch);",
    replace: "  add('name', false, namesMatch);",
    breaks: 'The accessible name must count — it is what most real pages offer',
  },
  {
    file: 'src/tools/page-scanner.ts',
    find: "if (el.affordance === 'toggle' && Object.keys(el.stateAttributes).length === 0) {",
    replace: 'if (false) {',
    breaks: 'A toggle exposing no state must be reported as unobservable',
  },
  {
    file: 'src/tools/schema.ts',
    find: "if (type === 'null') acc.nullable = true;",
    replace: '// nullability dropped',
    breaks: 'A field observed as null must be reported nullable',
  },
  {
    file: 'src/qe/exploration-policy.ts',
    find: 'if (control.isSubmit && !policy.allowFormSubmit) {',
    replace: 'if (false) {',
    breaks: 'A read-only environment must refuse form submission',
  },
  {
    file: 'src/qe/exploration-policy.ts',
    // Both the test and prod policies set this, so the anchor carries the
    // maxStates below it to pin the mutation to prod, the stricter of the two.
    find: 'captureBodies: false,\n    denyLabels: [...DESTRUCTIVE_LABELS, ...OUTBOUND_LABELS],\n    maxStates: 15,',
    replace:
      'captureBodies: true,\n    denyLabels: [...DESTRUCTIVE_LABELS, ...OUTBOUND_LABELS],\n    maxStates: 15,',
    breaks: 'Payload bodies must not be written to disk outside local',
  },
  {
    file: 'apps/targets.ts',
    find: 'if (has(EFFECT_TAGS.writes) && !policy.allowWrites) {',
    replace: 'if (false) {',
    breaks: 'A writing test must be refused on an environment that forbids writes',
  },
  {
    file: 'apps/targets.ts',
    find: "if (policy.environment === 'local') return { allowed: true };",
    replace: 'return { allowed: true };',
    breaks: 'An untagged test must be treated as unknown, not harmless, off local',
  },
  {
    file: 'src/tools/interstitial.ts',
    find: "call.path.includes('/cdn-cgi/challenge-platform') ||",
    replace: 'false ||',
    breaks: 'A bot challenge must be reported rather than scanned as if it were the app',
  },
  {
    file: 'src/tools/interstitial.ts',
    find: 'if (observed.passwords > 0 && observed.interactive < 15) {',
    replace: 'if (false) {',
    breaks: 'A sign-in page must not be mistaken for the application behind it',
  },
  {
    file: 'src/tools/crawl.ts',
    find: 'if (response.status >= 500) {',
    replace: 'if (false) {',
    breaks: 'An unreachable robots.txt must refuse the crawl, not grant permission',
  },
  {
    file: 'src/tools/crawl.ts',
    find: '      disallowed.push(next.url);',
    replace: '      // disallow ignored',
    breaks: 'A path disallowed by robots.txt must be skipped and reported',
  },
  {
    file: 'src/tools/crawl.ts',
    find: "return (byPrefix.get(key)?.size ?? 0) >= minVariants ? '{slug}' : segment;",
    replace: 'return segment;',
    breaks: 'Slug segments must be induced, or every product page is its own template',
  },
  {
    file: 'src/tools/reveal.ts',
    find: 'if (rect.right <= 0 && rect.left < -1_000) continue;',
    replace: '// visually-hidden check removed',
    breaks: 'A control parked off-screen must count as hidden, or focus reveals nothing',
  },
  {
    file: 'apps/targets.ts',
    find: 'return new RegExp(EFFECT_TAGS.readOnly);',
    replace: 'return undefined;',
    breaks: 'A production run must be narrowed to read-only tests, not left unfiltered',
  },
  {
    file: 'src/tools/heal.ts',
    find: '  if (matches === 1) {',
    replace: '  if (false) {',
    breaks: 'A selector that still resolves must win outright, not be re-scored',
  },
  {
    file: 'src/tools/heal.ts',
    find: '  if (matches === 0 && !sameOrigin(url, baseline.url)) {',
    replace: '  if (false) {',
    breaks: 'A baseline must never be matched against a different origin',
  },
  {
    file: 'src/tools/heal.ts',
    find: '  if (!ranked.decisive) {',
    replace: '  if (false) {',
    breaks: 'A heal that is too close to call must be refused, not resolved by rank',
  },
  {
    file: 'src/tools/heal.ts',
    find: '  if (isStableId(fingerprint.id)) rungs.push(`#${fingerprint.id}`);',
    replace: '  if (fingerprint.id !== null) rungs.push(`#${fingerprint.id}`);',
    breaks: 'A framework-generated id must not be proposed as the replacement selector',
  },
  {
    file: 'src/tools/heal.ts',
    find: '  if (found > 1) {',
    replace: '  if (false) {',
    breaks: 'A baseline must not be taken from a selector that matches several elements',
  },
  {
    file: 'src/qe/gate.ts',
    find: 'risks.push(`${healed.length} locator(s) healed`);',
    replace: '// mutated: healed locators no longer surface',
    breaks: 'A healed locator must not pass unmentioned',
  },
  {
    file: 'src/qe/gate.ts',
    find: 'blockers.push(`${misdirected.length} locator(s) resolved against the wrong origin`);',
    replace: '// mutated: wrong-origin baselines no longer block',
    breaks: 'A baseline used against the wrong origin must block the release',
  },
  {
    file: 'src/qe/gate.ts',
    find: 'risks.push(`${unresolved.length} locator(s) could not be resolved or healed`);',
    replace: '// mutated: unresolved locators no longer surface',
    breaks: 'A locator that could neither resolve nor heal must be reported',
  },
  {
    file: 'src/qe/baselines.ts',
    find: '  if (parsed.version !== FORMAT_VERSION) {',
    replace: '  if (false) {',
    breaks: 'A baseline file in an unknown format must be refused, not read as empty',
  },
  {
    file: 'src/qe/baselines.ts',
    find: "  const safe = name.replace(/[^a-z0-9]+/gi, '-').slice(0, 120);",
    replace: '  const safe = name;',
    breaks: 'A test title must not be able to steer where its journal is written',
  },
  {
    file: 'src/qe/baselines.ts',
    find: '  return `${path}::${selector}`;',
    replace: '  return `${url}::${selector}`;',
    breaks: 'One baseline must serve every environment, not be recaptured per host',
  },
  {
    file: 'src/qe/baselines.ts',
    find: '  for (const key of [...baselines.keys()].sort()) sorted[key] = baselines.get(key)!;',
    replace: '  for (const key of baselines.keys()) sorted[key] = baselines.get(key)!;',
    breaks: 'A recaptured baseline file must stay diffable, or no heal can be reviewed',
  },
  {
    file: 'src/fixtures/harness.ts',
    find: '          if (captureBaselines) captured.set(key, await captureBaseline(page, selector));',
    replace: '          captured.set(key, await captureBaseline(page, selector));',
    breaks: 'Baselines must only be captured when a run explicitly asks for it',
  },
  {
    file: 'src/tools/page-scanner.ts',
    find: "            el.scrollIntoView({ block: 'center', inline: 'center' });",
    replace: '            // mutated: hit-test where the element happens to be sitting',
    breaks: 'Occlusion must be judged after scrolling, because Playwright scrolls before clicking',
  },
  {
    file: 'src/tools/page-scanner.ts',
    find: '      window.scrollTo(scrolledFrom.x, scrolledFrom.y);',
    replace: '      // mutated: scroll position left wherever the scan ended',
    breaks: 'A read-only scan must leave the page at the scroll position it found it',
  },
  {
    file: 'src/tools/accessible-name.ts',
    find: '    clean(parts.imageAlt)?.slice(0, 80) ??',
    replace: '',
    breaks: 'An image-only link must be named by its image alt, as every browser names it',
  },
  {
    file: 'src/tools/accessible-name.ts',
    find: '    clean(parts.value) ??',
    replace: '',
    breaks: 'A submit input must be named by its value, which is its only label',
  },
  {
    file: 'src/tools/reveal.ts',
    find: '    const stillHoverOnly = claim.signatures.filter((signature) => !withoutHover.has(signature));',
    replace: '    const stillHoverOnly = claim.signatures;',
    breaks: 'A hover reveal must disappear when the hover stops, or it arrived on its own',
  },
  {
    file: 'src/tools/heal.ts',
    find: '    if (conflicts.length === 0) {',
    replace: '    if (true) {',
    breaks: 'A selector resolving to a contradicting element must be reported, not called intact',
  },
  {
    file: 'src/tools/heal.ts',
    find: '    if (index < 0) {',
    replace: '    if (false) {',
    breaks: 'A selector resolving to a hidden element must not be reported as healthy',
  },
  {
    file: 'src/tools/heal.ts',
    find: '    if (count === 1) return rung;',
    replace: '    return rung;',
    breaks: 'A proposed selector must resolve to exactly one element',
  },
  {
    file: 'src/qe/gate.ts',
    find: 'risks.push(`${drifted.length} locator(s) resolve to something that changed`);',
    replace: '// mutated: drift no longer surfaces',
    breaks: 'A locator that drifted must reach the gate',
  },
  {
    file: 'src/tools/page-scanner.ts',
    find: "        audience: ['automation'],",
    replace: "        audience: ['product', 'automation'],",
    breaks: 'An ambiguous selector must not be put in front of a product owner as a defect',
  },
  {
    file: 'src/tools/page-scanner.ts',
    find: "      audience: ['recon'],",
    replace: "      audience: ['product'],",
    breaks: 'An unscanned frame is a declared blind spot, not a defect in the product',
  },
  {
    file: 'src/tools/probe.ts',
    find: '  if (zoom.horizontalOverflow) {',
    replace: '  if (false) {',
    breaks: 'A reflow failure must be reported as a product defect, not buried in the map',
  },
  {
    file: 'src/tools/probe.ts',
    find: "    .then((): Settling => 'settled')",
    replace: "    .then((): Settling => 'timed-out')",
    breaks: 'A settled page must not be reported as an incomplete inventory',
  },
  {
    file: 'src/tools/page-scanner.ts',
    find: "    ...(options.settled === 'timed-out'",
    replace: '    ...(false',
    breaks: 'An inventory taken before the page settled must declare itself a floor',
  },
  {
    file: 'src/tools/probe.ts',
    // Dropping the `load` wait alone changes nothing while networkidle still runs,
    // so the mutation carrying this rule has to remove the networkidle wait.
    find: '  const settledTo: Settling = await page',
    replace: '  const settledTo: Settling = await Promise.resolve()',
    breaks: 'Content a page adds after load must still reach the map',
  },
  {
    file: 'src/quality/assertions.ts',
    find: '    if (writes && drivesPage && !checksTheWire) {',
    replace: '    if (false) {',
    breaks: 'A writing UI test that checks only the DOM must be refused',
  },
  {
    file: 'src/quality/assertions.ts',
    find: 'const readsBack = /\\b(?:api|request)\\.get\\s*\\(/.test(block.code);',
    replace: 'const readsBack = true;',
    breaks: 'A successful API write that is never read back must be refused',
  },
  {
    // Without inheritance every @writes describe tags nothing, and the UI write rule
    // silently stops applying to every spec written the conventional way.
    file: 'src/quality/assertions.ts',
    find: '      .flatMap((describe) => describe.tags);',
    replace: '      .flatMap(() => [] as string[]);',
    breaks: "A describe's effect tag must reach the tests inside it",
  },
  {
    file: 'src/quality/assertions.ts',
    find: 'tagsBetween(nameStart + nameLength, openIndex)',
    replace: 'tagsBetween(match.index, openIndex)',
    breaks: 'A tag named in a test title must not count as a tag',
  },
  {
    file: 'src/fixtures/probes.ts',
    find: '  const delta = parsedStep !== null && parsedStep > 0 ? parsedStep : 1;',
    replace: '  const delta = 1;',
    breaks: 'A boundary neighbour must be one step away, not one unit',
  },
  {
    // A login form's probes, tagged @writes, would run on a shared environment and
    // lock real accounts.
    file: 'src/qe/test-ideas.ts',
    find: "  const authenticates = elements.some((element) => element.type === 'password');",
    replace: '  const authenticates = false;',
    breaks: 'A credential attempt must be left untagged so it runs on local only',
  },
  {
    file: 'src/qe/test-ideas.ts',
    find: "  if (type === 'password') return ideas;",
    replace: '',
    breaks: 'A password field must never be handed a list of values to type',
  },
  {
    file: 'src/qe/test-ideas.ts',
    find: "  return endpoint.method === 'GET' && endpoint.response.length > 0;",
    replace: "  return endpoint.method === 'GET';",
    breaks: 'A bodiless GET must not be offered as the read that proves a write',
  },
  {
    file: 'src/qe/test-ideas.ts',
    find: '  if (predatesFormat(scan)) {',
    replace: '  if (false) {',
    breaks: 'A scan in the old format must be refused out loud, not read as a thin page',
  },
  {
    file: 'src/qe/test-ideas.ts',
    find: '    if (seen.has(key)) return false;',
    replace: '    if (seen.size < 0) return false;',
    breaks: 'A case shared by two controls must be printed once',
  },
  {
    // The shell route around every other bound: a commit the user never saw.
    file: 'src/qe/shell-guard.ts',
    find: '      if (GIT_WRITE.test(command)) {',
    replace: '      if (false) {',
    breaks: 'A git write by an agent must be refused',
  },
  {
    file: 'src/qe/shell-guard.ts',
    find: '      if (NESTED_RUN.test(command)) {',
    replace: '      if (false) {',
    breaks: 'A role run started from inside a run must be refused',
  },
  {
    file: 'src/qe/shell-guard.ts',
    find: '      if (SECRETS.test(command)) {',
    replace: '      if (false) {',
    breaks: 'Reading .env or a credential store from the shell must be refused',
  },
  {
    file: 'src/qe/shell-guard.ts',
    find: '        if (value !== scope.environment) {',
    replace: '        if (false) {',
    breaks: 'A test run pointed at an environment other than the run’s must be refused',
  },
  {
    file: 'src/qe/shell-guard.ts',
    find: '        if (LOOPBACK.has(host) || hosts.has(host)) continue;',
    replace: '        continue;',
    breaks: 'A host outside the app and its extraHosts must be refused',
  },
  {
    // The split this closes: specs and the gate ran against the registry default.
    file: 'src/qe/run-gate.ts',
    find: '    input.environment === null ? {} : { TEST_ENV: input.environment };',
    replace: '    {};',
    breaks: 'Every spec the gate runs must run in the run’s environment',
  },
  {
    file: 'src/qe/run-gate.ts',
    find: '          HARNESS_RESULTS_FILE: `${input.runDir}/results.json`,',
    replace: '',
    breaks: 'The gate must not write over the suite results the release gate reads',
  },
  {
    file: 'src/qe/run-gate.ts',
    find: '  if (gatePassed(record)) return null;',
    replace: '  if (false) return null;',
    breaks: 'A passed gate must hand nothing to an investigator',
  },
  {
    file: 'src/qe/run-target.ts',
    find: '  const extra = registered.extraHosts.map((host) => host.toLowerCase());',
    replace: '  const extra: string[] = [];',
    breaks: 'The hosts an app config allows must reach the run',
  },
  {
    file: 'src/qe/run-target.ts',
    find: "    problems.push('--app without --env: a run has no default environment');",
    replace: '    // mutated: an app with no environment resolves silently',
    breaks: 'A run with no environment must be refused, not given a default',
  },
  {
    file: 'src/qe/run-lock.ts',
    find: '  if (!alive(existing.pid)) return { take: true, replacedStale: existing };',
    replace: '  return { take: true, replacedStale: existing };',
    breaks: 'A second run must be refused while the first is alive',
  },
  {
    file: 'src/qe/readiness.ts',
    find: '    NEEDS_A_TARGET.has(request.role) &&',
    replace: '    false &&',
    breaks: 'A role that tests a deployment must name its app and environment',
  },
  {
    file: 'src/qe/readiness.ts',
    find: '  if (changedSince.length === 0) return null;',
    replace: '  return null;',
    breaks: 'A design older than the app’s changes must be warned about',
  },
  {
    file: 'src/qe/tool-hook.ts',
    find: '        if (decision.allowed || toolName === null) return { continue: true };',
    replace: '        return { continue: true };',
    breaks: 'A refused tool call must reach the SDK as a deny',
  },
  {
    file: 'src/qe/tool-hook.ts',
    find: 'allowed: false,\n        reason: `the guard failed to decide',
    replace: 'allowed: true,\n        reason: `the guard failed to decide',
    breaks: 'A guard that throws must refuse the call, not allow it',
  },
  {
    file: 'src/agents/compose.ts',
    find: '  if (skills.length === 0) return role.prompt;',
    replace: '  return role.prompt;',
    breaks: 'A role’s declared skills must reach its prompt as text',
  },
  {
    file: 'src/agents/models.ts',
    find: '    timeoutMs: declaredSeconds * 1000,',
    replace: '    timeoutMs: 180_000,',
    breaks: 'A role’s declared wall clock must become its limit',
  },
  {
    file: 'src/qe/readiness.ts',
    find: '  if (path === undefined) {',
    replace: '  if (false) {',
    breaks: 'A coder with no design must not start',
  },
  {
    file: 'src/qe/readiness.ts',
    find: '  if (reading.cases === 0) return',
    replace: '  if (false) return',
    breaks: 'A design that lists no cases must not start a coder',
  },
  {
    file: 'src/qe/report.ts',
    find: "  if (report.report === 'test-design' && report.cases.length === 0) {",
    replace: '  if (false) {',
    breaks: 'A test design with no cases must be refused by check-report',
  },
  {
    file: 'src/qe/run-gate.ts',
    find: '      if (appSpecs.length > 0) {',
    replace: '      if (false) {',
    breaks: 'Every app spec a coder changed must be fault-checked after the run',
  },
  {
    file: 'src/qe/run-gate.ts',
    find: "      problems.push('test-planner wrote no design file under apps/<app>/designs/');",
    replace: '      // mutated: a planner run with no design passes',
    breaks: 'A planner run that wrote no design file must fail its gate',
  },
  {
    // Isolation by construction rests on this one comparison.
    file: 'src/qe/run-worktree.ts',
    find: "  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));",
    replace: '  return true;',
    breaks: 'A path outside a run worktree must not count as inside it',
  },
  {
    file: 'src/qe/run-worktree.ts',
    find: '  return normalise(checkout) === normalise(base);',
    replace: '  return true;',
    breaks: 'Linked modules must be refused when the lockfile differs from the base commit',
  },
  {
    file: 'src/qe/file-guard.ts',
    find: '        if (!insideDir(value, root)) {',
    replace: '        if (false) {',
    breaks: 'A file tool must not reach outside the run’s worktree',
  },
  {
    file: 'src/qe/file-guard.ts',
    find: '        if (SECRET_FILE.test(value.trim())) {',
    replace: '        if (false) {',
    breaks: 'A file tool must not read .env, even inside the worktree',
  },
  {
    file: 'apps/targets.ts',
    find: '  return Number.isInteger(port) && port > 0 ? port : undefined;',
    replace: '  return undefined;',
    breaks: 'A run’s port must move the target, or specs look where no server listens',
  },
  {
    file: 'src/qe/run-lock.ts',
    find: '  return `artifacts/locks/${app}-${environment}.lock`;',
    replace: "  return 'artifacts/run.lock';",
    breaks: 'Runs against different targets must not share one lock',
  },
  // The runner's refusals, caught by tests/integration/role.int.test.ts. Every one of
  // these still ends at the --preflight exit those tests pass. Never mutate that exit:
  // the tests would then start a real, paid agent run.
  {
    file: 'src/cli/role.ts',
    find: '  if (designPath !== undefined && !(await committedAt(repoRoot, base, designPath))) {',
    replace: '  if (false) {',
    breaks: 'An uncommitted design must be refused — it never reaches the worktree',
  },
  {
    file: 'src/cli/role.ts',
    find: '  if (lockfile !== null) notReady.push(lockfile);',
    replace: '  // mutated: lockfile mismatch ignored',
    breaks: 'A run must be refused when linked modules do not match the base lockfile',
  },
  {
    file: 'src/cli/role.ts',
    find: '  if (!lock.take) {',
    replace: '  if (false) {',
    breaks: 'A run must be refused while another live run holds its target',
  },
  {
    file: 'src/cli/role.ts',
    find: "  if (family !== 'testing') {",
    replace: '  if (false) {',
    breaks: 'A coding role must not run in another run’s worktree',
  },
  {
    file: 'src/cli/role.ts',
    find: '  if (!(await isRunWorktree(repoRoot, reusePath))) {',
    replace: '  if (false) {',
    breaks: 'An investigator must not be pointed at a path that is not a run worktree',
  },
  {
    file: 'src/qe/facts.ts',
    find: '    if (external.counts.failing > 0) {',
    replace: '    if (false) {',
    breaks: 'Plan numbers must not be quotable while external tests are failing',
  },
  {
    file: 'src/qe/run-gate.ts',
    find: '  const place = worktree === undefined ? \'\' : ` --worktree "${posix(worktree)}"`;',
    replace: "  const place = '';",
    breaks: 'An investigation must be pointed at the failed run’s worktree',
  },
  {
    file: 'src/qe/fault.ts',
    find: "        else outcome = corrupted > 0 ? 'survived' : 'untouched';",
    replace: "        else outcome = 'untouched';",
    breaks: 'A spec that passes over corrupted server responses must be refused',
  },
  {
    file: 'src/qe/fault.ts',
    find: "        else if (status !== 'passed') outcome = corrupted > 0 ? 'caught' : 'inconclusive';",
    replace: "        else if (status !== 'passed') outcome = 'caught';",
    breaks: 'A failure the fault did not cause must not count as caught',
  },
  {
    // Caught only by the integration test, which runs the probe spec under the fault.
    file: 'src/fixtures/harness.ts',
    find: '        if (!corruptible(route.request().resourceType())) return route.continue();',
    replace: '        return route.continue();',
    breaks: 'Under the fault a page’s calls to its server must be corrupted',
  },
  {
    // Uncounted, every failure under the fault reads as inconclusive and the check
    // refuses an API spec that did notice.
    file: 'src/fixtures/api.ts',
    find: '      corrupted += 1;\n      response.writeHead',
    replace: '      response.writeHead',
    breaks: 'Under the fault an API spec’s corrupted calls must be counted',
  },
  {
    // The driver's plan is the only thing standing between a generated write case and
    // a production session. Checked on the tag, because `actionAllowed` can only see a
    // write when a submit control is in front of it.
    file: 'src/qe/driver.ts',
    find: "if (idea.tag === '@writes' && !policy.allowWrites) {",
    replace: "if (idea.tag === '@writes' && false) {",
    breaks: 'A case that changes server state must not be offered on a read-only policy',
  },
  {
    // Unknown is not read-only. Removing this reads every effect `ideasFor` could not
    // establish as safe, which is the wrong default in exactly the wrong place.
    file: 'src/qe/driver.ts',
    find: 'if (idea.tag === null && !policy.allowWrites) {',
    replace: 'if (idea.tag === null && false) {',
    breaks: 'An idea whose effect was never established must not pass as a read',
  },
  {
    // The label rules and the form-submit rule reach the plan only through here, so
    // this one line carries `denyLabels` for the whole driver.
    file: 'src/qe/driver.ts',
    find: 'return verdict.allowed ? null : verdict.reason;',
    replace: 'return null;',
    breaks: 'A control whose label commits to something must be refused in the plan too',
  },
  {
    // The set-not-multiset choice, which is the whole reason a list being used
    // normally does not spend the state ceiling. As a multiset, adding one todo row
    // is a new state and any session against a list burns its allowance on nothing.
    file: 'src/qe/state-model.ts',
    find: 'const signatures = [...new Set(observation.fingerprints.map(controlSignature))].sort();',
    replace: 'const signatures = observation.fingerprints.map(controlSignature).sort();',
    breaks: 'A list growing by one row must not count as a new state',
  },
  {
    // Off by one at the ceiling. The guard asks this exact question, so `>` instead of
    // `>=` grants every session one state more than its policy allows.
    file: 'src/qe/state-model.ts',
    find: 'return this.seen.size >= maxStates;',
    replace: 'return this.seen.size > maxStates;',
    breaks: 'The state ceiling must refuse AT the limit, not one past it',
  },
  {
    // `maxStates` was enforced by nothing for months. This is the line that changed
    // that, and it is worth a mutation precisely because its absence is invisible —
    // the other two bounds keep working and the run looks bounded.
    file: 'src/qe/browser-guard.ts',
    find: 'if (states !== undefined && states.atCeiling(policy.maxStates)) {',
    replace: 'if (false && states !== undefined && states.atCeiling(policy.maxStates)) {',
    breaks: 'An action past the state ceiling must be refused',
  },
  {
    // A missed look undercounts states, so the ceiling is enforced on a number lower
    // than the truth. Dropping the caveat turns a floor into an apparently exact count.
    file: 'src/qe/observer.ts',
    find: 'lines.push(\n          `${missedLooks} look(s) could not be taken, so that count is a FLOOR',
    replace:
      'lines.push(\n          `${missedLooks} look(s) could not be taken, so that count is a total',
    breaks: 'An undercounted state total must announce itself as a floor',
  },
];

/**
 * Which mutations this run will attempt.
 *
 * `--changed` narrows to the mutations whose target file the working tree has
 * touched. That is the difference between a thirty-second check while editing one
 * module and a five-minute one, and the short loop is the one that gets run.
 *
 * The full list stays the default and stays the gate before a push. A scoped run
 * tells you the rules you just touched are still held; it says nothing whatever
 * about the rest, and the output below never lets it pretend otherwise. A partial
 * score read as a full one is precisely the failure this tool exists to prevent.
 */
async function changedFiles(): Promise<string[]> {
  const { stdout } = await run('git', ['status', '--porcelain'], { windowsHide: true });
  return stdout
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter((path) => path !== '')
    .map((path) => path.replace(/\\/g, '/'));
}

const scoped = process.argv.includes('--changed');
let selected = MUTATIONS;

if (scoped) {
  const touched = await changedFiles();
  selected = MUTATIONS.filter((mutation) => touched.includes(mutation.file));
  const files = [...new Set(selected.map((mutation) => mutation.file))];
  console.log(
    `Scoped to --changed: ${selected.length} of ${MUTATIONS.length} mutation(s), ` +
      `across ${files.length} touched file(s).`,
  );
  for (const file of files) console.log(`  ${file}`);
  if (selected.length === 0) {
    console.log('\nNo mutation targets a file you have changed. Nothing to check here.');
    process.exit(0);
  }
  console.log('');
}

const PLAYWRIGHT = PLAYWRIGHT_CLI;

/**
 * Runs the suites and reports whether they passed.
 *
 * Distinguishing "the tests failed" from "the tests could not be started" matters
 * more here than anywhere else: if a spawn failure were treated as a failing suite,
 * every mutation would look caught while nothing ran at all — a mutation tool
 * reporting a perfect score having tested nothing. This exact thing happened when
 * the runner was invoked through the `npx` shim, which fails with EINVAL on Windows.
 */
async function suitePasses(stopAtFirstFailure: boolean): Promise<boolean> {
  try {
    await run(
      process.execPath,
      [
        PLAYWRIGHT,
        'test',
        ...PROJECTS,
        '--reporter=dot',
        // A mutation is caught the moment one test fails; the remaining several
        // hundred tell us nothing. Measured on a real mutation: 10.1s to run the
        // suite out, 3.3s to stop at the first failure. Across the whole list that
        // is ten minutes down to three and a half.
        //
        // Not used for the baseline, where the question is the opposite one - is
        // *everything* green - and stopping early would answer it dishonestly.
        //
        // Scoping each mutation to the project that can kill it was measured too,
        // and dropped: 3297ms against 3154ms, a 4% gain for a per-mutation
        // declaration that can be silently wrong. What is left is almost entirely
        // fixed process startup, roughly 3s of Playwright and tsx boot paid once
        // per mutation.
        ...(stopAtFirstFailure ? ['--max-failures=1'] : []),
      ],
      { windowsHide: true },
    );
    return true;
  } catch (error) {
    const e = error as { code?: number | string };
    if (typeof e.code === 'string') {
      throw new Error(
        `Could not start the test runner (${e.code}). Refusing to report a mutation score — ` +
          `every mutation would look caught while nothing ran.`,
      );
    }
    return false;
  }
}

/**
 * Every anchor must resolve to exactly one place, checked before anything runs.
 *
 * This used to print `SKIP` and carry on, which is a line nobody reads at the top
 * of a five-minute run. Two rules had been silently unchecked for a while that way
 * — `resolveLocator` was restructured and `proposeSelector` became a ladder, and
 * both anchors quietly stopped matching. The score still said 100%, of a smaller
 * denominator than anyone thought.
 *
 * An anchor matching *several* places is the same problem wearing a different hat:
 * `String.replace` takes the first, so the mutation applies somewhere, just not
 * necessarily where the rule lives. One anchor here matched five.
 *
 * Refusing is the only honest response. A mutation runner that quietly tests less
 * than its list is the exact failure it exists to catch.
 */
const badAnchors: string[] = [];

console.log('Baseline: running the unit + integration suites unmutated…');
if (!(await suitePasses(false))) {
  console.error('The suite fails before any mutation. Fix that first.');
  process.exit(2);
}
console.log('Baseline green.\n');

let caught = 0;
const survivors: Mutation[] = [];

for (const mutation of selected) {
  const target = await readFile(mutation.file, 'utf8').catch(() => null);
  if (target === null) {
    badAnchors.push(`  ${mutation.file} does not exist — ${mutation.breaks}`);
    continue;
  }
  const hits = target.split(mutation.find).length - 1;
  if (hits !== 1) {
    badAnchors.push(
      `  ${hits === 0 ? 'no match' : `${hits} matches`} in ${mutation.file} — ${mutation.breaks}`,
    );
  }
}
if (badAnchors.length > 0) {
  console.error(
    `${badAnchors.length} mutation(s) have an anchor that does not resolve to exactly one place:\n` +
      `${badAnchors.join('\n')}\n\n` +
      `Refusing to run. A score computed over a shrunken list reads as a full one.`,
  );
  process.exit(2);
}

for (const mutation of selected) {
  const original = await readFile(mutation.file, 'utf8');

  await writeFile(mutation.file, original.replace(mutation.find, mutation.replace), 'utf8');
  const stillPasses = await suitePasses(true);
  await writeFile(mutation.file, original, 'utf8');

  if (stillPasses) {
    survivors.push(mutation);
    console.log(`SURVIVED ${mutation.breaks}`);
  } else {
    caught += 1;
    console.log(`caught   ${mutation.breaks}`);
  }
}

const total = caught + survivors.length;
const score = total === 0 ? 0 : Math.round((caught / total) * 100);
if (scoped) {
  // Deliberately not a percentage. A scoped run covers the rules you touched and
  // nothing else, and a number that looks like a score would be read as one.
  console.log(
    `\nScoped result: ${caught}/${total} caught, across the files you changed.` +
      `\nThis is NOT the mutation score — ${MUTATIONS.length - total} rule(s) went` +
      ` unchecked. Run \`npm run mutate\` with no arguments before pushing.`,
  );
} else {
  console.log(`\nMutation score: ${caught}/${total} (${score}%)`);
  // Recorded for `npm run plan:facts`, only on a full run — a scoped record would be
  // quoted as the score. Written after every mutation has been restored, so its
  // timestamp is later than any file this run touched.
  await writeFile(
    'artifacts/mutation.json',
    `${JSON.stringify({ caught, total, ranAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

if (survivors.length > 0) {
  console.log('\nSurvivors — these rules are not actually tested:');
  for (const s of survivors) console.log(`  - ${s.breaks}  (${s.file})`);
  console.log('\nA surviving mutation means the suite would stay green if that rule broke.');
}

process.exit(survivors.length > 0 ? 1 : 0);
