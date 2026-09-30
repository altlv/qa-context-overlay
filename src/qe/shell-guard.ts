import type { GuardDecision } from './browser-guard.js';
import type { Environment } from './exploration-policy.js';

/**
 * The guard on `Bash`, for every role.
 *
 * The exploration policy binds the browser three ways, and every role that could run a
 * shell could reach everything the browser was refused: commit and push, a test run
 * pointed at another environment, a scan of any host, the contents of `.env`. None of
 * that was bound by anything but prose. See `docs/agent-workflows.md`.
 *
 * **What this cannot do.** It reads the command the agent wrote. `git commit` is
 * refused; the same command assembled from variables, or run inside a script the agent
 * wrote first, is not. A guard against accident, not against an adversary — the same
 * limit as the browser's label guard, and stated for the same reason.
 */

export interface ShellScope {
  /** The run's environment from `--env`, or null when it declared none. */
  environment: Environment | null;
  /** The app's base URL host and its config's `extraHosts`. Empty when the run has no app. */
  hosts: readonly string[];
}

const GIT_WRITE =
  /\bgit\s+(?:-C\s+\S+\s+)?(?:commit|push|reset|clean|rebase)\b|\bgit\s+(?:-C\s+\S+\s+)?checkout\s+--(?:\s|$)/;

/** A second agent run started from inside this one escapes its budget, lock and guard. */
const NESTED_RUN = /\bnpm\s+run\s+role\b|\bsrc[\\/]cli[\\/]role\.ts\b/;

/** `.env` and its variants, but never `.env.example`, which holds no values. */
const SECRETS =
  /(?:^|[\s'"`=:(\\/])\.env(?:\.(?!example\b)[\w-]+)?(?![\w.-])|\.git-credentials\b|\.netrc\b|\.npmrc\b|\.aws[\\/]credentials\b|\bid_(?:rsa|ed25519)\b/;

const ENV_ASSIGNMENT = /\b(TEST_ENV|EXPLORE_ENV)\s*=\s*["']?([\w-]+)/g;
const URL_HOST = /\bhttps?:\/\/([^\s/'"`:)\]]+)/gi;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

/** Characters no hostname contains, and every regular expression about one does. */
const NOT_HOSTNAME = /[[\]\\(){}|*+?^$]/;

/**
 * Whether this capture is something other than a destination.
 *
 * The guard cannot tell a URL a command will contact from one it merely contains, and a
 * live run paid for it: a session was refused for `[a-z` — the character class of a
 * pattern *about* URLs, matched by a pattern about URLs. An earlier session filed the same
 * shape against our tooling, a file write refused because the file's content named a
 * blocked host.
 *
 * Only that case is excluded, and only because a hostname cannot contain a bracket. The
 * first version of this also exempted the RFC-reserved suffixes — `.test`, `.example`,
 * `.invalid` — on the grounds that they cannot resolve. A test beside this one refused
 * that change by using `evil.test` as its example of a forbidden host, which is a decision
 * this repository had already made deliberately, and a guard should not be loosened to
 * make a run convenient. A role that wants an unreachable host has loopback.
 */
function notAHost(host: string): boolean {
  return NOT_HOSTNAME.test(host);
}

const allow: GuardDecision = { allowed: true, reason: 'within scope' };

export function shellGuard(scope: ShellScope): { check(command: string): GuardDecision } {
  const hosts = new Set(scope.hosts.map((host) => host.toLowerCase()));
  return {
    check(command) {
      if (GIT_WRITE.test(command)) {
        return {
          allowed: false,
          reason:
            'Git writes are refused: commits and pushes are the user’s. Describe the change in your report instead.',
        };
      }
      if (NESTED_RUN.test(command)) {
        return {
          allowed: false,
          reason:
            'Starting another role run from inside this one is refused: it would run outside this run’s budget, lock and guards. Delegate with the Agent tool, or report the need.',
        };
      }
      if (SECRETS.test(command)) {
        return {
          allowed: false,
          reason:
            'Reading .env or a credential store is refused. If a value is needed, say so in your report; never read it.',
        };
      }
      for (const [, name, value] of command.matchAll(ENV_ASSIGNMENT)) {
        if (scope.environment === null) {
          return {
            allowed: false,
            reason: `${name}=${value} is refused: this run declared no environment, so it may not choose one.`,
          };
        }
        if (value !== scope.environment) {
          return {
            allowed: false,
            reason: `${name}=${value} is refused: this run is bound to ${scope.environment}.`,
          };
        }
      }
      for (const [, rawHost] of command.matchAll(URL_HOST)) {
        const host = (rawHost ?? '').toLowerCase();
        if (LOOPBACK.has(host) || hosts.has(host) || notAHost(host)) continue;
        return {
          allowed: false,
          reason: `${host} is refused: this run may reach ${[...hosts].join(', ') || 'no external host'} and loopback only. A host the app legitimately needs belongs in its app config's extraHosts, reviewed in a commit — report the need.`,
        };
      }
      return allow;
    },
  };
}
