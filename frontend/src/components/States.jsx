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