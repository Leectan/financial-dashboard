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

function toSeriesMap(series: FREDSeries): SeriesMap {
  const map: SeriesMap = {}
  for (const obs of series) {
    const v = parseFloat(obs.value)
    if (!Number.isNaN(v)) {
      map[obs.date] = v
    }
  }
  return map
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

export async function computeLiquidity(startISO: string = '2003-01-01'): Promise<LiquidityResult> {
  // WALCL - Fed balance sheet, WDTGAL/WTREGEN - TGA, RRPONTSYD - ON RRP
  const [walcl, tgaSeries, rrp] = await Promise.all([
    fredAPI.getSeriesFromStart('WALCL', startISO),
    fredAPI.getSeriesFromStart('WDTGAL', startISO).catch(() => fredAPI.getSeriesFromStart('WTREGEN', startISO)),
    fredAPI.getSeriesFromStart('RRPONTSYD', startISO),
  ])

  const walclMap = toSeriesMap(walcl)
  const tgaMap = toSeriesMap(tgaSeries)
  const rrpMap = toSeriesMap(rrp)

  const dates = Object.keys(walclMap).sort()
  const points: LiquidityPoint[] = []

  for (const date of dates) {
    const wal = walclMap[date] ?? 0
    const tga = tgaMap[date] ?? 0
    const r = rrpMap[date] ?? 0
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


