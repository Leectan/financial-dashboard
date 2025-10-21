import { NextResponse } from 'next/server'
import { checkRedisHealth } from '@/lib/cache/redis'

export const runtime = 'nodejs'

export async function GET() {
  const services = {
    redis: await checkRedisHealth(),
    fred: Boolean(process.env.FRED_API_KEY),
  }

  const status = services.redis && services.fred ? 'healthy' : services.redis || services.fred ? 'degraded' : 'unhealthy'

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      services,
      uptime: process.uptime(),
    },
    { status: status === 'healthy' ? 200 : 503 }
  )
}
