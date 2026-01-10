# Environment Variables

This project requires several environment variables for auth (Clerk), billing (Stripe), database (Supabase), and data providers (FRED / Upstash).

Create a local `.env.local` (not committed) with values like:

```bash
# Core App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Clerk (Auth UI + sessions)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=[PLACEHOLDER: clerk publishable key]
CLERK_SECRET_KEY=[PLACEHOLDER: clerk secret key]
CLERK_WEBHOOK_SECRET=[PLACEHOLDER: clerk webhook signing secret]

# Stripe (Subscriptions)
STRIPE_SECRET_KEY=[PLACEHOLDER: stripe secret key]
STRIPE_WEBHOOK_SECRET=[PLACEHOLDER: stripe webhook secret]
STRIPE_PRICE_ID_PREMIUM=[PLACEHOLDER: stripe price id for $10/mo premium]

# Supabase (DB for users/subscriptions; server-side only)
SUPABASE_URL=[PLACEHOLDER: supabase project url]
SUPABASE_SERVICE_ROLE_KEY=[PLACEHOLDER: supabase service role key]

# Existing data keys
FRED_API_KEY=[PLACEHOLDER: fred api key]
UPSTASH_REDIS_REST_URL=[PLACEHOLDER: upstash redis rest url]
UPSTASH_REDIS_REST_TOKEN=[PLACEHOLDER: upstash redis rest token]
```




