'use client'

import { useQuery } from '@tanstack/react-query'
import type { RegimeSignalsResponse, RegimeLabel, CorrelationPair } from '@/lib/research/types'
import { getRegimeLabelColor, getRegimeLabelDescription } from '@/lib/research/regime-score'

// ============================================================================
// Data Fetching
// ============================================================================

async function fetchRegimeSignals(): Promise<RegimeSignalsResponse> {
  const response = await fetch('/api/research/regime-signals', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error('Failed to fetch regime signals')
  }
  const json = await response.json()
  return json.data
}

function useRegimeSignals() {
  return useQuery({
    queryKey: ['research', 'regime-signals'],
    queryFn: fetchRegimeSignals,
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
  })
}

// ============================================================================
// Sub-Components
// ============================================================================

function RegimeScoreCard({ label, score, asOf }: { label: RegimeLabel; score: number; asOf: string }) {
  const color = getRegimeLabelColor(label)
  const description = getRegimeLabelDescription(label)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Regime Score</h3>
        <span className="text-xs text-gray-400">as of {asOf}</span>
      </div>

      <div className="flex items-center gap-4 mb-3">
        <div
          className="text-4xl font-bold"
          style={{ color }}
        >
          {score.toFixed(0)}
        </div>
        <div>
          <div
            className="text-lg font-semibold"
            style={{ color }}
          >
            {label}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">0 = Risk-On, 100 = Stress</div>
        </div>
      </div>

      {/* Score Bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${score}%`,
            backgroundColor: color,
          }}
        />
      </div>

      <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  )
}

function TopDriversList({ drivers, components }: { drivers: string[]; components: RegimeSignalsResponse['regime']['components'] }) {
  if (drivers.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Top Drivers</h3>
      <ul className="space-y-2">
        {drivers.map((driverName) => {
          const comp = components.find((c) => c.name === driverName)
          if (!comp) return null

          return (
            <li key={comp.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700 dark:text-gray-300">{comp.name}</span>
              <div className="flex items-center gap-2">
                {comp.percentile !== null && (
                  <span className="text-xs text-gray-500">P{comp.percentile.toFixed(0)}</span>
                )}
                <span className="font-medium text-gray-900 dark:text-white">
                  {comp.value !== null ? comp.value.toFixed(2) : 'N/A'}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ActiveAlerts({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Active Alerts</h3>
        <p className="text-sm text-green-600 dark:text-green-400">No triggers currently firing</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
      <h3 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">Active Alerts</h3>
      <ul className="space-y-1">
        {alerts.map((alert) => (
          <li key={alert} className="text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {alert}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CorrelationsTable({ correlations }: { correlations: RegimeSignalsResponse['correlations'] }) {
  if (!correlations || correlations.length === 0) return null

  // Use the first window (60d)
  const corr = correlations[0]
  if (!corr || corr.pairs.length === 0) return null

  // Get top 5 by absolute spearman
  const topPairs = [...corr.pairs]
    .sort((a, b) => Math.abs(b.spearman) - Math.abs(a.spearman))
    .slice(0, 5)

  const formatSeriesName = (id: string): string => {
    const names: Record<string, string> = {
      hy_oas: 'HY OAS',
      vix: 'VIX',
      yield_curve_spread: 'Yield Curve',
      net_liquidity_pctile: 'Liquidity',
      sp500_drawdown: 'S&P DD',
    }
    return names[id] ?? id
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Correlations ({corr.window})</h3>
        <span className="text-xs text-gray-400">Spearman</span>
      </div>
      <div className="space-y-2">
        {topPairs.map((pair, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400 truncate">
              {formatSeriesName(pair.a)} / {formatSeriesName(pair.b)}
            </span>
            <span
              className={`font-mono font-medium ${
                pair.spearman > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {pair.spearman > 0 ? '+' : ''}
              {pair.spearman.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DataFreshness({ components }: { components: RegimeSignalsResponse['regime']['components'] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Data Freshness</h3>
      <div className="space-y-2 text-xs">
        {components.map((comp) => (
          <div key={comp.id} className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">{comp.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{comp.lagDescription}</span>
              <span className="text-gray-700 dark:text-gray-300">{comp.asOf}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-700">
      <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium mb-1">Data Warnings</p>
      <ul className="text-xs text-yellow-600 dark:text-yellow-500 space-y-1">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function SignalsPanel() {
  const { data, isLoading, error } = useRegimeSignals()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2" />
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-3" />
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-700">
        <p className="text-sm text-red-700 dark:text-red-400">
          Failed to load regime signals. Data will be available after the next cache warm.
        </p>
      </div>
    )
  }

  const { regime, correlations } = data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Signals</h2>
        <span className="text-xs text-gray-500">v{data.meta.version}</span>
      </div>

      <RegimeScoreCard label={regime.regimeLabel} score={regime.score} asOf={regime.asOf} />

      <TopDriversList drivers={regime.topDrivers} components={regime.components} />

      <ActiveAlerts alerts={regime.activeAlerts} />

      <CorrelationsTable correlations={correlations} />

      <DataFreshness components={regime.components} />

      <Warnings warnings={regime.warnings} />

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Signals are research outputs, not trade recommendations.
        <br />
        Past correlations do not guarantee future relationships.
      </p>
    </div>
  )
}
