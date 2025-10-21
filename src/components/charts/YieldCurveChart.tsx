import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Brush } from 'recharts'
import { format } from 'date-fns'

interface YieldCurveChartProps {
  // current snapshot still used for card context
  spread: number
  treasury10Y: number
  treasury2Y: number
  inverted: boolean
  // new historical series (date asc)
  history?: Array<{ date: string; spread: number }>
}

export function YieldCurveChart({ spread, treasury10Y, treasury2Y, inverted, history = [] }: YieldCurveChartProps) {
  const data = history.length > 0 ? history : [{ date: new Date().toISOString().slice(0, 10), spread }]

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), 'yyyy')} minTickGap={24} stroke="#666" fontSize={12} />
        <YAxis tickFormatter={(v) => `${Number(v).toFixed(1)}%`} stroke="#666" fontSize={12} domain={[dataMin => Math.min(-1, Number(dataMin)), dataMax => Math.max(3, Number(dataMax))]} />
        <Tooltip
          formatter={(value: number) => [`${Number(value).toFixed(2)}%`, 'Spread (10Y-2Y)']}
          labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
        <Line type="monotone" dataKey="spread" stroke={inverted ? '#dc2626' : '#2563eb'} strokeWidth={2} dot={false} />
        {history.length > 20 && (
          <Brush dataKey="date" height={22} travellerWidth={8} stroke="#94a3b8" />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
