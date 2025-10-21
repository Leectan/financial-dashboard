import { Redis } from '@upstash/redis'

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  // Do not throw in environments where envs are not set during build; clients may import.
  console.warn('Redis environment variables are missing: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN')
}

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || 'https://example.invalid',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || 'invalid',
})

export const CACHE_KEYS = {
  // Calculated indicators
  INDICATOR_BUFFETT: 'indicator:buffett',
  INDICATOR_YIELD_CURVE: 'indicator:yield-curve',
  INDICATOR_M2: 'indicator:m2',
  INDICATOR_SAHM: 'indicator:sahm',
  INDICATOR_HOUSING: 'indicator:housing',
  INDICATOR_PMI: 'indicator:pmi',
  INDICATOR_SENTIMENT: 'indicator:sentiment',
  INDICATOR_JOBLESS: 'indicator:jobless',
  INDICATOR_VIX: 'indicator:vix',
  INDICATOR_MARGIN: 'indicator:margin',
  INDICATOR_DEFAULT_HOUSING: 'indicator:default-housing',
  INDICATOR_DEFAULT_CREDIT: 'indicator:default-credit',

  // Raw data from APIs
  FRED_SERIES: (seriesId: string) => `fred:series:${seriesId}`,
  FRED_SERIES_RANGE: (seriesId: string, start: string) => `fred:series:${seriesId}:start:${start}`,
  YAHOO_WILSHIRE: 'yahoo:wilshire5000',
  YAHOO_WILSHIRE_HISTORY: (range: string, interval: string) => `yahoo:wilshire5000:range:${range}:interval:${interval}`,
  YAHOO_SYMBOL_QUOTE: (symbol: string) => `yahoo:quote:${symbol}`,
  YAHOO_SYMBOL_HISTORY: (symbol: string, range: string, interval: string) => `yahoo:history:${symbol}:range:${range}:interval:${interval}`,

  // System metadata
  CRON_LAST_RUN: 'meta:cron-last-run',
  HEALTH_STATUS: 'meta:health',
} as const

export const CACHE_TTL = {
  M2: 86400, // 24 hours
  GDP: 604800, // 7 days
  TREASURY_YIELDS: 3600, // 1 hour
  WILSHIRE: 3600, // 1 hour
  BUFFETT: 86400, // 24 hours
  YIELD_CURVE: 3600, // 1 hour
  HEALTH: 300, // 5 minutes
  CRON_STATUS: 3600, // 1 hour
  MONTHLY: 60 * 60 * 24 * 30, // 30 days
  WEEKLY: 60 * 60 * 24 * 7, // 7 days
} as const

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get<T>(key)
    if (value != null) {
      console.log(`[cache] hit for ${key}`)
      return value
    }
    console.log(`[cache] miss for ${key}`)
    return null
  } catch (error) {
    console.warn(`[cache] get error for ${key}:`, error)
    return null
  }
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, value as any, { ex: ttlSeconds })
  } catch (error) {
    console.warn(`[cache] set error for ${key}:`, error)
  }
}

export async function deleteCached(key: string): Promise<void> {
  try {
    await redis.del(key)
  } catch (error) {
    console.warn(`[cache] delete error for ${key}:`, error)
  }
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const res = await redis.ping()
    return res === 'PONG'
  } catch (error) {
    console.warn('[cache] ping error:', error)
    return false
  }
}
