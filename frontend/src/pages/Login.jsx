import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useOffline } from '../offline/OfflineContext'
import { useI18n } from '../services/i18n'
import SyncStatus from '../components/SyncStatus'

export default function Login() {
  const { login } = useAuth()
  const { syncNow } = useOffline()
  const { tr } = useI18n()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const user = await login(email.trim(), password)
      if (navigator.onLine) syncNow().catch(() => {})
      navigate(user.role === 'patient' ? '/patient' : '/caregiver', { replace: true })
    } catch (err) {
      setError(err.message || tr('auth.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <span className="w-14 h-14 rounded-2xl bg-navy-800 text-teal-500 flex items-center justify-center">
          <Brain size={32} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-navy-800">NeuroNest AI</h1>
          <p className="text-sm text-navy-600">{tr('app.tagline')}</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="card w-full max-w-md gap-4 flex flex-col"
        aria-label="Log in"
      >
        <h2 className="text-xl font-semibold text-navy-800">{tr('auth.login')}</h2>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-navy-700">{tr('auth.email')}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="rounded-xl border-2 border-navy-100 px-4 py-3 text-lg focus:border-teal-500 bg-white"
            placeholder="you@example.com"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-navy-700">{tr('auth.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="rounded-xl border-2 border-navy-100 px-4 py-3 text-lg focus:border-teal-500 bg-white"
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p className="text-red-600 font-medium" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? tr('auth.signingIn') : tr('auth.login')}
        </button>

        <p className="text-center text-navy-600">
          {tr('auth.noAccount')}{' '}
          <Link to="/register" className="text-teal-600 font-semibold underline">
            {tr('auth.register')}
          </Link>
        </p>
      </form>

      <div className="mt-6 flex flex-col items-center gap-3 text-center">
        <SyncStatus compact />
        <p className="text-xs text-navy-500 max-w-md flex items-start gap-1">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {tr('disclaimer')}
        </p>
      </div>
    </div>
  )
}