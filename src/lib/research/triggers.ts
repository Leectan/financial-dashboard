/**
 * Layer B: Trigger Stats & Event Study
 *
 * Computes conditional probabilities for defined trigger conditions.
 * Uses Wilson score interval for confidence bounds.
 */

import type { TriggerStat, TriggerType, TriggerThresholds } from './types'

// ============================================================================
// Default Thresholds
// ============================================================================

export const DEFAULT_THRESHOLDS: TriggerThresholds = {
  srfAcceptedThreshold: 0, // Any SRF usage
  rmpWowChangeThreshold: 25, // $25B weekly increase
  liquidityPercentileThreshold: 20, // Bottom quintile
  hyOasThreshold: 5, // 5% HY OAS
  hyOas3mChangeThreshold: 1, // 1% widening over 3 months
  vixThreshold: 25, // VIX > 25
  yieldCurveSpreadThreshold: 0, // Inverted curve
}

// ============================================================================
// Trigger Definitions
// ============================================================================

interface TriggerDefinition {
  id: TriggerType
  name: string
  description: string
  evaluate: (data: Record<string, number | null>, thresholds: TriggerThresholds) => boolean
}

export const TRIGGER_DEFINITIONS: TriggerDefinition[] = [
  {
    id: 'srf_takeup',
    name: 'SRF Take-up',
    description: 'Standing Repo Facility usage > 0',
    evaluate: (data, thresholds) => {
      const v = data['srf_accepted'] ?? null
      return v !== null && v > (thresholds.srfAcceptedThreshold ?? 0)
    },
  },
  {
    id: 'rmp_increase',
    name: 'RMP Bills Increase',
    description: 'SOMA Treasury bills WoW change > threshold',
    evaluate: (data, thresholds) => {
      const v = data['rmp_wow_change'] ?? null
      return v !== null && v > (thresholds.rmpWowChangeThreshold ?? 25)
    },
  },
  {
    id: 'liquidity_stress',
    name: 'Liquidity Stress',
    description: 'Net liquidity percentile below threshold',
    evaluate: (data, thresholds) => {
      const v = data['net_liquidity_pctile'] ?? null
      return v !== null && v < (thresholds.liquidityPercentileThreshold ?? 20)
    },
  },
  {
    id: 'credit_stress',
    name: 'Credit Stress',
    description: 'HY OAS above threshold or widening significantly',
    evaluate: (data, thresholds) => {
      const level = data['hy_oas'] ?? null
      const change = data['hy_oas_3m_change'] ?? null
      const levelThreshold = thresholds.hyOasThreshold ?? 5
      const changeThreshold = thresholds.hyOas3mChangeThreshold ?? 1

      const levelTrigger = level !== null && level > levelThreshold
      const changeTrigger = change !== null && change > changeThreshold

      return levelTrigger || changeTrigger
    },
  },
  {
    id: 'volatility_spike',
    name: 'Volatility Spike',
    description: 'VIX above threshold',
    evaluate: (data, thresholds) => {
      const v = data['vix'] ?? null
      return v !== null && v > (thresholds.vixThreshold ?? 25)
    },
  },
  {
    id: 'yield_curve_inversion',
    name: 'Yield Curve Inversion',
    description: '10Y-2Y spread below zero',
    evaluate: (data, thresholds) => {
      const v = data['yield_curve_spread'] ?? null
      return v !== null && v < (thresholds.yieldCurveSpreadThreshold ?? 0)
    },
  },
]

// ============================================================================
// Wilson Score Confidence Interval
// ============================================================================

/**
 * Compute Wilson score interval for a proportion
 * More accurate than normal approximation, especially for small samples
 *
 * @param successes - Number of successes
 * @param total - Total trials
 * @param z - Z-score for confidence level (1.96 for 95%)
 * @returns [lower, upper] bounds
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z: number = 1.96
): [number, number] {
  if (total === 0) return [0, 1]

  const p = successes / total
  const denominator = 1 + z * z / total
  const center = p + z * z / (2 * total)
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)

  const lower = Math.max(0, (center - spread) / denominator)
  const upper = Math.min(1, (center + spread) / denominator)

  return [lower, upper]
}

// ============================================================================
// Trigger Statistics Computation
// ============================================================================

interface AlignedDataRow {
  date: string
  values: Record<string, number | null>
}

/**
 * Evaluate triggers for each row of aligned data
 */
export function evaluateTriggers(
  rows: AlignedDataRow[],
  thresholds: TriggerThresholds = DEFAULT_THRESHOLDS
): Map<TriggerType, boolean[]> {
  const results = new Map<TriggerType, boolean[]>()

  for (const trigger of TRIGGER_DEFINITIONS) {
    const fired: boolean[] = []
    for (const row of rows) {
      fired.push(trigger.evaluate(row.values, thresholds))
    }
    results.set(trigger.id, fired)
  }

  return results
}

/**
 * Compute trigger statistics for an outcome variable
 *
 * @param triggerFired - Boolean array of when trigger fired
 * @param outcomeOccurred - Boolean array of when outcome occurred
 * @param horizonDays - Forward horizon for outcome (not used in simple version)
 * @param triggerId - Trigger identifier
 */
export function computeTriggerStat(
  triggerFired: boolean[],
  outcomeOccurred: boolean[],
  horizonDays: number,
  triggerId: TriggerType,
  triggerName: string
): TriggerStat {
  if (triggerFired.length !== outcomeOccurred.length) {
    throw new Error('Arrays must have same length')
  }

  const n = triggerFired.length
  let totalTriggers = 0
  let triggersWithOutcome = 0
  let totalOutcomes = 0

  for (let i = 0; i < n; i++) {
    if (outcomeOccurred[i]) totalOutcomes++
    if (triggerFired[i]) {
      totalTriggers++
      if (outcomeOccurred[i]) triggersWithOutcome++
    }
  }

  const baseRate = n > 0 ? totalOutcomes / n : 0
  const conditionalRate = totalTriggers > 0 ? triggersWithOutcome / totalTriggers : 0
  const lift = baseRate > 0 ? conditionalRate / baseRate : 0

  const ci95 = wilsonInterval(triggersWithOutcome, totalTriggers)

  const notes: string[] = []
  if (totalTriggers < 10) {
    notes.push('Low trigger count - interpret with caution')
  }
  if (lift > 2) {
    notes.push('Significant lift detected')
  }

  return {
    triggerId,
    triggerName,
    horizonDays,
    triggeredCount: totalTriggers,
    outcomeCount: triggersWithOutcome,
    baseRate: Math.round(baseRate * 10000) / 10000,
    conditionalRate: Math.round(conditionalRate * 10000) / 10000,
    lift: Math.round(lift * 100) / 100,
    ci95: [Math.round(ci95[0] * 10000) / 10000, Math.round(ci95[1] * 10000) / 10000],
    notes,
  }
}

/**
 * Compute forward-looking outcome occurrence
 * For each date, check if outcome occurs within next N days
 *
 * @param outcomeValues - Array of outcome indicator (1 = occurred, 0 = not)
 * @param horizonDays - Forward horizon
 */
export function computeForwardOutcome(
  outcomeValues: (number | null)[],
  horizonDays: number
): boolean[] {
  const result: boolean[] = []

  for (let i = 0; i < outcomeValues.length; i++) {
    let foundOutcome = false

    // Look forward horizonDays
    for (let j = i; j < Math.min(i + horizonDays, outcomeValues.length); j++) {
      if (outcomeValues[j] === 1) {
        foundOutcome = true
        break
      }
    }

    result.push(foundOutcome)
  }

  return result
}

/**
 * Compute all trigger statistics for a given outcome
 */
export function computeAllTriggerStats(
  rows: AlignedDataRow[],
  outcomeKey: string,
  horizonDays: number,
  thresholds: TriggerThresholds = DEFAULT_THRESHOLDS
): TriggerStat[] {
  // Extract outcome values
  const outcomeValues = rows.map((r) => r.values[outcomeKey] ?? null)

  // Compute forward outcome
  const forwardOutcome = computeForwardOutcome(outcomeValues, horizonDays)

  // Evaluate all triggers
  const triggerResults = evaluateTriggers(rows, thresholds)

  // Compute stats for each trigger
  const stats: TriggerStat[] = []

  for (const trigger of TRIGGER_DEFINITIONS) {
    const fired = triggerResults.get(trigger.id)
    if (!fired) continue

    const stat = computeTriggerStat(fired, forwardOutcome, horizonDays, trigger.id, trigger.name)
    stats.push(stat)
  }

  return stats
}

/**
 * Get currently firing triggers
 */
export function getCurrentlyFiringTriggers(
  currentValues: Record<string, number | null>,
  thresholds: TriggerThresholds = DEFAULT_THRESHOLDS
): TriggerDefinition[] {
  return TRIGGER_DEFINITIONS.filter((trigger) => trigger.evaluate(currentValues, thresholds))
}
