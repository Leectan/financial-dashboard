/**
 * Layer C: Composite Regime Score
 *
 * Builds a 0-100 risk regime score from standardized sub-scores.
 * Uses expanding-window percentiles to avoid lookahead bias.
 */

import type { RegimeScore, RegimeComponent, RegimeLabel } from './types'
import { getCurrentlyFiringTriggers, DEFAULT_THRESHOLDS } from './triggers'
import { DATASET_REGISTRY } from './dataset-registry'

// ============================================================================
// Component Definitions
// ============================================================================

interface ComponentDefinition {
  id: string
  name: string
  /** Higher raw value = more risk? If false, we invert */
  higherIsBad: boolean
  /** Weight in composite (default 1) */
  weight: number
  /** Data lag description */
  lagDescription: string
}

export const REGIME_COMPONENTS: ComponentDefinition[] = [
  {
    id: 'credit_stress',
    name: 'Credit Stress',
    higherIsBad: true, // Higher HY OAS = more stress
    weight: 1.5,
    lagDescription: 'Daily (T+1)',
  },
  {
    id: 'liquidity_stress',
    name: 'Liquidity Stress',
    higherIsBad: false, // Lower net liquidity percentile = more stress
    weight: 1.5,
    lagDescription: 'Weekly',
  },
  {
    id: 'volatility',
    name: 'Volatility',
    higherIsBad: true, // Higher VIX = more stress
    weight: 1.0,
    lagDescription: 'Daily (T+1)',
  },
  {
    id: 'funding_stress',
    name: 'Funding Stress',
    higherIsBad: true, // Higher SRF usage = stress
    weight: 1.0,
    lagDescription: 'Near real-time',
  },
  {
    id: 'curve_inversion',
    name: 'Yield Curve',
    higherIsBad: false, // Lower (negative) spread = inversion = stress
    weight: 1.0,
    lagDescription: 'Daily (T+1)',
  },
]

// ============================================================================
// Score Computation
// ============================================================================

interface ComponentInput {
  value: number | null
  percentile: number | null
  asOf: string
}

/**
 * Compute the regime score from component inputs
 *
 * @param components - Map of component ID to input values
 * @returns RegimeScore object
 */
export function computeRegimeScore(
  components: Record<string, ComponentInput>,
  currentValues: Record<string, number | null>,
  computeDate: string
): RegimeScore {
  const regimeComponents: RegimeComponent[] = []
  let totalWeight = 0
  let weightedSum = 0
  const warnings: string[] = []

  for (const def of REGIME_COMPONENTS) {
    const input = components[def.id]

    if (!input || input.percentile === null) {
      regimeComponents.push({
        id: def.id,
        name: def.name,
        value: input?.value ?? null,
        percentile: null,
        contribution: 0,
        asOf: input?.asOf ?? 'N/A',
        lagDescription: def.lagDescription,
      })
      warnings.push(`${def.name}: data unavailable`)
      continue
    }

    // Convert percentile to stress score (0-100)
    // For "higherIsBad" indicators, high percentile = high stress
    // For "lowerIsBad" indicators (higherIsBad=false), low percentile = high stress
    const stressScore = def.higherIsBad ? input.percentile : 100 - input.percentile

    const contribution = stressScore * def.weight
    weightedSum += contribution
    totalWeight += def.weight

    regimeComponents.push({
      id: def.id,
      name: def.name,
      value: input.value,
      percentile: Math.round(input.percentile * 10) / 10,
      contribution: Math.round(contribution * 10) / 10,
      asOf: input.asOf,
      lagDescription: def.lagDescription,
    })
  }

  // Compute overall score
  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 50

  // Determine regime label
  const regimeLabel = getRegimeLabel(score)

  // Get top drivers (sorted by contribution)
  const topDrivers = [...regimeComponents]
    .filter((c) => c.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((c) => c.name)

  // Get active alerts
  const firingTriggers = getCurrentlyFiringTriggers(currentValues, DEFAULT_THRESHOLDS)
  const activeAlerts = firingTriggers.map((t) => t.name)

  // Add staleness warnings
  const today = computeDate
  for (const comp of regimeComponents) {
    if (comp.asOf && comp.asOf !== 'N/A') {
      const daysDiff = Math.floor(
        (new Date(today).getTime() - new Date(comp.asOf).getTime()) / (1000 * 60 * 60 * 24)
      )
      const meta = DATASET_REGISTRY[comp.id]
      const expectedLag = meta?.knownLagDays ?? 3

      if (daysDiff > expectedLag + 3) {
        warnings.push(`${comp.name}: data stale (${daysDiff} days old)`)
      }
    }
  }

  return {
    asOf: computeDate,
    score,
    regimeLabel,
    components: regimeComponents,
    topDrivers,
    activeAlerts,
    warnings,
  }
}

/**
 * Convert score to categorical label
 */
function getRegimeLabel(score: number): RegimeLabel {
  if (score >= 75) return 'Stress'
  if (score >= 55) return 'Risk-Off'
  if (score >= 40) return 'Neutral'
  return 'Risk-On'
}

/**
 * Get color for regime label (for UI)
 */
export function getRegimeLabelColor(label: RegimeLabel): string {
  switch (label) {
    case 'Risk-On':
      return '#22c55e' // green
    case 'Neutral':
      return '#94a3b8' // gray
    case 'Risk-Off':
      return '#f59e0b' // amber
    case 'Stress':
      return '#dc2626' // red
  }
}

/**
 * Get description for regime label
 */
export function getRegimeLabelDescription(label: RegimeLabel): string {
  switch (label) {
    case 'Risk-On':
      return 'Market conditions favor risk-taking. Liquidity ample, credit tight, volatility low.'
    case 'Neutral':
      return 'Mixed signals. No strong directional bias in regime indicators.'
    case 'Risk-Off':
      return 'Elevated caution warranted. Some stress indicators elevated but not extreme.'
    case 'Stress':
      return 'Multiple stress indicators firing. Historically associated with risk-off episodes.'
  }
}
