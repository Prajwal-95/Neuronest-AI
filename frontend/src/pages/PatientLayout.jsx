import React from 'react'
import { Outlet } from 'react-router-dom'
import { Home, Gamepad2, LineChart, Bell, Settings } from 'lucide-react'
import Shell from '../components/Shell'
import { useI18n } from '../services/i18n'

export default function PatientLayout() {
  const { tr } = useI18n()
  const navItems = [
    { to: '/patient', end: true, icon: Home, label: tr('nav.home') },
    { to: '/patient/games', end: false, icon: Gamepad2, label: tr('nav.games') },
    { to: '/patient/analytics', end: false, icon: LineChart, label: tr('nav.analytics') },
    { to: '/patient/reminders', end: false, icon: Bell, label: tr('nav.reminders') },
    { to: '/patient/settings', end: false, icon: Settings, label: tr('nav.settings') },
  ]
  return (
    <Shell navItems={navItems}>
      <Outlet />
    </Shell>
  )
}