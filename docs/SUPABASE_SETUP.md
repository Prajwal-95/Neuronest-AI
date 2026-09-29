# 🗄️ Supabase Setup — NeuroNest AI

Connect the backend to a hosted **Supabase Postgres** database so accounts, game
sessions, recommendations and reminders are stored for real instead of in the
local `backend/neuronest.db` file.

**Time needed:** ~10 minutes. **Cost:** the Supabase free tier is enough.

---

## Why this needs no rewrite

Supabase *is* PostgreSQL. The backend already talks to a database through
SQLAlchemy (`app/database/db.py`), so pointing it at Supabase changes only the
**connection string** — every model, endpoint, service and chart keeps working
untouched:

| You change | You never touch |
|---|---|
| `USE_SUPABASE` / `SUPABASE_*` in `backend/.env` | `app/models/`, `app/api/`, `app/services/`, `app/ml/` |
| nothing else | the React frontend, the PWA, offline sync |

SQLite stays the default. Supabase is opt-in, so the app still runs on a laptop
with no internet and `pytest` still uses in-memory SQLite.

---

## Step 1 — Create the project

1. Sign in at <https://supabase.com/dashboard> — done (your project
   **Neuronest AI Project**, ref `pvcycmcotmkzmkreolfz`, is Healthy 🟢).
2. Open it: <https://supabase.com/dashboard/project/pvcycmcotmkzmkreolfz>
3. If you no longer have the **Database Password** from creation, reset it now:
   **Project Settings (gear) → Database → Reset database password** — and save
   the new one somewhere safe. It is shown only once.

> ⚠️ **The database password is not an API key.** `SUPABASE_DB_PASSWORD` is the
> one from this step. The `anon` and `service_role` keys on the *API* page are
> different things. Mixing them up is the single most common setup failure.

---

## Step 2 — Collect the credentials

From **Project Settings** (the gear icon):

### A. The database password → *Database*
Copy the connection details, or just note your **project ref** — it is the
subdomain in your project URL: `https://`**`abcdefghijklm`**`.supabase.co`.

### B. The API keys → *API*
Copy **Project URL** and the **anon / public** key:

```
SUPABASE_URL=https://pvcycmcotmkzmkreolfz.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
```

> The **service_role** key bypasses every database security rule. Put it in
> `backend/.env` only if you truly need it, and **never** in the frontend.

### C. Which connection string should I use?

*Database → Connection string* offers several. For this backend (a long-running
uvicorn server with a real connection pool) **any of the first two work**:

| Option | Host / port | Use it when |
|---|---|---|
| **Direct connection** | `db.<ref>.supabase.co` `:5432` | Simplest. Best if your network has IPv6 — new Supabase projects accept **IPv6 only** on this host. |
| **Session pooler** ← recommended | `aws-0-<region>.pooler.supabase.com` `:5432` | Long-lived server, works on **IPv4-only** networks. |
| **Transaction pooler** | `aws-0-<region>.pooler.supabase.com` `:6543` | Serverless/edge functions. The backend auto-detects this port and switches to `NullPool`. |

If you are unsure, take the **Session pooler**. The backend derives the
tenant-qualified username (`postgres.<ref>`) for pooler hosts automatically, so
you do not have to remember it.

---

## Step 3 — Fill in `backend/.env`

Open `F:\Neuronest-AI\backend\.env` (create it from `.env.example` if missing)
and add:

```env
USE_SUPABASE=true
SUPABASE_PROJECT_REF=pvcycmcotmkzmkreolfz          # your project ref
SUPABASE_DB_PASSWORD=your-database-password # the one from step 1
SUPABASE_URL=https://pvcycmcotmkzmkreolfz.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...             # optional, enables /health/supabase
```

That is the minimum. `SUPABASE_DB_HOST` is derived as
`db.<pvcycmcotmkzmkreolfz>.supabase.co:5432`.

**Only two of those four lines are strictly required for the database** —
`USE_SUPABASE=true` and `SUPABASE_DB_PASSWORD` (`SUPABASE_PROJECT_REF` supplies
the host). The two API values enable the REST/Storage client; leave them out
and the app tells you so instead of failing.

### Using the pooler instead

```env
SUPABASE_DB_HOST=aws-0-ap-south-1.pooler.supabase.com
SUPABASE_DB_PORT=5432      # 6543 for the transaction pooler
```

`SUPABASE_PROJECT_REF` is still worth setting: on port `6543` the backend uses
it to build the `postgres.<ref>` username Supavisor requires.

### Using a full pasted connection string instead

Prefer to copy the whole string from the dashboard? Set `DATABASE_URL` and leave
`USE_SUPABASE=false`:

```env
DATABASE_URL=postgresql://postgres.abcdefghijklm:your-password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

The backend normalises it for you: `postgres://` → `postgresql+psycopg2://`,
`sslmode=require` added, and the pooler-only parameters Supabase appends
(`?pgbouncer=true&connection_limit=1`) stripped, because psycopg2 rejects them
with `invalid dsn: invalid connection option`.

> **Third option:** `USE_SUPABASE=true` beats `DATABASE_URL` even when both are
> set. That is deliberate — it lets you keep a local `DATABASE_URL` for offline
> work and flip a single flag for the demo.

---

## Step 4 — Create the tables

```powershell
cd F:\Neuronest-AI\backend
..\venv\Scripts\python.exe scripts\supabase_setup.py --create
```

Expected:

```
[ OK ] Schema ready on postgresql (5 tables)
```

<details>
<summary>Prefer to create the schema by hand?</summary>

Print the schema and paste it into **Supabase → SQL Editor → New query → Run**:

```powershell
..\venv\Scripts\python.exe scripts\supabase_setup.py --schema
```

It is generated from the same models, and `tests/test_supabase_config.py`
asserts the file and the models can never drift apart. It also contains the
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements described in step 6.

</details>

---

## Step 5 — Verify

```powershell
..\venv\Scripts\python.exe scripts\supabase_setup.py --check
```

A healthy run looks like this:

```
Configuration
[ .. ] source ......... supabase
[ .. ] backend ........ postgresql
[ .. ] managed by ..... supabase
[ .. ] host ........... db.abcdefghijklm.supabase.co
[ .. ] TLS ............ require
[ .. ] pooler ......... no
[ .. ] URL ............ postgresql+psycopg2://postgres:***@db.abcdefghijklm.supabase.co:5432/postgres

Connection
[ OK ] Connected in 96.4 ms
[ OK ] All 5 tables present
[ .. ] Stored rows:
         users                0
         ...
```

Then start the backend and confirm it agrees:

```powershell
..\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

```
INFO: Database: postgresql (supabase) -> db.abcdefghijklm.supabase.co
```

Open <http://127.0.0.1:8000/health>:

```json
{
  "status": "ok",
  "database": { "backend": "postgresql", "managed_by": "supabase", "connected": true }
}
```

---

## Step 6 — Lock down the public REST API (important)

Supabase publishes every table at
`https://<ref>.supabase.co/rest/v1/<table>`, and the `anon` key that authorises
those calls **ships inside your frontend bundle** — it is public by definition.
Without Row Level Security, anyone holding it can read every patient's name,
email and cognitive scores.

`scripts/supabase_setup.py --schema` includes:

```sql
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregiver_patient ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders         ENABLE ROW LEVEL SECURITY;
```

Run those in the **SQL Editor** once (or re-run the whole schema file).

RLS does **not** affect the API: it connects as the `postgres` role using the
database password, and a table's owner bypasses RLS. What it does is close the
public REST endpoint. Confirm it works — this must return an empty array, not
your users:

```powershell
curl.exe "https://abcdefghijklm.supabase.co/rest/v1/users?select=email" `
  -H "apikey: YOUR_ANON_KEY"
```

---

## Step 7 — See your data in Supabase

Play a game, then look at **Table Editor → `game_sessions`** in the dashboard.
A new row appears the moment the session is saved. The same is true of
registrations (`users`), AI suggestions (`recommendations`) and caregiver
reminders (`reminders`).

---

## Loading the demo data (optional)

```powershell
..\venv\Scripts\python.exe scripts\supabase_setup.py --seed
```

> ⚠️ **`--seed` deletes every row** before inserting the three demo accounts and
> three weeks of sample sessions. It therefore **refuses to run** if the database
> already holds an account that is not one of the demo users:
>
> ```
> [FAIL] Refusing to seed: this database already holds 2 account(s) that are not
>        demo users: real.patient@example.com ...
> ```
>
> That guard is what stops `--seed` from destroying a project holding real
> patient records. Override it only when you are certain:
> `--seed --force`.

Afterwards the usual logins work: `patient@neuronest.demo` / `demo1234`
(see `LOGIN_DETAILS.md`).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `could not translate host name "db.<ref>.supabase.co"` | Wrong `SUPABASE_PROJECT_REF`, or an IPv6-only direct connection on an IPv4 network | Check the ref from your dashboard URL; switch to `SUPABASE_DB_HOST=aws-0-<region>.pooler.supabase.com` |
| `password authentication failed for user "postgres"` | `SUPABASE_DB_PASSWORD` holds an API key instead of the database password | Reset it under *Project Settings → Database → Reset database password* |
| `FATAL: Tenant or user not found` | Pooler port without the tenant-qualified username | Set `SUPABASE_PROJECT_REF` so the backend builds `postgres.<ref>` |
| `invalid dsn: invalid connection option "pgbouncer"` | The raw dashboard string was pasted into `DATABASE_URL` | Leave it in `DATABASE_URL`; the backend strips those params. Do **not** paste them into `SUPABASE_DB_*`. |
| `no pg_hba.conf entry ... no encryption` | TLS was disabled | Keep `SUPABASE_SSL_MODE=require` (the default) |
| `server closed the connection unexpectedly` | Supabase reaped an idle connection | Already handled — `pool_pre_ping=True`. Still seeing it? Reduce `DB_POOL_RECYCLE_SECONDS`. |
| `ModuleNotFoundError: No module named 'psycopg2'` | The Postgres driver is missing | `..\venv\Scripts\python.exe -m pip install -r requirements.txt` |
| Project "is paused" / connection times out | Free projects pause after ~1 week idle | Restore it from the dashboard, then retry |
| App boots but every request 500s | The database is unreachable | `scripts\supabase_setup.py --check`; the API deliberately starts anyway and reports `"status": "degraded"` on `/health` |
| Data still not in Supabase | `USE_SUPABASE=false` (often with a real `.env` missing) | The startup log line says which database is in use — look for `INFO: Database: ...` |

---

## Health & ops endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness. `status` is `ok` when the database answers, `degraded` when it does not. No third-party calls, so it stays fast. |
| `GET /health/database` | Backend, host, TLS, pool mode, latency, table list, errors. Row counts only when `HEALTH_EXPOSE_COUNTS=true`. |
| `GET /health/supabase` | Real HTTPS round trip that validates `SUPABASE_URL` + `SUPABASE_ANON_KEY` (catches a typo'd URL vs. a stale key). |

```powershell
..\venv\Scripts\python.exe scripts\supabase_setup.py --all   # --probe then --check
```

---

## Optional: the Supabase Python SDK

The API stores everything through SQLAlchemy, so the SDK is **not required**.
Install it only if you want Storage buckets, Realtime, or GoTrue admin calls:

```powershell
..\venv\Scripts\python.exe -m pip install -r requirements-supabase.txt
```

`app/database/supabase_client.py` then exposes `get_supabase()` (anon key,
respects RLS) and `get_supabase_admin()` (service role — server-side only).
Every function returns `None` when unconfigured, so nothing breaks without it.

---

## Rolling back to SQLite

Delete `USE_SUPABASE=true` (or set it to `false`). The app returns to
`backend/neuronest.db` on the next restart. Nothing in Supabase is deleted.

---

## Tests

```powershell
cd F:\Neuronest-AI\backend
..\venv\Scripts\python.exe -m pytest tests\ -q
```

`tests/test_supabase_config.py` covers URL resolution, pooler detection, TLS
injection, engine pool selection, `schema.sql` staying in sync with the models,
RLS statements, the health endpoints, and the `--seed` guard — all offline, with
no Supabase project needed.
