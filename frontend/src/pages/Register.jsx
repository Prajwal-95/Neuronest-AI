import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain } from 'lucide-react'
import { motion } from 'framer-motion'
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Ambient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 20% 15%, #16294a 0%, #0a1628 55%, #060e1a 100%)' }}
        aria-hidden="true"
      />
      {/* Decorative dots */}
      <div className="absolute inset-0 pointer-events-none opacity-30" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-teal-400/60"
            style={{ left: `${12 + i * 14}%`, top: `${18 + (i % 3) * 26}%` }}
            animate={{ y: [0, -10, 0], opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 3.5 + i * 0.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <motion.div
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-col items-center gap-3 mb-8">
          <motion.div
            className="w-16 h-16 rounded-3xl bg-gradient-to-br from-teal-500 via-teal-600 to-navy-700 text-white flex items-center justify-center shadow-glow-teal-lg"
            whileHover={{ scale: 1.05 }}
          >
            <Brain size={34} aria-hidden="true" />
          </motion.div>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white">
              NeuroNest <span className="text-teal-400">AI</span>
            </h1>
            <p className="text-sm text-navy-200 mt-1">{tr('app.tagline')}</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-panel w-full gap-4 flex flex-col p-8 rounded-3xl"
          aria-label={tr('auth.register')}
        >
          <h2 className="text-xl font-semibold text-navy-800">{tr('auth.register')}</h2>

        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-navy-700">{tr('auth.name')}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            className="input-field"
            placeholder="Aarti Sharma"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-navy-700">{tr('auth.email')}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="input-field"
            placeholder="you@example.com"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-navy-700">{tr('auth.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
            className="input-field"
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

      <p className="mt-6 text-xs text-navy-300 max-w-md text-center">{tr('disclaimer')}</p>
      </motion.div>
    </div>
  )
}