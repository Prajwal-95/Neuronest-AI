import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bell, Check, Plus, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../services/i18n'
import { voiceService } from '../services/voice'
import { ErrorState, EmptyState, LoadingSkeleton } from '../components/States'

export default function Reminders() {
  const { user } = useAuth()
  const { tr } = useI18n()
  const location = useLocation()
  const preselectedPatient = location.state?.patientId || null

  const [reminders, setReminders] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form state (caregiver creates reminders; patients mark done)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    patientId: preselectedPatient || '',
    title: '',
    description: '',
    when: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const isCaregiver = user?.role === 'caregiver'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [r, p] = await Promise.all([
        api.get('/reminders'),
        isCaregiver ? api.get('/patients') : Promise.resolve([]),
      ])
      setReminders(r)
      setPatients(p)
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

  const openForm = () => {
    setForm({
      patientId: form.patientId || preselectedPatient || '',
      title: '',
      description: '',
      when: '',
    })
    setShowForm(true)
  }

  const createReminder = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.patientId) {
      setFormError('Please choose a patient.')
      return
    }
    if (!form.when) {
      setFormError('Please pick a date and time.')
      return
    }
    setSubmitting(true)
    try {
      const created = await api.post('/reminders', {
        patient_id: Number(form.patientId),
        title: form.title.trim(),
        description: form.description.trim(),
        scheduled_time: new Date(form.when).toISOString(),
      })
      setReminders((prev) => [created, ...prev])
      setShowForm(false)
      voiceService.speak('Reminder set.')
    } catch (err) {
      setFormError(err.message || 'Could not create reminder.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleComplete = async (reminder) => {
    try {
      const updated = await api.put(`/reminders/${reminder.id}`, {
        completed: !reminder.completed,
      })
      setReminders((prev) => prev.map((r) => (r.id === reminder.id ? updated : r)))
      if (!reminder.completed) voiceService.speak('Nice. Reminder done.')
    } catch (err) {
      setError(err.message || 'Could not update reminder.')
    }
  }

  const deleteReminder = async (id) => {
    try {
      await api.delete(`/reminders/${id}`)
      setReminders((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      setError(err.message || 'Could not delete reminder.')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <LoadingSkeleton rows={3} />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />
  }

  const patientName = (id) =>
    patients.find((p) => p.id === id)?.name || (id === user?.id ? user.name : `Patient #${id}`)

  const sorted = [...reminders].sort(
    (a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time)
  )
return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">{tr('nav.reminders')}</h1>
          <p className="text-navy-600 mt-1">
            {isCaregiver
              ? 'Schedule gentle activity reminders for your patients.'
              : 'Your little nudges for brain-healthy habits.'}
          </p>
        </div>
        {isCaregiver && (
          <button type="button" className="btn-primary !px-4 !py-2" onClick={openForm}>
            <Plus size={18} className="inline mr-1" aria-hidden="true" /> New reminder
          </button>
        )}
      </header>

      {showForm && isCaregiver && (
        <form onSubmit={createReminder} className="card flex flex-col gap-4 border-teal-300">
          <h2 className="font-semibold text-navy-800">Create reminder</h2>

          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-navy-700">For patient</span>
            <select
              value={form.patientId}
              onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
              className="input-field"
              required
            >
              <option value="">Choose patient…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-navy-700">Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Evening memory game"
              className="input-field"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-navy-700">Note (optional)</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="input-field"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-navy-700">Date & time</span>
            <input
              type="datetime-local"
              value={form.when}
              onChange={(e) => setForm((f) => ({ ...f, when: e.target.value }))}
              className="input-field"
              required
            />
          </label>

          {formError && (
            <p className="text-red-600 font-medium" role="alert">
              {formError}
            </p>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? 'Saving…' : 'Save reminder'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
{sorted.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No reminders yet"
          message={
            isCaregiver
              ? 'Create the first reminder for one of your patients.'
              : 'A caregiver will add reminders for you here.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((r) => (
            <li
              key={r.id}
              className={`card flex items-center gap-4 ${r.completed ? 'opacity-60' : ''}`}
            >
              <button
                type="button"
                onClick={() => toggleComplete(r)}
                aria-label={`Mark "${r.title}" ${r.completed ? 'as not done' : 'as done'}`}
                className={`w-10 h-10 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                  r.completed
                    ? 'bg-teal-500 border-teal-500 text-white'
                    : 'border-navy-200 hover:border-teal-500'
                }`}
              >
                {r.completed && <Check size={20} aria-hidden="true" />}
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className={`font-semibold ${r.completed ? 'line-through text-navy-400' : 'text-navy-800'}`}
                >
                  {r.title}
                </p>
                {r.description && <p className="text-sm text-navy-500">{r.description}</p>}
                <p className="text-xs text-navy-400 mt-0.5">
                  {fmtWhen(r.scheduled_time)}
                  {isCaregiver ? ` · ${patientName(r.patient_id)}` : ''}
                </p>
              </div>
              {isCaregiver && (
                <button
                  type="button"
                  aria-label={`Delete reminder ${r.title}`}
                  className="p-2 text-navy-300 hover:text-red-500 transition-colors"
                  onClick={() => deleteReminder(r.id)}
                >
                  <Trash2 size={20} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}