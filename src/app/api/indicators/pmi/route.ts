import { NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

// Use nodejs runtime for stability with external API calls
export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || '1950-01-01'
    const fresh = searchParams.get('fresh') === '1'
    const key = `${CACHE_KEYS.INDICATOR_PMI}:start:${start}`
    const cached = fresh ? null : await getCached<any>(key)
    if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })

    // ISM PMI (NAPM) is not available on FRED (removed; see FRED announcement).
    // We attempt NAPM for backwards compatibility, and fall back to INDPRO as a transparent proxy.
    let series
    let seriesId: 'NAPM' | 'INDPRO' = 'INDPRO'
    try {
      series = await fredAPI.getSeriesFromStart('NAPM', start, fresh)
      seriesId = 'NAPM'
    } catch {
      // NAPM may not be available, use Industrial Production as a proxy
      series = await fredAPI.getSeriesFromStart('INDPRO', start, fresh)
      seriesId = 'INDPRO'
    }
    
    const data = series
      .filter((o) => o.value && o.value !== '.' && !isNaN(parseFloat(o.value)))
      .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    
    const payload = {
      values: data,
      meta: {
        seriesId,
        note:
          seriesId === 'INDPRO'
            ? 'Proxy: ISM PMI is not available on FRED; using Industrial Production (INDPRO) as a free, auditable proxy for manufacturing cycle.'
            : 'ISM PMI (NAPM) from FRED (if available).',
      },
    }

    await setCached(key, payload, CACHE_TTL.MONTHLY)
    return NextResponse.json({ data: payload, cached: false, lastUpdated: new Date().toISOString() })
  } catch (e) {
    console.error('PMI API error:', e)
    return NextResponse.json({ error: 'Failed to fetch PMI', message: e instanceof Error ? e.message : 'Unknown' }, { status: 500 })
  }
}






