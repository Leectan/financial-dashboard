import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/cache/redis'

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  analytics: true,
  prefix: 'ratelimit',
})

export async function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url)
  if (!pathname.startsWith('/api/')) return NextResponse.next()
  if (pathname === '/api/health' || pathname === '/api/cron/update') return NextResponse.next()

  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]
  const ip = forwardedFor || request.headers.get('x-real-ip') || request.ip || '127.0.0.1'

  try {
    const { success, limit, reset, remaining } = await ratelimit.limit(ip)
    if (!success) {
      const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many requests from this IP address. Please try again later.',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(reset).toISOString(),
            'Retry-After': String(retryAfter),
          },
        }
      )
    }

    const res = NextResponse.next()
    res.headers.set('X-RateLimit-Limit', String(limit))
    res.headers.set('X-RateLimit-Remaining', String(remaining))
    res.headers.set('X-RateLimit-Reset', new Date(reset).toISOString())
    return res
  } catch (error) {
    console.warn('Ratelimit error:', error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: '/api/:path*',
}

