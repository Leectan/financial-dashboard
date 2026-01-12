import { fredAPI, type FREDSeries } from '@/lib/api-clients/fred'

export interface LiquidityPoint {
  date: string
  netLiquidity: number
  yoyChange: number | null
  index: number | null
}

export interface LiquidityResult {
  history: LiquidityPoint[]
  current: LiquidityPoint | null
}

type SeriesMap = Record<string, number>

type SeriesPoint = { date: string; value: number }

function toSeriesPoints(series: FREDSeries): SeriesPoint[] {
  const pts: SeriesPoint[] = []
  for (const obs of series) {
    const v = parseFloat(obs.value)
    if (!Number.isNaN(v) && typeof obs.date === 'string') {
      pts.push({ date: obs.date, value: v })
    }
  }
  return pts.sort((a, b) => a.date.localeCompare(b.date))
}

function makeAsOfGetter(points: SeriesPoint[]): (date: string) => number | null {
  let i = 0
  const n = points.length
  return (date: string) => {
    while (i < n) {
      const cur = points[i]
      if (!cur || cur.date > date) break
      i++
    }
    const idx = i - 1
    const p = idx >= 0 ? points[idx] : undefined
    return p ? p.value : null
  }
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

export async function computeLiquidity(startISO: string = '2003-01-01', fresh: boolean = false): Promise<LiquidityResult> {
  // WALCL - Fed balance sheet, WDTGAL/WTREGEN - TGA, RRPONTSYD - ON RRP
  const [walcl, tgaSeries, rrp] = await Promise.all([
    fredAPI.getSeriesFromStart('WALCL', startISO, fresh),
    fredAPI.getSeriesFromStart('WDTGAL', startISO, fresh).catch(() => fredAPI.getSeriesFromStart('WTREGEN', startISO, fresh)),
    fredAPI.getSeriesFromStart('RRPONTSYD', startISO, fresh),
  ])

  // Critical: these series are not perfectly aligned by date across the entire history.
  // We compute net liquidity using "as-of" (last known) values for TGA and RRP at each WALCL date.
  const walclPts = toSeriesPoints(walcl)
  const tgaPts = toSeriesPoints(tgaSeries)
  const rrpPts = toSeriesPoints(rrp)

  const getTgaAsOf = makeAsOfGetter(tgaPts)
  const getRrpAsOf = makeAsOfGetter(rrpPts)

  const dates = walclPts.map((p) => p.date)
  const points: LiquidityPoint[] = []

  // WALCL dates are already our time grid; use sequential access rather than O(n^2) searches.
  for (let k = 0; k < walclPts.length; k++) {
    const date = walclPts[k]!.date
    const wal = walclPts[k]!.value
    const tga = getTgaAsOf(date) ?? 0
    const r = getRrpAsOf(date) ?? 0
    const net = wal - tga - r
    points.push({ date, netLiquidity: net, yoyChange: null, index: null })
  }

  // Compute YoY change assuming roughly weekly data (52 observations per year)
  const yoyValues: number[] = []
  for (let i = 52; i < points.length; i++) {
    const prev = points[i - 52]
    const curr = points[i]
    if (!prev || !curr || prev.netLiquidity === 0) continue
    const yoy = ((curr.netLiquidity - prev.netLiquidity) / prev.netLiquidity) * 100
    curr.yoyChange = yoy
    yoyValues.push(yoy)
  }

  // Compute percentile-based index from YoY values
  const validYoy = yoyValues.filter((v) => !Number.isNaN(v))
  for (const p of points) {
    if (p.yoyChange == null) continue
    p.index = percentileIndex(validYoy, p.yoyChange)
  }

  const current: LiquidityPoint | null = points.length > 0 ? points[points.length - 1]! : null

  return {
    history: points,
    current,
  }
}


