# Auth Route Contracts

**Branch**: `009-multi-user-auth` | **Date**: 2026-03-25

## Proxy Route Protection (`proxy.ts`)

All routes pass through the proxy. Behavior by path:

| Path Pattern | Auth Required | Role Required | Behavior |
|-------------|--------------|---------------|----------|
| `/login` | No | — | If authenticated, redirect to `/feed` |
| `/auth/callback` | No | — | PKCE code exchange, then redirect |
| `/_next/*` | No | — | Excluded via matcher (static assets) |
| `/favicon.ico` | No | — | Excluded via matcher |
| `/admin/*` | Yes | admin | If not admin, redirect to `/feed` |
| `/*` (all other) | Yes | — | If not authenticated, redirect to `/login` |

## Pages

| Route | Component | Auth | Role | Description |
|-------|-----------|------|------|-------------|
| `/` | Home | Yes | any | Creator grid (filtered by subscriptions) |
| `/feed` | Feed | Yes | any | All subscribed videos |
| `/c/[slug]` | Creator feed | Yes | any | Videos from one creator (if subscribed) |
| `/v/[id]` | Video player | Yes | any | Single video (if subscribed to creator) |
| `/login` | Login | No | — | Email/password sign-in form |
| `/admin` | Admin panel | Yes | admin | Channel/creator management |
| `/admin/subscriptions` | Subscription mgmt | Yes | admin | Per-user subscription toggles |

## Auth Callback

**Route**: `GET /auth/callback`

Handles PKCE code exchange after sign-in. Reads `code` from query params, exchanges for session via `supabase.auth.exchangeCodeForSession(code)`, redirects to `/feed`.

## Client-Side Auth State

The browser Supabase client reads auth cookies automatically. Components access auth state via:
- `supabase.auth.getUser()` — current user (async)
- `supabase.auth.getSession()` — current session with JWT
- `supabase.auth.onAuthStateChange()` — reactive auth state listener
- `supabase.auth.signOut()` — logout, clears cookies
