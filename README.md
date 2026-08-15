# Tarmac

Crowdsourced airport security wait times — so you know when to leave for the
airport.

Travelers standing in the line report what they're actually waiting, and
everyone flying after them gets a better number. Where nobody has reported
recently, Tarmac shows the typical wait for that airport at that hour and says
plainly that it's an estimate.

## How the number is worked out

Accuracy is the whole product, so the model is deliberately simple to describe:

- **Every line is separate.** Standard, TSA PreCheck and CLEAR are never mixed
  together. Averaging them produces a number nobody stands in.
- **Recent reports count for more.** A report's influence halves every 30
  minutes. Anything older than six hours is ignored entirely.
- **The median, not the mean.** One mistaken entry can't drag the number.
- **Local time, per airport.** The hour of day matters more than anything else,
  and every airport carries its own timezone.
- **Ranges, not false precision.** The app shows "likely 15–25 min" alongside a
  confidence level derived from how many reports there are, how fresh they are,
  and how much they agree.
- **Provenance is always shown.** A number built from reports is labelled
  differently from one built from the baseline model.

## Contributing a report

Anything a traveler submits is anonymous. There are no accounts. A random
per-install token limits how often one device can report, and IP addresses are
salted-hashed and never stored raw.

Standing in a line someone else already reported? Tapping 👍 counts as a fresh
report of that wait — the fastest way to keep a checkpoint current.

## Running it

```bash
npm install
npm run dev          # http://localhost:5000
npm test             # the wait-time model, timezone handling, label grouping
npm run check        # typecheck
```

You'll need a Postgres database and a `DATABASE_URL`. Apply
`migrations/setup.sql` to create the schema and starter data — it's idempotent
and never deletes a report. `npm run db:seed` does the same thing from a
terminal.

Set `REPORT_HASH_SALT` to a random 32+ character string in any real deployment.

## Layout

| Path | What's in it |
|---|---|
| `shared/schema.ts` | Tables and the API's shared types |
| `server/wait-model.ts` | The wait-time model — pure, deterministic, tested |
| `server/baselines.ts` | Typical-wait lookup, per airport and local hour |
| `server/local-time.ts` | Resolving an instant into an airport's local clock |
| `server/normalize.ts` | Grouping the terminal and checkpoint names people type |
| `server/storage.ts` | Queries, rate limiting, plausibility checks |
| `server/routes.ts` | HTTP layer |
| `client/src/pages/` | Home (airport list) and airport detail |
| `migrations/setup.sql` | The single definition of the schema and seed data |

`SETUP.md` is the click-by-click deployment guide. `DEPLOY.md` is the technical
version. `ARCHITECTURE.md` covers how the pieces fit together.

Built by Edison Labs LLC. Hosted on Vercel, database on Neon.
