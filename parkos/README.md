# ParkOS — Netlify Deployment Guide

## Project Structure
```
parkos/
├── public/
│   └── index.html              ← Your frontend (unchanged visually)
├── netlify/
│   └── functions/
│       ├── api.js              ← Your api.php rewritten in Node.js
│       └── package.json        ← Supabase dependency
├── netlify.toml                ← Netlify routing config
└── supabase_schema.sql         ← Run this in Supabase once
```

---

## STEP 1 — Set Up Supabase (Free Database)

1. Go to https://supabase.com and sign up (free)
2. Click **"New Project"** → give it a name (e.g. `parkos`) → set a password → Create
3. Wait ~2 minutes for it to initialize
4. Go to **SQL Editor** (left sidebar) → **New Query**
5. Paste the entire contents of `supabase_schema.sql` and click **Run**
6. Go to **Project Settings → API** and copy:
   - **Project URL** → looks like `https://xxxx.supabase.co`
   - **anon public key** → long JWT string

---

## STEP 2 — Deploy to Netlify

1. Go to https://netlify.com and sign up (free)
2. Click **"Add new site" → "Deploy manually"**
3. Drag and drop the entire `parkos/` folder onto the deploy area
4. Wait for deployment to complete

---

## STEP 3 — Add Environment Variables

This is the most important step — without these your site won't connect to the database.

1. In Netlify, go to your site → **Site configuration → Environment variables**
2. Click **"Add a variable"** and add these two:

| Key                  | Value                              |
|----------------------|------------------------------------|
| `SUPABASE_URL`       | `https://xxxx.supabase.co`         |
| `SUPABASE_ANON_KEY`  | `your-long-anon-key-here`          |

3. After adding both variables, go to **Deploys → Trigger deploy → Deploy site**

---

## STEP 4 — Test Your Live Site

Open your Netlify URL (e.g. `https://parkos-xyz.netlify.app`) and test:
- ✅ Check-In a vehicle (e.g. KA01AB1234, Car)
- ✅ View Slots page
- ✅ Check-Out the same vehicle
- ✅ View History and Dashboard

---

## What Changed From Your Original Code

| Original (XAMPP)         | Netlify Version                     |
|--------------------------|-------------------------------------|
| `api.php`                | `netlify/functions/api.js` (Node.js)|
| `db.php` (MySQL)         | Supabase (PostgreSQL via JS client) |
| MySQL Triggers           | Replicated as JS logic in api.js    |
| Stored Procedure         | Replicated as JS logic in api.js    |
| `const API = 'api.php'`  | `const API = '/api'`                |

The frontend HTML/CSS/JS is **identical** — only one line changed.

---

## Troubleshooting

**"Server error" on check-in/out:**
→ Check that your environment variables are set correctly in Netlify and re-deploy.

**Blank dashboard / slots:**
→ Make sure you ran `supabase_schema.sql` in Supabase SQL Editor.

**Function not found (404):**
→ Make sure `netlify.toml` is in the root of the uploaded folder.
