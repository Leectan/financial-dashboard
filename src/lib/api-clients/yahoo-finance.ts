import { z } from 'zod'
import { CONFIG } from '@/lib/config'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

const YahooQuoteSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            symbol: z.string(),
            regularMarketPrice: z.number().optional(),
            regularMarketTime: z.number().optional(),
          }),
        })
      )
      .min(1),
  }),
})

const YahooHistorySchema = z.object({
  chart: z.object({
    result: z.array(
      z.object({
        timestamp: z.array(z.number()).optional(),
        indicators: z.object({
          quote: z.array(
            z.object({
              close: z.array(z.number().nullable()),
            })
          ),
        }),
        meta: z.object({ symbol: z.string() }).optional(),
      })
    ).min(1),
  }),
})

type YahooQuote = z.infer<typeof YahooQuoteSchema>

type HistoryPoint = { date: string; price: number }

class YahooFinanceClient {
  private readonly baseUrl = CONFIG.api.yahoo.baseUrl
  private readonly WILSHIRE_TICKERS = ['^W5000', '^FTW5000'] as const

  private async fetchQuote(symbol: string) {
    const url = `${this.baseUrl}/${encodeURIComponent(symbol)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinancialDashboard/1.0; +https://example.com)'
      },
      cache: 'no-store',
    })
    if (!res.ok) {
      throw new Error(`Yahoo Finance returned HTTP ${res.status}`)
    }
    const json = (await res.json()) as unknown
    const parsed = YahooQuoteSchema.safeParse(json)
    if (!parsed.success) {
      throw new Error('Invalid Yahoo response: ' + JSON.stringify(parsed.error.issues))
    }
    const result = parsed.data.chart.result?.[0]
    if (!result) throw new Error('Yahoo response missing result[0]')
    const price = result.meta.regularMarketPrice
    const time = result.meta.regularMarketTime
    if (price == null || time == null) throw new Error('Missing market price/time')
    return { symbol, price, timestamp: time, date: new Date(time * 1000) }
  }

  private async fetchHistory(symbol: string, range = 'max', interval: '1mo' | '1wk' | '1d' = '1mo'): Promise<HistoryPoint[]> {
    const url = `${this.baseUrl}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinancialDashboard/1.0; +https://example.com)' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Yahoo Finance history HTTP ${res.status}`)
    const json = (await res.json()) as unknown
    const parsed = YahooHistorySchema.safeParse(json)
    if (!parsed.success) throw new Error('Invalid Yahoo history response: ' + JSON.stringify(parsed.error.issues))
    const result = parsed.data.chart.result[0]
    const timestamps = result.timestamp || []
    const closes = result.indicators.quote[0].close
    const points: HistoryPoint[] = []
    for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
      const ts = timestamps[i]
      const close = closes[i]
      if (close != null) {
        points.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: close })
      }
    }
    return points
  }

  async getWilshire5000() {
    const cacheKey = CACHE_KEYS.YAHOO_WILSHIRE
    const cached = await getCached<{ symbol: string; price: number; timestamp: number; date: string }>(cacheKey)
    if (cached) {
      return { ...cached, date: new Date(cached.date) }
    }

    let lastError: unknown
    for (const ticker of this.WILSHIRE_TICKERS) {
      try {
        const quote = await this.fetchQuote(ticker)
        await setCached(cacheKey, { ...quote, date: quote.date.toISOString() }, CACHE_TTL.WILSHIRE)
        return quote
      } catch (error) {
        console.warn(`Failed fetching ${ticker} from Yahoo:`, error)
        lastError = error
      }
    }

    throw new Error(`Failed to fetch Wilshire 5000: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`)
  }

  async getWilshireHistory(range = 'max', interval: '1mo' | '1wk' | '1d' = '1mo'): Promise<HistoryPoint[]> {
    const key = CACHE_KEYS.YAHOO_WILSHIRE_HISTORY(range, interval)
    const cached = await getCached<HistoryPoint[]>(key)
    if (cached) return cached

    let lastError: unknown
    for (const ticker of this.WILSHIRE_TICKERS) {
      try {
        const points = await this.fetchHistory(ticker, range, interval)
        await setCached(key, points, CACHE_TTL.WILSHIRE)
        return points
      } catch (err) {
        console.warn(`Failed fetching history ${ticker} from Yahoo:`, err)
        lastError = err
      }
    }
    throw new Error(`Failed Yahoo history: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`)
  }

  async getSymbolQuote(symbol: string) {
    const key = CACHE_KEYS.YAHOO_SYMBOL_QUOTE(symbol)
    const cached = await getCached<any>(key)
    if (cached) return cached
    const q = await this.fetchQuote(symbol)
    const data = { symbol, price: q.price, timestamp: q.timestamp, date: q.date.toISOString() }
    await setCached(key, data, CACHE_TTL.WILSHIRE)
    return { ...data, date: new Date(data.date) }
  }

  async getSymbolHistory(symbol: string, range = '5y', interval: '1wk' | '1d' | '1mo' = '1wk') {
    const key = CACHE_KEYS.YAHOO_SYMBOL_HISTORY(symbol, range, interval)
    const cached = await getCached<HistoryPoint[]>(key)
    if (cached) return cached
    const pts = await this.fetchHistory(symbol, range, interval as any)
    await setCached(key, pts, CACHE_TTL.WILSHIRE)
    return pts
  }
}

/**
 * Yahoo Finance API Client for Wilshire 5000 Index
 *
 * ⚠️ WARNING: This uses Yahoo Finance's unofficial API which may change without notice.
 * This client is isolated for easy replacement if the API breaks.
 *
 * Alternative sources if Yahoo breaks:
 * - Alpha Vantage (limited to 25 requests/day free)
 * - Manual quarterly updates
 * - Paid data providers (IEX Cloud, Polygon.io)
 */
export const yahooFinanceClient = new YahooFinanceClient()
export type { YahooQuote }
