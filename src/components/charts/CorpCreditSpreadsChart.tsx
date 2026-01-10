import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Brush, Legend } from 'recharts'
import { format } from 'date-fns'
import { useMemo } from 'react'

interface SpreadPoint {
  date: string
  value: number
}

interface CorpCreditSpreadsChartProps {
  ig: SpreadPoint[]
  bbb: SpreadPoint[]
  hy: SpreadPoint[]
  defaultWindowCount?: number
}

interface MergedDataPoint {
  date: string
  ig: number | null
  bbb: number | null
  hy: number | null
}

export function CorpCreditSpreadsChart({
  ig,
  bbb,
  hy,
  defaultWindowCount = 2600,
}: CorpCreditSpreadsChartProps) {
  // Merge all three series into a single array keyed by date
  const data = useMemo<MergedDataPoint[]>(() => {
    const dateMap = new Map<string, MergedDataPoint>()

    // Initialize with all dates from all series
    const addSeries = (series: SpreadPoint[], key: 'ig' | 'bbb' | 'hy') => {
      for (const pt of series) {
        const existing = dateMap.get(pt.date)
        if (existing) {
          existing[key] = pt.value
        } else {
          dateMap.set(pt.date, {
            date: pt.date,
            ig: key === 'ig' ? pt.value : null,
            bbb: key === 'bbb' ? pt.value : null,
            hy: key === 'hy' ? pt.value : null,
          })
        }
      }
    }

    addSeries(ig, 'ig')
    addSeries(bbb, 'bbb')
    addSeries(hy, 'hy')

    // Sort by date ascending
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [ig, bbb, hy])

  const startIndex = defaultWindowCount ? Math.max(0, data.length - defaultWindowCount) : undefined

  if (data.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 p-4 text-center">
        No data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => format(new Date(v), 'yyyy')}
          minTickGap={24}
          stroke="#666"
          fontSize={12}
        />
        <YAxis
          stroke="#666"
          fontSize={12}
          tickFormatter={(v) => `${v.toFixed(1)}%`}
          domain={['auto', 'auto']}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            const label =
              name === 'ig' ? 'IG OAS' : name === 'bbb' ? 'BBB OAS' : 'HY OAS'
            return [`${value.toFixed(2)}%`, label]
          }}
          labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        <Legend
          formatter={(value) => {
            if (value === 'ig') return 'IG (Investment Grade)'
            if (value === 'bbb') return 'BBB (Near-Junk)'
            if (value === 'hy') return 'HY (High Yield)'
            return value
          }}
        />
        <Line
          type="monotone"
          dataKey="ig"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          connectNulls
          name="ig"
        />
        <Line
          type="monotone"
          dataKey="bbb"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          connectNulls
          name="bbb"
        />
        <Line
          type="monotone"
          dataKey="hy"
          stroke="#dc2626"
          strokeWidth={2}
          dot={false}
          connectNulls
          name="hy"
        />
        {data.length > 30 && (
          <Brush
            dataKey="date"
            height={22}
            travellerWidth={8}
            stroke="#94a3b8"
            startIndex={startIndex}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
