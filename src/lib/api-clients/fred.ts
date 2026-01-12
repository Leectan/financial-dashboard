import { z } from 'zod'
import { CONFIG } from '@/lib/config'
import { fetchWithRetry } from '@/lib/utils/retry'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { APIError } from '@/lib/utils/errors'
import { FREDObservationSchema, FREDResponseSchema, type FREDSeries, type FREDObservation } from './types'

const SERIES_TTLS: Record<string, number> = {
  WM2NS: CACHE_TTL.M2,
  GDPC1: CACHE_TTL.GDP,
  GDP: CACHE_TTL.GDP,
  WILL5000IND: CACHE_TTL.TREASURY_YIELDS,
  DGS10: CACHE_TTL.TREASURY_YIELDS,
  DGS2: CACHE_TTL.TREASURY_YIELDS,
  T10Y2Y: CACHE_TTL.TREASURY_YIELDS,
}

class FREDAPIClient {
  private readonly apiKey: string | undefined
  private readonly baseUrl: string

  constructor() {
    const raw = process.env.FRED_API_KEY || ''
    const trimmed = raw.trim()
    this.apiKey = trimmed || undefined
    this.baseUrl = CONFIG.api.fred.baseUrl
  }

  private ensureApiKey() {
    if (!this.apiKey) {
      throw new Error('FRED_API_KEY is required')
    }
  }

  private async fetchSeriesRaw(seriesId: string, limit: number = 100, params?: Record<string, string>): Promise<FREDSeries> {
    this.ensureApiKey()
    const url = new URL(`${this.baseUrl}/series/observations`)
    url.searchParams.set('series_id', seriesId)
    url.searchParams.set('api_key', this.apiKey as string)
    url.searchParams.set('file_type', 'json')
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    } else {
      url.searchParams.set('sort_order', 'desc')
      url.searchParams.set('limit', String(limit))
    }

    const result = await fetchWithRetry(async () => {
      // Important: disable Next/Vercel fetch caching. Our cache layer is Redis.
      const res = await fetch(url.toString(), { cache: 'no-store' })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const msg = `FRED API returned HTTP ${res.status}${text ? `: ${text}` : ''}`
        throw new APIError(msg, res.status, 'FRED')
      }
      const json = await res.json()
      const parsed = FREDResponseSchema.safeParse(json)
      if (!parsed.success) {
        throw new Error('Invalid FRED response: ' + JSON.stringify(parsed.error.issues))
      }
      return parsed.data.observations
    })

    return result
  }

  async getSeries(seriesId: string, cacheTTL?: number, limit: number = 100, fresh = false): Promise<FREDSeries> {
    const cacheKey = CACHE_KEYS.FRED_SERIES(seriesId)
    const cached = fresh ? null : await getCached<FREDSeries>(cacheKey)
    if (cached) return cached

    const observations = await this.fetchSeriesRaw(seriesId, limit)
    const ttl = cacheTTL ?? SERIES_TTLS[seriesId] ?? CACHE_TTL.TREASURY_YIELDS
    await setCached(cacheKey, observations, ttl)
    return observations
  }

  async getSeriesFromStart(seriesId: string, startISO: string, fresh = false): Promise<FREDSeries> {
    const cacheKey = CACHE_KEYS.FRED_SERIES_RANGE(seriesId, startISO)
    const cached = fresh ? null : await getCached<FREDSeries>(cacheKey)
    if (cached) return cached

    const observations = await this.fetchSeriesRaw(seriesId, 0, { observation_start: startISO })
    await setCached(cacheKey, observations, SERIES_TTLS[seriesId] ?? CACHE_TTL.TREASURY_YIELDS)
    return observations
  }

  async getLatestObservation(seriesId: string, fresh = false): Promise<{ value: number; date: string }> {
    const observations = await this.getSeries(seriesId, undefined, 1, fresh)
    const latest = observations[0]
    if (!latest) {
      throw new Error(`No observations returned for ${seriesId}`)
    }
    const value = parseFloat(latest.value)
    if (Number.isNaN(value)) {
      throw new Error(`Invalid numeric value for ${seriesId}`)
    }
    return { value, date: latest.date }
  }

  async getLatestValue(seriesId: string, fresh = false): Promise<number> {
    const { value } = await this.getLatestObservation(seriesId, fresh)
    return value
  }

  // Convenience methods
  async getM2(): Promise<FREDSeries> {
    return this.getSeries('WM2NS', CACHE_TTL.M2)
  }

  async getM2History(startISO: string, fresh: boolean = false): Promise<FREDSeries> {
    return this.getSeriesFromStart('WM2NS', startISO, fresh)
  }

  async getGDP(): Promise<FREDSeries> {
    return this.getSeries('GDPC1', CACHE_TTL.GDP)
  }

  async getGDPHistory(startISO: string, fresh: boolean = false): Promise<FREDSeries> {
    return this.getSeriesFromStart('GDPC1', startISO, fresh)
  }

  async getTreasury10Y(): Promise<FREDSeries> {
    return this.getSeries('DGS10', CACHE_TTL.TREASURY_YIELDS)
  }

  async getTreasury2Y(): Promise<FREDSeries> {
    return this.getSeries('DGS2', CACHE_TTL.TREASURY_YIELDS)
  }

  async getTreasuryHistory(startISO: string, fresh: boolean = false): Promise<{ tenY: FREDSeries; twoY: FREDSeries }> {
    const [tenY, twoY] = await Promise.all([
      this.getSeriesFromStart('DGS10', startISO, fresh),
      this.getSeriesFromStart('DGS2', startISO, fresh),
    ])
    return { tenY, twoY }
  }

  // Alias for sample route usage
  async getM2MoneySupply(fresh: boolean = false): Promise<FREDSeries> {
    return this.getSeries('WM2NS', CACHE_TTL.M2, 100, fresh)
  }
}

export type { FREDObservation, FREDSeries }
export const fredAPI = new FREDAPIClient()
