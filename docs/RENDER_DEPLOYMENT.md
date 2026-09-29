# ☁️ Deploying to Render — NeuroNest AI

Put the whole prototype on the internet: **FastAPI on a Render web service**,
**React/Vite (the PWA) on a Render static site**, both talking to the existing
**Supabase Postgres** project. The database is *not* deployed — it already lives
in Supabase, so the deployed app sees exactly the demo accounts and history you
seeded locally.

**Time needed:** ~15 minutes once the repo is on GitHub. **Cost:** free tier is
enough for a demo.

---

## What gets deployed

```
   Browser / PWA
        │
        ▼
   neuronest-web      Render static site     ← frontend/  (dist/, built by Vite)
        │  fetch(https://neuronest-api.onrender.com/...)
        ▼
   neuronest-api      Render web service     ← backend/   (uvicorn + FastAPI)
        │  postgresql:// (IPv4 pooler, TLS)
        ▼
   Supabase Postgres  already running        ← unchanged, seeded
```

Both services are described in **`render.yaml`** at the repo root. That file is
the single source of truth for build commands, start commands and environment
variables, and `backend/tests/test_deploy_config.py` fails if it drifts.

| Service | Type | Root dir | Runs |
|---|---|---|---|
| `neuronest-api` | Web service (Python 3.11) | `backend/` | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| `neuronest-web` | Static site (Node 22) | `frontend/` | `npm ci && npm run build` → publish `dist/` |

> ⚠️ **Render's free web service sleeps after 15 minutes without traffic.** The
> first request then takes 30–60 s to wake the container while the static site
> loads instantly. The UI says so explicitly ("the server may be waking up")
> instead of showing a bare "Failed to fetch". See
> [Cold starts](#cold-starts-free-tier-reality) for what to do before a demo.

---

## Prerequisites

1. **Supabase is set up and seeded** — `docs/SUPABASE_SETUP.md`. Verify from
   your laptop:
   ```powershell
   cd backend
   ..\venv\Scripts\python.exe scripts\supabase_setup.py --check
   ```
   The deployed API uses the *same* project, so anything missing there is
   missing in production. `--seed` stays a **local** command; you never run it
   on Render.
2. **The repo is pushed to GitHub** — `git push` (`main`).
3. **A Render account** — <https://render.com>, "Sign in with GitHub" is the
   shortest path.

---

## Option A — Blueprint import (recommended)

1. Render dashboard → **New + → Blueprint**.
2. Pick the `Prajwal-95/Neuronest-AI` repository and approve the Render GitHub
   app when asked.
3. Render reads `render.yaml` and shows both services. Two things to do on that
   screen:
   * **`neuronest-api` → `SUPABASE_DB_PASSWORD`**: replace
     `your-supabase-db-password` with the real database password
     (Supabase → Project Settings → Database → *Reset database password* if
     lost). It is never stored in git.
   * Confirm the **region**. It is `singapore` because the Supabase project is in
     `ap-south-1` (Mumbai) — that is roughly 60–90 ms saved per query. If your
     account does not offer Singapore on the free plan, switch to `oregon`.
4. **Apply**. Render builds both services; in `neuronest-api` → *Logs* wait for
   uvicorn's `Application startup complete` and the deploy badge to turn green.
   (`NeuroNest AI API is running` is the **body of `GET /`**, not a log line —
   open the API URL in a browser to see it.)
5. Open `https://neuronest-web.onrender.com` and log in with any seeded account
   (all three live in the same Supabase project your laptop writes to):

   | Role | Email | Password |
   |---|---|---|
   | Patient (English) | `patient@neuronest.demo` | `demo1234` |
   | Patient (Hindi) | `meena@neuronest.demo` | `demo1234` |
   | Caregiver | `caregiver@neuronest.demo` | `demo1234` |

Renaming a service changes its URL (`https://<name>.onrender.com`). If you do,
update `CORS_ORIGINS` on the API and `VITE_API_URL` on the static site — the
consistency test in `test_deploy_config.py` tells you which one you forgot.

---

## Option B — Manual dashboard setup

Use this if you would rather not import a blueprint. Everything below is what
`render.yaml` already contains, so the two options stay interchangeable.

### 1. Backend — Web Service

| Setting | Value |
|---|---|
| Region | Singapore (`singapore`) |
| Instance Type | Free |
| Root Directory | `backend` |
| Runtime | Python 3 (3.11, pinned by `backend/.python-version`) |
| Build Command | `pip install -r requirements.txt` |
| Dockerfile Path | *(empty — not a Docker service)* |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

`$PORT` is mandatory: Render assigns a port per request cycle and a hard-coded
`8000` yields **"Service Unavailable"** with an otherwise clean log.

### 2. Frontend — Static Site

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |

Then in the static site's settings add one **rewrite** so React Router's deep
links (`/patient`, `/caregiver/12`) survive a refresh instead of 404ing.
(`render.yaml` already declares this under `rewrites:`, so a Blueprint import
configures it for you — this step is only needed when setting up by hand.)

| Source | Destination | Status |
|---|---|---|
| `/*` | `/index.html` | `200` |

---

## Environment variables

Set these on **`neuronest-api` → Environment**. Everything here is already
declared in `render.yaml`; the table is what each one is for.

| Variable | Value | Notes |
|---|---|---|
| `USE_SUPABASE` | `true` | Without it the API boots on SQLite inside the container — a throwaway file that vanishes on every deploy/restart. |
| `SUPABASE_PROJECT_REF` | `pvcycmcotmkzmkreolfz` | Used to build the pooler role name. |
| `SUPABASE_URL` | `https://pvcycmcotmkzmkreolfz.supabase.co` | Only used by the `/health/supabase` probe. |
| `SUPABASE_DB_HOST` | `aws-0-ap-south-1.pooler.supabase.com` | **The session pooler, not the direct host.** See the warning below. |
| `SUPABASE_DB_PORT` | `5432` | Session pooler port. `6543` (transaction mode) also works. |
| `SUPABASE_DB_USER` | `postgres` | `app/config.py` turns it into `postgres.pvcycmcotmkzmkreolfz` automatically for pooler hosts. |
| `SUPABASE_DB_PASSWORD` | *your password* | 🔒 Secret. Type it into Render; never commit it. |
| `SUPABASE_DB_NAME` | `postgres` | Default Supabase database. |
| `SUPABASE_SSL_MODE` | `require` | Render → Supabase must be TLS. |
| `JWT_SECRET_KEY` | *generated* | 🔒 `generateValue: true` makes Render create a strong random secret. Changing it logs every user out. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | 24 h login. |
| `CORS_ORIGINS` | `https://neuronest-web.onrender.com,http://localhost:5173` | Must contain the static site's exact origin. Comma-separated plain string is the Render-friendly form; a JSON list also works. |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `2` / `3` | The free instance has 512 MB and the pooler has its own connection cap. |
| `DB_POOL_RECYCLE_SECONDS` | `120` | Supabase's NAT drops idle connections; recycling avoids "server closed the connection unexpectedly". |
| `SUPABASE_ANON_KEY` | *(optional)* | Only for the `/health/supabase` round-trip probe, Storage and Realtime. Not needed for data. |

> ⚠️ **Use the pooler host, not `db.<ref>.supabase.co`.** The direct host
> resolves **IPv6 only**, and Render's free instances have no IPv6 egress — the
> symptom is a build that succeeds, a service that starts, and then a 30-second
> connect timeout on the first query. `aws-0-ap-south-1.pooler.supabase.com`
> resolves IPv4 and is the right target here.

> ⚠️ **Env vars are plain strings.** `CORS_ORIGINS=["a","b"]` (the `.env` form)
> and `CORS_ORIGINS=https://a,https://b` (the natural thing to type in Render's
> panel) both work — see `TestCorsOriginsParsing` in
> `backend/tests/test_deploy_config.py` for why that took a code change.

### On the frontend (`neuronest-web` → Environment)

| Variable | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `https://neuronest-api-39se.onrender.com` | Must be the API service's **real** URL, **without a trailing slash**. Render suffixes taken names, so this is *not* `https://neuronest-api.onrender.com`; the URL is pinned as `PROD_API_URL` in `backend/tests/test_deploy_config.py`. |
| `NODE_VERSION` | `22` | Same major as local dev, so the build is identical. |
| `VITE_GOOGLE_CLIENT_ID` | *(optional)* | Only if you want Google login in production too. |

> 🔑 **`VITE_*` variables are baked into the bundle at build time.** Changing
> `VITE_API_URL` in the dashboard does nothing until you **trigger a redeploy**
> of the static site (Environment → *Trigger Static Site Deploy*). This is the
> #1 cause of "I changed the URL and it still calls the old one".

---

## Verify the deployment

```powershell
# 1. The API is live and on the right database
curl https://neuronest-api.onrender.com/health

# 2. A real query round trip (host, TLS, pool mode, latency, tables)
curl https://neuronest-api.onrender.com/health/database
```

Expected in `/health`:

```json
{ "status": "ok", "service": "NeuroNest AI", "version": "1.0.0",
  "database": { "backend": "supabase", "connected": true, "error": null } }
```

| Symptom | Meaning |
|---|---|
| `"backend": "sqlite"` | `USE_SUPABASE` is not `true`, or the password is missing/placeholder. |
| `"status": "degraded"` | The API cannot reach Supabase — check host/port/password and whether Supabase is paused. |
| `connected: true`, latency `> 2000 ms` | Wrong region: the API is far from `ap-south-1`. |

Then in the browser: open the static site, **hard-refresh a deep link**
(`/patient`) — it must not 404 — and log in with a demo account
(`demo1234`). DevTools → Network should show requests going to
`neuronest-api.onrender.com`, all `200`, with
`Access-Control-Allow-Origin` matching the site's origin.


---

## Cold starts (free-tier reality)

A free Render web service suspends after ~15 minutes of silence. Pick one:

* **Accept it and rehearse:** open the site 2 minutes before the demo, log in,
  and leave it warm.
* **Add a keep-alive:** a cron pinging `https://neuronest-api.onrender.com/health`
  every 10 minutes (UptimeRobot, `cron-job.org`, a GitHub Actions cron) keeps the
  container hot. Ping only your own service.
* **Upgrade the instance** ($7/mo) — no sleeps, faster builds. Nothing in this
  repo needs to change.

The UI already distinguishes "server waking up" (hosted) from "start the backend
on port 8000" (local dev) in `frontend/src/services/api.js`, so a cold start
reads as a wait, not as a bug.

---

## Google login in production

`docs/GOOGLE_LOGIN_SETUP.md` covers the general setup. For Render, add one more
**Authorized JavaScript origin** in Google Cloud Console → Credentials:

```
https://neuronest-web.onrender.com
```

…then set `VITE_GOOGLE_CLIENT_ID` on the static site and redeploy the **static
site**. The backend only *verifies* Google-issued ID tokens
(`GOOGLE_CLIENT_ID`/`SUPABASE_ANON_KEY` are not involved in that path), so no new
redirect URIs are required for the current flow.

---

## Updating the deployment

| You changed | What happens |
|---|---|
| `backend/` code | `git push` → Render auto-deploys the API. The health check gates the switch; a failed boot keeps the previous release live. |
| `frontend/` code | `git push` → the static site rebuilds. `VITE_API_URL` is re-read at build time. |
| `render.yaml` | The blueprint re-applies env vars on the next deploy. Variables marked `sync: false` (the DB password, the optional Google key) keep the value you typed in the dashboard. |
| Demo data | Re-run `scripts/supabase_setup.py --seed` **locally** against Supabase. No redeploy needed — the API reads the same database. |

To roll back: Render → service → **Current Activity** → the deploy before the bad
one → **Manual Deploy → Commit to this commit**. Render redeploys that exact
commit; no git surgery required.

---

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Frontend says *"Failed to fetch"* / a CORS error in the console | `CORS_ORIGINS` on the API does not contain the static site's exact origin (scheme + host, no trailing slash). Edit the env var, save, redeploy the **API**. |
| Requests hit an `*.onrender.com` API URL and 404 | `VITE_API_URL` points at a URL the API service does not serve (Render appends a suffix to taken names — here `neuronest-api-39se`). Copy the service's **Live URL** into `VITE_API_URL` and **redeploy the static site**. |
| `502 Bad Gateway`, log says `Address already in use` or shows no listener | Start command hard-codes a port. Use `--port $PORT`. |
| `Service Unavailable`, log ends right after `Uvicorn running on ...` | Health check points at a path that doesn't exist, or boot crashed. Read the build log; `/health` must answer. |
| Log: `Could not prepare the database schema ... timed out` | Used the direct `db.<ref>.supabase.co` host (IPv6-only) or Supabase is paused. Use the pooler host and resume the project. |
| Boot log: `USE_SUPABASE is set but no database password is configured` | `SUPABASE_DB_PASSWORD` is missing or still the placeholder → the API silently fell back to SQLite. |
| Login says *Incorrect email or password* on the deployed site | The database the API points at was never seeded. Check `/health` → `database.backend`, then seed locally. |
| Refreshing `/patient` shows Render's 404 page | Missing the `/* → /index.html` rewrite on the static site. |
| Everything was fine, then everyone was logged out | `JWT_SECRET_KEY` changed (regenerated by a blueprint re-import). Expected; tokens last ~24 h. |
| `pip install` fails on Render | A dependency was used in code but never added to `backend/requirements.txt`. |

---

## Demo-day checklist

- [ ] `..\venv\Scripts\python.exe -m pytest tests -q` green — includes the
      deployment contract tests in `tests/test_deploy_config.py`.
- [ ] `npm run build` clean locally — a green local build is what Render gets.
- [ ] `https://neuronest-api.onrender.com/health` → `"status": "ok"`,
      `"backend": "supabase"`.
- [ ] Deep-link refresh works on the static site.
- [ ] Patient login → play a game → adaptive level changes → the caregiver
      dashboard shows that session (proves the *write* path, not just reads).
- [ ] The API is warm (see Cold starts) right before presenting.

