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
  const gdpLatestPromise = fredAPI.getLatestObservation('GDP', fresh)

  // Yahoo "quote" endpoints for Wilshire can be stale; history endpoints are more reliable.
  // Use last daily close from Yahoo history as the "current" Wilshire proxy.
  const wilshireFromYahooPromise = (async () => {
    const pts = await yahooFinanceClient.getWilshireHistory('5d', '1d', fresh)
    const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date))
    const last = sorted[sorted.length - 1]
    if (!last) throw new Error('No Wilshire history points')
    return { price: last.price, date: new Date(last.date + 'T00:00:00Z') }
  })()

  const [gdpLatest, wilshireFromYahoo] = await Promise.all([gdpLatestPromise, wilshireFromYahooPromise]).catch(async (err) => {
    // If Yahoo fails entirely, fall back to FRED Wilshire 5000 index (daily close).
    console.warn('Yahoo Wilshire fetch failed; falling back to FRED WILL5000IND:', err)
    const [gdp, will5000] = await Promise.all([
      gdpLatestPromise,
      fredAPI.getLatestObservation('WILL5000IND', fresh),
    ])
    notes.push('Wilshire 5000 quote from Yahoo was unavailable; using FRED WILL5000IND (daily close) as the market proxy.')
    return [
      gdp,
      { price: will5000.value, date: new Date(will5000.date + 'T00:00:00Z') },
    ] as const
  })

  // If Yahoo returned something implausibly stale, also fall back to FRED WILL5000IND.
  const STALE_MS = 1000 * 60 * 60 * 24 * 10 // 10 days
  const now = Date.now()
  let wilshireLevel = wilshireFromYahoo.price
  let wilshireDate = wilshireFromYahoo.date
  if (now - wilshireDate.getTime() > STALE_MS) {
    const will5000 = await fredAPI.getLatestObservation('WILL5000IND', fresh)
    notes.push('Wilshire 5000 from Yahoo appeared stale; using FRED WILL5000IND (daily close) as the market proxy.')
    wilshireLevel = will5000.value
    wilshireDate = new Date(will5000.date + 'T00:00:00Z')
  }

  const gdpBillions = gdpLatest.value
  const ratio = (wilshireLevel / gdpBillions) * 100

  const wilshireAge = now - wilshireDate.getTime()
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
    wilshireDate,
    gdpDate: gdpLatest.date,
    calculatedAt: new Date(),
    notes,
    dataFreshness: { wilshireAge, gdpAge },
  }
}

export async function getBuffettHistory(fresh: boolean = false): Promise<BuffettHistoryPoint[]> {
  // Monthly Wilshire history (max range)
  const wilshire = await yahooFinanceClient.getWilshireHistory('max', '1mo', fresh)
  // Quarterly nominal GDP in billions from 1950 for broad history
  const gdp = await fredAPI.getSeriesFromStart('GDP', '1950-01-01', fresh)
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
