# Quickstart: Multi-User Authentication & Per-User Subscriptions

**Branch**: `009-multi-user-auth` | **Date**: 2026-03-25

## Prerequisites

- Supabase project with Auth enabled (already provisioned)
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured
- `SUPABASE_SECRET_KEY` (service role key) — needed for admin client operations

## Setup Steps

### 1. Install dependency

```bash
npm install @supabase/ssr
```

### 2. Run database migration

Apply the migration that creates `profiles`, `user_subscriptions`, `custom_access_token_hook`, and replaces all RLS policies.

### 3. Enable the Custom Access Token Hook

In Supabase Dashboard:
1. Go to **Authentication → Hooks**
2. Enable **Custom Access Token** hook
3. Set it to `public.custom_access_token_hook`

### 4. Create user accounts

Via Supabase Dashboard (Authentication → Users → Add User):
1. Parent account (email/password) — then set `role = 'admin'` in `profiles`
2. Child 1 account — `role = 'member'`
3. Child 2 account — `role = 'member'`

Or run the seed script (to be created) that uses the admin API.

### 5. Set initial subscriptions

Log in as parent → navigate to `/admin/subscriptions` → toggle creators for each account.

## Key Files (will be created/modified)

```
NEW FILES:
  src/lib/supabase/client.ts      — createBrowserClient (replaces supabase.ts)
  src/lib/supabase/server.ts      — createServerClient with cookies
  src/lib/supabase/admin.ts       — admin client with service role key
  src/lib/supabase/proxy.ts       — session refresh helper for proxy
  src/proxy.ts                    — Next.js proxy (route protection)
  src/app/login/page.tsx          — Login page
  src/app/auth/callback/route.ts  — PKCE code exchange
  src/app/admin/subscriptions/page.tsx — Subscription management

MODIFIED FILES:
  src/lib/supabase.ts             — DELETED (replaced by supabase/ directory)
  src/hooks/use-feed.ts           — use createClient() instead of singleton
  src/lib/queries/creators.ts     — use createClient() instead of singleton
  src/app/layout.tsx              — add auth state listener / logout button
  src/app/page.tsx                — filter creators by subscriptions
  src/app/v/[id]/page.tsx         — use createClient()
  src/app/admin/page.tsx          — use createClient() (admin already, no logic change)
  src/app/api/videos/[id]/route.ts — use server client with auth
  package.json                    — add @supabase/ssr
  supabase/migrations/            — new migration file

MIGRATION:
  supabase/migrations/2026MMDD_multi_user_auth.sql
    - CREATE profiles, user_subscriptions
    - CREATE custom_access_token_hook function
    - DROP all old permissive RLS policies
    - CREATE new role-based + subscription-scoped RLS policies
```

## Verification

1. **Auth flow**: Open app → redirected to `/login` → sign in → see feed
2. **Feed scoping**: Sign in as child → see only subscribed creators' videos
3. **Admin gate**: Sign in as child → navigate to `/admin` → redirected to `/feed`
4. **Subscription management**: Sign in as parent → `/admin/subscriptions` → toggle creator for child → child's feed updates
5. **RLS enforcement**: Open browser dev tools → try querying unsubscribed videos via Supabase client → zero rows returned
