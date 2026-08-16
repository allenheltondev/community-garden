# Grow More of Your Own — library and posture

Location: `apps/grn/src/components/GrowMore/growMorePractices.ts` (content and
selection) and `apps/grn/src/pages/GrowMorePage.tsx` (the `/garden/grow-more`
view inside the Garden workspace).

## What it is

A browsable set of practices that help a garden feed its household further:
composting, growing more of what you already eat, succession sowing, seed
saving, covering soil between crops, watering deeply, season extension, keeping
a harvest, propagating from existing plants, perennials, and inviting
pollinators in.

Each practice carries the same fields, so cards stay consistent:

| Field | Purpose |
| --- | --- |
| `summary` | one line on what the practice is |
| `detail` | how it actually works |
| `opportunity` | what it opens up for the grower |
| `firstStep` | the smallest useful way to begin |
| `effort` | rough commitment, so nothing looks bigger than it is |
| `seasons` | when it is timely |
| `cropMatch` | crops already in the garden that make it handy now |
| `link` | optional deep link into the part of the app that supports it |

`selectGrowMorePractices` surfaces a few season-appropriate practices, ordered
so ones matching the grower's crops come first, and returns everything else
untouched in `rest`. Selection is deterministic for a given season and garden.

## Posture — read before extending this

Self-sufficiency is a direction some growers enjoy heading, **not a goal the
product sets for anyone**. This surface deliberately has:

- no score, percentage, or "food independence" metric
- no completion tracking or streaks on practices
- no targets, and no nudges to produce more

That follows `.kiro/steering/product-vision.md`: recognition reinforces
participation, never production volume, and the product must not create
pressure to overproduce. Adding a "you are 40% self-sufficient" meter here
would violate that, however motivating it looks.

Extensions that fit the posture: more practices, better seasonal or regional
relevance, deeper links into planning and journaling, and richer per-crop
guidance. Extensions that do not: anything that converts the library into a
program the grower can be behind on.
