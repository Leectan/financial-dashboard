interface ChartContainerProps {
  title?: string
  children: React.ReactNode
}

export function ChartContainer({ title, children }: ChartContainerProps) {
  return (
    <div className="chart-container">
      {title && <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{title}</h4>}
      <div className="bg-white dark:bg-gray-800 rounded-md p-2">{children}</div>
    </div>
  )
}






