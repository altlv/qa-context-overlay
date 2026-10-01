/**
 * Spawning a *subject's* own test runner, which is not this process's node.
 *
 * One rule, in one place, because it was written three times and forgotten a fourth. A
 * subject declares its runner as a command line — `node --test `, `npx vitest run ` — and
 * on Windows anything installed by npm is a `.cmd` shim. `CreateProcess` cannot start a
 * `.cmd`, so `spawn('npx')` fails with ENOENT and the caller sees "the suite could not be
 * started" for a runner that works perfectly from a prompt. The gate, the fault check and
 * the patience wrapper each learned this separately; `mutation-compare` had not, so the
 * mutation step could never run against a vitest subject — the one subject that exists to
 * prove a declared stack is honoured rather than assumed.
 *
 * The cost of a shell is that arguments are concatenated rather than escaped. What is
 * concatenated in every caller here is a runner the subject declared in its own config and
 * the paths of test files in its own tree, so there is no untrusted string in it. A subject
 * whose runner needs a quoted argument should be given a wrapper script rather than a
 * quoting dialect parsed here.
 */

/**
 * Whether this executable has to go through a shell.
 *
 * This process's own node is an absolute path to a real executable and needs no shell —
 * and going through one would make its arguments subject to shell quoting for no gain.
 * Everything else is treated as a name the shell must resolve.
 */
export function needsShell(executable: string): boolean {
  return executable !== '' && executable !== process.execPath;
}
