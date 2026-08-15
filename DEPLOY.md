# Deploying Tarmac off Replit

Target setup: **Vercel (Hobby, free) + Neon Postgres (free) + Cloudflare DNS**.
Expected cost at small scale: **$0/month**, plus whatever the domain costs.

The app is a Vite SPA plus a small Express API. On Vercel the SPA is served
straight from the CDN (free, doesn't touch a server), and only `/api/*` runs
as a serverless function, so the traffic that costs anything is just the API
calls.

## 1. Create the database (Neon)

1. neon.tech → new project, pick the region closest to your users
   (`us-east-1` is a good default).
2. Copy the connection string from **Connection Details**. Use the
   **Pooled connection** one — the host contains `-pooler`. It must end with
   `?sslmode=require`.

It looks like:

```
postgresql://USER:PASSWORD@ep-xxxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
```

The pooled string matters: serverless functions open connections in bursts,
and the non-pooled endpoint will run out.

## 2. Create the schema and seed it

No terminal needed: open `migrations/setup.sql`, copy it, paste it into the
Neon **SQL Editor**, and Run. It creates both tables and inserts the starter
data, and is safe to run more than once. See `SETUP.md` for the click-by-click
version.

From a terminal, if you prefer:

```bash
npm install
export DATABASE_URL='postgresql://...-pooler.../neondb?sslmode=require'
npm run db:push    # creates the tables
npm run db:seed    # inserts the airports + sample reports (skips if already seeded)
```

If you want to keep the data already in the Replit database, dump and restore
it instead of seeding:

```bash
pg_dump "$REPLIT_DATABASE_URL" --no-owner --no-acl -Fc -f tarmac.dump
pg_restore -d "$DATABASE_URL" --no-owner --no-acl tarmac.dump
```

## 3. Deploy to Vercel

1. vercel.com → **Add New → Project** → import `Litle-Drip/Tarmac` from GitHub.
2. Framework preset: **Other**. Leave build settings alone — `vercel.json` in
   this repo already sets the build command (`vite build`) and output
   directory (`dist/public`).
3. Environment Variables → add for **Production, Preview and Development**:
   - `DATABASE_URL` = the pooled Neon string from step 1.
4. Deploy.

Vercel picks up `api/index.ts` automatically as the API function, and
`vercel.json` rewrites `/api/*` to it and everything else to `index.html` for
client-side routing.

Verify: `https://<project>.vercel.app/api/health` should return `{"ok":true}`,
and `/api/airports` should return the airport list.

## 4. Domain (Cloudflare)

If the domain is on Cloudflare:

1. Vercel → Project → Settings → Domains → add your domain. Vercel shows the
   DNS records it wants.
2. In Cloudflare DNS, add them:
   - apex: `A` → `76.76.21.21`
   - `www`: `CNAME` → `cname.vercel-dns.com`
3. Set both records to **DNS only** (grey cloud), not proxied. Cloudflare's
   orange-cloud proxy in front of Vercel causes redirect loops unless you set
   SSL mode to Full (strict); grey cloud is simpler and Vercel already gives
   you a CDN and TLS.

## 5. Turn off Replit

Once the domain resolves to Vercel, stop the Replit deployment so it stops
billing. Nothing in the repo depends on Replit anymore — `.replit` is kept
only as a record and can be deleted.

## Costs and limits

- **Vercel Hobby**: free. Included per month: 100 GB bandwidth, 1M function
  invocations, 360k GB-seconds of function compute. Only `/api/*` calls burn
  invocations; static page loads don't. Hobby has no overage billing — you
  get throttled rather than charged, and you can add a spend limit if you
  later upgrade.
- **Neon Free**: 0.5 GB storage, ~190 compute-hours/month. This dataset is
  tiny; the compute hours are the thing to watch, and the free tier scales
  the database to zero when idle.
- If you outgrow the free tiers, the cheap next steps are Neon Launch ($19/mo)
  or moving the API to a $5 Hetzner/Fly VPS while keeping the frontend on
  Vercel.

## Local development

Unchanged:

```bash
export DATABASE_URL='postgresql://...'
npm run dev     # http://localhost:5000, API + client together
```

## Alternative: single VPS

If you'd rather have one always-on box with no cold starts, the Node build
still works standalone:

```bash
npm run build
NODE_ENV=production DATABASE_URL='...' PORT=5000 npm start
```

That serves the API and the built client from one process — deployable on any
$4–5/mo VPS (Hetzner CX22, Fly.io shared-cpu-1x) behind Cloudflare.
