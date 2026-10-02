/**
 * Mutations for the labs seam — `src/routes/labs.js` in `mcpa-training-bot`.
 *
 * Written from the source alone, before either suite was read closely, which is the order AD4
 * requires: a mutation written after reading the tests grades the author's memory of the tests.
 * Each entry removes exactly one rule and names it.
 *
 * Kept here rather than in the subject, because the subject is never modified. The subject's own
 * `scripts/mutate-app.mjs` carries mutations for this file too, but it runs a **fixed list of five
 * suite files** — so it grades the subject's own tests and cannot grade a file an agent writes.
 * This set is what `npm run mutation-compare` points at, and the subject's own
 * `test/labs-routes.test.js` is the first thing it is pointed at, to establish the bar.
 *
 * **The holdout.** Five entries are marked `holdout`: they are scored like every other and
 * are never shown to a role in its pre-run briefing, because a role briefed from this set
 * and then scored against it is being marked on the answer it was handed. The split takes
 * one rule from each family the seam has — message validation, resource limit, lab policy,
 * session lifecycle, OAuth — rather than a run of adjacent entries, so what it measures is
 * the effect of briefing and not one family's difficulty.
 *
 * Measured before the split existed: this subject's own suite kills 4 of 14, the role
 * choosing its own targets 8, and the role handed the survivors 11. **Those three numbers
 * are not comparable with anything scored after this split**, and the 11 is the one the
 * split exists because of. Which of the five the baseline already covers is unknown until
 * the next run prints it — a holdout the baseline kills distinguishes nothing, and
 * `holdoutPower` says how many are in that state.
 */
import type { Mutation } from '../../../src/qe/mutation-compare.js';

export const MUTATIONS: Mutation[] = [
  {
    file: 'src/routes/labs.js',
    find: "  if (message.jsonrpc !== '2.0') return false;",
    replace: '  if (false) return false;',
    breaks: 'a message must declare jsonrpc 2.0',
  },
  {
    file: 'src/routes/labs.js',
    find: "  if (typeof message.method === 'string') return true;",
    replace: '  if (false) return true;',
    breaks: 'a request or notification must carry a method',
  },
  {
    file: 'src/routes/labs.js',
    find: '  return message.id !== undefined && message.id !== null;',
    replace: '  return true;',
    breaks: 'a response must carry an id',
    holdout: true,
  },
  {
    file: 'src/routes/labs.js',
    find: '  if (session.log.length > MAX_LOG_ENTRIES) session.log.shift();',
    replace: '  if (false) session.log.shift();',
    breaks: 'the transcript is capped at MAX_LOG_ENTRIES',
    holdout: true,
  },
  {
    file: 'src/routes/labs.js',
    find: "  if (lab.pending) return res.status(409).json({ error: lab.name + ' is pending: ' + lab.pending });",
    replace: '  if (false) return res.status(409).json({ error: lab.name });',
    breaks: 'a lab marked pending is refused with 409 rather than started',
    holdout: true,
  },
  {
    file: 'src/routes/labs.js',
    find: '  const existing = [...sessions.values()].find((s) => s.labId === lab.id && s.alive);',
    replace: '  const existing = undefined;',
    breaks: 'a lab already running is reused instead of started twice',
  },
  {
    file: 'src/routes/labs.js',
    find: '  if (!validMessage(message)) {',
    replace: '  if (false) {',
    breaks: 'a message that is not JSON-RPC is refused with 400',
  },
  {
    file: 'src/routes/labs.js',
    find: '  if (sizeOf(message) > MAX_MESSAGE_BYTES) {',
    replace: '  if (false) {',
    breaks: 'a message over MAX_MESSAGE_BYTES is refused with 413',
  },
  {
    file: 'src/routes/labs.js',
    find: '  if (session.oauth && session.oauth.token) headers.authorization = `Bearer ${session.oauth.token}`;',
    replace: '  if (false) headers.authorization = null;',
    breaks: 'a stored OAuth token is attached to the next request',
  },
  {
    file: 'src/routes/labs.js',
    find: '    if (!session.child || session.child.exitCode !== null) {',
    replace: '    if (false) {',
    breaks: 'sending to a stdio session whose process died is refused',
    holdout: true,
  },
  {
    file: 'src/routes/labs.js',
    find: "  const challenge = response.headers.get('www-authenticate');",
    replace: '  const challenge = null;',
    breaks: 'a WWW-Authenticate challenge is captured for the OAuth steps',
    holdout: true,
  },
  {
    file: 'src/routes/labs.js',
    find: "  if (lab.origin === 'remote') {",
    replace: '  if (false) {',
    breaks: 'a remote lab starts no process of its own',
  },
  {
    file: 'src/routes/labs.js',
    find: '  if (await portInUse(proc.port)) {',
    replace: '  if (false) {',
    breaks: 'a port already listening is reused rather than spawned over',
  },
  {
    file: 'src/routes/labs.js',
    find: '  if (!flow) {',
    replace: '  if (false) {',
    breaks: 'an OAuth callback with an unknown state is refused',
  },
];
