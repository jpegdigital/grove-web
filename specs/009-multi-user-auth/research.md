# Research: Multi-User Authentication & Per-User Subscriptions

**Branch**: `009-multi-user-auth` | **Date**: 2026-03-25

## R1: Authentication Strategy

**Decision**: Supabase Auth with `@supabase/ssr` package, email/password sign-in.

**Rationale**: The project already uses Supabase (`@supabase/supabase-js` v2.99.3) and has `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured. Adding `@supabase/ssr` provides cookie-based session management required for SSR/proxy auth checks. Email/password is sufficient for a 3-user family app (no OAuth complexity needed).

**Alternatives considered**:
- NextAuth.js — adds another dependency and auth provider; Supabase Auth is already available at no cost.
- Custom JWT — unnecessary complexity when Supabase Auth handles token issuance, refresh, and storage.

## R2: Next.js Route Protection (Proxy)

**Decision**: Use Next.js 16 `proxy.ts` (renamed from `middleware.ts`) to refresh Supabase sessions and redirect unauthenticated users to `/login`.

**Rationale**: Next.js 16 renamed middleware to proxy. The proxy runs before every matched request, making it the correct place to refresh auth tokens and gate access. The `@supabase/ssr` `createServerClient` creates a Supabase client in the proxy that reads/writes auth cookies on each request, keeping sessions alive.

**Key details**:
- Proxy creates a Supabase client with cookie adapters, calls `getUser()` to trigger token refresh.
- Unauthenticated users are redirected to `/login`.
- Static assets (`_next/static`, `_next/image`, `favicon.ico`) are excluded via matcher.
- Login page and `/auth/callback` are excluded from redirect.

**Alternatives considered**:
- Per-page auth checks only — fragile, easy to miss a page. Proxy provides a single enforcement point.
- Server-side layout checks — Server Components can't set cookies, so can't refresh tokens.

## R3: Role-Based Access Control

**Decision**: Use a `profiles` table with a `role` column (`admin` | `member`) plus a Supabase Custom Access Token Hook that bakes the role into the JWT `app_metadata`.

**Rationale**: The hook runs on every token issuance, injecting the role from `profiles` into the JWT. This means RLS policies can read the role via `auth.jwt() -> 'app_metadata' ->> 'role'` without an extra table query per row. The `profiles` table is the source of truth; the JWT is a cached projection.

**Key details**:
- `profiles` table: `user_id` (PK, FK to `auth.users`), `role`, `display_name`.
- Hook function: `custom_access_token_hook(event jsonb)` reads role from profiles, sets it in `claims.app_metadata.role`.
- Hook must be enabled in Supabase Dashboard: Authentication → Hooks → Custom Access Token.
- Admin check in proxy: decode JWT, check `app_metadata.role === 'admin'` for `/admin/*` routes.

**Alternatives considered**:
- `app_metadata` set via admin API only — simpler but role changes require admin API call and token refresh. Less transparent.
- Profiles table check in every RLS policy — works but adds a subquery per policy evaluation. JWT approach is faster.

## R4: Per-User Subscriptions Data Model

**Decision**: New `user_subscriptions` table linking `auth.users.id` → `creators.id`. RLS on videos uses a subquery through `curated_channels` to check subscription.

**Rationale**: Subscriptions are at the creator level (per spec). Videos link to creators through `curated_channels` (videos → `channel_id` → `curated_channels.channel_id` → `curated_channels.creator_id`). The RLS policy on videos checks if the video's channel belongs to a creator the user is subscribed to.

**Key chain**: `videos.channel_id` → `curated_channels.channel_id` → `curated_channels.creator_id` → `user_subscriptions.creator_id` WHERE `user_subscriptions.user_id = auth.uid()`.

**Alternatives considered**:
- Subscription at channel level — too granular, user asked for creator-level subscriptions.
- Adding `creator_id` directly to videos table — would require denormalization and migration of existing data. The join through `curated_channels` is acceptable for the scale (< 1000 videos).

## R5: Supabase Client Refactoring

**Decision**: Replace the singleton `createClient` with three client factories from `@supabase/ssr`:
1. `createBrowserClient()` — for `"use client"` components (replaces current `supabase.ts`)
2. `createServerClient()` with cookie adapter — for proxy and any future server components
3. `createClient()` with `SUPABASE_SECRET_KEY` — for admin operations (user creation, bypassing RLS)

**Rationale**: `@supabase/ssr` manages auth cookies automatically. The browser client picks up the session from cookies set by the proxy, so all client-side Supabase queries automatically include the user's auth token. RLS then enforces per-user access.

**Key impact**: Every file that imports `supabase` from `@/lib/supabase` will need updating. The hook `useFeed` and query functions in `src/lib/queries/` all use the singleton client. They'll need to call `createClient()` instead of importing a singleton.

**Alternatives considered**:
- Keep singleton and add auth headers manually — brittle, doesn't integrate with Supabase's token refresh.
- React Context for Supabase client — unnecessary overhead; `createBrowserClient` is designed to be called per-component and deduplicates internally.

## R6: RLS Policy Strategy

**Decision**: Replace all permissive `using (true)` policies. New strategy:
- **`creators`, `channels`, `curated_channels`**: SELECT for all `authenticated` users (global config). INSERT/UPDATE/DELETE for `admin` role only.
- **`videos`**: SELECT only for videos whose channel belongs to a creator the user subscribes to, OR user is admin. Write operations for admin/service role only.
- **`user_subscriptions`**: Users SELECT their own rows. Admin can SELECT/INSERT/DELETE all rows.
- **`profiles`**: Users SELECT their own row. Admin can SELECT/UPDATE all rows.
- **`sync_queue`**: No RLS change needed (accessed by Python scripts via direct Postgres, bypasses RLS).

**Rationale**: The Python sync scripts connect via `DATABASE_URL` (direct Postgres), operating as the `postgres` role which bypasses RLS. So sync scripts are unaffected. Only browser clients using the publishable key are subject to RLS.

**Performance note**: Wrap `auth.uid()` and `auth.jwt()` in `(select ...)` for per-statement caching instead of per-row evaluation.

## R7: User Account Creation

**Decision**: Create accounts manually via Supabase Dashboard or a one-time script using the admin API (`auth.admin.createUser`). No self-registration flow in the app.

**Rationale**: This is a family app with exactly 3 users. Building a registration flow is unnecessary complexity. The parent creates accounts once during initial setup.

**Key details**:
- Use `email_confirm: true` to skip email verification.
- Set `app_metadata: { role: 'admin' }` for parent, `{ role: 'member' }` for kids.
- Create corresponding `profiles` row for each user.
- Can be done via Dashboard UI or a seed script.
