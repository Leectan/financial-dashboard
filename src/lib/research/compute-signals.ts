/**
 * Main Signal Computation Engine
 *
 * Orchestrates data fetching, alignment, and computation of all regime signals.
 * This module is called by the API route and cron warmer.
 *
 * IMPORTANT: Reuses existing production-grade calculators instead of re-implementing.
 */

import { fredAPI } from '@/lib/api-clients/fred'
import { computeLiquidity, type LiquidityResult } from '@/lib/calculations/liquidity'
import { computeSRFUsage, type SRFData } from '@/lib/calculations/srf'
import { computeRMPProxy, type RMPData } from '@/lib/calculations/rmp'
import type {
  RegimeSignalsResponse,
  TimePoint,
} from './types'
import {
  generateBusinessDayGrid,
  alignToGrid,
  expandingPercentile,
  nDayChange,
  formatDate,
  subtractDays,
  valueAsOf,
} from './alignment'
import { computeRollingCorrelations } from './correlations'
import { computeAllTriggerStats, DEFAULT_THRESHOLDS } from './triggers'
import { computeRegimeScore } from './regime-score'

// ============================================================================
// Data Fetching - Uses existing calculators where available
// ============================================================================

interface FetchedSeries {
  id: string
  points: TimePoint[]
  lagDays: number
}

/**
 * Fetch FRED series for regime signals
 * Only fetches series not covered by existing calculators
 */
async function fetchFREDSeries(startDate: string): Promise<FetchedSeries[]> {
  const seriesConfigs = [
    { id: 'hy_oas', fredId: 'BAMLH0A0HYM2', lagDays: 1 },
    { id: 'vix', fredId: 'VIXCLS', lagDays: 1 },
    { id: 'yield_curve_spread', fredId: 'T10Y2Y', lagDays: 1 },
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
 * Convert LiquidityResult to TimePoint array for alignment
 */
function liquidityToTimePoints(result: LiquidityResult): {
  netLiquidity: TimePoint[]
  liquidityIndex: TimePoint[]
} {
  const netLiquidity: TimePoint[] = []
  const liquidityIndex: TimePoint[] = []

  for (const pt of result.history) {
    netLiquidity.push({ date: pt.date, value: pt.netLiquidity })
    if (pt.index !== null) {
      liquidityIndex.push({ date: pt.date, value: pt.index })
    }
  }

  return { netLiquidity, liquidityIndex }
}

/**
 * Convert SRFData to TimePoint array for alignment
 */
function srfToTimePoints(data: SRFData): TimePoint[] {
  return data.history.map((pt) => ({
    date: pt.date,
    value: pt.accepted,
  }))
}

/**
 * Convert RMPData to TimePoint arrays for alignment
 */
function rmpToTimePoints(data: RMPData): {
  billsHeld: TimePoint[]
  wowChange: TimePoint[]
} {
  const billsHeld: TimePoint[] = []
  const wowChange: TimePoint[] = []

  for (const pt of data.history) {
    billsHeld.push({ date: pt.date, value: pt.billsHeldOutright })
    if (pt.wowChange !== null) {
      wowChange.push({ date: pt.date, value: pt.wowChange })
    }
  }

  return { billsHeld, wowChange }
}

// ============================================================================
// Main Computation
// ============================================================================

const SIGNAL_VERSION = 'v1.1.0'
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

  // Fetch all data using existing production calculators where available
  const [fredSeries, liquidityData, srfData, rmpData] = await Promise.all([
    fetchFREDSeries(startDate),
    computeLiquidity(startDate).catch((e) => {
      console.warn('Failed to compute liquidity:', e)
      return null
    }),
    computeSRFUsage().catch((e) => {
      console.warn('Failed to fetch SRF data:', e)
      return null
    }),
    computeRMPProxy().catch((e) => {
      console.warn('Failed to fetch RMP data:', e)
      return null
    }),
  ])

  // Convert calculator results to TimePoint arrays
  const liquidityPoints = liquidityData ? liquidityToTimePoints(liquidityData) : null
  const srfPoints = srfData ? srfToTimePoints(srfData) : []
  const rmpPoints = rmpData ? rmpToTimePoints(rmpData) : null

  // Combine all series
  const allSeries: FetchedSeries[] = [...fredSeries]

  if (liquidityPoints) {
    allSeries.push({ id: 'net_liquidity', points: liquidityPoints.netLiquidity, lagDays: 7 })
    allSeries.push({ id: 'liquidity_index', points: liquidityPoints.liquidityIndex, lagDays: 7 })
  }

  if (srfPoints.length > 0) {
    allSeries.push({ id: 'srf_accepted', points: srfPoints, lagDays: 0 })
  }

  if (rmpPoints) {
    allSeries.push({ id: 'rmp_bills', points: rmpPoints.billsHeld, lagDays: 3 })
    allSeries.push({ id: 'rmp_wow_change', points: rmpPoints.wowChange, lagDays: 3 })
  }

  // Find common date range
  const seriesWithData = allSeries.filter((s) => s.points.length > 0)
  if (seriesWithData.length === 0) {
    throw new Error('No data available for regime signal computation')
  }

  // Use HY OAS series as primary grid (most reliable daily coverage)
  const hyOasSeries = allSeries.find((s) => s.id === 'hy_oas')
  if (!hyOasSeries || hyOasSeries.points.length === 0) {
    throw new Error('HY OAS series required for regime computation')
  }

  const minDate = hyOasSeries.points[0]?.date ?? startDate
  const maxDate = hyOasSeries.points[hyOasSeries.points.length - 1]?.date ?? today

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

  // HY OAS percentile (expanding window, no lookahead)
  if (alignedSeries['hy_oas']) {
    alignedSeries['hy_oas_pctile'] = expandingPercentile(alignedSeries['hy_oas'], 252)
  }

  // VIX percentile
  if (alignedSeries['vix']) {
    alignedSeries['vix_pctile'] = expandingPercentile(alignedSeries['vix'], 252)
  }

  // Yield curve spread percentile
  if (alignedSeries['yield_curve_spread']) {
    alignedSeries['yield_curve_pctile'] = expandingPercentile(
      alignedSeries['yield_curve_spread'],
      252
    )
  }

  // SRF percentile (for when it's > 0)
  if (alignedSeries['srf_accepted']) {
    alignedSeries['srf_pctile'] = expandingPercentile(alignedSeries['srf_accepted'], 60)
  }

  // =========================================================================
  // Compute Layer A: Rolling Correlations
  // =========================================================================
  const correlationSeries: Record<string, (number | null)[]> = {
    hy_oas: alignedSeries['hy_oas'] ?? [],
    vix: alignedSeries['vix'] ?? [],
    yield_curve_spread: alignedSeries['yield_curve_spread'] ?? [],
  }

  // Only add liquidity if available
  if (alignedSeries['liquidity_index']) {
    correlationSeries['liquidity_index'] = alignedSeries['liquidity_index']
  }

  const correlations = computeRollingCorrelations(correlationSeries, grid, [
    { label: '60d', days: 60 },
    { label: '126d', days: 126 },
  ])

  // =========================================================================
  // Compute Layer B: Trigger Stats
  // =========================================================================
  const latestIndex = grid.length - 1

  // Build row-based data for trigger evaluation with ACTUAL data
  const rows = grid.map((date, i) => ({
    date,
    values: {
      hy_oas: alignedSeries['hy_oas']?.[i] ?? null,
      hy_oas_3m_change: alignedSeries['hy_oas_3m_change']?.[i] ?? null,
      vix: alignedSeries['vix']?.[i] ?? null,
      yield_curve_spread: alignedSeries['yield_curve_spread']?.[i] ?? null,
      net_liquidity_pctile: alignedSeries['liquidity_index']?.[i] ?? null,
      srf_accepted: alignedSeries['srf_accepted']?.[i] ?? null,
      rmp_wow_change: alignedSeries['rmp_wow_change']?.[i] ?? null,
      recession: alignedSeries['recession']?.[i] ?? null,
    },
  }))

  // Compute trigger stats for recession outcome (12 month horizon = ~252 days)
  let triggerStats: ReturnType<typeof computeAllTriggerStats> = []
  try {
    triggerStats = computeAllTriggerStats(rows, 'recession', 252, DEFAULT_THRESHOLDS)
  } catch (error) {
    console.warn('Failed to compute trigger stats:', error)
  }

  // =========================================================================
  // Compute Layer C: Regime Score
  // =========================================================================
  const latestDate = grid[latestIndex]!

  // Get latest values for each component
  const getLatestValue = (seriesId: string): number | null => {
    const series = alignedSeries[seriesId]
    if (!series) return null
    return series[latestIndex] ?? null
  }

  // Build component inputs with proper underlying dataset mapping
  const componentInputs: Record<string, { value: number | null; percentile: number | null; asOf: string; datasetId: string }> = {
    credit_stress: {
      value: getLatestValue('hy_oas'),
      percentile: getLatestValue('hy_oas_pctile'),
      asOf: seriesAsOf['hy_oas'] ?? 'N/A',
      datasetId: 'hy_oas',
    },
    liquidity_stress: {
      // Use the pre-computed liquidity index from existing calculator
      // Display value is YoY % change so humans can interpret negative values (e.g. -0.65%)
      value: liquidityData?.current?.yoyChange ?? null,
      percentile: liquidityData?.current?.index ?? null,
      asOf: liquidityData?.current?.date ?? 'N/A',
      datasetId: 'net_liquidity',
    },
    volatility: {
      value: getLatestValue('vix'),
      percentile: getLatestValue('vix_pctile'),
      asOf: seriesAsOf['vix'] ?? 'N/A',
      datasetId: 'vix',
    },
    funding_stress: {
      // Use actual SRF data
      value: srfData?.current?.accepted ?? null,
      percentile: getLatestValue('srf_pctile'),
      asOf: srfData?.current?.date ?? 'N/A',
      datasetId: 'srf_accepted',
    },
    curve_inversion: {
      value: getLatestValue('yield_curve_spread'),
      percentile: getLatestValue('yield_curve_pctile'),
      asOf: seriesAsOf['yield_curve_spread'] ?? 'N/A',
      datasetId: 'yield_curve_spread',
    },
  }

  // Current values for trigger evaluation (with actual SRF/RMP data)
  const currentValues: Record<string, number | null> = {
    hy_oas: getLatestValue('hy_oas'),
    hy_oas_3m_change: getLatestValue('hy_oas_3m_change'),
    vix: getLatestValue('vix'),
    yield_curve_spread: getLatestValue('yield_curve_spread'),
    net_liquidity_pctile: liquidityData?.current?.index ?? null,
    srf_accepted: srfData?.current?.accepted ?? null,
    rmp_wow_change: rmpData?.current?.wowChange ?? null,
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
