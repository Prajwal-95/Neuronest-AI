import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const I18nContext = createContext(null)

const messages = {
  en: () => import('../locales/en.json'),
  hi: () => import('../locales/hi.json'),
}

export function I18nProvider({ children }) {
  // English is the default. Only a previously stored, VALID choice ('hi') is
  // honoured, so a corrupt/legacy value can never leave the UI blank or stuck
  // on a non-English locale.
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem('neuronest_lang')
    return stored === 'hi' || stored === 'en' ? stored : 'en'
  })
  const [t, setT] = useState({})

  useEffect(() => {
    let mounted = true
    messages[lang]().then((mod) => {
      if (mounted) setT(mod.default)
    })
    localStorage.setItem('neuronest_lang', lang)
    return () => {
      mounted = false
    }
  }, [lang])

  const tr = useCallback(
    (key, params = {}) => {
      const parts = key.split('.')
      let cur = t
      for (const p of parts) {
        if (cur == null) return key
        cur = cur[p]
      }
      if (typeof cur !== 'string') return key
      return Object.entries(params).reduce(
        (str, [k, v]) => str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
        cur
      )
    },
    [t]
  )

  return (
    <I18nContext.Provider value={{ lang, setLang, t, tr }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}