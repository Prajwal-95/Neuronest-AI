import React, { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, clearToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authConfig, setAuthConfig] = useState({ google_enabled: false, demo_enabled: true })

  useEffect(() => {
    // Which login buttons to show (Google button needs backend GOOGLE_CLIENT_ID).
    api.get('/auth/config').then(setAuthConfig).catch(() => {})
  }, [])

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    const fetchMe = async () => {
      try {
        const me = await api.get('/users/me')
        setUser(me)
      } catch {
        clearToken()
      } finally {
        setLoading(false)
      }
    }
    fetchMe()
  }, [])

  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('neuronest:unauthorized', onUnauthorized)
    return () => window.removeEventListener('neuronest:unauthorized', onUnauthorized)
  }, [])

  const login = async (email, password) => {
    setError('')
    try {
      const data = await api.post('/auth/login', { email, password })
      setToken(data.access_token)
      setUser(data.user)
      return data.user
    } catch (err) {
      setError(err.message || 'Login failed')
      throw err
    }
  }

  const register = async (name, email, password, role) => {
    setError('')
    try {
      const data = await api.post('/auth/register', {
        name,
        email,
        password,
        role,
        language: 'en',
      })
      setToken(data.access_token)
      setUser(data.user)
      return data.user
    } catch (err) {
      setError(err.message || 'Registration failed')
      throw err
    }
  }

  const loginWithGoogle = async (idToken, role = 'patient') => {
    setError('')
    try {
      const data = await api.post('/auth/google', { id_token: idToken, role })
      setToken(data.access_token)
      setUser(data.user)
      return data.user
    } catch (err) {
      setError(err.message || 'Google sign-in failed')
      throw err
    }
  }

  const logout = () => {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, error, login, loginWithGoogle, register, logout, setUser, authConfig }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}