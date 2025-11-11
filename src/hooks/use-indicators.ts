'use client'

import { useQuery, UseQueryResult } from '@tanstack/react-query'

export interface M2Data {
  current: number
  date: string
  historical: Array<{ date: string; value: number }>
  unit: string
  source: string
  lastUpdated: string
}

export interface YieldCurveData {
  spread: number
  treasury10Y: number
  treasury2Y: number
  inverted: boolean
  interpretation: string
  recessionProbability: string
  date10Y: string
  date2Y: string
  calculatedAt: string
  historicalContext: string
  history?: Array<{ date: string; spread: number }>
  validation?: {
    isValid: boolean
    warnings: string[]
    freshness: {
      status: 'live' | 'delayed' | 'stale' | 'error'
      ageInMinutes: number
      ageInHours: number
      timestamp: Date
      formattedAge: string
      isStale: boolean
      warningMessage?: string
    }
  }
}

export interface BuffettData {
  ratio: number
  wilshireIndexLevel: number
  gdpBillions: number
  interpretation: string
  wilshireDate: string
  gdpDate: string
  calculatedAt: string
  notes: string[]
  dataFreshness: {
    wilshireAge: number
    gdpAge: number
  }
  history?: Array<{ date: string; ratio: number }>
}

interface APIResponse<T> {
  data: T
  cached: boolean
  lastUpdated: string
}

async function fetchM2(): Promise<M2Data> {
  // Optimize: fetch only last 10 years of M2 data
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 10)
  const start = startDate.toISOString().slice(0, 10)

  const response = await fetch(`/api/indicators/m2?start=${start}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch M2 data')
  const json: APIResponse<M2Data> = await response.json()
  return json.data
}

async function fetchYieldCurve(): Promise<YieldCurveData> {
  // Try fresh first, then fallback to cached route
  const tryOnce = async (fresh: boolean) => {
    // Use 1950-01-01 to match cron job cache key
    const start = '1950-01-01'
    const url = fresh ? `/api/indicators/treasury?start=${start}&fresh=1` : `/api/indicators/treasury?start=${start}`
    const res = await fetch(url, { cache: 'no-store' })
    // Even if not ok, try to parse JSON, since server may return placeholder payload
    let json: any = null
    try {
      json = await res.json()
    } catch {}
    if (json && json.data) return json.data as YieldCurveData
    if (!res.ok) throw new Error('Failed to fetch yield curve data')
    throw new Error('Invalid yield curve payload')
  }

  try {
    return await tryOnce(true)
  } catch {
    return await tryOnce(false)
  }
}

async function fetchBuffett(): Promise<BuffettData> {
  const response = await fetch('/api/indicators/buffett', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch Buffett indicator data')
  const json: APIResponse<BuffettData> = await response.json()
  return json.data
}

export function useM2(): UseQueryResult<M2Data> {
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 10)
  const start = startDate.toISOString().slice(0, 10)

  return useQuery({
    queryKey: ['indicator', 'm2', start],
    queryFn: fetchM2,
    staleTime: 24 * 60 * 60 * 1000, // M2 updates weekly, consider stale after 24 hours
    refetchInterval: 60 * 60 * 1000, // Refetch every hour
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

export function useYieldCurve(): UseQueryResult<YieldCurveData> {
  // Use 1950-01-01 to match cron job cache key
  const start = '1950-01-01'

  // Enable smart auto-refresh for treasury yields
  // During market hours (9:30 AM - 4:00 PM ET), refetch every 5 minutes
  // Outside market hours, refetch every 1 hour
  const getRefetchInterval = () => {
    const now = new Date()
    const etHour = now.getUTCHours() - 5 // Rough ET conversion (doesn't account for DST)
    const isMarketHours = etHour >= 9 && etHour < 16
    return isMarketHours ? 5 * 60 * 1000 : 60 * 60 * 1000 // 5 min or 1 hour
  }

  return useQuery({
    queryKey: ['indicator', 'yield-curve', start],
    queryFn: fetchYieldCurve,
    staleTime: 5 * 60 * 1000,
    refetchInterval: getRefetchInterval(),
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  })
}

export function useBuffett(): UseQueryResult<BuffettData> {
  return useQuery({
    queryKey: ['indicator', 'buffett'],
    queryFn: fetchBuffett,
    staleTime: 24 * 60 * 60 * 1000, // Buffett updates daily, stale after 24h
    refetchInterval: 60 * 60 * 1000, // Refetch every hour
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

export function useAllIndicators() {
  const m2 = useM2()
  const yieldCurve = useYieldCurve()
  const buffett = useBuffett()

  return {
    m2,
    yieldCurve,
    buffett,
    isLoading: m2.isLoading || yieldCurve.isLoading || buffett.isLoading,
    isError: m2.isError || yieldCurve.isError || buffett.isError,
    errors: {
      m2: m2.error,
      yieldCurve: yieldCurve.error,
      buffett: buffett.error,
    },
  }
}
