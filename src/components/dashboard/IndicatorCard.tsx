import { ErrorMessage } from '@/components/ui/error-message'

interface IndicatorCardProps {
  title: string
  value: string
  subtitle?: string
  interpretation?: string
  alert?: boolean
  error?: Error | null
  isLoading?: boolean
  children?: React.ReactNode
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
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <div className={`text-3xl font-bold ${alert ? 'text-red-600' : 'text-blue-600'}`}>{value}</div>
        {subtitle && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{subtitle}</p>}
        {interpretation && <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">{interpretation}</p>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}



