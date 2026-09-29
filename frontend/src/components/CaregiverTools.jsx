import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  UserPlus, Trash2, X, AlertTriangle, CheckCircle2, Info, FileText,
} from 'lucide-react'
import { api } from '../services/api'

/**
 * Caregiver tools: add a patient, remove a patient, generate a full report.
 *
 * Colour coding follows one rule across the whole app:
 *   success  = adds / confirms / generates something good
 *   danger   = removes / destroys
 *   info     = neutral
 *   warning  = read before acting
 */
export function AddPatientForm({ onAdded, onCancel }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [language, setLanguage] = useState('en')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const created = await api.post('/patients', { name, email, password, language })
      onAdded?.(created)
    } catch (err) {
      setError(err.message || 'Could not add the patient.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.form
      onSubmit={submit}
      className="card flex flex-col gap-4"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-navy-800 flex items-center gap-2">
          <UserPlus size={18} aria-hidden="true" /> Add a patient
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="glass-btn glass-btn-info !px-3 !py-1.5 !min-h-0 !text-sm"
        >
          <span className="inline-flex items-center gap-1">
            <X size={14} aria-hidden="true" /> Close
          </span>
        </button>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-navy-600">Full name</span>
        <input
          className="input-field w-full mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={1}
          placeholder="e.g. Ramesh Kumar"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-navy-600">Email</span>
        <input
          className="input-field w-full mt-1"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="ramesh@example.com"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-navy-600">
          Password (at least 6 characters)
        </span>
        <input
          className="input-field w-full mt-1"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          placeholder="Used when they sign in on their device"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-navy-600">Preferred language</span>
        <select
          className="input-field w-full mt-1"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
        </select>
      </label>

      {error && (
        <p className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <p className="text-xs text-navy-400">
        If this email is already registered, the existing account is linked instead
        of creating a duplicate.
      </p>

      <button type="submit" disabled={busy} className="glass-btn glass-btn-success">
        <span className="inline-flex items-center gap-2">
          <UserPlus size={18} aria-hidden="true" />
          {busy ? 'Adding…' : 'Add patient'}
        </span>
      </button>
    </motion.form>
  )
}

export function RemovePatientButton({ patient, onRemoved }) {
  const [open, setOpen] = useState(false)
  const [eraseData, setEraseData] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await api.delete(`/patients/${patient.id}?remove_account=${eraseData}`)
      onRemoved?.(patient)
    } catch (err) {
      setError(err.message || 'Could not remove the patient.')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-btn glass-btn-danger !px-3 !py-2 !min-h-0 !text-sm"
        title={`Remove ${patient.name}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <Trash2 size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Remove</span>
        </span>
      </button>
    )
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/50 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="card max-w-md w-full flex flex-col gap-4"
        initial={{ scale: 0.94, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="font-semibold text-navy-800 flex items-center gap-2">
          <AlertTriangle size={18} className="text-rose-600" aria-hidden="true" />
          Remove {patient.name}?
        </h3>

        <div className="rounded-xl bg-mind p-3 text-sm text-navy-700">
          <strong>Default — unlink only.</strong> Removes {patient.name} from your
          list. Their account and all activity history are kept, so another family
          member caring for them is unaffected.
        </div>

        <label className="flex items-start gap-3 rounded-xl border-2 border-rose-200 bg-rose-50 p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={eraseData}
            onChange={(e) => setEraseData(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm text-rose-900">
            <strong>Also delete their account and all history.</strong> This cannot
            be undone. Only tick this if the account was made by mistake.
          </span>
        </label>

        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { setOpen(false); setError(''); setEraseData(false) }}
            className="glass-btn glass-btn-info flex-1"
          >
            <span>Keep patient</span>
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="glass-btn glass-btn-danger flex-1"
          >
            <span className="inline-flex items-center gap-2">
              <Trash2 size={16} aria-hidden="true" />
              {busy ? 'Removing…' : eraseData ? 'Delete everything' : 'Unlink'}
            </span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
const SEVERITY = {
  good: {
    Icon: CheckCircle2,
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    chip: 'text-emerald-700',
  },
  info: {
    Icon: Info,
    cls: 'border-sky-200 bg-sky-50 text-sky-900',
    chip: 'text-sky-700',
  },
  warning: {
    Icon: AlertTriangle,
    cls: 'border-amber-300 bg-amber-50 text-amber-900',
    chip: 'text-amber-700',
  },
}

export function PatientReport({ report, loading, onClose, onGenerate }) {
  if (loading) {
    return (
      <div className="card">
        <p className="text-navy-500">Building the report…</p>
      </div>
    )
  }
  if (!report) return null

  return (
    <motion.section
      className="card flex flex-col gap-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-navy-800 flex items-center gap-2">
          <FileText size={20} aria-hidden="true" />
          Report for {report.patient_name}
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onGenerate}
            className="glass-btn glass-btn-success !px-3 !py-2 !min-h-0 !text-sm"
          >
            <span className="inline-flex items-center gap-1.5">
              <FileText size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Regenerate</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="glass-btn glass-btn-info !px-3 !py-2 !min-h-0 !text-sm"
          >
            <span className="inline-flex items-center gap-1">
              <X size={14} aria-hidden="true" /> Close
            </span>
          </button>
        </div>
      </div>

      <p className="text-navy-700 leading-relaxed">{report.summary}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Average score" value={`${Math.round(report.overall_score)}/100`} />
        <Stat label="Activities" value={report.sessions_completed} />
        <Stat label="Day streak" value={report.current_streak} />
        <Stat label="This week" value={report.weekly_activity} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl bg-mind p-3">
          <p className="text-navy-500 text-xs font-semibold uppercase">Engagement</p>
          <p className="font-bold text-navy-800 mt-0.5">{report.engagement}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-emerald-700 text-xs font-semibold uppercase">Strongest</p>
          <p className="font-bold text-emerald-900 mt-0.5">{report.strongest_area}</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <p className="text-amber-700 text-xs font-semibold uppercase">Needs focus</p>
          <p className="font-bold text-amber-900 mt-0.5">{report.weakest_area}</p>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-navy-800 mb-2">What we noticed</h4>
        <ul className="flex flex-col gap-2">
          {report.findings.map((f, i) => {
            const s = SEVERITY[f.severity] || SEVERITY.info
            return (
              <li
                key={i}
                className={`rounded-xl border p-3 flex items-start gap-3 ${s.cls}`}
              >
                <s.Icon size={18} className={`shrink-0 mt-0.5 ${s.chip}`} aria-hidden="true" />
                <div>
                  <p className="font-bold">{f.title}</p>
                  <p className="text-sm mt-0.5">{f.detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {report.recent_days?.length > 0 && (
        <div>
          <h4 className="font-semibold text-navy-800 mb-2">Last 7 active days</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-navy-500">
                  <th className="py-1.5 pr-3 font-semibold">Date</th>
                  <th className="py-1.5 pr-3 font-semibold">Played</th>
                  <th className="py-1.5 pr-3 font-semibold">Avg score</th>
                  <th className="py-1.5 font-semibold">Mistakes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {report.recent_days.map((d) => (
                  <tr key={d.date}>
                    <td className="py-1.5 pr-3 text-navy-700">{d.date}</td>
                    <td className="py-1.5 pr-3 text-navy-700">{d.sessions}</td>
                    <td className="py-1.5 pr-3 font-semibold text-navy-800">{d.avg_score}</td>
                    <td
                      className={`py-1.5 font-semibold ${
                        d.mistakes > 0 ? 'text-amber-700' : 'text-teal-700'
                      }`}
                    >
                      {d.mistakes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-navy-400 border-t border-navy-50 pt-3">
        {report.disclaimer}
      </p>
    </motion.section>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-mind p-3 text-center">
      <p className="text-xs text-navy-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-navy-800">{value}</p>
    </div>
  )
}

