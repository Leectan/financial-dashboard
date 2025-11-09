# Cron Schedule Configuration

## Current Schedule
- **Frequency**: Daily at midnight UTC (`0 0 * * *`)
- **Endpoint**: `/api/cron/update`

## Limitations
The current schedule is limited by **Vercel Hobby plan** which only allows daily cron jobs.

## Recommended for Pro Plan
If you upgrade to Vercel Pro plan, update the schedule to:
```
0 */4 * * *
```
This runs every 4 hours, ensuring treasury yield data is captured within 6 hours of the 4:05 PM CST FRED update.

## Schedule Breakdown
- **Current (Hobby)**: Once per day at midnight UTC (6 PM CST)
- **Recommended (Pro)**: Every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)

## Note
Even with daily cron, the frontend implements **smart auto-refresh**:
- Treasury yields: Every 5 minutes during market hours, hourly off-hours
- M2/Buffett: Hourly refresh
- All data: Refresh on window focus

This ensures users get reasonably fresh data even between cron runs.
