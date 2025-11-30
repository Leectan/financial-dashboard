export const CONFIG = {
  app: {
    name: 'Financial Indicators Dashboard',
    description: 'Real-time macroeconomic indicators and market valuation metrics',
    version: '1.0.0',
  },
  api: {
    fred: {
      baseUrl: 'https://api.stlouisfed.org/fred',
      rateLimit: 120,
    },
    yahoo: {
      baseUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
    },
  },
  cache: {
    defaultTTL: 3600,
  },
  rateLimit: {
    requestsPerMinute: 10,
    windowMs: 60000,
  },
  // No automatic refetch - manual refresh only via the Refresh button
} as const



