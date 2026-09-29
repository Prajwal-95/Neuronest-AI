// In dev (vite `npm run dev`) this is empty and the Vite proxy forwards
// /auth, /users, ... to http://127.0.0.1:8000 (see vite.config.js).
// In production (Render) set VITE_API_URL to the backend URL, e.g.
// https://neuronest-api.onrender.com — then all calls go there directly.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/** True when pointed at a hosted API (Render) instead of the local dev proxy. */
const IS_HOSTED = API_BASE !== ''

const TOKEN_KEY = 'neuronest_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch (err) {
    // fetch only rejects on a transport failure: the API is not running, the
    // Vite proxy has no target, or the machine is offline.
    throw new ApiError(
      navigator.onLine
        ? IS_HOSTED
          ? 'Cannot reach the NeuroNest API. The server may be waking up - free hosting takes about a minute after a period of inactivity. Try again shortly.'
          : 'Cannot reach the NeuroNest API. Start the backend with: cd backend && ..\\venv\\Scripts\\python.exe -m uvicorn app.main:app --port 8000'
        : 'You appear to be offline. Reconnect and try again.',
      0
    )
  }

  if (res.status === 401) {
    clearToken()
    window.dispatchEvent(new CustomEvent('neuronest:unauthorized'))
    throw new ApiError('Session expired. Please log in again.', 401)
  }

  let data = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { detail: text }
    }
  }

  if (!res.ok) {
    // A 5xx carrying HTML (or nothing) is the dev proxy failing to reach the
    // backend, not a real application error - say so instead of a generic line.
    const looksLikeProxyFailure =
      res.status >= 500 && (!data?.detail || String(data.detail).trim().startsWith('<'))
    const detail = looksLikeProxyFailure
      ? IS_HOSTED
        ? 'The NeuroNest API is not responding. It may be starting up again - give it a minute and retry.'
        : 'The NeuroNest API is not responding. Is the backend running on port 8000?'
      : typeof data?.detail === 'string'
        ? data.detail
        : 'Request failed. Please try again.'
    throw new ApiError(detail, res.status)
  }

  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) =>
    request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}