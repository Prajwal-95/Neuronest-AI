---

## Step 8 — Google login (optional, ~15 min)

Email + password and the pre-filled demo accounts keep working exactly as
before — Google is an **extra button** on the Login page:

1. **Google Cloud Console** → <https://console.cloud.google.com/> →
   **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   type **Web application**.
2. Under **Authorised JavaScript origins** add `http://localhost:5173`
   (and later your deployed frontend URL).
3. Copy the **Client ID** (`....apps.googleusercontent.com`) into the
   **same value** in two places:
   - `backend/.env`: `GOOGLE_CLIENT_ID=....apps.googleusercontent.com`
   - `frontend/.env` (create from `frontend/.env.example`):
     `VITE_GOOGLE_CLIENT_ID=....apps.googleusercontent.com`
4. Restart both servers. The button appears only when both are set
   (`GET /auth/config` → `google_enabled: true`).
5. Pick **patient / caregiver** on the Login page *before* clicking Google —
   first-time Google users are created with that role.

It stays authenticated the same way as email login: the browser gets a
one-time Google ID token, the backend verifies it against Google and mints
the app's **own JWT** — so Google users land in the same `users` table (with
`auth_provider='google'`) and get the same roles, `ProtectedRoute` guards,
offline sync and Supabase storage. Signing in with Google on an existing
email links the two (`google_sub`) instead of creating a duplicate.

---