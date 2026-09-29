# Design Guidelines

## Grounding

The subject has a real-world visual vernacular already: the rate boards jewellers hang outside their shops — LED digit displays or hand-chalked boards showing today's gold price. Most people in Colombo have walked past one. That's the reference point for this design, not a generic fintech dashboard. The page's single job: let someone glance at it and know today's gold price and who's offering the best rate, as fast as reading the board on the street.

Audience is broad — jewellers checking their own listing, and ordinary consumers who may not think of themselves as "using an app." Keep it legible and plain before clever.

## Color

| Name | Hex | Use |
|---|---|---|
| Ink | `#15120E` | Primary background — warm near-black, not pure black |
| Parchment | `#F3ECDC` | Light surfaces, card backgrounds, ledger areas |
| Antique Gold | `#C9A34E` | Primary accent — the hero price, key actions, active states |
| Deep Emerald | `#1B4332` | Positive/"up" indicator, secondary accent |
| Brick | `#9C4A3C` | Negative/"down" indicator, stale-data warnings |
| Brass Line | `#8A7350` | Hairline dividers, borders, muted labels |

Avoid pure orange/terracotta accents and avoid neon acid tones — this isn't a SaaS dashboard, it's closer to a ledger crossed with a shopfront sign. Gold should look like gold: warm, slightly muted, not saturated like a brand yellow.

## Typography

- **Display** (headings, the hero price): a warm serif with some heritage weight — Fraunces or Newsreader. Used at large size, restrained elsewhere.
- **Body**: a clean humanist sans — Inter or General Sans — for all reading text, labels, nav.
- **Numerals/data**: a monospace with tabular figures — IBM Plex Mono or JetBrains Mono — for every price, table column, and the calculator. Tabular numerals matter here: prices in a comparison table must align on the decimal, not wobble line to line.

Never render a price in the display serif. Prices are always in the mono face — that distinction itself signals "this number is data you can trust," separate from editorial headings.

## Layout concept

```
┌─────────────────────────────────────┐
│           THE BOARD (hero)           │  ← dark panel, LED-board styling
│     24K  LKR 46,500 /g   ▲ 0.4%      │
│     22K  LKR 42,600 /g               │
│     18K  LKR 34,900 /g               │
│     updated 6:52 AM · 14 shops       │
└─────────────────────────────────────┘

  [ Area filter ▾ ]        [ Sort: price ▾ ]

┌─────────────────────────────────────┐
│  Shop        24K      22K   Updated  │  ← ledger table, hairline rows
│  ─────────────────────────────────   │
│  Name A    46,400   42,500   3m ago  │
│  Name B    46,600   42,700   1h ago  │
│  Name C    45,900   42,100   9h ago● │  ← stale dot in Brick
└─────────────────────────────────────┘

┌───────────────┐
│ Convert        │  ← small brass-framed calculator panel
│ [ grams ] [24K▾]│
│ = LKR ______   │
└───────────────┘

  ~ trend sparkline, 30 days ~
```

Single column on mobile, board and table stack in that order. On desktop the board can run full-width with the table and calculator side by side below it.

## Signature element: The Board

The hero is styled as a physical LED rate board rendered in the browser: dark panel, gold digits, a subtle scanline/glow texture behind the numbers (very subtle — this is restraint, not a neon sign). On page load, the price digits do a single brief settle animation — like a split-flap display landing on today's number — then stay completely static. This is the one orchestrated motion moment on the page. Nothing else should move on load.

Everything else on the page — the table, the calculator, the filters — stays quiet and ledger-plain so the Board is unambiguously the thing you look at first.

## Motion

- One load animation only: the Board's digits settling into place (respect `prefers-reduced-motion` — show the final state immediately if set).
- Table rows: a plain background highlight on hover, no movement.
- No scroll-triggered reveals, no parallax, no card-hover lift effects. This product is read fast and often; motion that delays reading the number is a cost, not a delight.

## Component notes

- **Freshness indicator**: every price carries a "last updated" timestamp. Beyond ~6 hours stale, show a small Brick-colored dot and gray the row slightly — never hide a stale price, just mark it honestly.
- **Direction indicators** (▲/▼ vs yesterday): Emerald for up, Brick for down, and skip the arrow entirely if unchanged — don't force a symbol where there's no story.
- **Area filter**: plain dropdown, not a map or fancy geo-picker — this is a utility control, not a feature to show off.
- **Calculator**: single input (grams) + karat selector, live output, no submit button. It's arithmetic, not a form.

## Voice

- Plain and direct. "Today's gold price" not "Live Gold Rate Intelligence."
- Numbers speak for themselves — don't editorialize price movements ("prices surge!"). State the fact and the delta.
- Empty/error states: say what happened and what to do. "No submissions yet today — showing yesterday's prices" rather than a blank table or a generic spinner forever.

## Accessibility floor

- Body text on Ink background must hit WCAG AA contrast — check Antique Gold on Ink specifically, it's borderline at small sizes, so keep gold text large/bold or switch to Parchment for small labels on dark panels.
- All interactive elements (filter, sort, calculator inputs) need visible keyboard focus states.
- Responsive down to a narrow mobile viewport — this will very likely be opened from a WhatsApp-shared link on a phone, not a desktop, as the primary entry point.
