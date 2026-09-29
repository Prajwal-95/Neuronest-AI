"""
Caregiver progress report.

HONESTY NOTE: this is a DETERMINISTIC RULE-BASED report, not a language-model
output. Every statement is derived from stored session metrics, and each
finding names the numbers behind it. It deliberately does NOT speculate about
diagnosis, mood, medication or medical condition - none of that can be
inferred from gameplay data, and a report implying otherwise would be unsafe
in a care setting.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.models import User
from app.services.analytics_service import (
    GAME_DOMAINS, compute_current_streak, get_sessions_for_patient,
)

REPORT_DISCLAIMER = (
    "This report is generated from cognitive-activity scores only. It is a "
    "record of engagement and performance, not a medical assessment. It cannot "
    "detect, diagnose or rule out any health condition. Please discuss any "
    "concerns with a qualified doctor."
)

# A recent-score window short enough to react to, long enough not to panic over
# a single bad session.
RECENT_WINDOW = 10


def _avg_of(rows):
    vals = [r.score for r in rows if r.score is not None]
    return sum(vals) / len(vals) if vals else None


def _domain_breakdown(sessions):
    """(domain, avg_score, avg_mistakes, n) sorted by avg_score descending."""
    domain_map = {}
    for s in sessions:
        domain = GAME_DOMAINS.get(s.game_type, "Processing")
        d = domain_map.setdefault(domain, {"scores": [], "mistakes": []})
        if s.score is not None:
            d["scores"].append(s.score)
        d["mistakes"].append(s.mistakes or 0)
    ranked = []
    for name, d in domain_map.items():
        if not d["scores"]:
            continue
        ranked.append((
            name,
            sum(d["scores"]) / len(d["scores"]),
            sum(d["mistakes"]) / len(d["mistakes"]),
        ))
    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked


def _findings(sessions, recent, ranked, streak, weekly_activity):
    """Each finding must be traceable to a number the caregiver can verify."""
    findings = []
    recent_avg = _avg_of(recent)
    if recent_avg is not None and recent_avg < 55:
        findings.append({
            "severity": "warning",
            "title": "Recent scores have dropped",
            "detail": (
                f"The last {len(recent)} activities averaged {recent_avg:.0f} out of "
                "100. Worth checking whether the difficulty was raised too "
                "quickly, or whether something else is going on that day."
            ),
        })

    hard = [r for r in ranked if r[2] >= 4]
    if hard:
        names = ", ".join(f"{g[0]} ({g[2]:.1f} mistakes per game)" for g in hard)
        findings.append({
            "severity": "warning",
            "title": "Frequent mistakes in certain activities",
            "detail": (
                f"Most mistakes are happening in: {names}. Starting those at a "
                "lower level may feel more comfortable."
            ),
        })

    unfinished = [s for s in sessions if not s.completed]
    if len(unfinished) >= 2:
        findings.append({
            "severity": "warning",
            "title": f"{len(unfinished)} activities were not finished",
            "detail": (
                "Some activities ended early, often because the time limit ran "
                "out. A shorter or easier session may suit better right now."
            ),
        })

    if streak >= 3:
        findings.append({
            "severity": "good",
            "title": f"Playing consistently - {streak} day streak",
            "detail": (
                "Regular practice matters more than any single good session. "
                "This routine is working well."
            ),
        })
    elif weekly_activity == 0:
        findings.append({
            "severity": "warning",
            "title": "No sessions in the last 7 days",
            "detail": (
                "There has been no activity this week. A gentle reminder, or "
                "simply playing one activity together, usually helps."
            ),
        })

    if len(ranked) >= 2 and ranked[0][1] - ranked[-1][1] > 25:
        findings.append({
            "severity": "info",
            "title": f"Biggest gap is {ranked[-1][0]}",
            "detail": (
                f"{ranked[0][0]} is averaging {ranked[0][1]:.0f} while "
                f"{ranked[-1][0]} is at {ranked[-1][1]:.0f}. Focusing on the "
                "weaker area is the clearest place to make progress."
            ),
        })

    slow = [s for s in recent if (s.response_time or 0) > 12]
    if len(slow) >= 3:
        findings.append({
            "severity": "info",
            "title": "Responses are slowing down",
            "detail": (
                f"{len(slow)} of the last {len(recent)} activities averaged over "
                "12 seconds per move. This often happens with tiredness, so it "
                "may be worth asking how the session felt that day."
            ),
        })

    if not findings:
        findings.append({
            "severity": "good",
            "title": "No problems detected",
            "detail": (
                f"Across {len(sessions)} activities the scores and mistake counts "
                "look steady. Keep the current routine going."
            ),
        })
    return findings


def build_patient_report(db: Session, patient_id: int) -> dict:
    """Build the caregiver-facing progress report for one patient."""
    sessions = get_sessions_for_patient(db, patient_id)
    patient = db.query(User).filter(User.id == patient_id).first()
    name = patient.name if patient else f"Patient {patient_id}"

    if not sessions:
        return {
            "patient_id": patient_id,
            "patient_name": name,
            "generated_at": datetime.utcnow(),
            "summary": (
                f"{name} has not played any cognitive activity yet, so there is "
                "no performance data to report yet. The first step is simply to "
                "get them started with one short, easy activity."
            ),
            "overall_score": 0.0,
            "sessions_completed": 0,
            "current_streak": 0,
            "weekly_activity": 0,
            "engagement": "No activity",
            "strongest_area": "Not enough data",
            "weakest_area": "Not enough data",
            "trend": "Not enough data",
            "findings": [{
                "severity": "warning",
                "title": "No activities recorded",
                "detail": (
                    "Nothing has been recorded yet. A short daily session is "
                    "usually enough to start building a picture."
                ),
            }],
            "recent_days": [],
            "disclaimer": REPORT_DISCLAIMER,
        }

    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    scores = [s.score for s in sessions if s.score is not None]
    overall = round(sum(scores) / len(scores), 1) if scores else 0.0
    streak = compute_current_streak(sessions)
    this_week = [s for s in sessions if s.created_at >= week_ago]
    prev_week = [s for s in sessions if two_weeks_ago <= s.created_at < week_ago]
    weekly_activity = len(this_week)

    ranked = _domain_breakdown(sessions)
    strongest = f"{ranked[0][0]} ({ranked[0][1]:.0f} avg)" if ranked else "Not enough data"
    weakest = f"{ranked[-1][0]} ({ranked[-1][1]:.0f} avg)" if ranked else "Not enough data"

    cur_avg, prev_avg = _avg_of(this_week), _avg_of(prev_week)
    if cur_avg is None:
        trend = "No activity this week"
    elif prev_avg is None:
        trend = f"First active week - averaging {cur_avg:.0f}"
    else:
        delta = cur_avg - prev_avg
        if delta > 5:
            trend = f"Improving - up {delta:.0f} points vs last week"
        elif delta < -5:
            trend = f"Slipping - down {abs(delta):.0f} points vs last week"
        else:
            trend = f"Steady - within {abs(delta):.0f} points of last week"

    if weekly_activity >= 5:
        engagement = "Very active (5+ sessions this week)"
    elif weekly_activity >= 3:
        engagement = "Good (3-4 sessions this week)"
    elif weekly_activity >= 1:
        engagement = "Light (1-2 sessions this week)"
    else:
        engagement = "No activity this week"

    recent = sessions[:RECENT_WINDOW]
    findings = _findings(sessions, recent, ranked, streak, weekly_activity)

    by_day = {}
    for s in sessions:
        key = s.created_at.date().isoformat()
        d = by_day.setdefault(key, {"sessions": 0, "score_sum": 0.0, "mistakes": 0})
        d["sessions"] += 1
        d["score_sum"] += s.score or 0
        d["mistakes"] += s.mistakes or 0
    recent_days = [
        {
            "date": k,
            "sessions": by_day[k]["sessions"],
            "avg_score": round(by_day[k]["score_sum"] / by_day[k]["sessions"], 1),
            "mistakes": by_day[k]["mistakes"],
        }
        for k in sorted(by_day.keys(), reverse=True)[:7]
    ]

    summary = (
        f"{name} has completed {len(sessions)} cognitive activities with an "
        f"average score of {overall:.0f} out of 100. {engagement}. {trend}."
    )
    hard = [r for r in ranked if r[2] >= 4]
    if hard:
        summary += f" The main difficulty is with mistakes during {hard[0][0]}."

    return {
        "patient_id": patient_id,
        "patient_name": name,
        "generated_at": now,
        "summary": summary,
        "overall_score": overall,
        "sessions_completed": len(sessions),
        "current_streak": streak,
        "weekly_activity": weekly_activity,
        "engagement": engagement,
        "strongest_area": strongest,
        "weakest_area": weakest,
        "trend": trend,
        "findings": findings,
        "recent_days": recent_days,
        "disclaimer": REPORT_DISCLAIMER,
    }
