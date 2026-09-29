import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, CalendarDays, Trophy, Activity as ActivityIcon, ChevronRight, Heart, Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../auth/AuthContext'
import { useOffline } from '../offline/OfflineContext'
import { api } from '../services/api'
import { useI18n } from '../services/i18n'
import { localAnalytics } from '../offline/sessionQueue'
import { ErrorState, EmptyState, LoadingSkeleton } from '../components/States'
import ProgressRing from '../components/ProgressRing'
import CognitiveCore from '../three/CognitiveCore'
import AnimatedNumber from '../animation/AnimatedNumber'
import CognitiveJourney from '../animation/CognitiveJourney'
import { useSceneMode } from '../animation/useSceneMode'
import { useAnimStore } from '../animation/animStore'
import { voiceService } from '../services/voice'

const GAME_INFO = {
  memory_match: { name: 'Memory Match', route: '/patient/games/memory' },
  sequence_recall: { name: 'Sequence Recall', route: '/patient/games/sequence' },
  attention: { name: 'Attention Focus', route: '/patient/games/attention' },
  quick_math: { name: 'Quick Math', route: '/patient/games/math' },
  word_recall: { name: 'Word Recall', route: '/patient/games/words' },
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Encouraging message based on engagement level. */
function encouragement(stats) {
  const score = stats?.overall_score || 0
  const sessions = stats?.sessions_completed || 0
  if (score >= 80) return 'Great progress! Let\'s keep your streak going.'
  if (sessions >= 3) return 'You\'re building a strong routine!'
  if (sessions >= 1) return 'Small challenges. Stronger habits.'
  if (score > 0) return 'Nice work — every session counts.'
  return 'Ready for your first gentle challenge?'
}

export default function PatientHome() {
  const { user } = useAuth()
  const { syncStatus, pendingCount } = useOffline()
  const { tr } = useI18n()
  const navigate = useNavigate()
  useSceneMode('home')
  const setEnergy = useAnimStore((s) => s.setEnergy)
  const recentScore = useAnimStore((s) => s.recentScore)

  const [analytics, setAnalytics] = useState(null)
  const [localData, setLocalData] = useState(null)
  const [recommendation, setRecommendation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [an, recs] = await Promise.all([
        api.get(`/patients/${user.id}/analytics`),
        api.get(`/patients/${user.id}/recommendations`).catch(() => []),
      ])
      setAnalytics(an)
      setRecommendation(recs[0] || null)
      setLocalData(null)
      setEnergy(an?.overall_score ? an.overall_score / 100 : 0.5)
    } catch (err) {
      const local = await localAnalytics()
      setLocalData(local)
      setEnergy(local?.avg_score ? local.avg_score / 100 : 0.4)
      if (err.status !== 0) setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Feed live session scores into the environment
  useEffect(() => {
    if (recentScore > 0) setEnergy(recentScore / 100)
  }, [recentScore, setEnergy])

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="skeleton h-48 rounded-3xl" />
        <LoadingSkeleton rows={3} />
      </div>
    )
  }

  if (error && !analytics && !localData) {
    return <ErrorState message={error} onRetry={loadData} />
  }

  const stats = analytics || {
    overall_score: localData?.avg_score || 0,
    sessions_completed: localData?.sessions || 0,
    current_streak: 0,
    weekly_activity: localData?.sessions || 0,
  }

  const recGame = recommendation
    ? GAME_INFO[recommendation.game_type]
    : { name: 'Memory Match', route: '/patient/games/memory' }

  const journeySteps = buildJourney(stats)

  return (
    <div className="flex flex-col gap-6">
{/* Hero: Cognitive Core + greeting + recommended activity */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 text-white border border-navy-700 shadow-glass-lg">
        <div
          className="absolute inset-0 opacity-20"
          style={{ background: 'radial-gradient(circle at 85% 20%, rgba(75,159,222,0.55) 0%, transparent 55%)' }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: 'radial-gradient(circle at 15% 80%, rgba(43,179,163,0.6) 0%, transparent 45%)' }}
          aria-hidden="true"
        />
        <div className="grid md:grid-cols-[1fr_280px] items-center gap-2 p-6 md:p-8">
          <div>
            <motion.p
              className="text-teal-300 font-semibold text-sm uppercase tracking-[0.2em]"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              ✨ {tr('home.ready')}
            </motion.p>
            <motion.h1
              className="mt-3 text-3xl md:text-5xl font-bold leading-tight"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              {greeting()}, <span className="text-teal-300">{user?.name?.split(' ')[0]}</span>
            </motion.h1>
            <motion.p
              className="mt-3 text-navy-100 text-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              {encouragement(stats)}
            </motion.p>

            {/* Recommended next activity */}
            <motion.div
              className="mt-6 bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 border border-white/10 hover:bg-white/15 transition-colors"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <div className="flex-1">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles size={16} className="text-teal-300" aria-hidden="true" />
                  {recommendation?.reason ? tr('home.recommended') : tr('home.startToday')}
                </p>
                <p className="text-2xl font-bold mt-1">{recGame.name}</p>
                {recommendation?.difficulty && (
                  <p className="text-sm text-teal-200 font-semibold mt-0.5">
                    Challenge Level {recommendation.difficulty}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn-primary !bg-teal-500 !text-navy-900 hover:!bg-teal-400 shrink-0 !py-3 whitespace-nowrap"
                onClick={() => {
                  voiceService.speak(`Starting ${recGame.name}`)
                  navigate(recGame.route)
                }}
              >
                {tr('games.play')} <ChevronRight size={18} className="inline" aria-hidden="true" />
              </button>
            </motion.div>
          </div>

          {/* 3D Cognitive Core */}
          <div className="hidden md:block">
            <CognitiveCore height={280} />
          </div>
        </div>
      </section>

      {/* Quick stats with count-up + rings */}
      <section className="grid grid-cols-3 gap-4" aria-label="Progress summary">
        <motion.div
          className="card !p-4 text-center"
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          whileHover={{ y: -3 }}
        >
          <ProgressRing
            value={stats.overall_score || 0}
            size={72}
            strokeWidth={5}
            label={<Trophy size={24} className="text-teal-600" aria-hidden="true" />}
          />
          <p className="mt-2 text-2xl font-bold text-navy-800">
            <AnimatedNumber target={stats.overall_score || 0} />
          </p>
          <p className="text-xs text-navy-500 leading-tight">{tr('analytics.overall')}</p>
        </motion.div>
        <AnimatedStatCard
          icon={<ActivityIcon size={22} aria-hidden="true" />}
          label={tr('home.sessionsCompleted')}
          value={stats.sessions_completed ?? 0}
          delay={0.2}
        />
        <AnimatedStatCard
          icon={<CalendarDays size={22} aria-hidden="true" />}
          label={tr('home.currentStreak')}
          value={stats.current_streak ?? 0}
          suffix=" d"
          delay={0.3}
        />
      </section>

      {/* Today's Cognitive Journey */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-navy-800">Today&apos;s Cognitive Journey</h2>
          <span className="text-xs text-navy-400">
            {journeySteps.filter((s) => s.status === 'done').length}/{journeySteps.length} complete
          </span>
        </div>
        <div className="mt-6">
          <CognitiveJourney steps={journeySteps} />
        </div>
      </section>

      {/* Weekly progress */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-navy-800">{tr('home.weeklyProgress')}</h2>
          <button
            type="button"
            onClick={() => navigate('/patient/analytics')}
            className="text-teal-600 font-semibold text-sm"
          >
            View all <ChevronRight size={14} className="inline" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 flex items-end gap-2 h-28">
          {Array.from({ length: 7 }).map((_, i) => {
            const day = weeklyChartData(stats)[i] || 0
            const height = day > 0 ? Math.max(18, day) : 6
            return (
              <motion.div
                key={i}
                className="flex-1 flex flex-col items-center gap-1"
                aria-label={`Day ${i + 1}: ${day}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
              >
                <motion.div
                  className={`w-full rounded-lg ${day > 70 ? 'bg-teal-500' : day > 35 ? 'bg-teal-300' : day > 0 ? 'bg-teal-100' : 'bg-navy-50'}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ delay: 0.2 + i * 0.06, duration: 0.5, ease: 'easeOut' }}
                />
                <span className="text-[10px] text-navy-400">{[...'SMTWTFS'][i]}</span>
              </motion.div>
            )
          })}
        </div>
        {!analytics && syncStatus !== 'synced' && (
          <p className="mt-3 text-sm text-amber-700 font-medium">
            Showing offline data. {pendingCount} session{pendingCount === 1 ? '' : 's'} waiting to sync.
          </p>
        )}
      </section>

      {!analytics && localData && localData.sessions === 0 && (
        <EmptyState title="No activities yet" message="Play your first cognitive game to start tracking progress." />
      )}
    </div>
  )
}
function buildJourney(stats) {
  const dailyDone = todayHasScore(stats?.weekly_trend)
  const first = { id: 'memory', label: 'Memory', icon: '🧠', status: dailyDone || (stats?.sessions_completed || 0) >= 1 ? 'done' : 'current' }
  const second = {
    id: 'sequence',
    label: 'Sequence',
    icon: '🔗',
    status: dailyDone || (stats?.sessions_completed || 0) >= 2 ? 'done' : (stats?.sessions_completed || 0) === 1 ? 'current' : 'locked',
  }
  const third = {
    id: 'attention',
    label: 'Attention',
    icon: '🎯',
    status: dailyDone || (stats?.sessions_completed || 0) >= 3 ? 'done' : (stats?.sessions_completed || 0) === 2 ? 'current' : 'locked',
  }
  const finalStep = { id: 'complete', label: dailyDone ? 'Complete' : 'New challenge', icon: null, status: dailyDone ? 'done' : 'mystery' }
  return [first, second, third, finalStep]
}

function todayHasScore(weekly) {
  if (!weekly || !weekly.length) return false
  const today = new Date().toISOString().slice(0, 10)
  return weekly.some((p) => String(p.date).slice(0, 10) === today)
}

function weeklyChartData(stats) {
  if (!stats || !Array.isArray(stats.weekly_trend)) return []
  const days = Array(7).fill(0)
  for (const point of stats.weekly_trend) {
    const idx = [0, 1, 2, 3, 4, 5, 6][new Date(point.date).getDay()]
    days[idx] = point.score || 0
  }
  return days
}

function AnimatedStatCard({ icon, label, value, suffix = '', delay = 0 }) {
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