import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain, ShieldCheck, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../auth/AuthContext'
import { useOffline } from '../offline/OfflineContext'
import { useI18n } from '../services/i18n'
import SyncStatus from '../components/SyncStatus'

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

function loadGisScript() {
  if (typeof document === 'undefined') return Promise.resolve(false)
  if (window.google?.accounts?.id) return Promise.resolve(true)
  if (document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`)) {
    return new Promise((resolve) => {
      let tries = 0
      const timer = setInterval(() => {
        tries += 1
        if (window.google?.accounts?.id) {
          clearInterval(timer)
          resolve(true)
        } else if (tries > 50) {
          clearInterval(timer)
          resolve(false)
        }
      }, 100)
    })
  }
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve(Boolean(window.google?.accounts?.id))
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
}

const DEMO_ACCOUNTS = [
  { label: 'Patient (EN)', email: 'patient@neuronest.demo', password: 'demo1234' },
  { label: 'Patient (HI)', email: 'meena@neuronest.demo', password: 'demo1234' },
  { label: 'Caregiver', email: 'caregiver@neuronest.demo', password: 'demo1234' },
]

export default function Login() {
  const { login, loginWithGoogle, authConfig } = useAuth()
  const { syncNow } = useOffline()
  const { tr } = useI18n()
  const navigate = useNavigate()

  const [email, setEmail] = useState('patient@neuronest.demo')
  const [password, setPassword] = useState('demo1234')
  const [role, setRole] = useState('patient')
  const [submitting, setSubmitting] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [gisReady, setGisReady] = useState(false)
  const [error, setError] = useState('')

  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
  const googleEnabled = Boolean(authConfig?.google_enabled && googleClientId)

  useEffect(() => {
    if (!googleEnabled) return
    let mounted = true
    loadGisScript().then((ready) => {
      if (mounted) setGisReady(ready)
    })
    return () => {
      mounted = false
    }
  }, [googleEnabled])

  const finishLogin = (user) => {
    if (navigator.onLine) syncNow().catch(() => {})
    navigate(user.role === 'patient' ? '/patient' : '/caregiver', { replace: true })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const user = await login(email.trim(), password)
      finishLogin(user)
    } catch (err) {
      setError(err.message || tr('auth.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    if (!window.google?.accounts?.id) {
      setError('Google sign-in is still loading. Try again in a moment.')
      return
    }
    setGoogleBusy(true)
    try {
      const credential = await new Promise((resolve, reject) => {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (response) => resolve(response?.credential),
            auto_select: false,
            cancel_on_tap_outside: true,
          })
          window.google.accounts.id.prompt((notification) => {
            const dismissed = notification?.isDismissed?.() || notification?.isSkippedMoment?.()
            if (dismissed) reject(new Error('Google sign-in was dismissed.'))
          })
        } catch (err) {
          reject(err)
        }
        // If the One Tap prompt is suppressed (no session / blocked), fall
        // back to the OAuth2 popup via the token client is overkill here —
        // surfacing the message is clearer than a silent no-op.
        setTimeout(() => reject(new Error('Google did not return a credential. Please try again or use email login.')), 15000)
      })
      if (!credential) throw new Error('Google did not return a credential.')
      const user = await loginWithGoogle(credential, role)
      finishLogin(user)
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Try email login instead.')
    } finally {
      setGoogleBusy(false)
    }
  }

  const fillDemo = (account) => {
    setEmail(account.email)
    setPassword(account.password)
    setError('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Ambient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 20% 15%, #16294a 0%, #0a1628 55%, #060e1a 100%)' }}
        aria-hidden="true"
      />
      {/* Decorative neural dots */}
      <div className="absolute inset-0 pointer-events-none opacity-30" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-teal-400/60"
            style={{ left: `${10 + i * 11.5}%`, top: `${15 + (i % 4) * 22}%` }}
            animate={{ y: [0, -12, 0], opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <motion.div
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Brand hero */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <motion.div
            className="w-16 h-16 rounded-3xl bg-gradient-to-br from-teal-500 via-teal-600 to-navy-700 text-white flex items-center justify-center shadow-glow-teal-lg"
            whileHover={{ scale: 1.05 }}
            animate={{
              boxShadow: [
                '0 0 24px -4px rgba(43,179,163,0.5)',
                '0 0 40px -8px rgba(43,179,163,0.6)',
                '0 0 24px -4px rgba(43,179,163,0.5)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity }}
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
          aria-label={tr('auth.login')}
        >
          <h2 className="text-xl font-semibold text-navy-800 flex items-center gap-2">
            <Sparkles size={20} className="text-teal-600" aria-hidden="true" />
            {tr('auth.welcomeBack')}
          </h2>
          {googleEnabled && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleBusy || !gisReady}
                className="w-full rounded-xl border border-navy-200 bg-white px-4 py-3 font-semibold text-navy-800 hover:border-teal-400 hover:bg-teal-50 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {googleBusy ? 'Connecting to Google...' : 'Continue with Google'}
              </button>
              <div className="flex items-center gap-3 text-xs font-semibold text-navy-400" aria-hidden="true">
                <span className="h-px flex-1 bg-navy-100" />
                <span>OR</span>
                <span className="h-px flex-1 bg-navy-100" />
              </div>
            </div>
          )}
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
              autoComplete="current-password"
              required
              className="input-field"
              placeholder="••••••••"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-navy-700">{tr('auth.role')}</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tr('auth.role')}>
              {[
                { value: 'patient', label: tr('auth.patient') },
                { value: 'caregiver', label: tr('auth.caregiver') },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={role === opt.value}
                  onClick={() => setRole(opt.value)}
                  className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                    role === opt.value
                      ? 'border-teal-500 bg-teal-50 text-teal-800'
                      : 'border-navy-100 bg-white text-navy-600 hover:border-teal-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-navy-500">New Google accounts are created with this role.</p>
          </div>
          {error && (
            <motion.p
              className="text-red-600 font-medium bg-red-50 rounded-xl px-4 py-2.5"
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.p>
          )}

          <motion.button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full"
            whileHover={{ scale: submitting ? 1 : 1.01 }}
            whileTap={{ scale: submitting ? 1 : 0.97 }}
          >
            {submitting ? tr('auth.signingIn') : tr('auth.login')}
          </motion.button>

          <div className="rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-700">
              Demo login - already filled in
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => fillDemo(account)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    email === account.email
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-teal-700 border-teal-200 hover:border-teal-500'
                  }`}
                >
                  {account.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-teal-700">
              Password <code className="font-bold">demo1234</code> is pre-entered - just press Log in.
            </p>
          </div>
          <p className="text-center text-navy-600">
            {tr('auth.noAccount')}{' '}
            <Link to="/register" className="text-teal-600 font-semibold underline hover:text-teal-700">
              {tr('auth.register')}
            </Link>
          </p>
        </form>

        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <SyncStatus compact />
          <p className="text-xs text-navy-300 max-w-md flex items-start gap-1.5">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-teal-400" aria-hidden="true" />
            {tr('disclaimer')}
          </p>
        </div>
      </motion.div>
    </div>
  )
}