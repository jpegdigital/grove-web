# Research: Client-Side Supabase Queries

**Date**: 2026-03-24

## R1: Supabase Client-Side Query Feasibility

**Decision**: Direct client-side Supabase queries are fully supported and recommended for this use case.

**Rationale**:
- The Supabase client (`@supabase/supabase-js`) is already initialized with `NEXT_PUBLIC_` env vars, making it browser-compatible
- RLS is permissive (all tables allow full CRUD via publishable key) — no auth layer needed
- PostgREST's REST API supports the same joins and filters from the browser as from the server
- The current API routes are pure proxies with no business logic that requires server-side execution (feed scoring is pure functions)

**Alternatives considered**:
- Keep API routes with caching headers — rejected because it still has the cold-start problem and adds unnecessary indirection
- Server Components with `use` — rejected because the pages are already `"use client"` and use React Query for caching

## R2: Feed Scoring Client-Side Viability

**Decision**: Feed scoring runs client-side without modification.

**Rationale**:
- `src/lib/feed-scoring.ts` exports only pure functions (`scoreFeed`, `diversify`, `hashToFloat`, etc.)
- No Node.js-specific APIs (no `fs`, `crypto`, `process`, etc.)
- No `"use server"` directive
- The module is already importable from client components
- Data volume is small (~1000 videos max) — scoring computation is negligible on any modern device

**Alternatives considered**:
- Supabase Edge Function for scoring — rejected because it adds complexity and latency for no benefit at this scale
- Database-level scoring via SQL — rejected because the scoring algorithm uses daily jitter seeds and per-channel relative ranking that are awkward in SQL

## R3: Supabase PostgREST Join Syntax for Creator Avatar/Cover Resolution

**Decision**: Use named foreign key joins with `!constraint_name` syntax to resolve avatar and cover URLs.

**Rationale**:
- `creators.avatar_channel_id` and `creators.cover_channel_id` both reference `channels.youtube_id`
- PostgREST requires disambiguation when multiple FKs point to the same table
- Syntax: `avatar_channel:channels!avatar_channel_id(thumbnail_url)` — this was already validated and working in the current `/api/creators` route
- The fallback (first curated channel's thumbnail/banner) requires also joining `curated_channels(channels(thumbnail_url, banner_url))`

**Alternatives considered**:
- Separate queries for avatar/cover resolution — rejected because PostgREST can do it in one query
- Storing resolved URLs directly on the creators table — rejected because it would require a sync step and could get stale

## R4: Admin Panel Data Fetching Strategy

**Decision**: Move admin to direct Supabase queries inline (same pattern as home page), eliminating its dependency on `/api/creators`.

**Rationale**:
- The admin page already uses `"use client"` and React Query
- The Supabase client is already available client-side
- No server-side secrets are needed for admin queries (publishable key + permissive RLS)
- This allows complete removal of the `/api/creators` route

**Alternatives considered**:
- Keep `/api/creators?include=channels` just for admin — rejected because it preserves the unnecessary proxy pattern for no benefit
- Create a dedicated admin API — rejected for the same reason
