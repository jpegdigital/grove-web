# Quickstart: Client-Side Supabase Queries

**Date**: 2026-03-24

## What Changed

This feature moves data fetching for kid-facing pages from Next.js API routes to direct client-side Supabase queries using React Query.

### Before
```
Browser → GET /api/creators → Next.js server → Supabase → response
Browser → GET /api/videos/feed → Next.js server → Supabase → response (with scoring)
```

### After
```
Browser → Supabase (direct, via publishable key)
Browser → Supabase (direct) → client-side scoring/diversification
```

## Files Modified

| File | Change |
|------|--------|
| `src/app/page.tsx` | Replaced `fetch("/api/creators")` with direct Supabase query via React Query |
| `src/components/feed-view.tsx` | Replaced `fetch("/api/videos/feed")` with direct Supabase queries + client-side feed scoring |
| `src/app/admin/page.tsx` | Replaced `fetch("/api/creators?include=channels")` with direct Supabase queries |
| `src/hooks/use-feed.ts` | New hook encapsulating feed data fetching + scoring |
| `src/lib/queries/creators.ts` | New module with shared creator query functions |

## Files Deleted

| File | Reason |
|------|--------|
| `src/app/api/creators/route.ts` | No longer needed — queries run client-side |
| `src/app/api/videos/feed/route.ts` | No longer needed — queries run client-side |

## How to Verify

1. `npm run dev` — start the dev server
2. Open the home page — creator avatars should load
3. Open the feed page — videos should appear in scored/diversified order
4. Open the admin panel — creator groups with channels should display
5. Check browser network tab — no requests to `/api/creators` or `/api/videos/feed`; Supabase REST API calls go directly to the Supabase URL
