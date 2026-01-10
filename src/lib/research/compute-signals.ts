/**
 * Main Signal Computation Engine
 *
 * Orchestrates data fetching, alignment, and computation of all regime signals.
 * This module is called by the API route and cron warmer.
 */

import { fredAPI } from '@/lib/api-clients/fred'
import type {
  RegimeSignalsResponse,
  RegimeScore,
  RollingCorrelation,
  TriggerStat,
  TimePoint,
} from './types'
import {
  generateBusinessDayGrid,
  alignToGrid,
  expandingPercentile,
  nDayChange,
  formatDate,
  subtractDays,
} from './alignment'
import { computeRollingCorrelations } from './correlations'
import { computeAllTriggerStats, DEFAULT_THRESHOLDS } from './triggers'
import { computeRegimeScore } from './regime-score'
import { DATASET_REGISTRY } from './dataset-registry'

// ============================================================================
// Data Fetching
// ============================================================================

interface FetchedSeries {
  id: string
  points: TimePoint[]
  lagDays: number
}

/**
 * Fetch all required FRED series for regime signals
 */
async function fetchFREDSeries(startDate: string): Promise<FetchedSeries[]> {
  const seriesConfigs = [
    { id: 'hy_oas', fredId: 'BAMLH0A0HYM2', lagDays: 1 },
    { id: 'ig_oas', fredId: 'BAMLC0A0CM', lagDays: 1 },
    { id: 'vix', fredId: 'VIXCLS', lagDays: 1 },
    { id: 'yield_curve_spread', fredId: 'T10Y2Y', lagDays: 1 },
    { id: 'rrp', fredId: 'RRPONTSYD', lagDays: 1 },
    { id: 'recession', fredId: 'USREC', lagDays: 30 },
  ]

  const results: FetchedSeries[] = []

  await Promise.all(
    seriesConfigs.map(async ({ id, fredId, lagDays }) => {
      try {
        const data = await fredAPI.getSeriesFromStart(fredId, startDate)
        const points: TimePoint[] = data
          .map((obs) => ({
            date: obs.date,
            value: parseFloat(obs.value),
          }))
          .filter((p) => !Number.isNaN(p.value))
          .sort((a, b) => a.date.localeCompare(b.date))

        results.push({ id, points, lagDays })
      } catch (error) {
        console.warn(`Failed to fetch ${fredId}:`, error)
        results.push({ id, points: [], lagDays })
      }
    })
  )

  return results
}

/**
 * Fetch liquidity components and compute net liquidity
 */
async function fetchLiquiditySeries(startDate: string): Promise<FetchedSeries> {
  try {
    // Fetch components
    const [walcl, tga, rrp] = await Promise.all([
      fredAPI.getSeriesFromStart('WALCL', startDate), // Fed balance sheet
      fredAPI.getSeriesFromStart('WTREGEN', startDate), // TGA
      fredAPI.getSeriesFromStart('RRPONTSYD', startDate), // ON RRP
    ])

    // Convert to maps for alignment
    const walclMap = new Map(walcl.map((o) => [o.date, parseFloat(o.value)]))
    const tgaMap = new Map(tga.map((o) => [o.date, parseFloat(o.value)]))
    const rrpMap = new Map(rrp.map((o) => [o.date, parseFloat(o.value)]))

    // Get all unique dates
    const allDates = new Set([...walclMap.keys(), ...tgaMap.keys(), ...rrpMap.keys()])
    const sortedDates = Array.from(allDates).sort()

    // Compute net liquidity with forward-fill
    let lastWalcl = 0
    let lastTga = 0
    let lastRrp = 0

    const points: TimePoint[] = []

    for (const date of sortedDates) {
      if (walclMap.has(date)) lastWalcl = walclMap.get(date)!
      if (tgaMap.has(date)) lastTga = tgaMap.get(date)!
      if (rrpMap.has(date)) lastRrp = rrpMap.get(date)!

      // Net liquidity = WALCL - TGA - RRP (in billions)
      const netLiquidity = lastWalcl - lastTga / 1000 - lastRrp / 1000

      if (lastWalcl > 0) {
        points.push({ date, value: netLiquidity })
      }
    }

    return { id: 'net_liquidity', points, lagDays: 7 }
  } catch (error) {
    console.warn('Failed to compute net liquidity:', error)
    return { id: 'net_liquidity', points: [], lagDays: 7 }
  }
}

// ============================================================================
// Main Computation
// ============================================================================

const SIGNAL_VERSION = 'v1.0.0'
const MIN_HISTORY_DAYS = 252 * 2 // 2 years minimum for percentiles

/**
 * Compute all regime signals
 *
 * @param fresh - If true, bypass any internal caching
 */
export async function computeRegimeSignals(fresh: boolean = false): Promise<RegimeSignalsResponse> {
  const computeStart = Date.now()
  const today = formatDate(new Date())

  // Use 10 years of history for percentile calculations
  const startDate = subtractDays(today, 365 * 10)

  // Fetch all data
  const [fredSeries, liquiditySeries] = await Promise.all([
    fetchFREDSeries(startDate),
    fetchLiquiditySeries(startDate),
  ])

  const allSeries = [...fredSeries, liquiditySeries]

  // Find common date range
  const seriesWithData = allSeries.filter((s) => s.points.length > 0)
  if (seriesWithData.length === 0) {
    throw new Error('No data available for regime signal computation')
  }

  const minDate = seriesWithData
    .map((s) => s.points[0]?.date ?? '9999-12-31')
    .sort()[seriesWithData.length - 1]!

  const maxDate = seriesWithData
    .map((s) => s.points[s.points.length - 1]?.date ?? '1900-01-01')
    .sort()
    .reverse()[0]!

  // Generate business day grid
  const grid = generateBusinessDayGrid(minDate, maxDate)

  if (grid.length < MIN_HISTORY_DAYS) {
    throw new Error(`Insufficient history: ${grid.length} days (need ${MIN_HISTORY_DAYS})`)
  }

  // Align all series to grid
  const alignedSeries: Record<string, (number | null)[]> = {}
  const seriesAsOf: Record<string, string> = {}

  for (const series of allSeries) {
    if (series.points.length === 0) continue

    alignedSeries[series.id] = alignToGrid(series.points, grid, series.lagDays)
    seriesAsOf[series.id] = series.points[series.points.length - 1]?.date ?? 'N/A'
  }

  // Compute derived series
  // HY OAS 3-month change (63 business days)
  if (alignedSeries['hy_oas']) {
    alignedSeries['hy_oas_3m_change'] = nDayChange(alignedSeries['hy_oas'], 63)
  }

  // Net liquidity percentile
  if (alignedSeries['net_liquidity']) {
    alignedSeries['net_liquidity_pctile'] = expandingPercentile(alignedSeries['net_liquidity'], 252)
  }

  // VIX percentile
  if (alignedSeries['vix']) {
    alignedSeries['vix_pctile'] = expandingPercentile(alignedSeries['vix'], 252)
  }

  // HY OAS percentile
  if (alignedSeries['hy_oas']) {
    alignedSeries['hy_oas_pctile'] = expandingPercentile(alignedSeries['hy_oas'], 252)
  }

  // Yield curve spread percentile (inverted - lower is worse)
  if (alignedSeries['yield_curve_spread']) {
    alignedSeries['yield_curve_pctile'] = expandingPercentile(
      alignedSeries['yield_curve_spread'],
      252
    )
  }

  // =========================================================================
  // Compute Layer A: Rolling Correlations
  // =========================================================================
  const correlationSeries: Record<string, (number | null)[]> = {
    hy_oas: alignedSeries['hy_oas'] ?? [],
    vix: alignedSeries['vix'] ?? [],
    yield_curve_spread: alignedSeries['yield_curve_spread'] ?? [],
    net_liquidity_pctile: alignedSeries['net_liquidity_pctile'] ?? [],
  }

  const correlations = computeRollingCorrelations(correlationSeries, grid, [
    { label: '60d', days: 60 },
    { label: '126d', days: 126 },
  ])

  // =========================================================================
  // Compute Layer B: Trigger Stats
  // =========================================================================
  // Build row-based data for trigger evaluation
  const rows = grid.map((date, i) => ({
    date,
    values: {
      hy_oas: alignedSeries['hy_oas']?.[i] ?? null,
      hy_oas_3m_change: alignedSeries['hy_oas_3m_change']?.[i] ?? null,
      vix: alignedSeries['vix']?.[i] ?? null,
      yield_curve_spread: alignedSeries['yield_curve_spread']?.[i] ?? null,
      net_liquidity_pctile: alignedSeries['net_liquidity_pctile']?.[i] ?? null,
      srf_accepted: null, // Modern data - would need separate fetch
      rmp_wow_change: null, // Modern data - would need separate fetch
      recession: alignedSeries['recession']?.[i] ?? null,
    },
  }))

  // Compute trigger stats for recession outcome (12 month horizon = ~252 days)
  let triggerStats: TriggerStat[] = []
  try {
    triggerStats = computeAllTriggerStats(rows, 'recession', 252, DEFAULT_THRESHOLDS)
  } catch (error) {
    console.warn('Failed to compute trigger stats:', error)
  }

  // =========================================================================
  // Compute Layer C: Regime Score
  // =========================================================================
  const latestIndex = grid.length - 1
  const latestDate = grid[latestIndex]!

  const componentInputs: Record<string, { value: number | null; percentile: number | null; asOf: string }> = {
    credit_stress: {
      value: alignedSeries['hy_oas']?.[latestIndex] ?? null,
      percentile: alignedSeries['hy_oas_pctile']?.[latestIndex] ?? null,
      asOf: seriesAsOf['hy_oas'] ?? 'N/A',
    },
    liquidity_stress: {
      value: alignedSeries['net_liquidity']?.[latestIndex] ?? null,
      percentile: alignedSeries['net_liquidity_pctile']?.[latestIndex] ?? null,
      asOf: seriesAsOf['net_liquidity'] ?? 'N/A',
    },
    volatility: {
      value: alignedSeries['vix']?.[latestIndex] ?? null,
      percentile: alignedSeries['vix_pctile']?.[latestIndex] ?? null,
      asOf: seriesAsOf['vix'] ?? 'N/A',
    },
    funding_stress: {
      value: null, // Would need SRF data
      percentile: null,
      asOf: 'N/A',
    },
    curve_inversion: {
      value: alignedSeries['yield_curve_spread']?.[latestIndex] ?? null,
      percentile: alignedSeries['yield_curve_pctile']?.[latestIndex] ?? null,
      asOf: seriesAsOf['yield_curve_spread'] ?? 'N/A',
    },
  }

  const currentValues: Record<string, number | null> = {
    hy_oas: alignedSeries['hy_oas']?.[latestIndex] ?? null,
    hy_oas_3m_change: alignedSeries['hy_oas_3m_change']?.[latestIndex] ?? null,
    vix: alignedSeries['vix']?.[latestIndex] ?? null,
    yield_curve_spread: alignedSeries['yield_curve_spread']?.[latestIndex] ?? null,
    net_liquidity_pctile: alignedSeries['net_liquidity_pctile']?.[latestIndex] ?? null,
    srf_accepted: null,
    rmp_wow_change: null,
  }

  const regime = computeRegimeScore(componentInputs, currentValues, latestDate)

  // =========================================================================
  // Build Response
  // =========================================================================
  const computeTime = Date.now() - computeStart
  console.log(`Regime signals computed in ${computeTime}ms`)

  return {
    regime,
    correlations,
    triggerStats,
    meta: {
      computedAt: new Date().toISOString(),
      version: SIGNAL_VERSION,
      dataRange: {
        start: grid[0] ?? startDate,
        end: latestDate,
      },
    },
  }
}
