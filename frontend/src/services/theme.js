/**
 * Light / dark theme.
 *
 * Applied as a `dark` class on <html> (Tailwind class-based dark mode), and
 * mirrored onto `document.body` so the `.dark .card` overrides in index.css
 * match. The choice is persisted, and the first-ever visit respects the
 * operating system preference.
 */

const STORAGE_KEY = 'neuronest_theme'

function systemPrefersDark() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function stored() {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'dark' || v === 'light' ? v : null
}

function apply(theme) {
  const dark = theme === 'dark'
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = theme
  if (document.body) {
    document.body.classList.toggle('dark', dark)
    document.body.style.backgroundColor = dark ? '#0b1220' : '#f4f6fa'
  }
  return theme
}

/** Apply the stored/system theme. Call once, before first paint if possible. */
export function initTheme() {
  return apply(stored() || (systemPrefersDark() ? 'dark' : 'light'))
}

export function getTheme() {
  return stored() || (systemPrefersDark() ? 'dark' : 'light')
}

export function setTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light'
  localStorage.setItem(STORAGE_KEY, next)
  return apply(next)
}

export function toggleTheme() {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark')
}
