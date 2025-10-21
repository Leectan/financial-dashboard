import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Brush, ReferenceLine } from 'recharts'
import { format } from 'date-fns'

interface BuffettChartProps {
  ratio: number
}

export function BuffettChart({ ratio }: BuffettChartProps) {
  const getColor = (value: number) => {
    if (value > 200) return '#dc2626'
    if (value > 150) return '#ea580c'
    if (value > 120) return '#fbbf24'
    if (value > 100) return '#22c55e'
    return '#3b82f6'
  }

  const data = [
    { name: 'Buffett Indicator', value: Math.min(ratio, 250), fill: getColor(ratio) },
  ]

  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadialBarChart innerRadius="50%" outerRadius="100%" data={data} startAngle={180} endAngle={0}>
        <PolarAngleAxis type="number" domain={[0, 250]} angleAxisId={0} tick={false} />
        <RadialBar background dataKey="value" cornerRadius={10} label={{ position: 'center', formatter: () => `${ratio.toFixed(1)}%` }} />
      </RadialBarChart>
    </ResponsiveContainer>
  )
}

interface BuffettHistoryChartProps { history: Array<{ date: string; ratio: number }> }

export function BuffettHistoryChart({ history }: BuffettHistoryChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={history} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), 'yyyy')} minTickGap={24} stroke="#666" fontSize={12} />
        <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}%`} stroke="#666" fontSize={12} domain={[0, 300]} />
        <Tooltip
          formatter={(value: number) => [`${Number(value).toFixed(1)}%`, 'Buffett Ratio']}
          labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <ReferenceLine y={100} stroke="#22c55e" strokeDasharray="3 3" />
        <ReferenceLine y={150} stroke="#f59e0b" strokeDasharray="3 3" />
        <ReferenceLine y={200} stroke="#dc2626" strokeDasharray="3 3" />
        <Line type="monotone" dataKey="ratio" stroke="#2563eb" strokeWidth={2} dot={false} />
        {history.length > 50 && <Brush dataKey="date" height={22} travellerWidth={8} stroke="#94a3b8" />}
      </LineChart>
    </ResponsiveContainer>
  )
}
