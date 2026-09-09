import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { I18nProvider } from './services/i18n'
import ProtectedRoute from './auth/ProtectedRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import PatientLayout from './pages/PatientLayout'
import PatientHome from './pages/PatientHome'
import GamesList from './pages/GamesList'
import MemoryMatch from './games/MemoryMatch'
import SequenceRecall from './games/SequenceRecall'
import Attention from './games/Attention'
import QuickMath from './games/QuickMath'
import WordRecall from './games/WordRecall'
import PatientAnalytics from './pages/PatientAnalytics'
import CaregiverLayout from './pages/CaregiverLayout'
import CaregiverHome from './pages/CaregiverHome'
import CaregiverPatientDetail from './pages/CaregiverPatientDetail'
import Reminders from './pages/Reminders'
import Settings from './pages/Settings'

function HomeRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'patient' ? '/patient' : '/caregiver'} replace />
}

function AppRoot() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Patient area */}
          <Route
            path="/patient"
            element={
              <ProtectedRoute role="patient">
                <PatientLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PatientHome />} />
            <Route path="games" element={<GamesList />} />
            <Route path="games/memory" element={<MemoryMatch />} />
            <Route path="games/sequence" element={<SequenceRecall />} />
            <Route path="games/attention" element={<Attention />} />
            <Route path="games/math" element={<QuickMath />} />
            <Route path="games/words" element={<WordRecall />} />
            <Route path="analytics" element={<PatientAnalytics />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Caregiver area */}
          <Route
            path="/caregiver"
            element={
              <ProtectedRoute role="caregiver">
                <CaregiverLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CaregiverHome />} />
            <Route path="patient/:id" element={<CaregiverPatientDetail />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </I18nProvider>
  )
}

export default function App() {
  return <AppRoot />
}