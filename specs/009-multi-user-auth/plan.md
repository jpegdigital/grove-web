# Implementation Plan: Multi-User Authentication & Per-User Subscriptions

**Branch**: `009-multi-user-auth` | **Date**: 2026-03-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-multi-user-auth/spec.md`

## Summary

Add Supabase Auth (email/password) with per-user creator subscriptions. Users log in and see only videos from creators they're subscribed to. A parent (admin) manages all users' subscriptions via `/admin/subscriptions`. Route protection via Next.js 16 proxy. RLS enforces data access at the database layer.

## Technical Context

**Language/Version**: TypeScript 5 (Next.js 16.2.0, React 19), Python 3 (sync scripts — unchanged)
**Primary Dependencies**: `@supabase/supabase-js` v2.99.3, `@supabase/ssr` (new), `@tanstack/react-query` v5, `next` v16.2.0
**Storage**: Supabase Postgres (existing), Cloudflare R2 (existing, unchanged)
**Testing**: Vitest v4.1.0
**Target Platform**: Web (desktop + tablet, family use)
**Project Type**: Web application (Next.js App Router, client-side queries)
**Performance Goals**: Feed loads in < 3s, subscription changes reflected in < 5s
**Constraints**: 3 users, < 1000 videos, single Supabase project
**Scale/Scope**: 3 user accounts, ~5 creators, ~20 channels, < 1000 videos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Progressive Complexity | PASS | New tables are minimal (profiles, user_subscriptions). No premature abstractions — client factories are the standard @supabase/ssr pattern. |
| II. Testing Discipline | PASS | RLS policies testable via Vitest + Supabase client with different auth contexts. Proxy redirect logic testable. |
| III. Fail Fast & Loud | PASS | Missing env vars (SUPABASE_SECRET_KEY) fail on import. Auth errors redirect to login. RLS denies silently (returns empty) — correct for security. |
| IV. Configuration as Data | PASS | Roles stored in profiles table (data). No hardcoded user IDs. Route matcher patterns are static config in proxy. |
| V. Code Style | PASS | Follows existing patterns: kebab-case files, PascalCase components, path aliases. Supabase client factories follow official @supabase/ssr patterns. |
| VI. Anti-Patterns | PASS | No catch-all handlers. No magic strings (roles are typed). No god modules. |

**Post-Phase 1 Re-check**: All gates still pass. The data model adds two small tables and a hook function — minimal complexity. RLS policies use standard Supabase patterns.

## Project Structure

### Documentation (this feature)

```text
specs/009-multi-user-auth/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: setup guide
├── contracts/
│   ├── rls-policies.md  # Phase 1: all RLS policy definitions
│   └── auth-routes.md   # Phase 1: route protection contracts
└── tasks.md             # Phase 2: task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── proxy.ts                          # NEW: Next.js 16 proxy (auth + role checks)
├── lib/
│   ├── supabase.ts                   # DELETED (replaced by supabase/ directory)
│   └── supabase/
│       ├── client.ts                 # NEW: createBrowserClient factory
│       ├── server.ts                 # NEW: createServerClient with cookie adapter
│       ├── admin.ts                  # NEW: admin client (service role key)
│       └── proxy.ts                  # NEW: session refresh helper
├── hooks/
│   └── use-feed.ts                   # MODIFIED: use client factory
├── components/
│   └── (existing)                    # MODIFIED: auth-aware navigation (logout button)
├── app/
│   ├── layout.tsx                    # MODIFIED: auth state provider
│   ├── page.tsx                      # MODIFIED: filter by subscriptions
│   ├── login/
│   │   └── page.tsx                  # NEW: email/password login form
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts             # NEW: PKCE code exchange
│   ├── feed/
│   │   └── page.tsx                  # UNCHANGED (uses useFeed which handles filtering via RLS)
│   ├── c/[slug]/
│   │   └── page.tsx                  # UNCHANGED (RLS handles filtering)
│   ├── v/[id]/
│   │   └── page.tsx                  # MODIFIED: use client factory
│   ├── admin/
│   │   ├── page.tsx                  # MODIFIED: use client factory
│   │   └── subscriptions/
│   │       └── page.tsx              # NEW: subscription management UI
│   └── api/
│       └── videos/[id]/
│           └── route.ts              # MODIFIED: use server client with auth
supabase/
└── migrations/
    └── 2026MMDD_multi_user_auth.sql  # NEW: profiles, subscriptions, hook, RLS
```

**Structure Decision**: Extends existing Next.js App Router structure. No new top-level directories. Supabase client split from single file to directory with three factory functions (standard `@supabase/ssr` pattern). Proxy file at `src/proxy.ts` per Next.js 16 convention.
