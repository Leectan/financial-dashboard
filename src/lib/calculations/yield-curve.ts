import { fredAPI } from '@/lib/api-clients/fred'
import { yahooFinanceClient } from '@/lib/api-clients/yahoo-finance'

export interface YieldCurveResult {
  spread: number
  treasury10Y: number
  treasury2Y: number
  inverted: boolean
  interpretation: string
  recessionProbability: string
  date10Y: string
  date2Y: string
  calculatedAt: Date
  historicalContext: string
}

export interface YieldCurveHistoryPoint { date: string; spread: number }

export async function calculateYieldCurveSpread(): Promise<YieldCurveResult> {
  // Strategy: Use Yahoo intraday for "current" 10Y and 2Y when available; fallback to FRED latest.
  // History remains FRED (handled by getYieldCurveHistory).
  let tenYValue: number | null = null
  let twoYValue: number | null = null
  let date10Y: string = ''
  let date2Y: string = ''

  // Try Yahoo first for intraday values
  try {
    const tenYQuote = await yahooFinanceClient.getSymbolQuote('^TNX') // 10-year yield index; value is yield * 10
    tenYValue = tenYQuote.price / 10
    date10Y = tenYQuote.date.toISOString().slice(0, 10)
  } catch {}

  // Attempt multiple 2Y symbols before falling back to FRED
  try {
    const twoYQuote = await yahooFinanceClient.getSymbolQuote('^UST2Y')
    twoYValue = twoYQuote.price
    date2Y = twoYQuote.date.toISOString().slice(0, 10)
  } catch {
    try {
      const twoYQuoteAlt = await yahooFinanceClient.getSymbolQuote('US2Y')
      twoYValue = twoYQuoteAlt.price
      date2Y = twoYQuoteAlt.date.toISOString().slice(0, 10)
    } catch {}
  }

  // Fallback to FRED if Yahoo unavailable
  if (tenYValue == null) {
    const tenYfred = await fredAPI.getLatestObservation('DGS10')
    tenYValue = tenYfred.value
    date10Y = tenYfred.date
  }
  if (twoYValue == null) {
    const twoYfred = await fredAPI.getLatestObservation('DGS2')
    twoYValue = twoYfred.value
    date2Y = twoYfred.date
  }

  const spreadFromYields = tenYValue - twoYValue

  // Also get FRED spread as a secondary reference (in case of oddities)
  let fredSpread: number | null = null
  try {
    const s = await fredAPI.getLatestObservation('T10Y2Y')
    fredSpread = s.value
  } catch {}

  const spread = Number.isFinite(spreadFromYields) ? spreadFromYields : (fredSpread ?? 0)
  const inverted = spread < 0

  let interpretation = 'Normal Range'
  if (spread < -0.5) interpretation = 'Deeply Inverted - Strong Recession Signal'
  else if (spread < 0) interpretation = 'Inverted - Recession Warning'
  else if (spread < 0.5) interpretation = 'Flattening - Caution Warranted'
  else if (spread < 1.0) interpretation = 'Normal Range'
  else if (spread < 2.0) interpretation = 'Healthy Positive Slope'
  else interpretation = 'Steep Curve - Strong Growth Signal'

  let recessionProbability = 'Low (10-30%)'
  if (spread < -0.5) recessionProbability = 'Very High (70-80% within 12-24 months)'
  else if (spread < 0) recessionProbability = 'High (50-70% within 12-24 months)'
  else if (spread < 0.5) recessionProbability = 'Moderate (30-50%)'
  else if (spread < 1.0) recessionProbability = 'Low (10-30%)'
  else recessionProbability = 'Very Low (<10%)'

  return {
    spread,
    treasury10Y: tenYValue,
    treasury2Y: twoYValue,
    inverted,
    interpretation,
    recessionProbability,
    date10Y,
    date2Y,
    calculatedAt: new Date(),
    historicalContext: 'Yield curve inversions have preceded most US recessions with 12-24 month lead time.',
  }
}

export async function getYieldCurveHistory(startISO: string = '1950-01-01'): Promise<YieldCurveHistoryPoint[]> {
  const series = await fredAPI.getSeriesFromStart('T10Y2Y', startISO)
  return series
    .filter((o) => o.value !== null && o.value !== undefined && o.value !== '.' && o.value !== '')
    .map((o) => ({ date: o.date, spread: parseFloat(o.value) }))
}
