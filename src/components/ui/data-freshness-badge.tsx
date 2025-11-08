/**
 * Data Freshness Badge Component
 *
 * Displays data freshness status with color-coded badge
 * following Bloomberg/Reuters industry standards
 */

import { DataFreshnessStatus, getFreshnessColorClass, getFreshnessLabel } from '@/lib/utils/data-validation'

interface DataFreshnessBadgeProps {
  status: DataFreshnessStatus
  age: string
  className?: string
  showAge?: boolean
}

export function DataFreshnessBadge({ status, age, className = '', showAge = true }: DataFreshnessBadgeProps) {
  const colorClass = getFreshnessColorClass(status)
  const label = getFreshnessLabel(status)

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
        title={`Data status: ${label}`}
      >
        <StatusIndicator status={status} />
        {label}
      </span>
      {showAge && age && (
        <span className="text-xs text-gray-500 dark:text-gray-400" title="Time since last update">
          {age}
        </span>
      )}
    </div>
  )
}

function StatusIndicator({ status }: { status: DataFreshnessStatus }) {
  const baseClasses = "w-2 h-2 rounded-full"

  switch (status) {
    case 'live':
      return (
        <span className={`${baseClasses} bg-green-600 dark:bg-green-400 animate-pulse`} aria-label="Live data" />
      )
    case 'delayed':
      return (
        <span className={`${baseClasses} bg-yellow-600 dark:bg-yellow-400`} aria-label="Delayed data" />
      )
    case 'stale':
      return (
        <span className={`${baseClasses} bg-red-600 dark:bg-red-400`} aria-label="Stale data" />
      )
    case 'error':
      return (
        <span className={`${baseClasses} bg-gray-600 dark:bg-gray-400`} aria-label="Data error" />
      )
  }
}
