# Rolodex

A near-real-time price ticker for trading card collections. Track the cards you own,
pull their market prices from [PriceCharting](https://www.pricecharting.com/api-documentation)
(and, optionally, raw sold comps from eBay), and get automatic signals when a card is
trending up or looks like it's time to sell.

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
- A **sync** (`src/lib/sync.ts`, exposed as `POST /api/sync` and `npm run sync`) refreshes
  every price PriceCharting reports for each card in your collection (whatever grade/price
  fields that category returns) as `PriceSnapshot` rows, optionally pulls recent sold comps
  from eBay's Marketplace Insights API into `EbaySale` rows, then runs the **trend engine**.
  All PriceCharting calls go through a shared throttle (`src/lib/rateLimit.ts`) to stay
  under their hard 1 request/second limit — exceeding it risks API access being revoked.
- The **trend engine** (`src/lib/trends.ts`) looks at each card's price history and fires
  `Alert` rows for:
  - **Trending up / down** — ≥10% move over the trailing 7 days
  - **New high** — the latest price is an all-time high
  - **Sell signal** — either a big 30-day run-up (≥35%) or a pullback of ≥8% from a recent
    30-day peak (momentum stalling after a run)
  - Alerts are deduplicated with a 24h cooldown per (card, price type, alert type) so a
    sustained trend doesn't spam you every sync.
- **Notifications** (`src/lib/notify.ts`): every alert created during a sync run is batched
  into one summary email via [Resend](https://resend.com). Optional — with no email config,
  sync just skips it and alerts still show up on `/alerts`.
- The **dashboard** (`/`) is the ticker: portfolio value, average 7-day change, and a table
  per card with its latest price, 7-day change, sparkline, and any active signals.

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

Without `PRICECHARTING_API_KEY` set, the app still runs — collection/alerts pages work off
whatever's already in the database (e.g. the seed data), but syncing/importing will fail
with a clear error instead of crashing.

`EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` are optional. Note that eBay's **sold-listing** data
(what we want for real comps) lives behind the Marketplace Insights API, which eBay only
grants to approved developer accounts on request — see
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
own) and `PriceSnapshot` (time series of prices per condition/price type) and `EbaySale`
(raw sold comps) and `Alert` (generated signals).

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

## Not yet built

- Push/SMS notifications — email is wired up (see above), push would need a service worker
  + subscription storage since there's no user accounts to hang a device token off of
- Scheduled syncing (see above — you need to wire up your own cron)
- Multi-user support / auth
- CSV bulk price download (Legendary-tier PriceCharting subscribers can download the full
  price guide as CSV once/day instead of per-product API calls — not wired up yet, but
  would be a good fit for keeping a large collection's prices fresh without burning the
  1 req/sec API limit)
