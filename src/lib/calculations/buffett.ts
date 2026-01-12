import { fredAPI } from '@/lib/api-clients/fred'
import { yahooFinanceClient } from '@/lib/api-clients/yahoo-finance'

export interface BuffettIndicatorResult {
  ratio: number
  wilshireIndexLevel: number
  gdpBillions: number
  interpretation: string
  wilshireDate: Date
  gdpDate: string
  calculatedAt: Date
  notes: string[]
  dataFreshness: {
    wilshireAge: number
    gdpAge: number
  }
}

export interface BuffettHistoryPoint { date: string; ratio: number }

export async function calculateBuffettIndicator(fresh: boolean = false): Promise<BuffettIndicatorResult> {
  const notes: string[] = []

  // Buffett Indicator is typically "total US equity market cap / nominal GDP".
  // We approximate total market cap using Wilshire 5000 index level, and use nominal GDP (GDP, current dollars).
  const [wilshire, gdpLatest] = await Promise.all([
    yahooFinanceClient.getWilshire5000(fresh),
    fredAPI.getLatestObservation('GDP', fresh),
  ])

  const wilshireLevel = wilshire.price
  const gdpBillions = gdpLatest.value
  const ratio = (wilshireLevel / gdpBillions) * 100

  const now = Date.now()
  const wilshireAge = now - wilshire.date.getTime()
  const gdpAge = now - new Date(gdpLatest.date).getTime()

  if (gdpAge > 1000 * 60 * 60 * 24 * 120) {
    notes.push('GDP data may be stale (older than 120 days).')
  }

  let interpretation = 'Fairly Valued'
  if (ratio > 200) interpretation = 'Extremely Overvalued - Danger Zone'
  else if (ratio > 150) interpretation = 'Significantly Overvalued'
  else if (ratio > 120) interpretation = 'Moderately Overvalued'
  else if (ratio > 100) interpretation = 'Fairly Valued'
  else if (ratio > 80) interpretation = 'Moderately Undervalued'
  else interpretation = 'Significantly Undervalued'

  notes.push('Wilshire 5000 index level used as a proxy for total US market cap.')
  notes.push('GDP is nominal GDP in billions of dollars (GDP).')

  return {
    ratio,
    wilshireIndexLevel: wilshireLevel,
    gdpBillions,
    interpretation,
    wilshireDate: wilshire.date,
    gdpDate: gdpLatest.date,
    calculatedAt: new Date(),
    notes,
    dataFreshness: { wilshireAge, gdpAge },
  }
}

export async function getBuffettHistory(): Promise<BuffettHistoryPoint[]> {
  // Monthly Wilshire history (max range)
  const wilshire = await yahooFinanceClient.getWilshireHistory('max', '1mo')
  // Quarterly nominal GDP in billions from 1950 for broad history
  const gdp = await fredAPI.getSeriesFromStart('GDP', '1950-01-01')
  // Build a map of GDP by quarter date
  const gdpPoints = gdp.map((o) => ({ date: o.date, value: parseFloat(o.value) }))

  function getGDPFor(dateISO: string): number | null {
    const t = new Date(dateISO).getTime()
    for (let i = gdpPoints.length - 1; i >= 0; i--) {
      const gi = gdpPoints[i]
      if (!gi) continue
      const gt = new Date(gi.date).getTime()
      if (gt <= t && !Number.isNaN(gi.value)) return gi.value
    }
    return null
  }

  const series: BuffettHistoryPoint[] = []
  for (const p of wilshire) {
    const g = getGDPFor(p.date)
    if (g != null && g > 0) {
      series.push({ date: p.date, ratio: (p.price / g) * 100 })
    }
  }
  return series
}
