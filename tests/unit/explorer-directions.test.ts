import { test, expect } from '@playwright/test';
import { exploratoryTester } from '../../src/agents/roles/exploratory-tester.js';
import { composeSystemPrompt } from '../../src/agents/compose.js';

/**
 * Four standing directions the explorer role carries in every session.
 *
 * These are not an implementation detail and they are not mine to trade away. They
 * were given as a standing requirement — "those directions must be part of the
 * explorer role, always" — and "always" cannot mean "whoever edits this file next
 * remembers". So it means this file: drop one and the build fails.
 *
 * The role prompt has been rewritten a dozen times in a week, usually by deleting a
 * paragraph that looked redundant. Each of these four has a whole section elsewhere in
 * the prompt explaining how to do it well, which is exactly what makes the summary at
 * the top look like the safe thing to cut. It is not. The sections say HOW; these say
 * that the four hold at all, whatever a charter asks for.
 */

const prompt = exploratoryTester.prompt as string;

/** Phrase, and what its loss would cost. Each must survive any edit to the role. */
const DIRECTIONS: { name: string; must: RegExp; costs: string }[] = [
  {
    name: 'understand the product context first',
    must: /Understand the product context first/i,
    costs:
      'without it the ranking comes from habit, and habit runs the same sweep against a bank and a spellchecker',
  },
  {
    name: 'explore',
    must: /\*\*Explore\.\*\* Not a checklist walked, not a scan confirmed/,
    costs: 'a session that only confirms the scan has spent its budget agreeing with a free tool',
  },
  {
    name: 'find bugs, inconsistencies and risks — and classify them',
    must: /Find the bugs, the inconsistencies and the risks/i,
    costs: 'an unplaced finding is an anecdote, and an anecdote cannot be acted on or counted',
  },
  {
    name: 'look for the unexpected',
    must: /Look for the unexpected/i,
    costs: 'the predicted behaviours are already checked by something cheaper than a session',
  },
];

test.describe('the four standing directions', () => {
  for (const direction of DIRECTIONS) {
    test(`should always carry: ${direction.name}`, () => {
      expect(
        prompt,
        `This is a standing direction, not a paragraph to tidy away — ${direction.costs}.`,
      ).toMatch(direction.must);
    });
  }

  test('should state that they hold whatever the charter says', () => {
    // The charter says where and why; the role says how. A charter that appears to
    // excuse a direction is a badly written charter, and the session should say so
    // rather than quietly comply — we have already paid for a charter that taught
    // method and pre-loaded its own answers.
    expect(prompt).toMatch(/hold in every session, whatever the charter says/i);
    expect(prompt).toMatch(/cannot excuse\s+you from any of them/i);
  });

  test('should keep them ahead of the method that serves them', () => {
    // Their whole purpose is to survive a session that runs out of budget or patience
    // partway through the method. Buried at the end they would be read last or not
    // at all.
    const method = prompt.indexOf('Method:');
    expect(method, 'the prompt must still have a Method section').toBeGreaterThan(0);
    for (const direction of DIRECTIONS) {
      const at = prompt.search(direction.must);
      expect(at, `${direction.name} must appear before the method`).toBeLessThan(method);
    }
  });

  test('should survive composition, which is what the agent actually receives', () => {
    // runAgent is handed composeSystemPrompt(role), not role.prompt. A direction that
    // existed only before the skills were appended would never reach a session.
    const composed = composeSystemPrompt(exploratoryTester);
    for (const direction of DIRECTIONS) {
      expect(composed, `${direction.name} must reach the composed prompt`).toMatch(direction.must);
    }
  });
});
