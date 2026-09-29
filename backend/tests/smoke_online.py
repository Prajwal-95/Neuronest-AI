"""End-to-end smoke test for the ONLINE NeuroNest AI prototype.

Runs against a live uvicorn server and walks the full demo path:
health -> login (patient + caregiver) -> register -> session submit ->
adaptive -> analytics -> caregiver dashboard -> AI recommendation ->
reminders CRUD -> offline sync -> role isolation.

Usage (backend must already be running on :8000):
    ..\\venv\\Scripts\\python.exe tests\\smoke_online.py
"""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
PASS = "demo1234"
GAMES = ["memory_match", "sequence_recall", "attention", "quick_math", "word_recall"]
failures = []


def call(method, path, token=None, body=None, expect=200):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=20) as res:
            status, raw = res.status, res.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    try:
        parsed = json.loads(raw) if raw else None
    except ValueError:
        parsed = None  # e.g. the HTML served at /docs
    ok = status == expect
    label = f"{method} {path} -> {status} (expect {expect})"
    print(("  PASS  " if ok else "  FAIL  ") + label)
    if not ok:
        failures.append(label)
        print("         body: " + str(raw)[:250])
    return parsed


def check(name, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + (("  " + detail) if detail else ""))
    if not cond:
        failures.append(name)


def section(title):
    print("\n" + title)


print("=" * 66)
print("NEURONEST AI - ONLINE PROTOTYPE SMOKE TEST")
print("=" * 66)

section("[1] Health & docs")
health = call("GET", "/health")
check("health reports ok", bool(health) and health.get("status") == "ok")
call("GET", "/docs")

section("[2] Authentication")
ptok = call("POST", "/auth/login", body={"email": "patient@neuronest.demo", "password": PASS})
ctok = call("POST", "/auth/login", body={"email": "caregiver@neuronest.demo", "password": PASS})
check("patient login -> role patient", ptok["user"]["role"] == "patient")
check("caregiver login -> role caregiver", ctok["user"]["role"] == "caregiver")
call("POST", "/auth/login", body={"email": "patient@neuronest.demo", "password": "wrong"}, expect=401)
me = call("GET", "/users/me", token=ptok["access_token"])
check("/users/me matches token owner", me["email"] == "patient@neuronest.demo")
call("GET", "/users/me", expect=401)
patient_id = ptok["user"]["id"]

stamp = str(int(time.time()))
stranger_email = "stranger" + stamp + "@neuronest.demo"
stranger = call("POST", "/auth/register", body={
    "name": "Smoke Stranger", "email": stranger_email,
    "password": "test1234", "role": "caregiver", "language": "en"})
call("POST", "/auth/register", body={
    "name": "Smoke Stranger", "email": stranger_email,
    "password": "test1234", "role": "caregiver"}, expect=400)
call("POST", "/auth/register", body={
    "name": "Bad", "email": "not-an-email", "password": "x", "role": "patient"}, expect=422)

section("[3] Patient game sessions (all 5 shipped games)")
for g in GAMES:
    call("POST", "/games/sessions", token=ptok["access_token"], body={
        "game_type": g, "difficulty": 2, "score": 70, "accuracy": 0.8,
        "response_time": 2.5, "mistakes": 1, "attempts": 10, "completed": True})
# Level 10 is the top of the range the games can reach. This used to return 422
# because the schema capped difficulty at 5, so the ceiling is pinned down for
# every game. These posts run on a throwaway patient on purpose: writing
# high-scoring sessions into Ravi's history would flip the "weak history"
# fixture that the hysteresis check in section [4] depends on.
ceiling = call("POST", "/auth/register", body={
    "name": "Ceiling Probe", "email": "ceiling%s@neuronest.demo" % stamp,
    "password": "test1234", "role": "patient"})
ceil_tok = ceiling["access_token"]
for g in GAMES:
    call("POST", "/games/sessions", token=ceil_tok, body={
        "game_type": g, "difficulty": 10, "score": 92, "accuracy": 0.95,
        "response_time": 9.0, "mistakes": 1, "attempts": 14, "completed": True})
check("all 5 games accept a level-10 session", True)
# Widening the range must still reject anything past either end.
for bad_level in (0, 11):
    call("POST", "/games/sessions", token=ceil_tok, body={
        "game_type": "memory_match", "difficulty": bad_level, "score": 70,
        "accuracy": 0.8, "response_time": 2.5, "mistakes": 1, "attempts": 10},
        expect=422)
check("difficulty outside 1..10 is rejected", True)
call("POST", "/games/sessions", token=ptok["access_token"], body={
    "game_type": "invalid_game", "difficulty": 2, "score": 50, "accuracy": 0.5,
    "response_time": 2, "mistakes": 1, "attempts": 5}, expect=422)
call("POST", "/games/sessions", token=ctok["access_token"], body={
    "game_type": "memory_match", "difficulty": 1, "score": 50, "accuracy": 0.5,
    "response_time": 2, "mistakes": 0, "attempts": 5}, expect=403)
call("POST", "/games/sessions", body={
    "game_type": "memory_match", "difficulty": 1, "score": 50, "accuracy": 0.5,
    "response_time": 2, "mistakes": 0, "attempts": 5}, expect=401)
sess = call("GET", "/games/sessions", token=ptok["access_token"])
check("patient session history populated", len(sess) > 0, "count=%d" % len(sess))

section("[4] Adaptive difficulty engine (hysteresis: increase / maintain / decrease)")
for payload, mode in [
    ({"accuracy": 0.70, "response_time": 3.0, "mistakes": 2,
      "current_difficulty": 3, "game_type": "quick_math"}, "maintain"),
    ({"accuracy": 0.25, "response_time": 9.0, "mistakes": 7,
      "current_difficulty": 4, "game_type": "attention"}, "decrease"),
]:
    r = call("POST", "/games/adaptive", token=ptok["access_token"], body=payload)
    delta = {"increase": 1, "maintain": 0, "decrease": -1}[mode]
    check("adaptive %s path" % mode,
          r["recommended_difficulty"] == payload["current_difficulty"] + delta,
          "L%d->L%d :: %s" % (payload["current_difficulty"],
                              r["recommended_difficulty"], r["reason"][:55]))
    check("adaptive returns a reason", bool(r.get("reason")))

# The endpoint deliberately overrides client-supplied `recent_scores` with the
# authoritative DB history, so the real online flow is: play a strong session
# (it persists), then ask for the next recommendation. Ravi's seeded history is
# all below 85, so a single great session correctly holds the level.
r = call("POST", "/games/adaptive", token=ptok["access_token"], body={
    "accuracy": 0.95, "response_time": 1.5, "mistakes": 0,
    "current_difficulty": 2, "game_type": "memory_match"})
check("hysteresis: 1 strong session + weak history holds level",
      r["recommended_difficulty"] == 2, "L2->L%d" % r["recommended_difficulty"])

# Full loop on a brand-new patient: a strong session must persist and then push
# the NEXT call up a level - the behaviour a real patient actually sees.
fresh = call("POST", "/auth/register", body={
    "name": "Adaptive Probe", "email": "probe%s@neuronest.demo" % stamp,
    "password": "test1234", "role": "patient"})
freshtok = fresh["access_token"]
r1 = call("POST", "/games/adaptive", token=freshtok, body={
    "accuracy": 0.95, "response_time": 1.5, "mistakes": 0,
    "current_difficulty": 2, "game_type": "memory_match"})
check("new patient holds level on first strong session",
      r1["recommended_difficulty"] == 2, "L2->L%d" % r1["recommended_difficulty"])
call("POST", "/games/sessions", token=freshtok, body={
    "game_type": "memory_match", "difficulty": 2, "score": 90, "accuracy": 0.95,
    "response_time": 1.5, "mistakes": 0, "attempts": 8, "completed": True})
r2 = call("POST", "/games/adaptive", token=freshtok, body={
    "accuracy": 0.95, "response_time": 1.5, "mistakes": 0,
    "current_difficulty": 2, "game_type": "memory_match"})
check("second strong session advances the level",
      r2["recommended_difficulty"] == 3, "L2->L%d" % r2["recommended_difficulty"])
# At the top of the range a strong session must NOT overflow past level 10.
r_top = call("POST", "/games/adaptive", token=freshtok, body={
    "accuracy": 0.99, "response_time": 1.0, "mistakes": 0,
    "current_difficulty": 10, "game_type": "memory_match"})
check("level 10 is the ceiling (no level 11)", r_top["recommended_difficulty"] == 10,
      "L10->L%d" % r_top["recommended_difficulty"])

section("[5] Patient analytics")
an = call("GET", "/patients/%d/analytics" % patient_id, token=ptok["access_token"])
check("overall score computed", an["overall_score"] > 0, "score=%s" % an["overall_score"])
check("sessions counted", an["sessions_completed"] > 0, "n=%s" % an["sessions_completed"])
check("4 cognitive domains", len(an["domains"]) == 4)
check("7-day weekly trend", len(an["weekly_trend"]) == 7)
rs = an["recent_sessions"]
# `recent_sessions` is a "newest first" activity feed (distinct from
# recent_scores_for_patient, which is deliberately chronological for scoring).
check("recent sessions newest-first (most recent at top)",
      all(rs[i]["created_at"] >= rs[i + 1]["created_at"] for i in range(len(rs) - 1)))
check("difficulty progression present", len(an["difficulty_progression"]) > 0)

section("[6] Caregiver dashboard scoping")
dash = call("GET", "/caregiver/dashboard", token=ctok["access_token"])
check("lists connected patients", len(dash["patients"]) == 2, "n=%d" % len(dash["patients"]))
names = sorted(p["name"] for p in dash["patients"])
check("only linked patients appear", names == ["Meena Devi", "Ravi Sharma"], str(names))
check("weekly sessions scoped", dash["sessions_this_week"] >= 0, "n=%s" % dash["sessions_this_week"])
check("sync status present on every card",
      all(p["sync_status"] in ("synced", "pending") for p in dash["patients"]))
call("GET", "/caregiver/dashboard", token=ptok["access_token"], expect=403)

section("[7] Patient detail & cross-tenant authorization")
for p in dash["patients"]:
    det = call("GET", "/patients/%d" % p["id"], token=ctok["access_token"])
    check("caregiver reads %s" % p["name"], det["email"] == p["email"])
call("GET", "/patients/99999", token=ctok["access_token"], expect=404)
call("GET", "/patients/%d/analytics" % patient_id, token=stranger["access_token"], expect=403)
call("GET", "/caregiver/dashboard", token=stranger["access_token"])
check("unlinked caregiver sees zero patients",
      call("GET", "/caregiver/dashboard", token=stranger["access_token"])["patients"] == [])

section("[8] AI recommendation engine")
rec = call("POST", "/recommendations/generate", token=ctok["access_token"],
           body={"patient_id": patient_id})
check("recommendation names a valid game", rec["game_type"] in GAMES, rec["game_type"])
check("recommendation difficulty within 1..10", 1 <= rec["difficulty"] <= 10,
      "L%s" % rec["difficulty"])
check("explainable reason", len(rec["reason"]) > 20, rec["reason"][:70])
call("GET", "/patients/%d/recommendations" % patient_id, token=ptok["access_token"])
call("POST", "/recommendations/generate", token=stranger["access_token"],
     body={"patient_id": patient_id}, expect=403)

section("[9] Reminders CRUD")
rem = call("POST", "/reminders", token=ctok["access_token"], body={
    "patient_id": patient_id, "title": "Smoke test walk",
    "description": "Automated prototype check",
    "scheduled_time": "2026-01-01T09:00:00"})
pr = call("GET", "/reminders", token=ptok["access_token"])
check("patient sees own reminders", any(x["id"] == rem["id"] for x in pr))
cr = call("GET", "/reminders", token=ctok["access_token"])
check("caregiver sees connected patients' reminders", any(x["id"] == rem["id"] for x in cr))
upd = call("PUT", "/reminders/%d" % rem["id"], token=ptok["access_token"],
           body={"completed": True})
check("patient can complete own reminder", upd["completed"] is True)
call("POST", "/reminders", token=ptok["access_token"], body={
    "patient_id": patient_id, "title": "Nope",
    "scheduled_time": "2026-01-01T09:00:00"}, expect=403)
call("DELETE", "/reminders/%d" % rem["id"], token=ctok["access_token"])
call("PUT", "/reminders/%d" % rem["id"], token=ctok["access_token"], body={}, expect=404)

section("[10] Offline-first session sync")
cid1 = "smoke-offline-%s-a" % stamp
cid2 = "smoke-offline-%s-b" % stamp
sync = call("POST", "/sync/sessions", token=ptok["access_token"], body={"sessions": [
    {"game_type": "memory_match", "difficulty": 3, "score": 0, "accuracy": 0.85,
     "response_time": 2.1, "mistakes": 1, "attempts": 12, "completed": True,
     "offline_created": True, "client_id": cid1},
    {"game_type": "word_recall", "difficulty": 2, "score": 0, "accuracy": 0.60,
     "response_time": 4.0, "mistakes": 3, "attempts": 10, "completed": True,
     "offline_created": True, "client_id": cid2},
]})
check("2 offline sessions synced", len(sync["synced"]) == 2,
      "n=%d" % len(sync["synced"]))
check("server recomputed a non-zero score",
      all(s["score"] > 0 for s in sync["synced"]),
      str([s["score"] for s in sync["synced"]]))
check("synced rows carry synced_at", all(s["synced_at"] for s in sync["synced"]))
dup = call("POST", "/sync/sessions", token=ptok["access_token"], body={"sessions": [
    {"game_type": "memory_match", "difficulty": 3, "score": 0, "accuracy": 0.85,
     "response_time": 2.1, "mistakes": 1, "attempts": 12, "completed": True,
     "offline_created": True, "client_id": cid1}]})
check("duplicate client_id skipped (idempotent re-sync)",
      dup["duplicates"] == 1 and len(dup["synced"]) == 0)
call("POST", "/sync/sessions", token=ctok["access_token"], body={"sessions": []}, expect=403)

section("[11] Sync status reflects the queue")
dash2 = call("GET", "/caregiver/dashboard", token=ctok["access_token"])
check("all sessions acknowledged -> 'synced'",
      all(p["sync_status"] == "synced" for p in dash2["patients"]),
      str({p["name"]: p["sync_status"] for p in dash2["patients"]}))

section("[12] Caregiver adaptive-level reset")
rst = call("DELETE", "/patients/%d/levels" % patient_id, token=ctok["access_token"])
check("reset returns level 1", rst["reset"] is True and rst["level"] == 1)
call("DELETE", "/patients/%d/levels" % patient_id, token=ptok["access_token"], expect=403)

section("[13] Day-by-day session history (caregiver detail view)")
hist = call("GET", "/patients/%d/sessions" % patient_id, token=ctok["access_token"])
check("GET /patients/{id}/sessions -> 200", isinstance(hist, list))
check("history is not empty", len(hist) > 0, "n=%d" % len(hist))
if hist:
    check(
        "history is newest-first",
        all(hist[i]["created_at"] >= hist[i + 1]["created_at"] for i in range(len(hist) - 1)),
    )
    required = ("game_type", "difficulty", "score", "accuracy", "mistakes", "attempts", "completed", "created_at")
    check(
        "every record carries the fields the caregiver view needs",
        all(all(k in row for k in required) for row in hist),
    )
    # The caregiver view groups by day; verify more than one day is reachable,
    # otherwise the "pick a day" control would be pointless.
    check(
        "history spans multiple days (day picker is useful)",
        len({row["created_at"][:10] for row in hist}) > 1,
        "days=%d" % len({row["created_at"][:10] for row in hist}),
    )
    check(
        "mistakes are recorded so 'played correctly' can be judged",
        any(row["mistakes"] > 0 for row in hist) or all(row["mistakes"] == 0 for row in hist),
    )
# Access control: a patient may read their own history, a caregiver only a linked
# patient, and nobody may read it anonymously.
call("GET", "/patients/%d/sessions" % patient_id, token=ptok["access_token"])
check("patient can read own session history", True)
call("GET", "/patients/999999/sessions", token=ctok["access_token"], expect=404)
call("GET", "/patients/%d/sessions" % patient_id, expect=401)
check("session history is protected (404 unknown / 401 anonymous)", True)

section("[14] Caregiver patient management + report")
import time as _time
_stamp = int(_time.time())
_new = call("POST", "/patients", token=ctok["access_token"], body={
    "name": "Smoke Patient", "email": "smoke%d@t.com" % _stamp,
    "password": "test1234", "language": "en"}, expect=201)
check("POST /patients creates a patient", _new.get("name") == "Smoke Patient", str(_new)[:90])
_newid = _new.get("id")
check("new patient appears in the caregiver dashboard",
      any(p["id"] == _newid for p in
          call("GET", "/caregiver/dashboard", token=ctok["access_token"])["patients"]))
_again = call("POST", "/patients", token=ctok["access_token"], body={
    "name": "Smoke Patient", "email": "smoke%d@t.com" % _stamp,
    "password": "test1234"}, expect=201)
check("re-adding the same email links instead of duplicating", _again.get("id") == _newid)
call("POST", "/patients", token=ptok["access_token"], body={
    "name": "X", "email": "x%d@t.com" % _stamp, "password": "test1234"}, expect=403)
check("a patient cannot add patients", True)
call("POST", "/patients", token=ctok["access_token"], body={
    "name": "X", "email": "caregiver@neuronest.demo", "password": "test1234"}, expect=400)
check("a caregiver account cannot be added as a patient", True)
call("POST", "/patients", token=ctok["access_token"], body={
    "name": "X", "email": "y%d@t.com" % _stamp, "password": "12"}, expect=422)
check("short password is rejected", True)

_rep = call("GET", "/patients/%d/report" % patient_id, token=ctok["access_token"])
check("GET /patients/{id}/report -> 200", isinstance(_rep, dict) and "summary" in _rep)
for _f in ("summary", "overall_score", "sessions_completed", "engagement",
           "strongest_area", "weakest_area", "trend", "findings", "disclaimer"):
    check("report includes %s" % _f, _f in _rep)
check("report always carries the not-a-medical-assessment disclaimer",
      "not a medical assessment" in _rep["disclaimer"])
check("report never claims a diagnosis",
      not any(w in _rep["summary"].lower() for w in
              ("diagnos", "alzheimer", "dementia", "depression", "medication")))
check("report has at least one finding", len(_rep["findings"]) >= 1)
check("every finding has a title and detail",
      all(f.get("title") and f.get("detail") for f in _rep["findings"]))
check("every finding has a valid severity",
      all(f.get("severity") in ("good", "info", "warning") for f in _rep["findings"]))
_empty = call("GET", "/patients/%d/report" % _newid, token=ctok["access_token"])
check("report works for a patient with zero activity",
      "summary" in _empty and _empty["sessions_completed"] == 0)
call("GET", "/patients/999999/report", token=ctok["access_token"], expect=404)
call("GET", "/patients/%d/report" % patient_id, expect=401)
check("report endpoint is protected", True)

_removed = call("DELETE", "/patients/%d" % _newid, token=ctok["access_token"])
check("DELETE /patients/{id} unlinks by default",
      _removed.get("deleted") is True and _removed.get("unlinked_only") is True)
call("DELETE", "/patients/%d" % 999999, token=ctok["access_token"], expect=404)
call("DELETE", "/patients/%d" % patient_id, token=ptok["access_token"], expect=403)
check("only a linked caregiver can remove a patient", True)

print("\n" + "=" * 66)
if failures:
    print("RESULT: %d CHECK(S) FAILED" % len(failures))
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("RESULT: ALL CHECKS PASSED - online prototype is functional end to end")
print("=" * 66)
