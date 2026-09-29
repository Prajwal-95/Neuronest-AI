# 🧠 NeuroNest AI

**Personalized cognitive gaming & memory assistance platform for elderly users.**

NeuroNest AI is a full-stack, offline-first PWA built for the **Smart India Hackathon (SIH26003)** that delivers adaptive cognitive training games, voice-guided interaction, caregiver monitoring dashboards, and AI-powered difficulty recommendations — all designed with large touch targets, high-contrast theming, and multi-language support for senior users.

> ⚠️ **Disclaimer:** This is an assistive cognitive-engagement prototype, **not** a medical diagnostic or clinical tool. All analytics and recommendations are engagement engineering signals intended solely for gamified motivation.

---

## ✨ Features

### For Patients (the elderly user)
- 🎮 **5 cognitive training games** — Memory Match, Sequence Recall, Attention Focus, Quick Math, and Word Recall — with 5 adaptive difficulty levels each
- 🧠 **Adaptive difficulty engine** that automatically adjusts game level based on recent accuracy, response speed, and mistakes
- 🗣️ **Voice guidance** via the browser-native SpeechSynthesis API (toggleable) for every screen, instruction, and result
- 📊 **Personal analytics** — overall score, streaks, weekly trends, cognitive-domain scores, and difficulty progression charts
- 🔔 **Reminders** created by their caregiver — one-tap "mark done"
- 🌐 **Bilingual UI** — English and Hindi (हिंदी) with live language switching
- ♿ **Accessibility** — 4 font-size presets and a high-contrast mode applied live
- 📴 **Offline-first** — game sessions are saved locally to IndexedDB and auto-synced when the connection returns
- 📲 **Installable PWA** — works offline after first visit, network-first navigation fallback

### For Caregivers
- 📋 **Dashboard** — connected patients, total sessions this week, per-patient engagement
- 👤 **Patient detail view** — full performance breakdown, weekly trend, domain scores, recent sessions, and difficulty progression
- 💡 **AI recommendations** — one-click generation of an explainable "next activity" suggestion for any patient
- 🔔 **Reminder management** — create, edit, delete, and track reminders for each connected patient

---

## 🛠️ Tech Stack

### Frontend

| Layer | Technology | Purpose |
|---|---|---|
| Core UI | **React 18** (functional components + hooks) | Component-based SPA |
| Build tool | **Vite 5** (`@vitejs/plugin-react`) | Fast dev server, production bundling, API proxy |
| Routing | **react-router-dom v6** | Nested protected routes per role |
| Styling | **Tailwind CSS 3.4** + PostCSS + Autoprefixer | Utility-first responsive design, custom navy/teal theme on the Inter font |
| Animations | **framer-motion** | Smooth card reveals, tap feedback, celebratory effects |
| Charts | **Recharts 2** | Analytics line/area charts and domain score bars |
| Icons | **lucide-react** | Touch-friendly vector icons |
| Offline storage | **Dexie 4** (IndexedDB wrapper) | Offline session queue (`sessionQueue.js`) |
| State (client) | React Context + `localStorage` | Auth, i18n, offline sync, accessibility preferences |
| PWA | Custom service worker (`sw.js`) + `manifest.webmanifest` + `icon.svg` | Installability, stale-while-revalidate static caching, offline shell |
| i18n | Custom lightweight provider (`services/i18n.jsx`) | Lazy-loaded EN/HI JSON locales |
| Voice | Browser **Web Speech API** (`speechSynthesis`) | Spoken guidance in `en-IN` / `hi-IN` |

### Backend

| Layer | Technology | Purpose |
|---|---|---|
| API framework | **FastAPI 0.104** | Async-ready REST API, auto OpenAPI docs at `/docs` |
| Server | **uvicorn** | ASGI server |
| ORM | **SQLAlchemy 2.0** | Models and DB access — the same models run on SQLite *and* Postgres |
| Database | **SQLite** (`aiosqlite` driver) | Zero-config local DB (`neuronest.db`) — the offline-first default |
| Hosted database | **Supabase Postgres** (`psycopg2`, optional) | Opt in with `USE_SUPABASE=true` to persist real accounts, sessions, recommendations and reminders in a hosted Postgres project. Pooler-aware, TLS, pre-ping. Guide: [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) |
| Validation / config | **Pydantic 2.5** + **pydantic-settings** | Request/response schemas, `.env` settings |
| Auth | **python-jose** (JWT, HS256) + **passlib/bcrypt** | Token login, password hashing, role-based guards |
| ML | **scikit-learn** (`GradientBoostingClassifier`), **numpy**, **pandas** | Synthetic-data recommendation model + adaptive difficulty engine |
| Extras | `python-dotenv`, `email-validator`, `python-multipart` | Environment loading, email validation, form parsing |

---

## 📁 Project Structure

```
Neuronest-AI/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, router mount
│   │   ├── config.py               # Settings (DB URL, Supabase, JWT, CORS)
│   │   ├── api/                    # Routers: auth, users, games, patients,
│   │   │                           #   recommendations, reminders, sync, health
│   │   ├── auth/security.py        # JWT creation/validation, bcrypt, role checks
│   │   ├── database/
│   │   │   ├── db.py               # SQLAlchemy engine + session (TLS, pooler-aware,
│   │   │   │                       #   pool_pre_ping, SQLite/Postgres/Supabase)
│   │   │   └── supabase_client.py  # Optional Supabase SDK (Storage / Realtime)
│   │   ├── ml/
│   │   │   ├── adaptive_engine.py  # Deterministic, explainable difficulty engine
│   │   │   └── recommendation.py   # sklearn recommendation model (synthetic data)
│   │   ├── models/models.py        # User, CaregiverPatient, GameSession,
│   │   │                           #   Recommendation, Reminder
│   │   ├── schemas/schemas.py      # Pydantic request/response schemas
│   │   └── services/               # analytics, session, recommendation services
│   ├── scripts/
│   │   └── supabase_setup.py       # Supabase bootstrap + verification CLI
│   ├── db/
│   │   └── schema.sql              # Postgres schema + Row Level Security
│   ├── tests/                      # Offline test suite (pytest / unittest)
│   ├── seed.py                     # Demo data generator (accounts + 3 weeks of sessions)
│   ├── requirements.txt
│   ├── requirements-supabase.txt   # Optional Supabase SDK extras
│   ├── .env.example
│   └── neuronest.db                # SQLite DB (auto-created; unused when USE_SUPABASE=true)
│
├── frontend/
│   ├── public/
│   │   ├── sw.js                   # Service worker (offline shell + stale-while-revalidate)
│   │   ├── manifest.webmanifest    # PWA manifest
│   │   └── icon.svg                # App icon
│   ├── src/
│   │   ├── main.jsx                # Entry: a11y preload, SW registration, providers
│   │   ├── App.jsx                 # Route tree with role-based ProtectedRoute
│   │   ├── pages/                  # Login, Register, PatientHome, GamesList,
│   │   │                           #   PatientAnalytics, CaregiverHome,
│   │   │                           #   CaregiverPatientDetail, Reminders, Settings,
│   │   │                           #   PatientLayout, CaregiverLayout
│   │   ├── games/                  # MemoryMatch, SequenceRecall, Attention,
│   │   │                           #   gameEngine.js (shared scoring/adaptive logic)
│   │   ├── components/             # Shell (top bar + bottom nav), States, SyncStatus
│   │   ├── auth/                   # AuthContext, ProtectedRoute
│   │   ├── offline/                # OfflineContext, sessionQueue (Dexie/IndexedDB)
│   │   ├── services/               # api (fetch wrapper), i18n, voice
│   │   └── locales/                # en.json, hi.json
│   ├── index.html
│   ├── vite.config.js              # Port 5173 + dev proxy → http://127.0.0.1:8000
│   ├── tailwind.config.js          # navy/teal/mind/cream palette, Inter font
│   └── package.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites
- **Python 3.10+**
- **Node.js 18+ / npm 9+**

### ⚡ Fastest way to run it (Windows)

Once the dependencies below are installed, this single command starts the
backend, the frontend, and seeds the demo data if the database is empty:

```powershell
.\run.ps1
```

Then open **http://localhost:5173** and log in with `patient@neuronest.demo` /
`demo1234`. See **LOGIN_DETAILS.md** for all demo logins and a demo script.

### Manual setup (all platforms)

### 1. Backend (FastAPI)

```bash
cd backend

# Create and activate a virtual environment (Windows)
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# (Optional) configure environment
copy .env.example .env

# Run the API server (auto-reload for development)
uvicorn app.main:app --reload --port 8000
```

The API is now live at `http://127.0.0.1:8000` with interactive docs at `http://127.0.0.1:8000/docs`.

### 2. Seed demo data (recommended)

Populates demo caregiver + patient accounts and **3 weeks of realistic session history** so all charts and recommendations have data to show:

```bash
cd backend
python seed.py
```

| Role | Email | Password |
|---|---|---|
| Caregiver | `caregiver@neuronest.demo` | `demo1234` |
| Patient 1 (improving) | `patient@neuronest.demo` | `demo1234` |
| Patient 2 (Hindi, declining) | `meena@neuronest.demo` | `demo1234` |

> All seed records are clearly marked **demo data** for development only.

### 3. Frontend (React + Vite)

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server (proxies API routes to localhost:8000)
npm run dev
```

Open **http://localhost:5173** and log in with a demo account.

### 4. Production build

```bash
cd frontend
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

In dev the Vite proxy maps `/auth`, `/users`, `/games`, `/patients`,
`/recommendations`, `/reminders`, `/sync`, `/caregiver`, and `/health` to
`http://127.0.0.1:8000`, so the frontend needs no configuration. In a deployed
build there is no proxy — set `VITE_API_URL` to the backend's URL (see
`frontend/.env.example`) and `src/services/api.js` sends every request there
instead. Vite inlines `VITE_*` values **at build time**, so the variable must be
present when `npm run build` runs, not when the site is served.

📖 **Deploy both halves to Render in one click:
[`docs/RENDER_DEPLOYMENT.md`](docs/RENDER_DEPLOYMENT.md)** (`render.yaml` is at
the repo root).

### 5. Verify the whole stack

```bash
cd backend

# Unit + endpoint tests (no running server needed)
python -m pytest tests -q

# End-to-end HTTP check against the running stack
python tests/smoke_online.py
```

`smoke_online.py` exercises the live API over HTTP — health, auth, all five
games, the adaptive engine's hysteresis, analytics, caregiver dashboard scoping,
AI recommendations, reminders CRUD, offline session sync (with duplicate
suppression), sync status, and role isolation — and prints
`RESULT: ALL CHECKS PASSED` when the online prototype is fully functional.

---

## ☁️ Deploying (Render)

`render.yaml` at the repo root is a **Render Blueprint**: importing it creates
both halves of the prototype in one pass.

| Service | Type | Root dir | Runs |
|---|---|---|---|
| `neuronest-api` | Web service (Python 3.11) | `backend/` | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| `neuronest-web` | Static site (Node 22) | `frontend/` | `npm ci && npm run build` → publish `dist/` |

```
Render dashboard → New + → Blueprint → this repo → paste the DB password → Apply
```

Supabase is **not** deployed — the API connects to the existing project over the
**IPv4 session pooler**, so the live site shows the same seeded demo data as your
laptop. Three things catch people out:

* **Pooler host, not `db.<ref>.supabase.co`** — the direct host is IPv6-only and
  Render's free instances have no IPv6 egress, so connections just time out.
* **`VITE_API_URL` is baked in at build time** — changing it in the dashboard
  does nothing until the static site redeploys.
* **`CORS_ORIGINS` must list the static site's exact origin** or every request
  fails in the browser with a CORS error.

📖 **Step-by-step, env-var reference, troubleshooting table and a demo-day
checklist: [`docs/RENDER_DEPLOYMENT.md`](docs/RENDER_DEPLOYMENT.md).** The
contract between `render.yaml`, the API URL and CORS is enforced by
`backend/tests/test_deploy_config.py`, so a drifted blueprint fails CI rather
than failing on stage.

---


## 🔑 Authentication & Roles

- **JWT (HS256)** stored in `localStorage` as `neuronest_token`, attached as `Authorization: Bearer <token>`.
- Passwords hashed with **bcrypt** via passlib.
- Two roles: **`patient`** and **`caregiver`**, enforced end-to-end:
  - Frontend: `ProtectedRoute` guards each route group.
  - Backend: `require_role()` dependency on protected endpoints.
  - A 401 response auto-clears the token and redirects to login (via a `neuronest:unauthorized` window event).

---

## 🎮 Cognitive Games

All games share a **standardized session schema** (`gameEngine.js` ⇄ backend `GameSession` model) so analytics and adaptive logic work uniformly:

```
game_type, difficulty (1–5), score (0–100), accuracy, response_time,
mistakes, attempts, completed, client_id, created_at
```

| Game | Route | Domain | What it trains |
|---|---|---|---|
| ✨ Memory Match | `/patient/games/memory` | Memory | Find matching pairs; level controls card count (6→20) and reveal speed |
| 🔢 Sequence Recall | `/patient/games/sequence` | Recognition | Watch a symbol sequence, then tap it back in order; level controls length (3→7) |
| 🎯 Attention Grid | `/patient/games/attention` | Attention | Tap all the target shapes among distractors before the timer ends |

**Performance score formula** (identical frontend & backend):
`Accuracy×0.45 + ResponseEfficiency×0.20 + Consistency×0.15 + Completion×0.10 + Improvement×0.10`

Every finished session shows the score, accuracy, mistakes, and an **explainable adaptive suggestion** (`suggestDifficulty` on the client, `adaptive_engine.py` on the server) with a "Next activity" button that carries the recommendation forward.

---

## 🤖 Adaptive Difficulty & Recommendation Engine

- **`backend/app/ml/adaptive_engine.py`** — deterministic, explainable algorithm:
  - Advance difficulty only after **2 consecutive strong sessions** (accuracy ≥ 85%, few mistakes, good response speed) — hysteresis prevents oscillation.
  - Regress difficulty on weak performance (accuracy < 60% or ≥ 8 mistakes).
  - Difficulty-bound response-time thresholds (4s→8s across levels 1→5).
- **`backend/app/ml/recommendation.py`** — a `GradientBoostingClassifier` trained on **clearly-labeled synthetic data** chooses the next best game + level from patient aggregate features (avg accuracy, response time, error rate, completion, difficulty). Every output is paired with a plain-language reason.
- The frontend mirrors both rules in `games/gameEngine.js` so the app still gives instant adaptive feedback **offline**.

---

## 📴 Offline-First Architecture

1. When a patient finishes a game, `OfflineContext.saveSession()` writes the record to **IndexedDB** (via Dexie in `offline/sessionQueue.js`) with `status: 'pending_sync'`.
2. If online, it immediately attempts sync via `POST /sync/sessions`.
3. If offline, the record stays queued; the shell shows a **SyncStatus** badge with the pending count.
4. On the `online` event (or manual retry), all pending sessions are uploaded with their `client_id` for **idempotent deduplication** — duplicates are rejected by the server, and synced records are cleaned up.

### Service Worker (`public/sw.js`)
- Pre-caches `/`, `/index.html`, `/icon.svg` for a reliable offline shell.
- Navigation requests: **network-first with cache fallback**.
- Static assets: **stale-while-revalidate**.
- API calls bypass the SW (IndexedDB handles offline writes).

---

## ♿ Accessibility & Localization

| Feature | Implementation |
|---|---|
| Large touch targets | Bottom nav + game tiles sized for elderly users (`min-h-16`+) |
| Font size presets | 4 sizes (`small/medium/large/xl`) written to `localStorage` and applied via `font-*` body class in `index.css` |
| High contrast | `high-contrast` body class toggles stronger text/border contrast live |
| Voice guidance | `voiceService.speak()` with `en-IN`/`hi-IN` rate/pitch tuning; toggleable |
| Language | EN/HI lazy-loaded JSON locales via `useI18n()`/`tr()` key lookup |
| Semantics | `aria-live` result announcements, `aria-pressed` cards, labeled nav, keyboard-friendly buttons |

---

## 📡 API Reference (FastAPI)

> Full auto-generated docs: `http://localhost:8000/docs`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness + active database backend (`ok` / `degraded`) |
| GET | `/health/database` | — | Database report: host, TLS, pool mode, latency, tables |
| GET | `/health/supabase` | — | Verifies the Supabase project URL + anon key |
| POST | `/auth/register` | — | Create patient/caregiver account (returns JWT) |
| POST | `/auth/login` | — | Login (OAuth2 form → JWT) |
| GET | `/users/me` | 🔒 | Current profile |
| POST | `/games/adaptive` | 🔒 patient | Difficulty suggestion from a session |
| POST | `/games/sessions` | 🔒 patient | Save a completed session |
| GET | `/games/sessions` | 🔒 patient | List own sessions (latest 50) |
| GET | `/patients` | 🔒 | Patient self, or caregiver's connected patients |
| GET | `/patients/{id}` | 🔒 | Single patient summary (`sync_status` included) |
| GET | `/patients/{id}/analytics` | 🔒 | Full patient analytics payload |
| DELETE | `/patients/{id}/levels` | 🔒 caregiver | Reset the adaptive difficulty to Level 1 |
| GET | `/caregiver/dashboard` | 🔒 caregiver | Connected patients + their weekly session counts |
| POST | `/recommendations/generate` | 🔒 | Generate an AI recommendation for a patient |
| GET | `/patients/{id}/recommendations` | 🔒 | List recommendations for a patient |
| GET/POST | `/reminders` | 🔒 | List/create reminders (role-scoped) |
| PUT/DELETE | `/reminders/{id}` | 🔒 | Update / delete a reminder |
| POST | `/sync/sessions` | 🔒 patient | Bulk-upload offline sessions (idempotent) |

---

## 🏗️ Configuration

### Backend `.env` (see `.env.example`)

With no configuration at all, the app runs on the local SQLite file:

```env
JWT_SECRET_KEY=your-secret-key-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
```

`CORS_ORIGINS` also accepts a plain comma-separated string, which is what
hosted environments (Render's env panel) store:
`CORS_ORIGINS=https://neuronest-web.onrender.com`. See
`_coerce_cors_origins` in `app/config.py`.

#### Optional: store real data in Supabase

Supabase **is** PostgreSQL, so the same SQLAlchemy models run on it unchanged —
only the connection has to be configured:

```env
USE_SUPABASE=true
SUPABASE_PROJECT_REF=your-project-ref              # derives db.<ref>.supabase.co
SUPABASE_DB_PASSWORD=your-supabase-db-password     # the DATABASE password, not an API key
SUPABASE_URL=https://your-project-ref.supabase.co  # optional: Storage / Realtime
SUPABASE_ANON_KEY=your-supabase-anon-key           # optional
```

Then create the schema and confirm the connection:

```powershell
cd backend
..\venv\Scripts\python.exe scripts\supabase_setup.py --create
..\venv\Scripts\python.exe scripts\supabase_setup.py --check
```

📖 **Full walkthrough — including the connection pooler, Row Level Security and a
troubleshooting table: [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).**

An explicit `DATABASE_URL` keeps working exactly as before (absolute paths
recommended) and is used whenever `USE_SUPABASE` is not `true`.

### Frontend `vite.config.js`

Dev server on port **5173**, proxying all API prefixes to the backend at `http://127.0.0.1:8000`.

### Frontend `.env` (see `frontend/.env.example`)

```env
VITE_API_URL=                      # empty in dev (Vite proxy); set it for a hosted API
```

| Value | Where requests go |
|---|---|
| *(empty)* | Relative paths → the Vite dev proxy → `http://127.0.0.1:8000` |
| `https://neuronest-api.onrender.com` | Directly to the deployed API (CORS must allow the site's origin) |

---

## 🧪 Testing

The backend ships a `tests/` directory (extend with pytest). A fast smoke flow:

```bash
# 1. Start backend
cd backend && uvicorn app.main:app --reload --port 8000

# 2. Seed demo data
python seed.py

# 3. Start frontend
cd frontend && npm run dev

# 4. Manual E2E smoke test
#    Login as patient@neuronest.demo / demo1234
#    → Play a game → save session → check /patient/analytics
#    → Toggle airplane mode → play another game → reconnect → confirm auto-sync badge clears
#    → Login as caregiver@neuronest.demo / demo1234
#    → Generate a recommendation → create a reminder → logout
```

Suggested next test areas: PWA installability (Lighthouse), offline reload, and role-guard edge cases (patient hitting `/caregiver/*`).

---

## 🚧 Known Limitations & Roadmap

1. **ML model is trained on synthetic data** — retraining on real (consented) patient data is a future step; kept deliberately small and explainable for the prototype.
2. **Push notifications** not yet implemented for reminders — requires browser Push API subscription + a push backend (VAPID).
3. **Bundle size** — the main bundle is large (≈851 kB minified / 253 kB gzipped); route-level `React.lazy()` code-splitting and `manualChunks` are recommended before scaling.
4. **Security hardening** — replace the demo JWT secret, add refresh tokens, rate limiting, and HTTPS-only cookies for production.
5. **Multi-device analytics** — aggregating offline sessions across devices is future work beyond the single-device IndexedDB queue.

---

## 📄 License

Proprietary / educational prototype for **Smart India Hackathon 2026 (SIH26003)**. All data and models are demo-grade and **not clinically validated**.