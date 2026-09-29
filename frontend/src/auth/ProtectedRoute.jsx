import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BrandedLoader } from '../components/States'

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BrandedLoader message="Preparing your cognitive space..." />
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