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
- **CollectionItem** rows track what you actually own — quantity, condition, cost basis.
- A **sync** (`src/lib/sync.ts`, exposed as `POST /api/sync` and `npm run sync`) refreshes
  every price PriceCharting reports for each card in your collection (loose/graded/etc,
  whatever fields that category returns) as `PriceSnapshot` rows, optionally pulls recent
  sold comps from eBay's Marketplace Insights API into `EbaySale` rows, then runs the
  **trend engine**.
- The **trend engine** (`src/lib/trends.ts`) looks at each card's price history and fires
  `Alert` rows for:
  - **Trending up / down** — ≥10% move over the trailing 7 days
  - **New high** — the latest price is an all-time high
  - **Sell signal** — either a big 30-day run-up (≥35%) or a pullback of ≥8% from a recent
    30-day peak (momentum stalling after a run)
  - Alerts are deduplicated with a 24h cooldown per (card, price type, alert type) so a
    sustained trend doesn't spam you every sync.
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
| `PRICECHARTING_API_KEY` | yes, for real data | Primary price source — [get a key here](https://www.pricecharting.com/api-documentation) |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | no | eBay developer app credentials, for pulling sold comps |

Without `PRICECHARTING_API_KEY` set, the app still runs — collection/alerts pages work off
whatever's already in the database (e.g. the seed data), but syncing new prices will fail
per-card with a clear error instead of crashing.

`EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` are optional. Note that eBay's **sold-listing** data
(what we want for real comps) lives behind the Marketplace Insights API, which eBay only
grants to approved developer accounts on request — see
[the eBay docs](https://developer.ebay.com/api-docs/buy/marketplace-insights/overview.html).
If your keys don't have that access yet, `fetchSoldComps` logs a warning and returns an
empty list rather than failing the sync.

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

## Not yet built

- Notifications (email/push) when a new alert fires — alerts currently only surface in-app
  on the dashboard/alerts page
- Scheduled syncing (see above — you need to wire up your own cron)
- Multi-user support / auth
