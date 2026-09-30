import { test, expect } from '@playwright/test';
import { shellGuard } from '../../src/qe/shell-guard.js';

/**
 * Each rule is tested both ways: the command it exists to refuse, and the ordinary
 * command next to it that must still run. A shell guard that refuses too much is
 * switched off within a week, and then it guards nothing.
 */

const local = shellGuard({ environment: 'local', hosts: ['127.0.0.1'] });
const onTest = shellGuard({ environment: 'test', hosts: ['demo.example.com', 'auth.example.com'] });
const undeclared = shellGuard({ environment: null, hosts: [] });

const allowed = (guard: ReturnType<typeof shellGuard>, command: string) =>
  guard.check(command).allowed;

test.describe('git', () => {
  test('should refuse every git write the user owns', () => {
    for (const command of [
      'git commit -m "x"',
      'git push origin main',
      'git reset --hard HEAD~1',
      'git clean -fd',
      'git rebase main',
      'git checkout -- src/a.ts',
      'cd repo && git -C . commit -am wip',
    ]) {
      expect(allowed(local, command), `"${command}" must be refused`).toBe(false);
    }
  });

  test('should allow reading git state', () => {
    for (const command of ['git status --short', 'git diff --stat', 'git log --oneline -5']) {
      expect(allowed(local, command), `"${command}" is how an agent inspects its work`).toBe(true);
    }
  });
});

test.describe('environments', () => {
  test('should refuse a test run pointed at another environment', () => {
    expect(
      allowed(onTest, 'TEST_ENV=prod npx playwright test'),
      'the shell must not reach an environment the run was not started for',
    ).toBe(false);
    expect(allowed(onTest, 'EXPLORE_ENV=local npm run scan -- https://demo.example.com')).toBe(
      false,
    );
  });

  test('should allow the environment the run declared', () => {
    expect(allowed(onTest, 'TEST_ENV=test npx playwright test --project=demo')).toBe(true);
  });

  test('should refuse choosing any environment when the run declared none', () => {
    expect(allowed(undeclared, 'TEST_ENV=local npx playwright test')).toBe(false);
  });
});

test.describe('hosts', () => {
  test('should refuse a host outside the app and its extra hosts', () => {
    expect(
      allowed(onTest, 'npm run scan -- https://other.example.org/page'),
      'a scan of an undeclared host is the shell route around the browser allowed origins',
    ).toBe(false);
    expect(allowed(onTest, 'curl -s http://evil.test/x')).toBe(false);
  });

  test('should allow the app’s host, its configured extra hosts and loopback', () => {
    expect(allowed(onTest, 'npm run scan -- https://demo.example.com/cart out.json')).toBe(true);
    expect(
      allowed(onTest, 'curl -s https://AUTH.example.com/.well-known/openid-configuration'),
      'an extra host the app config lists is reviewed, so it is allowed, whatever its case',
    ).toBe(true);
    expect(allowed(onTest, 'curl -s http://127.0.0.1:4173/api/todos')).toBe(true);
    expect(allowed(undeclared, 'curl http://localhost:4173/')).toBe(true);
  });

  test('should refuse any external host when the run has no app', () => {
    expect(allowed(undeclared, 'curl https://demo.example.com')).toBe(false);
  });

  test('should point a refused host at the app config, not at a workaround', () => {
    expect(
      onTest.check('curl https://cdn.other.net/x').reason,
      'widening is a reviewed commit to the app config, never something the agent does',
    ).toContain('extraHosts');
  });
});

test.describe('secrets and nested runs', () => {
  test('should refuse reading .env and credential stores', () => {
    for (const command of [
      'cat .env',
      'type .env.local',
      'grep KEY ./.env',
      'cat ~/.aws/credentials',
      'cat ~/.ssh/id_rsa',
      'cat ~/.npmrc',
    ]) {
      expect(allowed(local, command), `"${command}" must be refused`).toBe(false);
    }
  });

  test('should allow the example file, which holds no values', () => {
    expect(allowed(local, 'cat .env.example'), '.env.example is documentation').toBe(true);
    expect(allowed(local, 'npm run check'), 'loading .env inside a script is not reading it').toBe(
      true,
    );
  });

  test('should refuse starting another role run from inside a run', () => {
    expect(
      allowed(local, 'npm run role -- e2e-coder "write it"'),
      'a nested run escapes this run’s budget, lock and guard',
    ).toBe(false);
  });
});

test.describe('a URL the command mentions rather than contacts', () => {
  // Two live runs paid for this. A session was refused for `[a-z` — the character class
  // of a pattern about URLs, matched by a pattern about URLs — and again for
  // `example.test`, a domain reserved precisely so it can be named safely. An earlier
  // session filed the same shape against our tooling: a file write refused because the
  // file's content named a blocked host.
  const guard = shellGuard({ environment: 'test', hosts: ['academybugs.com'] });

  test('should not read a regular expression as a destination', () => {
    expect(
      guard.check(String.raw`grep -oE "https?://[a-z0-9.-]+" server/rag.js`).allowed,
      'a hostname cannot contain a bracket, so this was never a host',
    ).toBe(true);
  });

  test('should keep refusing a reserved test domain, because that was decided already', () => {
    // The first version of the fix exempted .test, .example and .invalid on the grounds
    // that they cannot resolve. The test above refused that change by using evil.test as
    // its example of a forbidden host — a decision this repository had already made, and
    // a guard is not loosened to make a run convenient. A role wanting an unreachable
    // host has loopback.
    expect(guard.check('curl http://example.test/api').allowed).toBe(false);
  });

  test('should still refuse a host that could actually be reached', () => {
    // The narrowing must not become a way through: anything resolvable stays refused.
    const decision = guard.check('curl https://api.openai.com/v1/models');
    expect(decision.allowed, 'a real host is the whole point of this guard').toBe(false);
    expect(decision.reason).toContain('api.openai.com');
  });

  test('should still allow the host its app declared', () => {
    expect(guard.check('curl https://academybugs.com/find-bugs/').allowed).toBe(true);
  });
});
