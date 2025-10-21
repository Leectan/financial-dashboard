import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Brush, ReferenceLine } from 'recharts'
import { format } from 'date-fns'

interface RefLine {
  y: number
  color?: string
  dash?: string
}

interface SimpleLineChartProps {
  data: Array<{ date: string; value: number }>
  valueLabel?: string
  valueFormatter?: (v: number) => string
  refLines?: RefLine[]
  defaultWindowCount?: number
}

export function SimpleLineChart({ data, valueLabel = 'Value', valueFormatter = (v) => String(v), refLines = [], defaultWindowCount }: SimpleLineChartProps) {
  const startIndex = defaultWindowCount ? Math.max(0, data.length - defaultWindowCount) : undefined
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), 'yyyy')} minTickGap={24} stroke="#666" fontSize={12} />
        <YAxis stroke="#666" fontSize={12} />
        <Tooltip
          formatter={(value: number) => [valueFormatter(Number(value)), valueLabel]}
          labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        {refLines.map((r, i) => (
          <ReferenceLine key={i} y={r.y} stroke={r.color || '#999'} strokeDasharray={r.dash || '3 3'} />
        ))}
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
        {data.length > 30 && <Brush dataKey="date" height={22} travellerWidth={8} stroke="#94a3b8" startIndex={startIndex} />}
      </LineChart>
    </ResponsiveContainer>
  )
}

