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
  // Prefer near-real-time Yahoo yields if available
  let treasury10Y = NaN
  let treasury2Y = NaN
  let date10Y = ''
  let date2Y = ''

  try {
    const [t10, t2] = await Promise.all([
      yahooFinanceClient.getSymbolQuote('^TNX'), // 10-year yield index (x10)
      (async () => {
        try { return await yahooFinanceClient.getSymbolQuote('^UST2Y') } catch { return await yahooFinanceClient.getSymbolQuote('^US2Y') }
      })(),
    ])
    treasury10Y = t10.price / 10
    treasury2Y = t2.price // already in percent
    date10Y = new Date(t10.date).toISOString().slice(0, 10)
    date2Y = new Date(t2.date).toISOString().slice(0, 10)
  } catch {
    // Yahoo failed; fall back to FRED daily data
    const latestSpread = await fredAPI.getLatestObservation('T10Y2Y')
    try {
      const [tenY, twoY] = await Promise.all([
        fredAPI.getLatestObservation('DGS10'),
        fredAPI.getLatestObservation('DGS2'),
      ])
      treasury10Y = tenY.value
      treasury2Y = twoY.value
      date10Y = tenY.date
      date2Y = twoY.date
    } catch {
      // As a last resort, compute from spread only
      treasury10Y = NaN
      treasury2Y = NaN
      date10Y = latestSpread.date
      date2Y = latestSpread.date
    }

    const spread = latestSpread.value
    const inverted = spread < 0
    return {
      spread,
      treasury10Y,
      treasury2Y,
      inverted,
      interpretation: spread < -0.5 ? 'Deeply Inverted - Strong Recession Signal' : spread < 0 ? 'Inverted - Recession Warning' : spread < 0.5 ? 'Flattening - Caution Warranted' : spread < 1.0 ? 'Normal Range' : spread < 2.0 ? 'Healthy Positive Slope' : 'Steep Curve - Strong Growth Signal',
      recessionProbability: spread < -0.5 ? 'Very High (70-80% within 12-24 months)' : spread < 0 ? 'High (50-70% within 12-24 months)' : spread < 0.5 ? 'Moderate (30-50%)' : spread < 1.0 ? 'Low (10-30%)' : 'Very Low (<10%)',
      date10Y,
      date2Y,
      calculatedAt: new Date(),
      historicalContext: 'Yield curve inversions have preceded most US recessions with 12-24 month lead time.',
    }
  }

  const spread = treasury10Y - treasury2Y
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
    treasury10Y,
    treasury2Y,
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
