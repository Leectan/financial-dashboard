/**
 * Time Grid Alignment Utilities
 *
 * Critical for avoiding lookahead bias in regime signal computations.
 * All functions use ISO date strings (YYYY-MM-DD) for consistency.
 */

import type { TimePoint, DatasetMetadata } from './types'

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Parse ISO date string to Date object (UTC midnight)
 */
export function parseDate(iso: string): Date {
  return new Date(iso + 'T00:00:00Z')
}

/**
 * Format Date to ISO date string
 */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Add days to a date
 */
export function addDays(iso: string, days: number): string {
  const d = parseDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return formatDate(d)
}

/**
 * Subtract days from a date
 */
export function subtractDays(iso: string, days: number): string {
  return addDays(iso, -days)
}

/**
 * Get the difference in days between two dates
 */
export function daysBetween(start: string, end: string): number {
  const startD = parseDate(start)
  const endD = parseDate(end)
  return Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Check if a date is a weekday (Mon-Fri)
 */
export function isWeekday(iso: string): boolean {
  const d = parseDate(iso)
  const day = d.getUTCDay()
  return day !== 0 && day !== 6
}

/**
 * Get the previous business day
 */
export function previousBusinessDay(iso: string): string {
  let d = parseDate(iso)
  do {
    d.setUTCDate(d.getUTCDate() - 1)
  } while (!isWeekday(formatDate(d)))
  return formatDate(d)
}

// ============================================================================
// Time Grid Generation
// ============================================================================

/**
 * Generate a daily time grid between start and end dates (inclusive)
 */
export function generateDailyGrid(start: string, end: string): string[] {
  const grid: string[] = []
  let current = start
  while (current <= end) {
    grid.push(current)
    current = addDays(current, 1)
  }
  return grid
}

/**
 * Generate a business day time grid (Mon-Fri only)
 */
export function generateBusinessDayGrid(start: string, end: string): string[] {
  const grid: string[] = []
  let current = start
  while (current <= end) {
    if (isWeekday(current)) {
      grid.push(current)
    }
    current = addDays(current, 1)
  }
  return grid
}

/**
 * Generate a weekly time grid (every Friday)
 */
export function generateWeeklyGrid(start: string, end: string): string[] {
  const grid: string[] = []
  let d = parseDate(start)

  // Move to first Friday on or after start
  while (d.getUTCDay() !== 5) {
    d.setUTCDate(d.getUTCDate() + 1)
  }

  while (formatDate(d) <= end) {
    grid.push(formatDate(d))
    d.setUTCDate(d.getUTCDate() + 7)
  }

  return grid
}

// ============================================================================
// Series Alignment (Critical for No-Lookahead)
// ============================================================================

/**
 * Get the value as-of a given date, respecting publication lag.
 *
 * Returns the last known value that would have been available on `asOfDate`,
 * after applying the publication lag.
 *
 * @param series - Sorted ascending time series
 * @param asOfDate - The date we're computing for
 * @param lagDays - Publication lag in days
 * @returns The value or null if no data available
 */
export function valueAsOf(
  series: TimePoint[],
  asOfDate: string,
  lagDays: number = 0
): { value: number; date: string } | null {
  if (series.length === 0) return null

  // The effective cutoff date: we can only use data published before this
  const effectiveCutoff = subtractDays(asOfDate, lagDays)

  // Binary search for the last point <= effectiveCutoff
  let low = 0
  let high = series.length - 1
  let result: TimePoint | null = null

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const point = series[mid]
    if (!point) break

    if (point.date <= effectiveCutoff) {
      result = point
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return result ? { value: result.value, date: result.date } : null
}

/**
 * Align a series to a time grid, forward-filling values with lag.
 *
 * @param series - Original time series (sorted ascending)
 * @param grid - Target time grid
 * @param lagDays - Publication lag
 * @returns Aligned series with same length as grid
 */
export function alignToGrid(
  series: TimePoint[],
  grid: string[],
  lagDays: number = 0
): (number | null)[] {
  const aligned: (number | null)[] = []

  for (const date of grid) {
    const asOf = valueAsOf(series, date, lagDays)
    aligned.push(asOf?.value ?? null)
  }

  return aligned
}

/**
 * Align multiple series to a common grid
 */
export function alignMultipleSeries(
  seriesMap: Record<string, { points: TimePoint[]; lagDays: number }>,
  grid: string[]
): Record<string, (number | null)[]> {
  const result: Record<string, (number | null)[]> = {}

  for (const [id, { points, lagDays }] of Object.entries(seriesMap)) {
    result[id] = alignToGrid(points, grid, lagDays)
  }

  return result
}

// ============================================================================
// Series Statistics
// ============================================================================

/**
 * Compute the rolling mean of a series
 */
export function rollingMean(values: (number | null)[], window: number): (number | null)[] {
  const result: (number | null)[] = []

  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      result.push(null)
      continue
    }

    let sum = 0
    let count = 0
    for (let j = i - window + 1; j <= i; j++) {
      const v = values[j]
      if (v !== null && v !== undefined) {
        sum += v
        count++
      }
    }

    result.push(count > 0 ? sum / count : null)
  }

  return result
}

/**
 * Compute N-day change (value[i] - value[i-n])
 */
export function nDayChange(values: (number | null)[], n: number): (number | null)[] {
  const result: (number | null)[] = []

  for (let i = 0; i < values.length; i++) {
    if (i < n) {
      result.push(null)
      continue
    }

    const current = values[i] ?? null
    const previous = values[i - n] ?? null

    if (current === null || previous === null) {
      result.push(null)
    } else {
      result.push(current - previous)
    }
  }

  return result
}

/**
 * Compute N-day percent change
 */
export function nDayPercentChange(values: (number | null)[], n: number): (number | null)[] {
  const result: (number | null)[] = []

  for (let i = 0; i < values.length; i++) {
    if (i < n) {
      result.push(null)
      continue
    }

    const current = values[i] ?? null
    const previous = values[i - n] ?? null

    if (current === null || previous === null || previous === 0) {
      result.push(null)
    } else {
      result.push(((current - previous) / Math.abs(previous)) * 100)
    }
  }

  return result
}

/**
 * Compute expanding percentile rank (no lookahead - uses only data up to each point)
 */
export function expandingPercentile(values: (number | null)[], minWindow: number = 252): (number | null)[] {
  const result: (number | null)[] = []

  for (let i = 0; i < values.length; i++) {
    const current = values[i] ?? null
    if (current === null || i < minWindow - 1) {
      result.push(null)
      continue
    }

    // Collect all non-null values up to and including current point
    const historicalValues: number[] = []
    for (let j = 0; j <= i; j++) {
      const v = values[j]
      if (v !== null && v !== undefined) {
        historicalValues.push(v)
      }
    }

    if (historicalValues.length < minWindow) {
      result.push(null)
      continue
    }

    // Count how many values are <= current
    const rank = historicalValues.filter((v) => v <= current).length
    const percentile = ((rank - 1) / (historicalValues.length - 1)) * 100

    result.push(Math.max(0, Math.min(100, percentile)))
  }

  return result
}

/**
 * Compute expanding z-score (no lookahead)
 */
export function expandingZScore(values: (number | null)[], minWindow: number = 252): (number | null)[] {
  const result: (number | null)[] = []

  for (let i = 0; i < values.length; i++) {
    const current = values[i] ?? null
    if (current === null || i < minWindow - 1) {
      result.push(null)
      continue
    }

    // Compute mean and std of values up to current point
    const historicalValues: number[] = []
    for (let j = 0; j <= i; j++) {
      const v = values[j]
      if (v !== null && v !== undefined) {
        historicalValues.push(v)
      }
    }

    if (historicalValues.length < minWindow) {
      result.push(null)
      continue
    }

    const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length
    const variance =
      historicalValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / historicalValues.length
    const std = Math.sqrt(variance)

    if (std === 0) {
      result.push(0)
    } else {
      result.push((current - mean) / std)
    }
  }

  return result
}
