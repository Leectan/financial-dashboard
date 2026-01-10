/**
 * Layer A: Rolling Correlations Engine
 *
 * Computes rolling Pearson and Spearman correlations between indicator pairs.
 * Spearman is more robust to outliers and non-linear relationships.
 */

import type { RollingCorrelation, CorrelationPair } from './types'

// ============================================================================
// Correlation Computation
// ============================================================================

/**
 * Compute Pearson correlation coefficient between two arrays
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return NaN

  const n = x.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0
  let sumY2 = 0

  for (let i = 0; i < n; i++) {
    sumX += x[i]!
    sumY += y[i]!
    sumXY += x[i]! * y[i]!
    sumX2 += x[i]! * x[i]!
    sumY2 += y[i]! * y[i]!
  }

  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

  if (denominator === 0) return 0
  return numerator / denominator
}

/**
 * Compute ranks for Spearman correlation
 */
function computeRanks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ value: v, index: i }))
  indexed.sort((a, b) => a.value - b.value)

  const ranks = new Array(values.length)

  let i = 0
  while (i < indexed.length) {
    let j = i
    // Find ties
    while (j < indexed.length && indexed[j]!.value === indexed[i]!.value) {
      j++
    }
    // Assign average rank to ties
    const avgRank = (i + j + 1) / 2
    for (let k = i; k < j; k++) {
      ranks[indexed[k]!.index] = avgRank
    }
    i = j
  }

  return ranks
}

/**
 * Compute Spearman rank correlation coefficient
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return NaN

  const rankX = computeRanks(x)
  const rankY = computeRanks(y)

  return pearsonCorrelation(rankX, rankY)
}

// ============================================================================
// Rolling Correlations
// ============================================================================

/**
 * Compute rolling correlation between two series
 */
export function rollingCorrelation(
  x: (number | null)[],
  y: (number | null)[],
  window: number,
  method: 'pearson' | 'spearman' = 'pearson'
): (number | null)[] {
  if (x.length !== y.length) {
    throw new Error('Series must have same length')
  }

  const result: (number | null)[] = []
  const corrFn = method === 'pearson' ? pearsonCorrelation : spearmanCorrelation

  for (let i = 0; i < x.length; i++) {
    if (i < window - 1) {
      result.push(null)
      continue
    }

    // Extract window values, filtering out nulls
    const xWindow: number[] = []
    const yWindow: number[] = []

    for (let j = i - window + 1; j <= i; j++) {
      const xv = x[j] ?? null
      const yv = y[j] ?? null
      if (xv !== null && yv !== null) {
        xWindow.push(xv)
        yWindow.push(yv)
      }
    }

    // Need at least 10 valid pairs for meaningful correlation
    if (xWindow.length < 10) {
      result.push(null)
      continue
    }

    const corr = corrFn(xWindow, yWindow)
    result.push(Number.isNaN(corr) ? null : corr)
  }

  return result
}

// ============================================================================
// Multi-Series Correlation Matrix
// ============================================================================

/** Series IDs used for correlation analysis */
export const CORRELATION_SERIES = [
  'hy_oas',
  'vix',
  'yield_curve_spread',
  'net_liquidity_pctile',
  'sp500_drawdown',
] as const

export type CorrelationSeriesId = (typeof CORRELATION_SERIES)[number]

/**
 * Compute correlation matrix for all pairs at a single point in time
 */
export function computeCorrelationPairs(
  alignedSeries: Record<string, (number | null)[]>,
  endIndex: number,
  window: number
): CorrelationPair[] {
  const pairs: CorrelationPair[] = []
  const seriesIds = Object.keys(alignedSeries)

  for (let i = 0; i < seriesIds.length; i++) {
    for (let j = i + 1; j < seriesIds.length; j++) {
      const aId = seriesIds[i]!
      const bId = seriesIds[j]!
      const aSeries = alignedSeries[aId]!
      const bSeries = alignedSeries[bId]!

      // Extract window
      const startIdx = Math.max(0, endIndex - window + 1)
      const aWindow: number[] = []
      const bWindow: number[] = []

      for (let k = startIdx; k <= endIndex; k++) {
        const av = aSeries[k] ?? null
        const bv = bSeries[k] ?? null
        if (av !== null && bv !== null) {
          aWindow.push(av)
          bWindow.push(bv)
        }
      }

      if (aWindow.length < 10) {
        pairs.push({ a: aId, b: bId, pearson: NaN, spearman: NaN })
        continue
      }

      pairs.push({
        a: aId,
        b: bId,
        pearson: pearsonCorrelation(aWindow, bWindow),
        spearman: spearmanCorrelation(aWindow, bWindow),
      })
    }
  }

  return pairs
}

/**
 * Compute rolling correlations for multiple windows
 */
export function computeRollingCorrelations(
  alignedSeries: Record<string, (number | null)[]>,
  grid: string[],
  windows: { label: string; days: number }[] = [
    { label: '20d', days: 20 },
    { label: '60d', days: 60 },
    { label: '126d', days: 126 },
    { label: '252d', days: 252 },
  ]
): RollingCorrelation[] {
  if (grid.length === 0) return []

  const latestIndex = grid.length - 1
  const latestDate = grid[latestIndex]!

  const results: RollingCorrelation[] = []

  for (const { label, days } of windows) {
    const pairs = computeCorrelationPairs(alignedSeries, latestIndex, days)

    results.push({
      asOf: latestDate,
      window: label,
      windowDays: days,
      pairs: pairs.filter((p) => !Number.isNaN(p.pearson) && !Number.isNaN(p.spearman)),
    })
  }

  return results
}

/**
 * Get the top N most extreme correlations (positive or negative)
 */
export function getTopCorrelations(
  correlations: RollingCorrelation,
  n: number = 5,
  method: 'pearson' | 'spearman' = 'spearman'
): CorrelationPair[] {
  const sorted = [...correlations.pairs].sort((a, b) => {
    const aVal = method === 'pearson' ? Math.abs(a.pearson) : Math.abs(a.spearman)
    const bVal = method === 'pearson' ? Math.abs(b.pearson) : Math.abs(b.spearman)
    return bVal - aVal
  })

  return sorted.slice(0, n)
}
