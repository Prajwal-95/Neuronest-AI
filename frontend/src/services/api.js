const API_BASE = ''  // uses Vite proxy to backend

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
    throw new ApiError('Network error. Check your connection.', 0)
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
    const detail =
      typeof data?.detail === 'string'
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