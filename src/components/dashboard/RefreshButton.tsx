'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

export function RefreshButton() {
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    // Calculate optimized date range (last 10 years)
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 10)
    const start = startDate.toISOString().slice(0, 10)

    // Force-refresh each API by adding fresh=1 once to break cache for this request
    await Promise.allSettled([
      fetch('/api/indicators/vix?fresh=1', { cache: 'no-store' }),
      fetch(`/api/indicators/treasury?start=${start}&fresh=1`, { cache: 'no-store' }),
      fetch(`/api/indicators/m2?start=${start}&fresh=1`, { cache: 'no-store' }),
      fetch('/api/indicators/buffett?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/sahm?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/housing?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/pmi?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/sentiment?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/jobless?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/margin?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/defaults?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/rrp?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/corp-credit?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/hy-spread?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/corp-defaults?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/tsi?fresh=1', { cache: 'no-store' }),
    ])
    await queryClient.invalidateQueries({ queryKey: ['indicator'] })
    // Reload the page data to ensure all components get fresh data
    window.location.reload()
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
    </button>
  )
}

