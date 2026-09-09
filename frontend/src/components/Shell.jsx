import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Brain, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import SyncStatus from './SyncStatus'
import RoleSwitcher from './RoleSwitcher'
import NeuralEnvironment from '../three/NeuralEnvironment'
import PageTransition from '../animation/PageTransition'
import LevelUpOverlay from '../animation/LevelUpOverlay'
import SuccessBurst from '../animation/SuccessBurst'
import SyncToast from '../animation/SyncToast'

/**
 * Shared app shell: top bar with brand, user, sync status; a big
 * touch-friendly bottom navigation (ideal for elderly users).
 * Hosts the global 3D Neural-Garden background and animation overlays.
 */
export default function Shell({ navItems, children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Persistent 3D neural background */}
      <NeuralEnvironment />

      {/* Top bar */}
      <header className="bg-navy-800/85 backdrop-blur-md text-white sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <NavLink to={user?.role === 'patient' ? '/patient' : '/caregiver'} className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-navy-700 text-teal-500 flex items-center justify-center nx-glow">
              <Brain size={22} aria-hidden="true" />
            </span>
            <span className="font-bold text-lg leading-tight">
              NeuroNest AI
              <span className="block text-xs font-normal text-navy-100">{user?.name}</span>
            </span>
          </NavLink>
          <div className="flex items-center gap-2">
            <RoleSwitcher />
            <SyncStatus />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="rounded-full p-2 hover:bg-navy-700 transition-colors"
            >
              <LogOut size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 pb-28 relative z-10">
        <PageTransition>{children}</PageTransition>
      </main>

      {/* Bottom navigation */}
      <nav
        aria-label="Main navigation"
        className={`fixed bottom-0 inset-x-0 bg-white/85 backdrop-blur-md border-t border-navy-100 z-20`}
      >
        <div
          className="max-w-5xl mx-auto grid px-2 py-2"
          style={{
            gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
          }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-center transition-colors ${
                  isActive ? 'bg-mind text-teal-700 font-semibold' : 'text-navy-600 hover:bg-navy-50'
                }`
              }
            >
              <item.icon size={26} aria-hidden="true" />
              <span className="text-xs leading-tight">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Global animation overlays */}
      <LevelUpOverlay />
      <SuccessBurst />
      <SyncToast />
    </div>
  )
}