import { fredAPI, type FREDSeries } from '@/lib/api-clients/fred'

export interface HYSpreadPoint {
  date: string
  spread: number
}

export interface HYSpreadResult {
  history: HYSpreadPoint[]
  current: HYSpreadPoint | null
}

function seriesToPoints(series: FREDSeries): HYSpreadPoint[] {
  const points: HYSpreadPoint[] = []
  for (const obs of series) {
    const v = parseFloat(obs.value)
    if (!Number.isNaN(v)) {
      points.push({ date: obs.date, spread: v })
    }
  }
  // FRED returns newest first; sort ascending for charts
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

export async function computeHYSpread(startISO: string = '1997-01-01', fresh: boolean = false): Promise<HYSpreadResult> {
  // BAMLH0A0HYM2: ICE BofA US High Yield Index Option-Adjusted Spread
  const series = await fredAPI.getSeriesFromStart('BAMLH0A0HYM2', startISO, fresh)
  const history = seriesToPoints(series)
  const current: HYSpreadPoint | null = history.length > 0 ? history[history.length - 1]! : null
  return { history, current }
}


