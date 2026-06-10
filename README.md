# Media Buyers · Meta Performance Dashboard

A public, editable web page where each Media Buyer gets a card showing their
Facebook/Meta **Spend** and **CPA/CPL**, with **ClickUp** account context and a
one-click **Ads Manager** link. Numbers pull live from Meta where an ad account
is set; anyone with the link can edit, and edits are shared (saved to a
database) so the whole team sees the same thing.

It runs fine with *zero* credentials — you'll see example cards you can edit by
hand — and progressively "lights up" as you connect a database, Meta, and
ClickUp.

---

## What you'll need (all free tiers)

1. A **Vercel** account — hosts the page. https://vercel.com
2. A **Neon** Postgres database — stores the shared edits. https://neon.tech
3. (Optional, for live numbers) a free **Meta** access token with `ads_read`.
4. (Optional, for context) a free **ClickUp** personal API token.

Everything here is free. The dashboard pulls live numbers directly from Meta's
own Marketing API — there is **no paid third-party tool (Supermetrics, etc.)
required**. You do *not* need to write any code.

---

## Deploy in ~10 minutes

### 1. Put this folder on GitHub
Create a new GitHub repo and upload everything in this folder (or use the
GitHub Desktop app — drag the folder in, commit, publish).

### 2. Create the database (Neon)
- Sign up at neon.tech, create a project.
- Copy the **pooled connection string** (it ends in `?sslmode=require`).

### 3. Import to Vercel
- In Vercel, **Add New → Project**, pick your GitHub repo.
- Before clicking Deploy, open **Environment Variables** and add the ones below.
- Click **Deploy**. Vercel gives you a public URL — that's your dashboard.

### 4. Environment variables
Copy these from `.env.example`. Only `DATABASE_URL` is required for editing to
save; the rest are optional.

| Variable | Required? | What it does |
|---|---|---|
| `DATABASE_URL` | Yes (to save edits) | Your Neon connection string. |
| `META_ACCESS_TOKEN` | Optional | Turns on live Meta numbers. |
| `META_DATE_PRESET` | Optional | `today`, `yesterday`, `last_7d`, `last_30d`, `this_month`. Default `last_7d`. |
| `META_CONVERSION_ACTION` | Optional | Which action = a conversion for CPA/CPL (e.g. `lead`, `purchase`). |
| `CLICKUP_API_TOKEN` | Optional | Adds ClickUp context to each card. |
| `EDIT_PASSWORD` | Optional | If set, viewing is open but editing requires this password. Leave blank for fully-open editing. |

The table is created automatically on first load, with two example cards.

---

## Using the dashboard

- **Edit any number or note** — click the field and type. It saves on its own
  (you'll see "Saved ✓"). When a card has a live Meta ad account, its Spend and
  CPA show the live figures and become read-only; everything else stays editable.
- **⚙ on a card** — set that buyer's Meta **ad account ID** and **ClickUp list ID**,
  or delete the buyer.
- **+ Add buyer** — adds a new card.
- **CPA color** — green = at/under target, amber = within 15% over, red = over.
- **Ads Manager link** appears once an ad account ID is set.

### Where the IDs come from
- **Meta ad account ID**: in Ads Manager, the number after `act_` (e.g. `1234567890`).
- **ClickUp list ID**: open the list in ClickUp; it's the number in the URL.

---

## Getting a Meta access token (when you're ready for live numbers)
The robust path is a **System User token** so it doesn't expire:
1. business.facebook.com → Business Settings → Users → **System Users** → add one.
2. Give it access to your ad accounts, then **Generate token** with `ads_read`.
3. Paste it into `META_ACCESS_TOKEN` in Vercel and redeploy.

Meta's Marketing API is free for your own ad accounts — the only cost is the
few minutes it takes to generate the token above.

---

## A note on "public"
With `EDIT_PASSWORD` blank, **anyone who has the URL can edit the cards** — that's
true public mode. For a team tool, set `EDIT_PASSWORD` so the link can be shared
for viewing while edits stay behind one shared password. (Numbers and notes here
aren't ad-account credentials, but treat the link as semi-sensitive either way.)

---

## Run locally (optional)
```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL at minimum
npm run dev                   # http://localhost:3000
```

## Project map
```
app/
  page.jsx              the dashboard UI (cards, inline editing)
  layout.jsx, globals.css
  api/dashboard/route.js  merges Meta + ClickUp + saved edits
  api/buyers/route.js     create / edit / delete (handles the edit password)
lib/
  db.js                 Postgres: schema, queries, seed data
  meta.js               Meta Marketing API (spend + CPA/CPL)
  clickup.js            ClickUp account context
```
