import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Loader2 } from 'lucide-react'

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-navy-700">
        <Loader2 className="animate-spin" size={40} aria-hidden="true" />
        <p className="text-lg font-medium">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (role && user.role !== role) {
    // A patient should not access caregiver pages and vice versa.
    return <Navigate to={user.role === 'patient' ? '/patient' : '/caregiver'} replace />
  }

  return children
}