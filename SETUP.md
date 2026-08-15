# Moving Tarmac off Replit — step by step

No terminal, no code. Everything here is done by clicking in a browser.
Set aside about 30 minutes. Total cost: **$0/month**.

You need three free accounts, which you already have: **Neon** (the database),
**Vercel** (runs the site), **Cloudflare** (your domain name).

---

## Step 1 — Create the database (Neon)

1. Go to **neon.tech** and sign in.
2. Click **New Project**.
   - Name: `tarmac`
   - Region: pick the one closest to most of your users (`AWS US East (N. Virginia)`
     is a safe default).
3. Click **Create**.
4. A box appears with a **connection string**. There is a dropdown above it —
   make sure it says **Pooled connection**. The text should contain the word
   `-pooler`.
5. Click the copy icon. **Paste it somewhere safe** (a note on your computer) —
   you'll need it in Step 3. It looks like this:

   ```
   postgresql://neondb_owner:AbC123@ep-cool-name-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

> ⚠️ This string is a password. Don't post it anywhere public.

---

## Step 2 — Create the tables and starter data

1. Still in Neon, click **SQL Editor** in the left sidebar.
2. Open this file on GitHub in another tab:
   **`migrations/setup.sql`** in your Tarmac repository.
3. Click the **copy raw file** button at the top right of the file, which copies
   the whole thing.
4. Paste it into the Neon SQL Editor box.
5. Click **Run**.

You should see it finish without red error text. To check it worked, click
**Tables** in the sidebar — you'll see `airports` (32 rows) and
`wait_time_reports` (24 rows).

> Running this file a second time is harmless — it will not create duplicates.

---

## Step 3 — Put the site on Vercel

1. Go to **vercel.com** and sign in with GitHub.
2. Click **Add New → Project**.
3. Find **Litle-Drip/Tarmac** in the list and click **Import**.
4. On the configure screen:
   - **Framework Preset**: choose **Other**.
   - Leave Build Command, Output Directory, and Install Command alone. The
     repo already tells Vercel what to do.
5. Expand **Environment Variables** and add one:
   - **Key**: `DATABASE_URL`
   - **Value**: paste the Neon connection string from Step 1
   - Make sure all three environments are ticked (Production, Preview,
     Development)
6. Click **Deploy** and wait a couple of minutes.

When it finishes, Vercel gives you a link like `tarmac-abc123.vercel.app`.
Open it — the app should load with the airport list.

**If something looks wrong**, add `/api/health` to the end of the URL
(e.g. `tarmac-abc123.vercel.app/api/health`). You should see `{"ok":true}`.
If you don't, the `DATABASE_URL` is usually the culprit — check it in
Vercel under **Settings → Environment Variables**, then **Deployments → ⋯ →
Redeploy**.

---

## Step 4 — Point your domain at it (Cloudflare)

Skip this if you're happy with the free `.vercel.app` address.

1. In Vercel: **Project → Settings → Domains**. Type your domain, click **Add**.
   Vercel will show you the DNS records it wants.
2. In Cloudflare: pick your domain → **DNS → Records → Add record**, and add:

   | Type  | Name  | Value                  | Proxy status         |
   |-------|-------|------------------------|----------------------|
   | A     | `@`   | `76.76.21.21`          | **DNS only** (grey)  |
   | CNAME | `www` | `cname.vercel-dns.com` | **DNS only** (grey)  |

3. The **grey cloud matters.** Click the orange cloud icon to turn it grey on
   both records. Leaving it orange causes the site to fail to load.
4. Wait a few minutes. Vercel's Domains page will show a green checkmark.

---

## Step 5 — Turn off Replit

Once your domain loads the new site, go to Replit and **stop or delete the
deployment** so it stops using your usage allowance. Everything is now running
on Vercel and Neon.

---

## What this costs, and what happens if you get popular

Nothing, until you get a lot of traffic. The free limits:

- **Vercel**: 100 GB of traffic and 1,000,000 API requests per month. Loading a
  page doesn't count against the API number — only fetching wait times does.
- **Neon**: 0.5 GB of storage (this app uses a tiny fraction) and about 190
  hours of database activity per month. The database sleeps when nobody's using
  it.

**Important difference from Replit**: on Vercel's free plan you cannot get a
surprise bill. If you exceed the limits the site slows down or pauses rather
than charging you. If you get there, the next step up is about $20/month —
message me and I'll walk you through it.

---

## Making changes later

Edit the code on GitHub (or ask me to). Every time something is merged into the
`main` branch, Vercel automatically rebuilds and publishes the site within a
minute or two. You don't have to do anything.

---

## Common problems

**Always start at `/api/health`.** Add it to the end of your site's address
(e.g. `tarmac-nu.vercel.app/api/health`). It tells you exactly what's wrong:

| What `/api/health` says | What it means | Fix |
|---|---|---|
| `"ok":true` | Everything works | If the site still looks wrong, it's a display issue, not setup |
| `"database":"unconfigured"` | Vercel doesn't have your `DATABASE_URL` | Add it under **Settings → Environment Variables**, then **redeploy** (see below) |
| `"database":"no-tables"` | Connected, but Step 2 wasn't run | Paste `migrations/setup.sql` into the Neon SQL Editor and Run |
| `"database":"unreachable"` | Wrong password, or the string is malformed | Reset the password in Neon, copy the **Pooled** string again, update it in Vercel, redeploy |
| A Vercel error page (500) | The site is running old code | Redeploy from the latest `main` |

> **Environment variables only apply to new deployments.** Changing
> `DATABASE_URL` does nothing to a site that's already live. After changing it:
> **Deployments → the top one → ⋯ menu → Redeploy**.

Other problems:

| What you see | What to do |
|---|---|
| "Too many connections" error | Your Neon string is missing `-pooler`. Copy the **Pooled connection** one and update it in Vercel. |
| Domain shows a redirect loop | A Cloudflare record is still orange-clouded. Set both to **DNS only**. |
| Deploy fails on Vercel | Open the failed deployment, read the last red lines of the log, and send them to me. |

For the technical version of all this, see `DEPLOY.md`.
