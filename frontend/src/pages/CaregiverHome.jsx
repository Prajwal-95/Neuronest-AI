import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Activity as ActivityIcon, ChevronRight, User, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '../services/api'
import { useI18n } from '../services/i18n'
import { voiceService } from '../services/voice'
import { ErrorState, EmptyState } from '../components/States'
import AnimatedNumber from '../animation/AnimatedNumber'
import TiltCard from '../animation/TiltCard'
import { useSceneMode } from '../animation/useSceneMode'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function CaregiverHome() {
  const { tr } = useI18n()
  useSceneMode('caregiver')
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generatingFor, setGeneratingFor] = useState(null)
  const [recMessage, setRecMessage] = useState({})

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const d = await api.get('/caregiver/dashboard')
      setDashboard(d)
    } catch (err) {
      setError(err.message || tr('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generateRecommendation = async (patientId) => {
    setGeneratingFor(patientId)
    setRecMessage((m) => ({ ...m, [patientId]: '' }))
    try {
      const rec = await api.post('/recommendations/generate', { patient_id: patientId })
      setRecMessage((m) => ({ ...m, [patientId]: rec.reason }))
      voiceService.speak('Recommendation ready for this patient.')
    } catch {
      setRecMessage((m) => ({ ...m, [patientId]: 'Could not generate. Please try again.' }))
    } finally {
      setGeneratingFor(null)
    }
  }

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-16 text-navy-500">
        <span className="text-lg">{tr('common.loading')}</span>
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />
  }

  const patients = dashboard?.patients || []
  const engagementLabel =
    dashboard?.average_engagement >= 3
      ? 'Great engagement this week'
      : dashboard?.average_engagement > 0
      ? 'Moderate engagement this week'
      : 'No sessions this week yet'

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-navy-800">{greeting()}, caregiver 👋</h1>
        <p className="text-navy-600 mt-1">{tr('nav.caregiver')} — stay informed, act with care.</p>
      </header>
      <section className="grid grid-cols-2 gap-4" aria-label="Caregiver summary">
        <motion.div
          className="card !p-5 flex items-center gap-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          whileHover={{ y: -3 }}
        >
          <span className="w-12 h-12 rounded-xl bg-mind text-teal-700 flex items-center justify-center">
            <Users size={26} aria-hidden="true" />
          </span>
          <div>
            <p className="text-3xl font-bold text-navy-800">
              <AnimatedNumber target={patients.length} />
            </p>
            <p className="text-sm text-navy-500">Patients</p>
          </div>
        </motion.div>
        <motion.div
          className="card !p-5 flex items-center gap-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          whileHover={{ y: -3 }}
        >
          <span className="w-12 h-12 rounded-xl bg-mind text-teal-700 flex items-center justify-center">
            <ActivityIcon size={26} aria-hidden="true" />
          </span>
          <div>
            <p className="text-3xl font-bold text-navy-800">
              <AnimatedNumber target={dashboard?.sessions_this_week ?? 0} />
            </p>
            <p className="text-sm text-navy-500">Sessions this week</p>
          </div>
        </motion.div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold text-navy-800 mb-1">Your patients</h2>
        <p className="text-sm text-navy-500 mb-4">{engagementLabel}</p>

        {patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patients connected"
            message="Request to connect with patients in the administration panel."
          />
        ) : (
          <ul className="divide-y divide-navy-50">
            {patients.map((p, idx) => (
              <motion.li
                key={p.id}
                className="py-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06, duration: 0.35 }}
                whileHover={{ y: -2 }}
              >
                <div className="flex items-center gap-4">
                  <span className="w-12 h-12 rounded-full bg-navy-700 text-white flex items-center justify-center shrink-0">
                    <User size={24} aria-hidden="true" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy-800">{p.name}</p>
                    <p className="text-xs text-navy-500">
                      Overall {Math.round(p.overall_performance || 0)} ·{' '}
                      {p.weekly_sessions} sessions this week ·{' '}
                      {p.last_activity ? `Last: ${fmtWhen(p.last_activity)}` : 'No activity yet'}
                    </p>
                  </div>
                  <Link
                    to={`/caregiver/patient/${p.id}`}
                    className="btn-secondary !px-4 !py-2 text-sm shrink-0"
                    aria-label={`View ${p.name}'s details`}
                  >
                    View <ChevronRight size={16} className="inline" aria-hidden="true" />
                  </Link>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary !px-4 !py-2 text-sm shrink-0"
                    disabled={generatingFor === p.id}
                    onClick={() => generateRecommendation(p.id)}
                  >
                    <Sparkles size={16} className="inline mr-1" aria-hidden="true" />
                    {generatingFor === p.id ? 'Generating…' : 'Generate recommendation'}
                  </button>
                  {recMessage[p.id] && (
                    <motion.p
                      className="text-sm text-navy-600 bg-mind rounded-xl px-3 py-2"
                      role="status"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      {recMessage[p.id]}
                    </motion.p>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}