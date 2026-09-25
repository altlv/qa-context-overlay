import { test, expect } from '@playwright/test';
import { exploratoryTester } from '../../src/agents/roles/exploratory-tester.js';

/**
 * Five amendments, each bought with a measured session. They are pinned here because
 * every one of them corrects a failure the prompt read perfectly well without.
 *
 * The runs: two sessions against the same storefront, 746s/68 calls and 779s/63 calls,
 * both stopping at roughly 13 minutes of a 45-minute timebox with no budget cutting
 * either off, and 14 and 9 defect claims between them.
 */

const prompt = exploratoryTester.prompt as string;

test.describe('what the prompt must keep telling a session', () => {
  test('should hand it a measured clock and forbid estimating one', () => {
    // Both sessions called "date" once, at tool call #1, and invented every timestamp
    // after it. One closed claiming "~37 minutes of the 45" at a real elapsed of 779s.
    expect(prompt).toContain('SESSION CLOCK');
    expect(prompt).toContain('never estimate it');
  });

  test('should treat the budget as a floor to spend, not a ceiling to avoid', () => {
    // 135 turns and 88 actions unspent, twice. The only stopping guidance the prompt
    // used to carry was "when it runs low, stop", which nothing contradicted.
    expect(prompt).toContain('floor to spend, not a ceiling to avoid');
    expect(prompt).toMatch(/enough findings/i);
  });

  test('should require one bulk markup harvest before interacting', () => {
    // Seven of one run's fourteen findings came from a single pass like this. The
    // other run never made one, and the prompt never asked for it.
    expect(prompt).toContain('harvest the markup in bulk');
    expect(prompt).toMatch(/empty src/i);
  });

  test('should name the URL as an input surface', () => {
    // Two findings came from nothing but editing the address bar; the dimension list
    // said "UI, API, import and export, logs, queues" and stopped there.
    expect(prompt).toContain('the URL itself');
    expect(prompt).toMatch(/query parameter/i);
  });

  test('should make a surprising measurement suspect the instrument first', () => {
    // A run reported 25 invisible-but-tabbable elements from a filter ignoring
    // visibility:hidden (true count: zero), and an occlusion defect from a selector
    // matching an 800x5269 page-wide wrapper. Both retracted, both paid for in full.
    expect(prompt).toContain('claim about your instrument');
    expect(prompt).toContain('visibility:hidden');
  });

  test('should NOT tell it to open its skills, because they are already inlined', () => {
    // This file asserted the opposite for exactly one run. composeSystemPrompt inlines
    // the full text of every declared skill and the composed prompt then says "it is
    // already here — do not spend a turn reading its SKILL.md". An instruction to open
    // them is a live contradiction, the same class of fault that cost 4 turns and
    // $0.26 in the browser briefing.
    expect(prompt).not.toContain('Open the skills before you start');
  });
});

test.describe('measuring whether the inlined skills change anything', () => {
  test('should require every finding to declare what produced it', () => {
    // 21k tokens of skill text reach every session and nothing could tell whether any
    // of it landed — using a skill costs no tool call, so no ledger of calls sees it.
    expect(prompt).toContain('Say what found each finding');
    expect(prompt).toContain('"method"');
  });

  test('should ask for the method used, not the one that sounds best', () => {
    // The field is a measurement. A tidied answer destroys the only reading of it
    // there is, so the prompt makes "noticed it while doing something else" legitimate.
    expect(prompt).toContain('never\n   the one that sounds best');
    expect(prompt).toMatch(/Noticed it while doing something else/i);
  });
});

test.describe('what the session is actually for', () => {
  test('should define the job as uncovering and classifying, not finishing', () => {
    // The clock stopped the fabricated early close. It did not stop the voluntary
    // one: the next run still closed with 19 minutes left. Time was never the real
    // frame — a session ends when the product stops telling it things it did not know.
    expect(prompt).toContain('uncover information, and to classify what you uncover');
    expect(prompt).toContain('A session ends on');
    expect(prompt).toContain('information, never on tidiness');
  });

  test('should replace "have I got enough" with a question that can be answered', () => {
    // You cannot know what enough is: the thing being counted is the thing not yet
    // found. What a session can answer is where its last surprise pointed.
    expect(prompt).toMatch(/when did I last learn something, and where did it point/i);
    expect(prompt).toContain('avoiding the lead');
  });

  test('should make classification half the work, not filing', () => {
    // An unplaced finding is an anecdote, and an anecdote cannot be acted on,
    // argued for, or counted.
    expect(prompt).toContain('Classification is half the work');
    expect(prompt).toMatch(/is an anecdote/i);
  });
});

test.describe('breadth, against the pull of depth', () => {
  test('should counterweight "bugs cluster" with a return to the survey', () => {
    // True per-session economics, wrong across sessions: the cheap second defect in
    // an area is the one the next run finds anyway. Five sessions on one target
    // reached 39% of the union at best, and 31 of 57 findings were seen exactly once.
    expect(prompt).toContain('take a territory you have not touched');
    expect(prompt).toContain('not the whole story');
  });

  test('should say the singletons cluster by territory, not by luck', () => {
    expect(prompt).toContain('not luck');
    expect(prompt).toMatch(/none of them crossed/i);
  });
});
