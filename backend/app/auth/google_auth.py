"""Google Identity Services verification (backend-verified ID tokens).

Flow: the browser signs the user in with Google (GIS button in Login.jsx) and
sends the resulting one-time ID token to POST /auth/google. This module
verifies that token against Google's tokeninfo endpoint, then the route mints
the app's own JWT — so Google users land in the SAME `users` table and the
rest of the stack (roles, ProtectedRoute, offline sync, Supabase-or-SQLite)
works unchanged.

Why tokeninfo instead of a JWT library: zero new dependencies, a 5s timeout so
a slow Google response can never hang a request, and the response already
contains the verified email + profile fields the app needs.
"""

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict

from app.config import is_unset, settings

logger = logging.getLogger("neuronest.auth.google")

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
_VERIFY_TIMEOUT_SECONDS = 5.0


def google_configured() -> bool:
    """True when the backend can verify Google ID tokens."""
    return settings.google_configured


def allowed_email(email: str) -> bool:
    """True when `email` passes the optional GOOGLE_ALLOWED_EMAILS allow-list."""
    raw = (settings.GOOGLE_ALLOWED_EMAILS or "").strip()
    if not raw:
        return True
    allowed = {part.strip().lower() for part in raw.split(",") if part.strip()}
    return email.strip().lower() in allowed


def verify_id_token(id_token: str) -> Dict[str, Any]:
    """Verify a Google ID token, returning the tokeninfo claims.

    Raises ValueError with a user-safe message when the token is invalid,
    expired, or meant for a different app (wrong audience).
    """
    if not google_configured():
        raise ValueError(
            "Google sign-in is not configured. Set GOOGLE_CLIENT_ID in "
            "backend/.env (see docs/SUPABASE_SETUP.md)."
        )
    if not id_token or not id_token.strip():
        raise ValueError("Missing Google credential. Please try again.")

    url = f"{TOKENINFO_URL}?{urllib.parse.urlencode({'id_token': id_token.strip()})}"
    try:
        request = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(request, timeout=_VERIFY_TIMEOUT_SECONDS) as response:
            claims = json.loads(response.read() or b"{}")
    except urllib.error.HTTPError:
        # tokeninfo answers 400 for expired/forged/wrong-audience tokens.
        raise ValueError("That Google sign-in has expired. Please try again.")
    except Exception as exc:  # network down, DNS, timeout — never leak internals
        logger.warning("Google tokeninfo unreachable: %s: %s", type(exc).__name__, exc)
        raise ValueError("Could not reach Google to verify the sign-in. Try again.")

    expected_aud = (settings.GOOGLE_CLIENT_ID or "").strip()
    if claims.get("aud") != expected_aud:
        raise ValueError("This Google sign-in was meant for a different app.")
    email = (claims.get("email") or "").strip().lower()
    if not email or claims.get("email_verified") not in ("true", True, "1", 1):
        raise ValueError("Google did not return a verified email address.")
    if not allowed_email(email):
        raise ValueError("This Google account is not invited to NeuroNest AI yet.")

    return {
        "sub": str(claims.get("sub") or ""),
        "email": email,
        "name": (claims.get("name") or email.split("@")[0]).strip(),
        "picture": (claims.get("picture") or "").strip() or None,
    }
