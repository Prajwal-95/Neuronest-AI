import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, CartesianGrid,
} from 'recharts'
import { TrendingUp, CalendarDays, Trophy, Activity as ActivityIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../services/api'
import { useI18n } from '../services/i18n'
import { localAnalytics, getLocalHistory } from '../offline/sessionQueue'
import { ErrorState, EmptyState } from '../components/States'
import AnimatedNumber from '../animation/AnimatedNumber'
import { useSceneMode } from '../animation/useSceneMode'

const GAME_NAMES = {
  memory_match: 'Memory Match',
  sequence_recall: 'Sequence Recall',
  attention: 'Attention Focus',
  quick_math: 'Quick Math',
  word_recall: 'Word Recall',
}

export default function PatientAnalytics() {
  const { user } = useAuth()
  const { tr } = useI18n()
  useSceneMode('analytics')
  const [data, setData] = useState(null)
  const [local, setLocal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const d = await api.get(`/patients/${user.id}/analytics`)
      setData(d)
      setLocal(null)
    } catch (err) {
      const localStats = await localAnalytics()
      const localHistory = await getLocalHistory()
      setLocal({ stats: localStats, history: localHistory })
      if (err.status !== 0) setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-16 text-navy-500">
        <span className="text-lg">{tr('common.loading')}</span>
      </div>
    )
  }

  // Merge: when offline, show a simplified view from IndexedDB
  const hasServerData = !!data
  const overall = data?.overall_score ?? local?.stats?.avg_score ?? 0
  const sessions = data?.sessions_completed ?? local?.stats?.sessions ?? 0
  const weekly = data?.weekly_activity ?? sessions
  const streak = data?.current_streak ?? 0

  const domains = data?.domains?.length
    ? data.domains.map((d) => ({ name: GAME_NAMES[d.domain] || d.domain, score: Math.round(d.score) }))
    : Object.entries(local?.stats?.byGame || {}).map(([g, v]) => ({
        name: GAME_NAMES[g] || g,
        score: v.avg,
      }))

  const trend = data?.weekly_trend?.length
    ? data.weekly_trend.map((p) => ({ day: shortDay(p.date), score: Math.round(p.score) }))
    : []

  const recent = data?.recent_sessions || local?.history || []

  if (!hasServerData && sessions === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy-800">{tr('analytics.title')}</h1>
        <EmptyState icon={TrendingUp} title="No progress yet" message={tr('analytics.noData')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-navy-800">{tr('analytics.title')}</h1>
        {!hasServerData && (
          <p className="text-amber-700 text-sm font-medium mt-1">
            Offline mode — showing locally saved progress.
          </p>
        )}
      </header>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-label="Key metrics">
        <Kpi icon={<Trophy />} label={tr('analytics.overall')} value={Math.round(overall)} delay={0.05} />
        <Kpi icon={<ActivityIcon />} label={tr('analytics.sessions')} value={sessions} delay={0.12} />
        <Kpi icon={<CalendarDays />} label={tr('analytics.streak')} value={streak} suffix=" d" delay={0.19} />
        <Kpi icon={<TrendingUp />} label="This week" value={weekly} delay={0.26} />
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

      {domains.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold text-navy-800">{tr('analytics.domains')}</h2>
          <div className="mt-4" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={domains} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef4fb" />
                <XAxis dataKey="name" tick={{ fill: '#16294a' }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#16294a' }} />
                <Tooltip />
                <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                  {domains.map((_, i) => (
                    <Cell key={i} fill={['#1e9a8c', '#1e3a5f', '#d97706'][i % 3]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Recent sessions */}
      <section className="card">
        <h2 className="text-lg font-semibold text-navy-800 mb-3">{tr('analytics.recentSessions')}</h2>
        {recent.length === 0 ? (
          <p className="text-navy-500">{tr('analytics.noData')}</p>
        ) : (
          <ul className="divide-y divide-navy-50">
            {recent.slice(0, 10).map((s, i) => (
              <li key={s.client_id || s.id || i} className="py-3 flex items-center gap-4">
                <span className="w-10 h-10 rounded-xl bg-mind text-teal-700 flex items-center justify-center text-xs font-bold">
                  {GAME_NAMES[s.game_type]?.split(' ')[0] || 'Game'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy-800 truncate">
                    {GAME_NAMES[s.game_type] || s.game_type}
                    {s.difficulty ? ` · Level ${s.difficulty}` : ''}
                  </p>
                  <p className="text-xs text-navy-500">
                    {fmtDate(s.created_at || s.timestamp)}
                    {s.completed ? '' : ' · incomplete'}
                  </p>
                </div>
                <span className="text-xl font-bold text-navy-800">{s.score ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Kpi({ icon, label, value, suffix = '', delay = 0 }) {
  return (
    <motion.div
      className="card !p-4 text-center"
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={{ y: -3 }}
    >
      <span className="mx-auto w-10 h-10 rounded-xl bg-mind text-teal-700 flex items-center justify-center">
        {icon}
      </span>
      <p className="mt-2 text-2xl font-bold text-navy-800">
        <AnimatedNumber target={value} suffix={suffix} />
      </p>
      <p className="text-xs text-navy-500 leading-tight">{label}</p>
    </motion.div>
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