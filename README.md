# Financial Indicators Dashboard

A real-time financial dashboard displaying key macroeconomic indicators including M2 Money Supply, Buffett Indicator, and Treasury Yield Curve spread.

## Features

- ✅ Real-time data from Federal Reserve (FRED) and Yahoo Finance
- ✅ Automatic updates every hour via background cron jobs
- ✅ Redis caching to minimize API calls and stay within rate limits
- ✅ Rate limiting to prevent abuse
- ✅ Responsive design with dark mode support
- ✅ Production-ready with TypeScript and error handling

## Tech Stack

- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Data Fetching:** TanStack Query (React Query)
- **Visualization:** Recharts
- **Caching:** Upstash Redis
- **Deployment:** Vercel

## Prerequisites

- Node.js 18+ and pnpm
- Free API keys:
  - FRED API: https://fred.stlouisfed.org/docs/api/api_key.html
  - Upstash Redis: https://upstash.com
- Vercel account for deployment (optional)

## Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd financial-dashboard
pnpm install
```

### 2. Get API Keys

**FRED API Key (Required):**
1. Visit https://fred.stlouisfed.org/
2. Create a free account
3. Go to API Keys section
4. Generate new API key (free, instant approval)

**Upstash Redis (Required):**
1. Visit https://upstash.com
2. Create free account
3. Create new Redis database
4. Copy REST URL and REST Token from dashboard

### 3. Configure Environment Variables

Create `.env.local` file in project root:

```env
FRED_API_KEY=your_fred_api_key_here
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_rest_token_here
CRON_SECRET=your_random_secret_here
```

Generate CRON_SECRET with:

```bash
openssl rand -base64 32
```

### 4. Run Development Server

```bash
pnpm dev
```

Open http://localhost:3000

### 5. Test API Endpoints

```bash
# Health check
curl http://localhost:3000/api/health

# M2 Money Supply
curl http://localhost:3000/api/indicators/m2

# Yield Curve
curl http://localhost:3000/api/indicators/treasury

# Buffett Indicator
curl http://localhost:3000/api/indicators/buffett

# All indicators
curl http://localhost:3000/api/indicators/all

# Cron update (requires secret)
curl http://localhost:3000/api/cron/update \
  -H "Authorization: Bearer your_cron_secret"
```

## Deployment

### Vercel (Recommended)

Important: For production/commercial use, upgrade to Vercel Pro ($20/month). Hobby tier is for personal use only.

1. Push code to GitHub
2. Visit https://vercel.com
3. Import your repository
4. Add environment variables in project settings
5. Deploy

Vercel automatically configures cron jobs from `vercel.json`.

### AWS (Alternative)

See `AWS_DEPLOYMENT.md` (optional) for detailed instructions.

## Architecture

```
┌─────────────┐
│   Browser   │
│  (React UI) │
└──────┬──────┘
       │ HTTP requests every 60s
       ▼
┌──────────────────────┐
│  Next.js API Routes  │
│  (Serverless)        │
└──────┬───────────────┘
       │
       ├─→ Redis Cache (1-24h TTL) ←─┐
       │                              │
       └─→ External APIs              │
           • FRED (120 req/min)       │
           • Yahoo Finance            │
                                      │
┌──────────────────────┐             │
│  Vercel Cron Job     │─────────────┘
│  (Hourly updates)    │
└──────────────────────┘
```

## Data Sources

| Indicator | Source | Update Frequency | Cache TTL |
|-----------|--------|------------------|-----------|
| M2 Money Supply | FRED (WM2NS) | Weekly (Tuesdays) | 24 hours |
| GDP | FRED (GDPC1) | Quarterly | 7 days |
| 10-Year Treasury | FRED (DGS10) | Daily (6 PM ET) | 1 hour |
| 2-Year Treasury | FRED (DGS2) | Daily (6 PM ET) | 1 hour |
| Wilshire 5000 | Yahoo Finance | Daily (4 PM ET market close) | 1 hour |

## API Rate Limits

**FRED API:**
- Free tier: 120 requests per minute
- Sufficient with caching

**Alpha Vantage (Optional Backup):**
- Free tier: 25 requests per day
- Use FRED as primary to avoid exhaustion

**Yahoo Finance:**
- Unofficial API, no documented limits
- Caching recommended

## Troubleshooting

### Redis Connection Fails

Check environment variables are correctly set:

```bash
echo $UPSTASH_REDIS_REST_URL
echo $UPSTASH_REDIS_REST_TOKEN
```

### FRED API Returns 429 (Rate Limit)

- Check caching is working (should see "Cache hit" logs)
- Verify FRED_API_KEY is valid
- Increase cache TTLs if necessary

### Data Shows as Stale

- Verify cron job is running (check Vercel logs)
- Manually trigger: `curl /api/cron/update` with auth header
- Check Redis connectivity

### Build Fails

```bash
pnpm clean
rm -rf .next node_modules
pnpm install
pnpm build
```

## Cost Breakdown

**Free Tier (Development):**
- Vercel Hobby: $0/month (personal use only)
- Upstash Redis: $0/month (10K commands/day)
- FRED API: $0/month (unlimited)
- Yahoo Finance: $0/month (unofficial)
- **Total: $0/month**

**Production (Commercial Use):**
- Vercel Pro: $20/month (required for commercial)
- Upstash Redis: $0-5/month (likely free tier sufficient)
- **Total: $20-25/month**

## License

MIT

## Contributing

Pull requests welcome! Please ensure:
- TypeScript strict mode passes
- All tests pass
- Code follows existing patterns


