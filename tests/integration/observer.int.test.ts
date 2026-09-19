import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { activePage, pageObserver } from '../../src/qe/observer.js';
import { browserMcpConfig } from '../../src/qe/browser-tools.js';
import { policyFor } from '../../src/qe/exploration-policy.js';
import { freePort } from '../../src/qe/run-worktree.js';

/**
 * The claim E5b rests on: **one browser, two clients.** Playwright MCP drives it
 * because the run hands it `--cdp-endpoint`, and the harness reads it over a second
 * connection to the same endpoint.
 *
 * Worth a real test rather than a spike, because nothing about it is guaranteed by
 * either package's API and both can change under us. If Playwright MCP ever launches
 * its own browser despite the flag, every state this harness counts becomes a state in
 * a browser the agent is not using — and the failure would be silent, since a count of
 * zero reads exactly like a session that never moved.
 */

const PAGE = 'data:text/html,<main><button>Open cart</button></main>';

async function sharedBrowser() {
  const port = await freePort();
  const endpoint = `http://127.0.0.1:${port}`;
  const driven = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
  const eyes = await chromium.connectOverCDP(endpoint);
  return {
    endpoint,
    eyes,
    async close() {
      await eyes.close();
      await driven.close();
    },
  };
}

test.describe('the harness and the agent share one browser', () => {
  test('should let the observer read a page another CDP client opened and changed', async () => {
    const shared = await sharedBrowser();
    const driver = await chromium.connectOverCDP(shared.endpoint);
    const observer = pageObserver(() => activePage(shared.eyes));

    try {
      const context = driver.contexts()[0]!;
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(PAGE);

      const first = await observer.observe();
      expect(first, 'the observer must be able to read a page it did not open').not.toBeNull();
      expect(observer.count(), 'one look, one state').toBe(1);

      // The driver opens something. This is a modal in miniature: new controls, same URL.
      await page.evaluate(() =>
        document
          .querySelector('main')!
          .insertAdjacentHTML('beforeend', '<button>Confirm</button><button>Cancel</button>'),
      );

      const second = await observer.observe();
      expect(
        second?.appeared.map((control) => control.name).sort(),
        'a surface opening without a URL change is the case the whole state model exists for',
      ).toEqual(['Cancel', 'Confirm']);
      expect(second?.isNewState, 'and it has to register as somewhere new').toBe(true);
      expect(observer.missed(), 'nothing should have been missed on a settled page').toBe(0);
    } finally {
      await driver.close();
      await shared.close();
    }
  });

  test('should see the page Playwright MCP itself navigated', async () => {
    const shared = await sharedBrowser();
    const config = browserMcpConfig(
      policyFor('local'),
      'http://127.0.0.1',
      'artifacts/browser',
      'none',
      shared.endpoint,
    );

    expect(
      config.args,
      'without the endpoint MCP owns a browser nothing else can reach, and the observer would read an empty one',
    ).toContain('--cdp-endpoint');
    expect(
      config.args,
      'a profile flag alongside an endpoint would be MCP trying to own a browser it is only attaching to',
    ).not.toContain('--isolated');

    const mcp = spawn(config.command, config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;
    const observer = pageObserver(() => activePage(shared.eyes));

    try {
      await call(mcp, 1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'observer-int-test', version: '1' },
      });
      mcp.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
      );
      await call(mcp, 2, 'tools/call', {
        name: 'browser_navigate',
        arguments: { url: PAGE },
      });

      const transition = await observer.observe();

      expect(
        transition,
        'MCP launching its own browser would leave the observer with nothing, and a silent zero reads like a session that never moved',
      ).not.toBeNull();
      expect(
        transition?.appeared.map((control) => control.name),
        'the control MCP put on screen must be the one the harness reads back',
      ).toEqual(['Open cart']);
    } finally {
      mcp.kill();
      await shared.close();
    }
  });
});

/** Minimal JSON-RPC over stdio — enough to drive one tool call, and no more. */
function call(
  mcp: ChildProcessWithoutNullStreams,
  id: number,
  method: string,
  params: unknown,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} did not answer in 30s`)), 30_000);
    let buffer = '';
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      let cut = buffer.indexOf('\n');
      while (cut !== -1) {
        const line = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut + 1);
        if (line !== '') {
          const message = JSON.parse(line) as { id?: number };
          if (message.id === id) {
            clearTimeout(timer);
            mcp.stdout.off('data', onData);
            resolve();
            return;
          }
        }
        cut = buffer.indexOf('\n');
      }
    };
    mcp.stdout.on('data', onData);
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}
