import { fredAPI } from '@/lib/api-clients/fred'

export interface SahmResult {
  latest: number
  date: string
  triggered: boolean
  interpretation: string
  history: Array<{ date: string; value: number }>
}

export async function calculateSahm(startISO: string = '1970-01-01'): Promise<SahmResult> {
  const series = await fredAPI.getSeriesFromStart('SAHMREALTIME', startISO)
  const history = series.map((o) => ({ date: o.date, value: parseFloat(o.value) }))
  const latestObs = history[history.length - 1]
  const latest = latestObs ? latestObs.value : NaN
  const triggered = latest >= 0.5
  const interpretation = triggered ? 'Recession signal (Sahm Rule triggered)' : 'No recession signal'
  return { latest, date: latestObs?.date || '', triggered, interpretation, history }
}





