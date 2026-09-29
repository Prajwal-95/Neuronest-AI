import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Brain, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import SyncStatus from './SyncStatus'
import RoleSwitcher from './RoleSwitcher'
import VoiceToggle from './VoiceToggle'
import NeuralEnvironment from '../three/NeuralEnvironment'
import PageTransition from '../animation/PageTransition'
import LevelUpOverlay from '../animation/LevelUpOverlay'
import SuccessBurst from '../animation/SuccessBurst'
import SyncToast from '../animation/SyncToast'
import { motion } from 'framer-motion'

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

  const isPatient = user?.role === 'patient'

  return (
    <div className="min-h-screen flex flex-col">
      {/* Persistent 3D neural background */}
      <NeuralEnvironment />

      {/* Top bar */}
      <header className="bg-navy-900/90 backdrop-blur-xl text-white sticky top-0 z-30 shadow-lg shadow-navy-900/20 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Brand */}
          <NavLink
            to={user?.role === 'patient' ? '/patient' : '/caregiver'}
            className="flex items-center gap-3 group"
            aria-label="NeuroNest AI home"
          >
            <motion.span
              className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white flex items-center justify-center shadow-glow-teal"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Brain size={22} aria-hidden="true" />
            </motion.span>
            <span className="font-bold text-lg leading-tight hidden sm:block">
              NeuroNest <span className="text-teal-400">AI</span>
              <span className="block text-xs font-normal text-navy-200">
                {user?.name?.split(' ')[0] || ''}
              </span>
            </span>
          </NavLink>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <VoiceToggle />
            <RoleSwitcher />
            <SyncStatus />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="btn-icon text-navy-200 hover:bg-white/10 hover:text-white"
            >
              <LogOut size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 pb-32 relative z-10">
        <PageTransition>{children}</PageTransition>
      </main>

      {/* Bottom navigation */}
      <nav
        aria-label="Main navigation"
        className={`fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur-xl border-t border-navy-100/60 z-30 shadow-lg shadow-navy-900/5`}
      >
        <div
          className="max-w-6xl mx-auto grid px-2 py-2 gap-1"
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
                `flex flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-center transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-br from-teal-50 to-mint-50 text-teal-800 font-semibold shadow-inner-glow ring-1 ring-teal-100'
                    : 'text-navy-500 hover:bg-navy-50 hover:text-navy-700'
                }`
              }
            >
              <item.icon size={24} aria-hidden="true" />
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