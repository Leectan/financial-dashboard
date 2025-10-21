'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

export function RefreshButton() {
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    // Force-refresh each API by adding fresh=1 once to break cache for this request
    await Promise.allSettled([
      fetch('/api/indicators/vix?fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/treasury?start=1950-01-01&fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/m2?start=1959-01-01&fresh=1', { cache: 'no-store' }),
      fetch('/api/indicators/buffett?fresh=1', { cache: 'no-store' }),
    ])
    await queryClient.invalidateQueries({ queryKey: ['indicator'] })
    setTimeout(() => setIsRefreshing(false), 1000)
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

