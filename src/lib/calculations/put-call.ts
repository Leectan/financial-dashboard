import { yahooFinanceClient } from '@/lib/api-clients/yahoo-finance'

export interface PutCallPoint {
  date: string
  ratio: number
  smoothed: number | null
  index: number | null
}

export interface PutCallResult {
  history: PutCallPoint[]
  current: PutCallPoint | null
}

function smooth(values: number[], window: number): number[] {
  const out: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      const v = values[i] ?? 0
      out.push(v)
      continue
    }
    let sum = 0
    for (let j = i - window + 1; j <= i; j++) {
      const v = values[j] ?? 0
      sum += v
    }
    out.push(sum / window)
  }
  return out
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

export async function computePutCallIndex(range: '5y' | '10y' = '5y', fresh: boolean = false): Promise<PutCallResult> {
  // NOTE: Symbol ^PCALL is widely used for CBOE total put/call ratio on Yahoo Finance,
  // but should be verified in the running environment.
  const history = await yahooFinanceClient.getSymbolHistory('^PCALL', range, '1d', fresh)
  if (!history.length) return { history: [], current: null }

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const ratios = sorted.map((p) => p.price)
  const smoothed = smooth(ratios, 5)

  const valid = smoothed.filter((v) => !Number.isNaN(v))
  const result: PutCallPoint[] = []
  for (let i = 0; i < sorted.length; i++) {
    const r = ratios[i] ?? 0
    const s = smoothed[i] ?? null
    const idx = s != null ? 100 - percentile(valid, s) : null
    const baseDate = sorted[0]?.date ?? new Date().toISOString().slice(0, 10)
    const date = sorted[i]?.date ?? baseDate
    result.push({
      date,
      ratio: r,
      smoothed: s,
      index: idx,
    })
  }

  const current = result[result.length - 1] ?? null
  return { history: result, current }
}


