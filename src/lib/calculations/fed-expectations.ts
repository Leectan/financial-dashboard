import { fredAPI, type FREDSeries } from '@/lib/api-clients/fred'
import { yahooFinanceClient } from '@/lib/api-clients/yahoo-finance'

export interface FedExpectationsPoint {
  date: string
  targetRate: number | null
  impliedRate: number | null
  easing: number | null
  index: number | null
}

export interface FedExpectationsResult {
  history: FedExpectationsPoint[]
  current: FedExpectationsPoint | null
}

function seriesToMap(series: FREDSeries): Record<string, number> {
  const map: Record<string, number> = {}
  for (const obs of series) {
    const v = parseFloat(obs.value)
    if (!Number.isNaN(v)) {
      map[obs.date] = v
    }
  }
  return map
}

function percentile(values: number[], value: number): number {
  if (!values.length) return 50
  const sorted = [...values].sort((a, b) => a - b)
  let count = 0
  for (const v of sorted) {
    if (v <= value) count++
    else break
  }
  const pct = (count - 1) / (sorted.length - 1 || 1)
  return Math.min(100, Math.max(0, pct * 100))
}

export async function computeFedExpectations(startISO: string = '2015-01-01', fresh: boolean = false): Promise<FedExpectationsResult> {
  // DFEDTARU: Federal Funds Target Range - Upper Limit (verify series ID in FRED)
  const targetSeries = await fredAPI.getSeriesFromStart('DFEDTARU', startISO, fresh)
  const targetMap = seriesToMap(targetSeries)

  // ZQ=F: generic Fed Funds futures continuous contract on Yahoo Finance (verify symbol)
  const futuresHistory = await yahooFinanceClient.getSymbolHistory('ZQ=F', '10y', '1d', fresh)
  if (!futuresHistory.length) {
    return { history: [], current: null }
  }
  const sorted = [...futuresHistory].sort((a, b) => a.date.localeCompare(b.date))

  const history: FedExpectationsPoint[] = []
  const easingValues: number[] = []

  for (const p of sorted) {
    const target = targetMap[p.date] ?? null
    const impliedRate = 100 - p.price // Fed funds futures quoted as 100 - implied rate
    let easing: number | null = null
    if (target != null) {
      const diff = target - impliedRate
      easing = diff > 0 ? diff : 0
      easingValues.push(easing)
    }
    history.push({
      date: p.date,
      targetRate: target,
      impliedRate,
      easing,
      index: null,
    })
  }

  const validEasing = easingValues.filter((v) => !Number.isNaN(v) && v >= 0)
  for (const h of history) {
    if (h.easing == null) continue
    h.index = percentile(validEasing, h.easing)
  }

  const current = history[history.length - 1] ?? null
  return { history, current }
}


