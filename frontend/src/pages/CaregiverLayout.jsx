import React from 'react'
import { Outlet } from 'react-router-dom'
import { LayoutDashboard, Bell, Settings } from 'lucide-react'
import Shell from '../components/Shell'
import { useI18n } from '../services/i18n'

export default function CaregiverLayout() {
  const { tr } = useI18n()
  const navItems = [
    { to: '/caregiver', end: true, icon: LayoutDashboard, label: tr('nav.caregiver') },
    { to: '/caregiver/reminders', end: false, icon: Bell, label: tr('nav.reminders') },
    { to: '/caregiver/settings', end: false, icon: Settings, label: tr('nav.settings') },
  ]
  return (
    <Shell navItems={navItems}>
      <Outlet />
    </Shell>
  )
}