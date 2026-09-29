import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Check, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../services/i18n'
import { voiceService } from '../services/voice'

/**
 * Demo account switcher — used for the SIH live demo.
 * Lets the presenter hop between the seeded demo identities (caregiver,
 * English patient, Hindi patient) with one tap, without re-typing credentials.
 */
const DEMO_ACCOUNTS = [
  {
    key: 'caregiver',
    email: 'caregiver@neuronest.demo',
    nameKey: 'demo.caregiver',
    route: '/caregiver',
    lang: 'en',
    avatarClass: 'bg-teal-100 text-teal-700',
  },
  {
    key: 'ravi',
    email: 'patient@neuronest.demo',
    nameKey: 'demo.ravi',
    route: '/patient',
    lang: 'en',
    avatarClass: 'bg-navy-100 text-navy-700',
  },
  {
    key: 'meena',
    email: 'meena@neuronest.demo',
    nameKey: 'demo.meena',
    route: '/patient',
    // English by default. Hindi is opt-in via Settings -> Language; a demo
    // account must not silently switch the whole UI language on sign-in.
    lang: 'en',
    avatarClass: 'bg-amber-100 text-amber-700',
  },
]
const DEMO_PASSWORD = 'demo1234'

export default function RoleSwitcher() {
  const { user, login } = useAuth()
  const { tr, setLang } = useI18n()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const ref = useRef(null)

  // Close the popover on outside click or Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const switchTo = async (account) => {
    if (busy) return
    setBusy(account.key)
    setError('')
    try {
      const nextUser = await login(account.email, DEMO_PASSWORD)
      // Sync UI language + voice language with the target demo account
      localStorage.setItem('neuronest_lang', account.lang)
      setLang(account.lang)
      voiceService.speak(
        account.lang === 'hi'
          ? `${nextUser.name}, न्यूरोनेस्ट में आपका स्वागत है।`
          : `Signed in as ${nextUser.name}.`
      )
      navigate(account.route, { replace: true })
      setOpen(false)
    } catch (err) {
      setError(err.message || tr('demo.error'))
    } finally {
      setBusy(null)
    }
  }

  const currentEmail = user?.email

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          setError('')
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tr('demo.button')}
        title={tr('demo.button')}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-navy-700 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-600 transition-colors"
      >
        <ArrowLeftRight size={18} aria-hidden="true" />
        <span className="hidden md:inline">{tr('demo.button')}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={tr('demo.title')}
          className="absolute right-0 top-full mt-2 z-30 w-72 overflow-hidden rounded-2xl border border-navy-100 bg-white text-navy-800 shadow-xl dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          {/* Every colour here is overridden explicitly. The global dark-mode
              remap in index.css turns .bg-white translucent (bg-slate-800/60)
              and .text-navy-800 near-white, but leaves bg-teal-50 light - which
              rendered the ACTIVE caregiver row as white text on a light teal
              band, and let the page show through the panel behind it. */}
          <div className="border-b border-navy-100 bg-mind px-4 py-3 dark:border-slate-600 dark:bg-slate-700/60">
            <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
              {tr('demo.title')}
            </p>
            <p className="text-xs text-navy-500 dark:text-slate-300">{tr('demo.subtitle')}</p>
          </div>

          {DEMO_ACCOUNTS.map((acc) => {
            const active = acc.email === currentEmail
            return (
              <button
                key={acc.key}
                type="button"
                role="menuitem"
                onClick={() => switchTo(acc)}
                disabled={busy !== null}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-navy-50 disabled:opacity-60 dark:hover:bg-slate-700/60 ${
                  active
                    ? 'bg-teal-50 ring-1 ring-inset ring-teal-200 dark:bg-teal-500/20 dark:ring-teal-400/40'
                    : ''
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${acc.avatarClass}`}
                >
                  {tr(acc.nameKey).charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{tr(acc.nameKey)}</span>
                  <span className="block truncate text-xs text-navy-500 dark:text-slate-300">
                    {acc.email}
                  </span>
                </span>
                {busy === acc.key ? (
                  <Loader2 size={18} className="animate-spin text-teal-600" aria-hidden="true" />
                ) : active ? (
                  <Check size={18} className="text-teal-600" aria-hidden="true" />
                ) : null}
              </button>
            )
          })}

          {error && (
            <p role="alert" className="border-t border-navy-100 px-4 py-2 text-xs font-medium text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}