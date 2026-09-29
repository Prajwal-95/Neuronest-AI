import React from 'react'
import { AlertTriangle } from 'lucide-react'

/** Graceful error state for API-dependent screens. */
export function ErrorState({ message, onRetry }) {
  return (
    <div className="card flex flex-col items-center gap-4 py-12 text-center" role="alert">
      <AlertTriangle size={48} className="text-amber-500" aria-hidden="true" />
      <h3 className="text-xl font-semibold text-navy-800">Something went wrong</h3>
      <p className="text-navy-600 max-w-md">{message || 'Please try again in a moment.'}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

/** Empty state with a friendly landing for pages with no data yet. */
export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="card flex flex-col items-center gap-4 py-12 text-center">
      {Icon && <Icon size={48} className="text-teal-600" aria-hidden="true" />}
      <h3 className="text-xl font-semibold text-navy-800">{title}</h3>
      {message && <p className="text-navy-600 max-w-md">{message}</p>}
      {action}
    </div>
  )
}

/**
 * Premium loading skeleton for dashboard data.
 */
export function LoadingSkeleton({ rows = 3, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-16 rounded-2xl" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  )
}

/**
 * Full-screen branded loading state.
 */
export function BrandedLoader({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative w-16 h-16 mb-6">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 animate-glow-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5Z" />
            <path d="M9 14v2a3 3 0 0 0 6 0v-2" />
          </svg>
        </div>
      </div>
      <p className="text-navy-600 text-lg font-medium">{message || 'Preparing your space...'}</p>
    </div>
  )
}

export default LoadingSkeleton