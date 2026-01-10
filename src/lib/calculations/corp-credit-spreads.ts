import { fredAPI, type FREDSeries } from '@/lib/api-clients/fred'

export interface SpreadPoint {
  date: string
  value: number
}

export interface SpreadSeries {
  current: SpreadPoint | null
  history: SpreadPoint[]
}

export interface CorpCreditSpreads {
  ig: SpreadSeries
  bbb: SpreadSeries
  hy: SpreadSeries
  meta: {
    source: 'FRED'
    asOf: string
  }
}

// FRED Series IDs for ICE BofA OAS indices
const SERIES_IDS = {
  IG: 'BAMLC0A0CM',       // ICE BofA US Corporate Index OAS
  BBB: 'BAMLC0A4CBBB',    // ICE BofA BBB US Corporate Index OAS
  HY: 'BAMLH0A0HYM2',     // ICE BofA US High Yield Index OAS
} as const

function seriesToPoints(series: FREDSeries): SpreadPoint[] {
  const points: SpreadPoint[] = []
  for (const obs of series) {
    const v = parseFloat(obs.value)
    if (!Number.isNaN(v)) {
      points.push({ date: obs.date, value: v })
    }
  }
  // FRED may return newest first; sort ascending for charts
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

function buildSpreadSeries(series: FREDSeries): SpreadSeries {
  const history = seriesToPoints(series)
  const current = history.length > 0 ? history[history.length - 1]! : null
  return { current, history }
}

export async function computeCorpCreditSpreads(
  startISO: string = '1997-01-01',
  fresh: boolean = false
): Promise<CorpCreditSpreads> {
  // Fetch all three series in parallel
  const [igSeries, bbbSeries, hySeries] = await Promise.all([
    fredAPI.getSeriesFromStart(SERIES_IDS.IG, startISO, fresh),
    fredAPI.getSeriesFromStart(SERIES_IDS.BBB, startISO, fresh),
    fredAPI.getSeriesFromStart(SERIES_IDS.HY, startISO, fresh),
  ])

  const ig = buildSpreadSeries(igSeries)
  const bbb = buildSpreadSeries(bbbSeries)
  const hy = buildSpreadSeries(hySeries)

  // Determine the latest "as of" date across all series
  const dates = [ig.current?.date, bbb.current?.date, hy.current?.date].filter(
    (d): d is string => !!d
  )
  const asOf = dates.length > 0 ? dates.sort().reverse()[0]! : new Date().toISOString().slice(0, 10)

  return {
    ig,
    bbb,
    hy,
    meta: {
      source: 'FRED',
      asOf,
    },
  }
}
