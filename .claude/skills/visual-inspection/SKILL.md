---
name: visual-inspection
description: Look at a rendered page methodically — the pre-flight checks that find bugs in the first two minutes, a sweep across positions and states, and the conditions worth forcing. Use before or during any session against a UI, and whenever a defect is likely to be visible rather than queryable. Not for deciding what to test (test-design) or for choosing input values (test-techniques).
# The named moves this skill is measured on — the terms a report would actually write. Headings
# alone are not enough: a skill whose headings are phases can only ever score zero, which is how
# `exploratory-session` reported 0/3 in four consecutive live runs against needles no report
# could contain. Single ubiquitous words are deliberately absent.
methods:
  - pre-flight
  - the sweep
  - position × state
  - conditions worth forcing
  - dismissal sweep
  - accessible-name pass
  - the placeholder rule
---

A DOM query answers what the page contains. It cannot tell you the panel escapes its
container, that two things overlap, that a word has a hole in the middle, or that a
spinner never stops.

This skill exists because "look at the page" is not a method. Told to look, an agent
looks **once**, at **one viewport**, in **one state**, and reports what it happens to
see. Three separate defects were missed that way in this repo's own sessions — all of
them plainly visible in a screenshot taken two scrolls further down.

## When to use

- Before a charter, as pre-flight — the first two minutes are the cheapest bugs you
  will ever collect
- Whenever the product renders something for a person to look at
- After any change to layout, copy, or an async region

## When NOT to use

- Deciding what deserves coverage → `test-design`
- Choosing which values to enter → `test-techniques`
- Judging whether what you saw is wrong → `oracle-check`

## Operating rules

- **A screenshot is a sample, not a survey.** One image is one position, one state,
  one viewport. Say which one.
- **Notice, then measure.** The eye finds it; a measurement makes it arguable. "That
  row looks off" becomes "this tile renders 376x346 where the other fifteen render
  376x376" — the second gets fixed.
- **Occlusion is directional.** _A covers B_ and _B covers A_ are two defects. Finding
  one does not clear the other, and in this repo's own session the second was missed
  after the first was found.

---

## 1. Pre-flight — five checks, under two minutes

Do these before the charter. They are not exploration; they are the bugs lying in the
open. Every one of them found a real defect in this repo's sessions.

**Do the arithmetic.** Any page showing numbers that should relate. Subtotal +
shipping + tax − discount against the total. Line total against quantity × price.
Item count against items shown. One subtraction found a cart adding a phantom $100 to
every order.

**Read every literal string.** Read, not skim. Placeholders shipped to production,
unhandled states, and broken grammar all surface in the same pass — "Loading Title",
"Test Title", "Missing Option:", a gift-card field pre-filled `...test...`, a button
reading `RETURN TO STOR   E`, an error saying "could not completed".

Then `Ctrl+F` for: `lorem` · `test` · `todo` · `TBD` · `placeholder` · `undefined` ·
`null` · `NaN` · `[object`.

**Open the console and network panel before touching anything.** A dead CDN and a
`404 /undefined` on every page load, found before the first click.

**Tab through it.** Ten seconds of pressing Tab. A page with 72 controls and 5 tab
stops is a finding. So is focus order that does not match reading order, a trap, and a
control that never receives focus at all.

**Say the same fact twice.** Any value shown in two places is a free oracle — a price
in the listing, on the detail page, in the cart, in the structured data. A product
refusing to show a price while sorting into its correct position by that price is how
you learn the price exists.

---

## 2. The sweep — position × state

The failure this prevents is looking once. Walk both axes.

**Positions:** top · middle · **bottom**. The footer is a place you go, not somewhere
you end up. Two defects in this repo's sessions lived there.

**States:** default · an overlay or panel open · with data · with none · mid-load ·
after an error · signed in.

The interesting cells are the combinations: _bottom of the page, with the login panel
open_ is a state nothing visits by accident, and it is where a panel was found sitting
on top of the legal links.

### Transient surfaces — the ones no page scan visits

A mini-cart, dropdown, modal, toast, drawer, tooltip or popover is a **surface**, not a
page. It exists only in a state, so it appears in no inventory and no crawl. Open each
one and look at it _in place_, at the position it appears.

A cart-preview panel hanging off the bottom of the page was missed for exactly this
reason: the cart _page_ was tested thoroughly and the cart _preview_ was never opened.

#### Dismissal sweep — opening a surface is half of it

Every surface you open, **close three ways**: `Escape`, a click outside it, and its own
close control. A surface with no way out is a trap whichever of the three is missing,
and the three fail independently — a modal can honour `Escape` and have no visible
close button, or have one that is unreachable by keyboard.

This is not hypothetical and it is not rare. A session against academybugs on
2026-10-09 found a feedback popover that **could not be dismissed with `Escape` and had
no distinguishable close target in the accessibility tree** — found only because the
session tried to close it. Opening it, looking at it and moving on would have reported
nothing, and every earlier session had done exactly that.

Then ask the question the open/close pair makes available: after dismissing it, is the
page as it was? A surface that leaves scroll locked, focus lost, or a backdrop behind
is a defect that only exists **after** the close.

### What to look for

| Look for                        | Reads as                                                               |
| ------------------------------- | ---------------------------------------------------------------------- |
| Alignment across a repeated row | one tile shorter than its siblings; a button 30px above its neighbours |
| Containment                     | content escaping its box, a panel past the page edge, overlap          |
| Occlusion, **both ways**        | a banner over a control; a panel over the footer                       |
| Broken text                     | a gap inside a word, truncation, overflow, a space before a full stop  |
| Repetition                      | the same breadcrumb, heading or block rendered twice                   |
| Label against content           | an image that does not match its title; "Select Shirt Size" on a coat  |
| Async regions                   | a spinner that never resolves; an empty state with no explanation      |

### Two free reveals

- **`Ctrl+A`** — select-all renders invisible text visible: duplicated content, strings
  parked off-screen, text outside its container.
- **Zoom to 50%** — nobody does this one. It exposes absolutely-positioned elements
  parked outside the viewport and containers that do not actually contain.

And **zoom to 200%**, which is a standard rather than a curiosity: content forced wider
than the viewport is a WCAG 1.4.10 failure.

### Accessible-name pass — the second rendering

The page renders twice: once for the eye, once for the accessibility tree. The second
is what a screen reader, and this harness's own scanner, actually read — and a control
can be perfectly legible in one and **absent from the other**.

Take the accessibility snapshot and look for controls with no accessible name, and for
several controls sharing one. Both are invisible to the eye by definition: the link
wrapping a product photo looks fine, and announces nothing.

Two sessions against academybugs found this twice over — **20 links with no accessible
name**, and three "Select Options" links sharing one name with no distinguishing
context, so a screen-reader user hears the same label three times for three different
products. Neither is visible in a screenshot. Both are WCAG failures (2.4.4, 4.1.2),
and the second is also the reason automation on that page is fragile, which is
`testability-audit`'s half of the same fact.

The eye and the tree disagreeing is itself the finding. Where a label is visible on
screen but missing from the tree, the page is showing one thing and announcing another.

---

## 3. Conditions worth forcing

Cheap, and each opens a class of state normal use never reaches.

| Force                                 | Exposes                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| Phone width                           | navigation that vanishes with no replacement                                       |
| Slow network, then offline mid-action | every loading and failure state you never see at full speed                        |
| Print preview                         | layouts that only exist on screen — receipts and confirmations most                |
| CSS disabled / reader mode            | DOM order against visual order; content that only works when styled                |
| One hostile paste per field           | a long string, an emoji, an RTL string, a leading space — one each, not a campaign |

---

## The placeholder rule

**A placeholder or loading string visible in production is evidence about a class, not
a typo.**

This is the rule that costs the most when it is missed. "Loading Title" rendered on a
live page was filed as a copy defect and moved past. It was pointing at a product whose
async states are unhandled — and the same defect family was later found as a billing
panel spinning forever behind a login. The string was a signpost, read as litter.

When you find one, stop and ask what it implies, then go looking for the rest of its
family.

## Decision points

| Situation                             | Action                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| It looks wrong but you cannot say why | Measure it. A number turns an impression into a defect report.                   |
| It only reproduces at one size        | Say which. A viewport-specific defect is still a defect                          |
| Something is ugly but works           | `oracle-check` — is there an oracle, or is it taste? Raise taste as a question   |
| You found one occlusion               | Look for the reverse before moving on                                            |
| A spinner has not resolved            | Wait longer, then say how long you waited. "Slow" and "never" are different bugs |

## Interlaying (blind spot)

This finds what is visible. It says nothing about whether the numbers behind the page
are right, whether a control does what it claims, or whether anything persisted —
`test-techniques` and `exploratory-session` cover those.

It also depends on being able to see. Roles that need to — `exploratory-tester` and
`testability-reviewer` — drive a real browser through the Playwright MCP server, with
`browser_take_screenshot`, `browser_snapshot`, `browser_hover`, `browser_mouse_wheel`
and `browser_resize` for the position sweep and the forced conditions.

**The harness already classifies what arrived, so read it rather than re-deriving it.**
After every action, `src/tools/surfaces.ts` reports the kind of surface that appeared
and the facts behind the label — whether it covers content, whether it is pinned to the
viewport, whether it traps focus, whether it announced itself, and whether it left on
its own. A line reading `popover — pinned to the viewport and covering content, does
not trap focus and announces nothing` has done the measuring for you: "announces
nothing" is already an accessible-name finding, and "does not trap focus" on something
that covers the page is already a keyboard one. Where the label is marked
**provisional**, its lifetime was not observed — that is a budget decision, not an
observation, so do not report it as one. **Any other
agent still cannot run this skill** and should say so rather than substituting a DOM
query and calling it looking.

What you are granted depends on the environment. Under a `prod` policy the browser is
observation-only: no clicking, typing or form submission, because those tools are
absent rather than discouraged. That rules out the state axis of the sweep — a panel
you cannot open is a panel you cannot inspect — so report those cells as unreached
instead of quietly narrowing the sweep to what the policy allowed.

_Lineage and licences: `docs/sources.md`._
