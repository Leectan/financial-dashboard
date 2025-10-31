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
    // Optimize: fetch only last 10 years of history by default
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 10)
    const start = startDate.toISOString().slice(0, 10)
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
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useYieldCurve(): UseQueryResult<YieldCurveData> {
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 10)
  const start = startDate.toISOString().slice(0, 10)

  return useQuery({
    queryKey: ['indicator', 'yield-curve', start],
    queryFn: fetchYieldCurve,
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  })
}

export function useBuffett(): UseQueryResult<BuffettData> {
  return useQuery({
    queryKey: ['indicator', 'buffett'],
    queryFn: fetchBuffett,
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
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
