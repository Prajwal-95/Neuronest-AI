import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Activity as ActivityIcon, ChevronRight, User, Sparkles, TrendingUp, UserPlus, FileText } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '../services/api'
import { useI18n } from '../services/i18n'
import { voiceService } from '../services/voice'
import { ErrorState, EmptyState, LoadingSkeleton } from '../components/States'
import {
  AddPatientForm, RemovePatientButton, PatientReport,
} from '../components/CaregiverTools'
import AnimatedNumber from '../animation/AnimatedNumber'
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
  const [showAdd, setShowAdd] = useState(false)
  const [reportFor, setReportFor] = useState(null)
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [recMessage, setRecMessage] = useState({})

  // Build the full progress report for one patient.
  const openReport = async (patientId) => {
    setReportFor(patientId)
    setReportLoading(true)
    setReport(null)
    try {
      setReport(await api.get(`/patients/${patientId}/report`))
      voiceService.speak('Report ready.')
    } catch (err) {
      setRecMessage((m) => ({ ...m, [patientId]: err.message || 'Could not build report.' }))
    } finally {
      setReportLoading(false)
    }
  }

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
      <div className="flex flex-col gap-5">
        <LoadingSkeleton rows={4} />
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <motion.p
          className="text-teal-600 font-semibold text-sm uppercase tracking-[0.2em]"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          Caregiver Portal
        </motion.p>
        <h1 className="text-3xl font-bold text-navy-800">{greeting()} <span aria-hidden="true">👋</span></h1>
        <p className="text-navy-500 mt-0.5">Stay informed, act with care.</p>
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

      {/* Engagement bar */}
      {dashboard?.average_engagement > 0 && (
        <section className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-navy-800 flex items-center gap-2">
              <TrendingUp size={20} className="text-teal-600" aria-hidden="true" />
              Engagement this week
            </h2>
            <span className="badge-teal">{engagementLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex-1">
                <div className="h-2.5 bg-navy-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{
                      width: `${Math.min(100, (dashboard.average_engagement / 5) * 100 * (1 - i * 0.12))}%`,
                    }}
                    transition={{ duration: 0.8, delay: 0.2 + i * 0.1 }}
                  />
                </div>
              </div>
            ))}
            <span className="text-navy-500 text-sm font-semibold ml-2">
              {dashboard.average_engagement}/5
            </span>
          </div>
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-navy-800 flex items-center gap-2">
            <Users size={20} className="text-teal-600" aria-hidden="true" />
            Your patients
          </h2>
          <span className="text-xs bg-navy-50 text-navy-500 rounded-full px-3 py-1 font-semibold">
            {patients.length} {patients.length === 1 ? 'patient' : 'patients'}
          </span>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <button
            type="button"
            className="glass-btn glass-btn-success"
            onClick={() => setShowAdd((v) => !v)}
            aria-expanded={showAdd}
          >
            <span className="inline-flex items-center gap-2">
              <UserPlus size={18} aria-hidden="true" />
              {showAdd ? 'Close add form' : 'Add patient'}
            </span>
          </button>
        </div>

        {showAdd && (
          <div className="mb-5">
            <AddPatientForm
              onAdded={() => { setShowAdd(false); load() }}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        )}

        {patients.length === 0 && !showAdd ? (
          <EmptyState
            icon={Users}
            title="No patients connected"
            message="Add a patient to start tracking their cognitive activities."
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
                  <span className="w-12 h-12 rounded-full bg-gradient-to-br from-navy-700 to-navy-600 text-white flex items-center justify-center shrink-0 font-bold text-lg">
                    {p.name?.charAt(0)?.toUpperCase() || <User size={24} aria-hidden="true" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy-800 text-lg">{p.name}</p>
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
                    className="glass-btn glass-btn-primary !px-4 !py-2 !min-h-0 !text-sm shrink-0"
                    disabled={generatingFor === p.id}
                    onClick={() => generateRecommendation(p.id)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles size={16} aria-hidden="true" />
                      {generatingFor === p.id ? 'Generating…' : 'Recommendation'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="glass-btn glass-btn-success !px-4 !py-2 !min-h-0 !text-sm shrink-0"
                    disabled={reportLoading && reportFor === p.id}
                    onClick={() => openReport(p.id)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <FileText size={16} aria-hidden="true" />
                      {reportLoading && reportFor === p.id ? 'Building…' : 'Full report'}
                    </span>
                  </button>
                  <RemovePatientButton patient={p} onRemoved={load} />
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
                {report && reportFor === p.id && (
                  <div className="mt-3">
                    <PatientReport
                      report={report}
                      onClose={() => { setReport(null); setReportFor(null) }}
                      onGenerate={() => openReport(p.id)}
                    />
                  </div>
                )}
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