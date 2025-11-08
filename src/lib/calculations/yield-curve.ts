import { fredAPI } from '@/lib/api-clients/fred'

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
  try {
    // Use FRED directly - it's more reliable and faster than Yahoo Finance
    // Removed Yahoo Finance to avoid slow retries on non-existent symbols
    const [latestSpread, tenY, twoY] = await Promise.all([
      fredAPI.getLatestObservation('T10Y2Y'),
      fredAPI.getLatestObservation('DGS10'),
      fredAPI.getLatestObservation('DGS2'),
    ])

    const treasury10Y = tenY.value
    const treasury2Y = twoY.value
    const date10Y = tenY.date
    const date2Y = twoY.date

    const spread = latestSpread.value
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
  } catch (error) {
    console.error('Error fetching treasury data:', error)
    throw new Error('Unable to fetch treasury yield data')
  }
}

export async function getYieldCurveHistory(startISO: string = '1950-01-01'): Promise<YieldCurveHistoryPoint[]> {
  const series = await fredAPI.getSeriesFromStart('T10Y2Y', startISO)
  return series
    .filter((o) => o.value !== null && o.value !== undefined && o.value !== '.' && o.value !== '')
    .map((o) => ({ date: o.date, spread: parseFloat(o.value) }))
}
