import { ErrorMessage } from '@/components/ui/error-message'
import { DataFreshnessBadge } from '@/components/ui/data-freshness-badge'
import { DataFreshnessStatus } from '@/lib/utils/data-validation'

interface IndicatorCardProps {
  title: string
  value: string
  subtitle?: string
  interpretation?: string
  alert?: boolean
  error?: Error | null
  isLoading?: boolean
  children?: React.ReactNode
  // Data freshness tracking
  dataTimestamp?: Date | string
  freshnessStatus?: DataFreshnessStatus
  freshnessAge?: string
  validationWarnings?: string[]
}

export function IndicatorCard({
  title,
  value,
  subtitle,
  interpretation,
  alert,
  error,
  isLoading,
  children,
  dataTimestamp,
  freshnessStatus,
  freshnessAge,
  validationWarnings,
}: IndicatorCardProps) {
  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <ErrorMessage message={error.message} title="Failed to load data" />
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {freshnessStatus && freshnessAge && (
            <DataFreshnessBadge status={freshnessStatus} age={freshnessAge} />
          )}
        </div>
        <div className={`text-3xl font-bold ${alert ? 'text-red-600' : 'text-blue-600'}`}>{value}</div>
        {subtitle && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{subtitle}</p>}
        {interpretation && <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">{interpretation}</p>}
        {validationWarnings && validationWarnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {validationWarnings.map((warning, idx) => (
              <p key={idx} className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {warning}
              </p>
            ))}
          </div>
        )}
        {dataTimestamp && !freshnessStatus && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Updated: {new Date(dataTimestamp).toLocaleString()}
          </p>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}


