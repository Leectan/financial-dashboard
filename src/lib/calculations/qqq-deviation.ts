import { yahooFinanceClient } from '@/lib/api-clients/yahoo-finance'

export interface QQQDeviationPoint {
  date: string
  price: number
  ma200: number | null
  deviationPct: number | null
  index: number | null
}

export interface QQQDeviationResult {
  history: QQQDeviationPoint[]
  current: QQQDeviationPoint | null
}

function percentileIndex(values: number[], value: number): number {
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

export async function computeQQQDeviation(range: '10y' | 'max' = '10y', fresh: boolean = false): Promise<QQQDeviationResult> {
  const history = await yahooFinanceClient.getSymbolHistory('QQQ', range, '1d', fresh)
  if (!history.length) {
    return { history: [], current: null }
  }

  // Ensure sorted by date ascending
  const points = [...history].sort((a, b) => a.date.localeCompare(b.date))

  const result: QQQDeviationPoint[] = []
  const window = 200

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const { date, price } = p
    if (i < window - 1) {
      result.push({ date, price, ma200: null, deviationPct: null, index: null })
      continue
    }

    let sum = 0
    for (let j = i - window + 1; j <= i; j++) {
      const pj = points[j]
      if (!pj) continue
      sum += pj.price
    }
    const ma200 = sum / window
    const deviationPct = ((price - ma200) / ma200) * 100
    result.push({ date, price, ma200, deviationPct, index: null })
  }

  const devValues = result
    .map((p) => p.deviationPct)
    .filter((v): v is number => v != null && !Number.isNaN(v))

  for (const p of result) {
    if (p.deviationPct == null) continue
    p.index = percentileIndex(devValues, p.deviationPct)
  }

  const current = result[result.length - 1] ?? null

  return {
    history: result,
    current,
  }
}


