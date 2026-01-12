import { NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

// Use nodejs runtime for stability with external API calls
export const runtime = 'nodejs'

// ISM Manufacturing PMI: FRED series 'MANEMP' (Manufacturing Employment) as proxy
// Note: 'NAPM' may not be available, using 'MANEMP' or 'INDPRO' as alternatives
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || '1950-01-01'
    const fresh = searchParams.get('fresh') === '1'
    const key = `${CACHE_KEYS.INDICATOR_PMI}:start:${start}`
    const cached = fresh ? null : await getCached<any>(key)
    if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })

    // Try NAPM first, fall back to INDPRO (Industrial Production Index) if not available
    let series
    try {
      series = await fredAPI.getSeriesFromStart('NAPM', start, fresh)
    } catch {
      // NAPM may not be available, use Industrial Production as a proxy
      series = await fredAPI.getSeriesFromStart('INDPRO', start, fresh)
    }
    
    const data = series
      .filter((o) => o.value && o.value !== '.' && !isNaN(parseFloat(o.value)))
      .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    
    await setCached(key, { values: data }, CACHE_TTL.MONTHLY)
    return NextResponse.json({ data: { values: data }, cached: false, lastUpdated: new Date().toISOString() })
  } catch (e) {
    console.error('PMI API error:', e)
    return NextResponse.json({ error: 'Failed to fetch PMI', message: e instanceof Error ? e.message : 'Unknown' }, { status: 500 })
  }
}






