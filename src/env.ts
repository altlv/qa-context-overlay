import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads the harness's own .env into process.env.
 *
 * `.env.example` documents the credential routes — `CLAUDE_CODE_OAUTH_TOKEN`, and
 * `ANTHROPIC_API_KEY` for billing an API account — plus `HARNESS_MODEL`, `BASE_URL` and the
 * agent budget limits, and the code reads them from process.env — but nothing was ever
 * loading the file. Anyone following the README set their key and watched it be
 * ignored, which is a particularly annoying failure because the code looks correct
 * from both ends.
 *
 * **Anchored to this file, never to the working directory.** Loading `.env` relative
 * to cwd is fine while every command runs from the repo root, and actively harmful
 * once the harness is pointed at subjects that carry their own `.env`: running a
 * harness CLI from inside one would load *that subject's* variables into the harness
 * process and leave the harness's own key missing. A subject's secrets are the
 * subject's business and the harness must never inherit them by accident. mcpa-bot
 * resolves its own env by absolute path and had this right first.
 *
 * Uses Node's built-in loader rather than a dependency. Import for side effect,
 * first thing, before anything reads process.env.
 */
export function harnessEnvFile(): string {
  return resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
}

try {
  // Available from Node 20.12 / 21.7. Absent .env is fine — CI supplies real
  // environment variables instead.
  process.loadEnvFile(harnessEnvFile());
} catch {
  // No .env, or a Node old enough to lack the loader. Either way, fall back to
  // whatever the environment already provides.
}
