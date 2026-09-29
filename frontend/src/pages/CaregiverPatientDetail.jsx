import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Activity as ActivityIcon, Sparkles, ChevronRight } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { api } from '../services/api'
import { useI18n } from '../services/i18n'
import { ErrorState, LoadingSkeleton } from '../components/States'

const GAME_NAMES = {
  memory_match: 'Memory Match',
  sequence_recall: 'Sequence Recall',
  attention: 'Attention Focus',
  quick_math: 'Quick Math',
  word_recall: 'Word Recall',
}

export default function CaregiverPatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { tr } = useI18n()
  const [patient, setPatient] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  // Full session history for the day-by-day breakdown. The analytics endpoint
  // only returns the 20 most recent sessions, which is not enough for a
  // caregiver to inspect an older day.
  const [sessions, setSessions] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [p, a, r, s] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get(`/patients/${id}/analytics`),
        api.get(`/patients/${id}/recommendations`),
        api.get(`/patients/${id}/sessions`),
      ])
      setPatient(p)
      setAnalytics(a)
      setRecs(r)
      setSessions(s)
    } catch (err) {
      setError(err.message || tr('common.error'))
    } finally {
      setLoading(false)
    }
  }

  // Group sessions by calendar day, newest day first. Uses the local date part
  // of the ISO timestamp so a session played at 23:50 is grouped with the day
  // the player actually experienced it.
  const days = useMemo(() => {
    const byDay = new Map()
    for (const s of sessions) {
      const day = new Date(s.created_at)
      if (Number.isNaN(day.getTime())) continue
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(s)
    }
    return [...byDay.entries()]
      .map(([date, items]) => ({
        date,
        items: items.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
        total: items.length,
        avgScore: Math.round((items.reduce((n, x) => n + (x.score || 0), 0) / items.length) * 10) / 10,
        totalMistakes: items.reduce((n, x) => n + (x.mistakes || 0), 0),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [sessions])

  // Default to the most recent day that actually had activity.
  useEffect(() => {
    if (days.length && !days.some((d) => d.date === selectedDay)) {
      setSelectedDay(days[0].date)
    }
  }, [days, selectedDay])

  const dayDetail = days.find((d) => d.date === selectedDay) || null

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleResetLevels = async () => {
    if (!patient) return
    if (!window.confirm(`Reset ${patient.name}'s difficulty levels back to Level 1 for all games?`)) return
    setResetting(true)
    setResetMsg('')
    // Always clear per-device level keys so the games restart at Level 1 on this browser,
    // even when offline. The backend call removes server-side recommendations (best effort).
    const keys = [
      'neuronest_memory_level', 'neuronest_sequence_level', 'neuronest_attention_level',
      'neuronest_math_level', 'neuronest_word_level',
    ]
    keys.forEach((k) => localStorage.removeItem(k))
    localStorage.removeItem('neuronest_recent_scores')
    try {
      await api.delete(`/patients/${id}/levels`)
      setResetMsg(`All levels for ${patient.name} have been reset to Level 1.`)
      // Refresh to drop stale recommendations
      setRecs([])
    } catch {
      setResetMsg(
        `All levels for ${patient.name} have been reset on this device to Level 1. ` +
        'Server recommendation could not be updated (offline?) — it will regenerate on the next session.'
      )
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <LoadingSkeleton rows={4} />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />
  }

  const trend = analytics?.weekly_trend?.length
    ? analytics.weekly_trend.map((p) => ({
        day: shortDay(p.date),
        score: Math.round(p.score),
      }))
    : []

  const domainMap = {
    Memory: 'Memory',
    Attention: 'Attention',
    Recognition: 'Recall & Recognition',
    Processing: 'Quick Thinking',
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="btn-secondary !px-4 !py-2 self-start flex items-center gap-2"
      >
        <ArrowLeft size={18} aria-hidden="true" /> Back
      </button>

      <section className="card flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="w-16 h-16 rounded-full bg-navy-700 text-white flex items-center justify-center shrink-0">
          <User size={34} aria-hidden="true" />
        </span>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-navy-800">{patient.name}</h1>
          <p className="text-navy-500">{patient.email}</p>
          <p className="text-sm text-navy-500 mt-1">
            {analytics?.sessions_completed ?? 0} sessions ·{' '}
            {analytics?.current_streak ?? 0}-day streak · Overall{' '}
            {Math.round(analytics?.overall_score ?? 0)}
          </p>
        </div>
        <Link
          to="/caregiver/reminders"
          state={{ patientId: patient.id }}
          className="btn-primary !px-4 !py-2 text-sm shrink-0"
        >
          Set reminder <ChevronRight size={16} className="inline" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={handleResetLevels}
          disabled={resetting}
          className="btn-secondary !px-4 !py-2 text-sm shrink-0 flex items-center gap-2"
          aria-label={`Reset ${patient.name}'s difficulty levels to 1`}
        >
          {resetting ? 'Resetting…' : 'Reset levels'}
        </button>
        {resetMsg && (
          <p
            className="w-full text-sm font-medium sm:text-right"
            style={{ color: /could not|offline/i.test(resetMsg) ? '#b45309' : '#0f766e' }}
            role="status"
          >
            {resetMsg}
          </p>
        )}
      </section>

      {trend.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold text-navy-800">{tr('analytics.weeklyTrend')}</h2>
          <div className="mt-4" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef4fb" />
                <XAxis dataKey="day" tick={{ fill: '#16294a' }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#16294a' }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#1e9a8c" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
<section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Domains */}
        <div className="card">
          <h2 className="text-lg font-semibold text-navy-800 mb-3">{tr('analytics.domains')}</h2>
          {(analytics?.domains?.length || 0) === 0 ? (
            <p className="text-navy-500">{tr('analytics.noData')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {analytics?.domains.map((d) => (
                <li key={d.domain}>
                  <div className="flex justify-between text-sm font-medium text-navy-700 mb-1">
                    <span>{domainMap[d.domain] || d.domain}</span>
                    <span>{Math.round(d.score)}</span>
                  </div>
                  <div className="h-3 bg-navy-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, d.score))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recommendations */}
        <div className="card">
          <h2 className="text-lg font-semibold text-navy-800 mb-3 flex items-center gap-2">
            <Sparkles size={20} className="text-teal-600" aria-hidden="true" /> Recommendations
          </h2>
          {recs.length === 0 ? (
            <p className="text-navy-500">No recommendations yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recs.slice(0, 5).map((r) => (
                <li key={r.id} className="rounded-xl bg-mind px-4 py-3">
                  <p className="font-semibold text-navy-800">
                    {GAME_NAMES[r.game_type] || r.game_type} · Level {r.difficulty}
                  </p>
                  <p className="text-sm text-navy-600">{r.reason}</p>
                  <p className="text-xs text-navy-400 mt-1">
                    Confidence {Math.round(r.confidence * 100)}% · {fmtDate(r.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Recent sessions */}
      <section className="card">
        <h2 className="text-lg font-semibold text-navy-800 mb-3">{tr('analytics.recentSessions')}</h2>
        {(analytics?.recent_sessions?.length || 0) === 0 ? (
          <p className="text-navy-500">{tr('analytics.noData')}</p>
        ) : (
          <ul className="divide-y divide-navy-50">
            {analytics?.recent_sessions.slice(0, 8).map((s, i) => (
              <li key={s.id || i} className="py-3 flex items-center gap-4">
                <span className="w-10 h-10 rounded-xl bg-mind text-teal-700 flex items-center justify-center">
                  <ActivityIcon size={18} aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-navy-800">
                    {GAME_NAMES[s.game_type] || s.game_type} · Level {s.difficulty}
                  </p>
                  <p className="text-xs text-navy-500">{fmtDate(s.created_at)}</p>
                </div>
                <span className="text-xl font-bold text-navy-800">{s.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Day-by-day activity detail */}
      <section className="card">
        <h2 className="text-lg font-semibold text-navy-800 mb-1">
          Activity by day
        </h2>
        <p className="text-sm text-navy-500 mb-4">
          Pick a day to see every activity played, with mistakes and correct
          answers.
        </p>

        {days.length === 0 ? (
          <p className="text-navy-500">{tr('analytics.noData')}</p>
        ) : (
          <>
            {/* Day picker */}
            <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Select activity day">
              {days.map((d) => {
                const active = d.date === selectedDay
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedDay(d.date)}
                    className={`rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-teal-500 bg-mind'
                        : 'border-navy-100 bg-white hover:border-teal-300'
                    }`}
                  >
                    <span className="block text-xs font-semibold text-navy-500">
                      {shortDay(`${d.date}T12:00:00`)}
                    </span>
                    <span className="block text-sm font-bold text-navy-800">
                      {d.date.slice(8)}/{d.date.slice(5, 7)}
                    </span>
                    <span className={`block text-xs font-semibold ${d.totalMistakes > 0 ? 'text-amber-600' : 'text-teal-600'}`}>
                      {d.total} played · {d.totalMistakes} mistake{d.totalMistakes === 1 ? '' : 's'}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Summary for the selected day */}
            {dayDetail && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatBox label="Activities" value={dayDetail.total} />
                <StatBox label="Average score" value={dayDetail.avgScore} />
                <StatBox
                  label="Total mistakes"
                  value={dayDetail.totalMistakes}
                  tone={dayDetail.totalMistakes > 0 ? 'warn' : 'good'}
                />
              </div>
            )}

            {/* Every activity on that day */}
            <ul className="divide-y divide-navy-50">
              {dayDetail?.items.map((s) => {
                const correct = Math.max(0, (s.attempts || 0) - (s.mistakes || 0))
                const clean = (s.mistakes || 0) === 0
                const time = new Date(s.created_at)
                return (
                  <li key={s.id} className="py-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          clean ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        <ActivityIcon size={18} aria-hidden="true" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy-800">
                          {GAME_NAMES[s.game_type] || s.game_type}
                          <span className="text-navy-400 font-normal"> · Level {s.difficulty}</span>
                        </p>
                        <p className="text-xs text-navy-500">
                          {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          {s.offline_created ? ' · played offline' : ''}
                          {!s.completed ? ' · did not finish' : ''}
                        </p>

                        {/* Per-activity verdict */}
                        <p
                          className={`mt-2 inline-block rounded-lg px-2.5 py-1 text-xs font-bold ${
                            clean ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {clean
                            ? 'Played correctly — no mistakes'
                            : `${s.mistakes} mistake${s.mistakes === 1 ? '' : 's'} · ${correct} of ${s.attempts} correct`}
                        </p>

                        <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <Metric label="Score" value={`${s.score}/100`} />
                          <Metric label="Accuracy" value={`${Math.round((s.accuracy || 0) * 100)}%`} />
                          <Metric label="Mistakes" value={s.mistakes} tone={s.mistakes > 0 ? 'warn' : 'good'} />
                          <Metric label="Avg time" value={`${(s.response_time || 0).toFixed(1)}s`} />
                        </dl>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function StatBox({ label, value, tone = 'default' }) {
  const color = tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-teal-600' : 'text-navy-800'
  return (
    <div className="rounded-xl bg-mind p-3 text-center">
      <p className="text-xs text-navy-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function Metric({ label, value, tone = 'default' }) {
  const color = tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-teal-700' : 'text-navy-700'
  return (
    <div className="rounded-lg bg-mind/60 px-2 py-1.5">
      <dt className="text-navy-400">{label}</dt>
      <dd className={`font-bold ${color}`}>{value}</dd>
    </div>
  )
}

function shortDay(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short' })
  } catch {
    return iso
  }
}

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}