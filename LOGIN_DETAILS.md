# 🔑 NeuroNest AI — Login Details

Quick reference for every demo account, its password, and what it shows.
**All demo accounts share the same password:** `demo1234`

---

## 🚀 Quick Login Table

| # | Role | Name shown | Email | Password | What you see |
|---|------|-----------|-------|----------|--------------|
| 1 | 👩⚕️ **Caregiver** | Demo Caregiver | `caregiver@neuronest.demo` | `demo1234` | Dashboard, AI recommendations, patient details, reminders |
| 2 | 👴 **Patient (English)** | Ravi Sharma | `patient@neuronest.demo` | `demo1234` | **All 5 games**, analytics, reminders |
| 3 | 👵 **Patient (Hindi)** | Meena Devi | `meena@neuronest.demo` | `demo1234` | Games + **हिंदी UI & voice** |

---

## 🌐 Where to Open

| What | URL |
|------|-----|
| Frontend app (login page) | **http://localhost:5173** |
| Backend health check | http://127.0.0.1:8000/health |
| Swagger API docs | http://127.0.0.1:8000/docs |
| ☁️ **Deployed (Render)** | **https://neuronest-web.onrender.com** |
| ☁️ Deployed API health | https://neuronest-api.onrender.com/health |

> Open the frontend, enter any email + `demo1234`, and you're in.
> No need to type credentials manually — the **⟷ Demo accounts** button in the top bar switches between all three instantly.

> ☁️ **Judging a hosted link instead of a laptop?** The two Render URLs above are
> the same app and the **same** demo accounts — nothing to seed, nothing to run.
> A free Render instance sleeps after ~15 minutes idle, so the first request can
> take ~60 s; the app then says *"the server may be waking up"* rather than
> failing silently. Ping `/health` once before you present. Setup:
> [`docs/RENDER_DEPLOYMENT.md`](docs/RENDER_DEPLOYMENT.md).

---

## ▶️ How to Run the Project (exact commands)

You need **two terminals**. Keep both running.

### Terminal 1 — Backend (API server on port 8000)

```powershell
cd F:\Neuronest-AI
.\venv\Scripts\activate
cd backend
uvicorn app.main:app --reload --port 8000
```

**Expected output (last lines):**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

> Prefer not to activate the venv? This single command also works:
> ```powershell
> cd F:\Neuronest-AI\backend
> ..\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
> ```

### Terminal 2 — Frontend (Vite dev server on port 5173)

```powershell
cd F:\Neuronest-AI\frontend
npm run dev
```

**Expected output (last lines):**
```
  VITE v5.x  ready in <x> ms
  ➜  Local:   http://localhost:5173/
```

### Then open the app

Go to **http://localhost:5173** in Chrome or Edge and log in with any demo account above.

### First time setup (only once — usually already done)

```powershell
# 1. Install backend dependencies (already done if backend starts)
cd F:\Neuronest-AI
python -m venv venv
.\venv\Scripts\activate
cd backend
pip install -r requirements.txt

# 2. Install frontend dependencies (already done if frontend starts)
cd F:\Neuronest-AI\frontend
npm install

# 3. Create the demo accounts + sample analytics
cd F:\Neuronest-AI\backend
..\venv\Scripts\python.exe seed.py
```

> If both servers start but the app page shows nothing useful, the most likely
> fix is running `seed.py` once (demo accounts might not exist yet).

---

## 🎮 The 5 Games (shown to the patient)

| Game | How it looks | URL |
|------|-------------|-----|
| 🃏 Memory Match | Flip cards, find matching pairs (larger board = harder) | `/patient/games/memory` |
| 🔢 Sequence Recall | Watch a symbol sequence, repeat it in order | `/patient/games/sequence` |
| 🎯 Attention Focus | Tap all the filled circles before time runs out | `/patient/games/attention` |
| ➕ Quick Math | Solve simple sums under a time limit | `/patient/games/math` |
| 📝 Word Recall | Recall a list of words shown briefly | `/patient/games/words` |

Each game has **5 difficulty levels** that adapt automatically and comes with
voice guidance (toggle under **Settings**).

---

## 🎬 2-Minute Live Demo Script

1. **Log in as Caregiver** (`caregiver@neuronest.demo`)
   → Show the dashboard (2 connected patients, weekly sessions)
   → Click a patient → **Generate recommendation** (AI suggestion)
2. **Switch to Ravi** (`patient@neuronest.demo`) via the **⟷ Demo accounts** button
   → Go to **Games** → play **Memory Match** for ~1 minute
   → Finish → it suggests your next adaptive activity
   → Show **My Progress** (live charts update after your game)
3. **Switch to Meena** (`meena@neuronest.demo`)
   → Show the **Hindi हिंदी interface + Hindi voice** reading instructions
4. (Optional) **Offline demo:** turn on airplane mode → play a game → it saves locally
   → turn Wi-Fi back on → the session **auto-syncs** (badge clears)

---

## ➕ Creating Your Own Account (for a real, non-seeded flow)

Use the **Create account** link on the login page:

| Field | Do this |
|-------|---------|
| Full name | Any name |
| Email | Any email |
| Password | Anything (min. 6 characters) |
| I am a | Patient **or** Caregiver |

> ⚠️ To connect a *new* caregiver to a *new* patient, you must also insert a link
> row in the `caregiver_patient` table / `CaregiverPatient` model, or use the
> seeded demo accounts below which are already connected.

---

## 🔄 Re-seed (reset all demo data)

```powershell
cd F:\Neuronest-AI\backend
..\venv\Scripts\python.exe seed.py
```

Resets accounts + 3 weeks of sample analytics (same emails & password as above).

---

## ✅ Verify the whole stack works (with both servers running)

```powershell
cd F:\Neuronest-AI\backend
..\venv\Scripts\python.exe tests\smoke_online.py
```

This hits the live API over HTTP and checks the full online path: health, login
and registration, all 5 games, the adaptive engine's hysteresis, analytics,
caregiver dashboard scoping, AI recommendations, reminders CRUD, offline session
sync (including duplicate suppression), sync status, and role isolation. It ends
with `RESULT: ALL CHECKS PASSED` when the prototype is functional.

---

## 📌 Reminders

- Demo password is **always** `demo1234`.
- Voice guidance works best in **Chrome/Edge** (British English + Hindi voices built in).
- If login fails, make sure the backend is running: `uvicorn app.main:app --reload --port 8000`