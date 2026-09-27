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
 */
export interface LabMutation {
  file: string;
  find: string;
  replace: string;
  breaks: string;
}

export const MUTATIONS: LabMutation[] = [
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
  },
  {
    file: 'src/routes/labs.js',
    find: '  if (session.log.length > MAX_LOG_ENTRIES) session.log.shift();',
    replace: '  if (false) session.log.shift();',
    breaks: 'the transcript is capped at MAX_LOG_ENTRIES',
  },
  {
    file: 'src/routes/labs.js',
    find: "  if (lab.pending) return res.status(409).json({ error: lab.name + ' is pending: ' + lab.pending });",
    replace: '  if (false) return res.status(409).json({ error: lab.name });',
    breaks: 'a lab marked pending is refused with 409 rather than started',
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
  },
  {
    file: 'src/routes/labs.js',
    find: "  const challenge = response.headers.get('www-authenticate');",
    replace: '  const challenge = null;',
    breaks: 'a WWW-Authenticate challenge is captured for the OAuth steps',
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
