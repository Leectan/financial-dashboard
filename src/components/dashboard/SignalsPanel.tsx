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

  const formatValue = (comp: RegimeSignalsResponse['regime']['components'][number]): string => {
    if (comp.value == null) return 'N/A'
    switch (comp.id) {
      case 'credit_stress':
        return `${comp.value.toFixed(2)}%`
      case 'liquidity_stress':
        return `${comp.value.toFixed(2)}% YoY`
      case 'volatility':
        return `${comp.value.toFixed(1)}`
      case 'funding_stress':
        return `$${(comp.value / 1e9).toFixed(2)}B`
      case 'curve_inversion':
        return `${comp.value.toFixed(2)}%`
      default:
        return comp.value.toFixed(2)
    }
  }

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
                  {formatValue(comp)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ComponentMeaning({ components }: { components: RegimeSignalsResponse['regime']['components'] }) {
  const byId = Object.fromEntries(components.map((c) => [c.id, c])) as Record<string, RegimeSignalsResponse['regime']['components'][number]>

  const credit = byId['credit_stress']
  const liq = byId['liquidity_stress']
  const vol = byId['volatility']
  const fund = byId['funding_stress']
  const curve = byId['curve_inversion']

  const creditText = (() => {
    if (!credit || credit.value == null) return 'HY OAS: unavailable.'
    const v = credit.value
    if (v < 3) return `HY OAS ${v.toFixed(2)}%: very tight (risk-on / benign credit).`
    if (v < 5) return `HY OAS ${v.toFixed(2)}%: normal-to-moderate risk (watch changes).`
    if (v < 7) return `HY OAS ${v.toFixed(2)}%: elevated stress (credit tightening).`
    return `HY OAS ${v.toFixed(2)}%: high stress (often seen in risk-off episodes).`
  })()

  const liqText = (() => {
    if (!liq) return 'Liquidity: unavailable.'
    const yoy = liq.value
    const pct = liq.percentile
    const parts: string[] = []
    if (yoy != null) {
      parts.push(`Liquidity YoY ${yoy.toFixed(2)}%: ${yoy < 0 ? 'shrinking (tighter conditions)' : 'growing (easier conditions)'}.`)
    }
    if (pct != null) {
      // Note: lower percentile = tighter liquidity; higher = easier liquidity
      parts.push(`Liquidity percentile P${pct.toFixed(0)} (0–100): ${pct < 20 ? 'very tight' : pct < 40 ? 'somewhat tight' : pct < 60 ? 'neutral' : 'easy'}.`)
    }
    return parts.length ? parts.join(' ') : 'Liquidity: unavailable.'
  })()

  const volText = (() => {
    if (!vol || vol.value == null) return 'VIX: unavailable.'
    const v = vol.value
    if (v < 15) return `VIX ${v.toFixed(1)}: low volatility (complacency / calm).`
    if (v < 25) return `VIX ${v.toFixed(1)}: normal range.`
    if (v < 35) return `VIX ${v.toFixed(1)}: elevated fear / stress.`
    return `VIX ${v.toFixed(1)}: extreme stress regime.`
  })()

  const curveText = (() => {
    if (!curve || curve.value == null) return 'Yield curve: unavailable.'
    const s = curve.value
    if (s < 0) return `10Y–2Y ${s.toFixed(2)}%: inverted (historically associated with higher recession odds, with long/variable leads).`
    if (s < 0.5) return `10Y–2Y ${s.toFixed(2)}%: flat/late-cycle (watch for further flattening).`
    return `10Y–2Y ${s.toFixed(2)}%: normal positive slope.`
  })()

  const fundText = (() => {
    if (!fund || fund.value == null) return 'SRF usage: unavailable.'
    const acceptedB = fund.value / 1e9
    if (acceptedB <= 0) return 'SRF accepted $0B: normal (no take-up).'
    if (acceptedB < 5) return `SRF accepted $${acceptedB.toFixed(2)}B: mild take-up (monitor).`
    return `SRF accepted $${acceptedB.toFixed(2)}B: meaningful take-up (funding plumbing stress signal).`
  })()

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">How to read these</h3>
      <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
        <p><span className="font-medium">Credit (HY OAS):</span> {creditText}</p>
        <p><span className="font-medium">Liquidity:</span> {liqText}</p>
        <p><span className="font-medium">Volatility (VIX):</span> {volText}</p>
        <p><span className="font-medium">Yield Curve:</span> {curveText}</p>
        <p><span className="font-medium">Funding (SRF):</span> {fundText}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          “Good/bad” is context-dependent: tight credit + easy liquidity is usually supportive for risk assets; widening spreads + tightening liquidity is usually a warning.
        </p>
      </div>
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

  const strengthLabel = (rho: number): string => {
    const a = Math.abs(rho)
    if (a >= 0.8) return 'Very strong'
    if (a >= 0.6) return 'Strong'
    if (a >= 0.4) return 'Moderate'
    if (a >= 0.2) return 'Weak'
    return 'Very weak'
  }

  const formatSeriesName = (id: string): string => {
    const names: Record<string, string> = {
      hy_oas: 'HY OAS',
      vix: 'VIX',
      yield_curve_spread: 'Yield Curve',
      liquidity_index: 'Liquidity',
      sp500_drawdown: 'S&P DD',
    }
    return names[id] ?? id
  }

  const explainPair = (pair: CorrelationPair): string => {
    const rho = pair.spearman
    const dir = rho >= 0 ? 'move together' : 'move opposite'
    const strength = strengthLabel(rho)
    const key = `${pair.a}|${pair.b}`
    const invKey = `${pair.b}|${pair.a}`

    // “Liquidity” here is a percentile index (0–100) built from YoY net liquidity change:
    // higher = easier liquidity, lower = tighter.
    const specific: Record<string, string> = {
      'hy_oas|vix':
        'Rising volatility tends to coincide with widening high-yield credit spreads (fear + credit stress together).',
      'yield_curve_spread|liquidity_index':
        'Easier liquidity often coincides with a more positive yield curve; tightening liquidity often coincides with a flatter/inverted curve.',
      'vix|yield_curve_spread':
        'Higher volatility often coincides with a flatter or inverted curve (risk-off conditions).',
      'vix|liquidity_index':
        'Higher volatility often coincides with tighter liquidity; calmer markets coincide with easier liquidity.',
      'hy_oas|liquidity_index':
        'Widening high-yield spreads often coincides with tighter liquidity; tightening spreads coincide with easier liquidity.',
    }

    const base = specific[key] ?? specific[invKey]
    if (!base) {
      return `${strength} (${rho >= 0 ? '+' : ''}${rho.toFixed(2)}) Spearman: the two series tend to ${dir} over this window.`
    }

    // Adjust wording a bit based on sign to reduce confusion for non-finance users
    const signAddendum =
      rho >= 0
        ? 'Because it’s positive, when one is high relative to recent history, the other also tends to be high.'
        : 'Because it’s negative, when one is high relative to recent history, the other tends to be low.'

    return `${strength} (${rho >= 0 ? '+' : ''}${rho.toFixed(2)}): ${base} ${signAddendum}`
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Correlations ({corr.window})</h3>
        <span className="text-xs text-gray-400">Spearman</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Spearman ρ measures how strongly two series move together over the last {corr.window}. Green = together; red = opposite. |ρ| closer to 1 = stronger relationship. Correlation ≠ causation.
      </p>
      <div className="space-y-2">
        {topPairs.map((pair, i) => (
          <div key={i} className="rounded-md p-2 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm">
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
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {explainPair(pair)}
            </div>
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

      <ComponentMeaning components={regime.components} />

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
