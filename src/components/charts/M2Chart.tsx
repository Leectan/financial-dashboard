import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from 'recharts'
import { format } from 'date-fns'

interface M2ChartProps {
  data: Array<{ date: string; value: number }>
}

export function M2Chart({ data }: M2ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), 'yyyy')} minTickGap={24} stroke="#666" fontSize={12} />
        <YAxis tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(1)}T`} stroke="#666" fontSize={12} />
        <Tooltip
          formatter={(value: number) => [`$${Number(value).toFixed(0)}B`, 'M2']}
          labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
        {data.length > 50 && <Brush dataKey="date" height={22} travellerWidth={8} stroke="#94a3b8" />}
      </LineChart>
    </ResponsiveContainer>
  )
}
