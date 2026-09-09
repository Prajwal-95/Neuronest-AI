import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../services/i18n'

export default function Register() {
  const { register } = useAuth()
  const { tr } = useI18n()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('patient')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const user = await register(name.trim(), email.trim(), password, role)
      navigate(user.role === 'patient' ? '/patient' : '/caregiver', { replace: true })
    } catch (err) {
      setError(err.message || tr('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const roleOptions = [
    { value: 'patient', label: tr('auth.patient'), hint: 'I want to train my memory and focus' },
    { value: 'caregiver', label: tr('auth.caregiver'), hint: 'I support family or clients' },
  ]

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
        aria-label="Create account"
      >
        <h2 className="text-xl font-semibold text-navy-800">{tr('auth.register')}</h2>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-navy-700">{tr('auth.name')}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            className="rounded-xl border-2 border-navy-100 px-4 py-3 text-lg focus:border-teal-500 bg-white"
            placeholder="Aarti Sharma"
          />
        </label>

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
            autoComplete="new-password"
            required
            minLength={6}
            className="rounded-xl border-2 border-navy-100 px-4 py-3 text-lg focus:border-teal-500 bg-white"
            placeholder="At least 6 characters"
          />
        </label>

        <fieldset>
          <legend className="font-medium text-navy-700 mb-2">{tr('auth.role')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {roleOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                aria-pressed={role === opt.value}
                className={`rounded-xl border-2 p-3 text-left transition-colors ${
                  role === opt.value
                    ? 'border-teal-500 bg-mind'
                    : 'border-navy-100 bg-white hover:border-teal-300'
                }`}
              >
                <span className="block font-semibold text-navy-800">{opt.label}</span>
                <span className="block text-xs text-navy-500 mt-1">{opt.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="text-red-600 font-medium" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? tr('auth.signingIn') : tr('auth.register')}
        </button>

        <p className="text-center text-navy-600">
          {tr('auth.haveAccount')}{' '}
          <Link to="/login" className="text-teal-600 font-semibold underline">
            {tr('auth.login')}
          </Link>
        </p>
      </form>

      <p className="mt-6 text-xs text-navy-500 max-w-md text-center">{tr('disclaimer')}</p>
    </div>
  )
}