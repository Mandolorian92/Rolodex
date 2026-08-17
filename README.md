# Rolodex

A near-real-time price ticker for trading card collections. Track the cards you own, and
get automatic sell/hold signals backed by **real recent sales** — not just
[PriceCharting](https://www.pricecharting.com/api-documentation)'s aggregate guide price,
which can lag what a card is actually selling for. PriceCharting's own marketplace sold
offers and, optionally, eBay sold comps both feed directly into the same price timeline
the guide price does, so an actual sale that beats the guide shows up as a signal
immediately instead of waiting for the aggregate number to catch up.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind
- **Postgres** via **Prisma 7** (using the `@prisma/adapter-pg` driver adapter)
- **Recharts** for price history / sparklines
- No auth — this is built as a single-user app for now

## How it works

- **Cards** are pulled from the PriceCharting catalog (`src/lib/pricecharting.ts`) and
  cached locally as `Card` rows, keyed by PriceCharting's product id.
- **CollectionItem** rows track what you actually own — quantity, condition (mapped to the
  matching PriceCharting price field via `src/lib/grades.ts`), cost basis.
- You can populate your collection two ways:
  - **Import** (`src/lib/import.ts`, `POST /api/collection/import`, the "Import from
    PriceCharting" button on `/collection`) — pulls your existing PriceCharting collection
    in one call via the Marketplace API (`/api/offers?status=collection`), including a
    starting price for each card. Safe to re-run; it syncs quantity/condition from
    PriceCharting rather than duplicating.
  - **Manual add** (`/collection/add`) — search the catalog and add a card by hand.
- A **sync** (`src/lib/sync.ts`, exposed as `POST /api/sync` and `npm run sync`) does three
  things per card, in order:
  1. Pulls PriceCharting's guide price for every grade/condition field that card's category
     returns, as `PriceSnapshot` rows (`source: PRICECHARTING_GUIDE`).
  2. Pulls real recent sold transactions — PriceCharting's own marketplace
     (`src/lib/marketSales.ts`, works with the same API key, no extra signup) and, if
     configured, eBay. Each sale is recorded twice: as a `MarketSale` (title/link/image, for
     display) and mirrored into `PriceSnapshot` (`source: PRICECHARTING_SALE` /
     `EBAY_SALE`) at its real sale date — so the trend engine sees an actual sale exactly
     like a guide-price move, not as a separate side channel.
  3. Runs the **trend engine** against the merged timeline.

  All PriceCharting calls go through a shared throttle (`src/lib/rateLimit.ts`) to stay
  under their hard 1 request/second limit — exceeding it risks API access being revoked.
  Note this means two PriceCharting calls per card per sync (guide + sold offers), so a
  full sync takes roughly 2 seconds/card.
- The **trend engine** (`src/lib/trends.ts`) looks at each card's merged price+sales history
  and fires `Alert` rows for:
  - **Trending up / down** — ≥10% move over the trailing 7 days
  - **New high** — the latest price is an all-time high
  - **Sell signal** — either a big 30-day run-up (≥35%) or a pullback of ≥8% from a recent
    30-day peak (momentum stalling after a run)
  - Alerts are deduplicated with a 24h cooldown per (card, price type, alert type) so a
    sustained trend doesn't spam you every sync.
  - Cards currently worth less than `ALERT_MIN_VALUE_USD` (default $5) skip trending/new-high/
    sell-signal alerts entirely — a 140% swing on a $1.60 card isn't actionable, so it's
    filtered before an alert is ever generated rather than just visually de-emphasized.
  - When a signal is driven by an actual sale rather than the guide price, the alert message
    says so explicitly (e.g. "Ungraded just hit a new high of $10,900.00 — based on a recent
    eBay sale") — the evidence behind the recommendation, not just a percentage.
- **Notifications** (`src/lib/notify.ts`): every alert created during a sync run is batched
  into one summary email via [Resend](https://resend.com). Optional — with no email config,
  sync just skips it and alerts still show up on `/alerts`.
- **Variant mismatch flagging** (`src/lib/variants.ts`): the same card number often exists
  as several print variants — Holo, Reverse Holo, Cosmos Holo, 1st Edition, etc — with real
  price differences between them. PriceCharting's collection scan is trusted as the source
  of truth for what a card is (its `product-name`/console are re-synced from PriceCharting
  on every import, not just set once), but scans can still be mislabeled. So whenever a card
  is first imported or added, the app searches PriceCharting's catalog for same-card
  different-variant siblings (matching on card identity with variant wording stripped out —
  "Vaporeon #22" out of both "Vaporeon #22 Holo" and "Vaporeon #22 Cosmos Holo") and flags
  it (`VARIANT_MISMATCH` alert, "Check variant" badge) if one is priced ≥10% more than
  what's on file — worth a manual double-check rather than an assumption either way. Also
  triggerable on demand from the "Check for higher-value variants" button on a card's page.

  Two things worth knowing: the variant-token list (`VARIANT_TOKENS`) is necessarily
  incomplete — it covers common Pokemon-style print variants, extend it for other games/
  variants as you hit them — and the comparison is guide-price-to-guide-price, since we
  don't track sale history for cards outside the collection.
- **Grading recommendations** (`src/lib/gradingRecs.ts`, `GRADING_OPPORTUNITY` alert, "Grade
  rec" badge): mirrors PriceCharting's own `sort=grade-recs` view, but gated by trend data
  instead of a static price gap. For each raw (ungraded/played) card owned, it compares the
  latest raw price against the latest Grade 9 price already sitting in that card's
  `PriceSnapshot` history — no extra API calls, since every sync already pulls every grade
  tier's guide price, not just the condition you own. A recommendation only fires when the
  premium clears both a dollar floor (`GRADING_MIN_PREMIUM_USD`, default $20 — roughly what
  grading + shipping costs) and a percentage floor (25%), **and** the Grade 9 price hasn't
  been declining over the trailing 30 days — a big premium that's actively shrinking isn't
  "solid," it's a fading opportunity. Runs every sync (it's a pure local computation, unlike
  the variant check), with a 14-day alert cooldown per card.
- The **dashboard** (`/`) is the ticker: portfolio value, average 7-day change, and a table
  per card with its latest price, 7-day change, sparkline, and any active signals.
- The **collection** page (`/collection`) is sortable by card name, condition, latest price,
  grade-rec premium, or date added — click a column header to sort by it, click again to
  flip direction. When any card has a live grading recommendation, a banner links straight to
  the Grade rec sort so the best candidates surface first.
- A **card's detail page** (`/cards/[id]`) shows a "Price by grade" panel — every grade tier
  PriceCharting publishes for that card at a glance (Ungraded through PSA/BGS/CGC/SGC 10),
  with the tier(s) you actually own highlighted — plus the grading-recommendation callout
  when one applies. Built from `latestPriceByType()` in `src/lib/cardStats.ts`, reading the
  same already-synced `PriceSnapshot` rows as everything else — no new data source.
- **Portfolio** (`/portfolio`, `src/lib/portfolio.ts`) is the investment-tracking view: cost
  basis vs. current value, unrealized gain $/%, a best-to-worst performer ranking, and a
  portfolio-value-over-time chart. The history chart reconstructs total value on every day
  any card got a fresh price, carrying forward each card's last known price on days it
  didn't — a simplification, since quantity-owned history isn't tracked, only current
  holdings applied backward.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL and PRICECHARTING_API_KEY
npm run db:migrate     # applies the schema to your Postgres database
npm run db:seed        # optional: loads demo cards with synthetic price history
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `PRICECHARTING_API_KEY` | yes, for real data | Your 40-character token — Subscription page → "API/Download". Requires a paid PriceCharting subscription. |
| `PRICECHARTING_SELLER_ID` | no | Your PriceCharting user id, for the collection importer — the part of `pricecharting.com/offers?...&seller=THIS_PART&status=collection` after `seller=`. Can also be entered directly in the import form instead. |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | no | eBay developer app credentials, for pulling sold comps |
| `RESEND_API_KEY` | no | Enables email notifications — [get a free key](https://resend.com) |
| `ALERT_EMAIL_TO` | no | Where alert emails get sent. Required (along with `RESEND_API_KEY`) to turn notifications on |
| `ALERT_EMAIL_FROM` | no | Sender address. Defaults to Resend's shared test sender, which works without verifying your own domain |
| `APP_BASE_URL` | no | Used to build links back to the app inside notification emails. Defaults to `http://localhost:3000` |
| `ALERT_MIN_VALUE_USD` | no | Skip trending/new-high/sell-signal alerts for cards currently worth less than this. Defaults to `5` |
| `GRADING_MIN_PREMIUM_USD` | no | Minimum dollar premium (Grade 9 price minus raw price) for a grading recommendation to fire. Defaults to `20` |

Without `PRICECHARTING_API_KEY` set, the app still runs — collection/alerts pages work off
whatever's already in the database (e.g. the seed data), but syncing/importing will fail
with a clear error instead of crashing.

`EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` are optional — real sold-comp data already works
without them, via PriceCharting's own marketplace (`getSoldOffers` in `pricecharting.ts`),
which uses your existing API key. eBay adds a much larger sales pool on top of that, since
most card sales happen there, but its **sold-listing** data lives behind the Marketplace
Insights API, which eBay only grants to approved developer accounts on request — see
[the eBay docs](https://developer.ebay.com/api-docs/buy/marketplace-insights/overview.html).
If your keys don't have that access yet, `fetchSoldComps` logs a warning and returns an
empty list rather than failing the sync.

### Notifications

Set `RESEND_API_KEY` and `ALERT_EMAIL_TO` to get an email whenever a sync run produces new
alerts — one email per sync summarizing everything that fired, not one per alert. The
`/alerts` page shows whether notifications are configured and has a "Send test email"
button to confirm the setup works before waiting on a real signal.

[Resend](https://resend.com)'s free tier doesn't require verifying your own sending domain
to get started — the default `onboarding@resend.dev` sender works, though it can only send
to the email address on your Resend account until you verify a domain. Swap in your own
domain via `ALERT_EMAIL_FROM` once you have one set up.

### Keeping prices fresh

Nothing calls `/api/sync` automatically. Wire it up to whatever scheduler you're deploying
with, e.g. [Vercel Cron](https://vercel.com/docs/cron-jobs) hitting `POST /api/sync`, or a
plain cron job running `npm run sync` on a server.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run start` | Production build / run |
| `npm run sync` | Refresh prices + run the trend engine from the CLI |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Load demo cards with synthetic price history |
| `npm run db:studio` | Open Prisma Studio |

## Data model

See `prisma/schema.prisma`. Briefly: `Card` (catalog entry) → `CollectionItem` (what you
own), `PriceSnapshot` (the merged time series — guide pulls and individual sales alike —
that the ticker and trend engine read), `MarketSale` (sold-transaction details for display:
title/link/image/condition), and `Alert` (generated signals). `PriceSnapshot.source` and
`MarketSale.source` share one `PriceSource` enum (`PRICECHARTING_GUIDE`,
`PRICECHARTING_SALE`, `EBAY_SALE`, `MANUAL`) so every price point's provenance is explicit.

### Card grades

PriceCharting reuses its video-game column names for card grades, which reads oddly out of
context. The mapping (see `src/lib/pricecharting.ts` and `src/lib/grades.ts`):

| PriceCharting field | Meaning for cards |
| --- | --- |
| `loose-price` | Ungraded |
| `cib-price` | Grade 7 |
| `new-price` | Grade 8 |
| `graded-price` | Grade 9 |
| `box-only-price` | Grade 9.5 |
| `manual-only-price` | PSA 10 |
| `bgs-10-price` | BGS 10 |
| `condition-17-price` | CGC 10 |
| `condition-18-price` | SGC 10 |

Below grade 10, PriceCharting only publishes one aggregate price per tier regardless of
grading company; at 10 it splits by grader. Our `Condition` enum mirrors that.

## Known limitations

- **Re-importing a card whose condition changed on PriceCharting** (e.g. you re-graded it)
  creates a new `CollectionItem` row for the new condition rather than replacing the old
  one, since matching is keyed on `(card, condition)`. The old row is left stale rather than
  removed. Reconciling this properly would mean tracking PriceCharting's own offer id per
  item — not done yet.

## Not yet built

- Push/SMS notifications — email is wired up (see above), push would need a service worker
  + subscription storage since there's no user accounts to hang a device token off of
- Scheduled syncing (see above — you need to wire up your own cron)
- Multi-user support / auth
- CSV bulk price download (Legendary-tier PriceCharting subscribers can download the full
  price guide as CSV once/day instead of per-product API calls — not wired up yet, but
  would be a good fit for keeping a large collection's prices fresh without burning the
  1 req/sec API limit)
