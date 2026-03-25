# Data Model: Multi-User Authentication & Per-User Subscriptions

**Branch**: `009-multi-user-auth` | **Date**: 2026-03-25

## New Entities

### profiles

Extends Supabase `auth.users` with application-specific fields.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| user_id | uuid | PK, FK → auth.users(id) ON DELETE CASCADE | Supabase auth user ID |
| role | text | NOT NULL, CHECK (role IN ('admin', 'member')), DEFAULT 'member' | Access level |
| display_name | text | NOT NULL | User-friendly name shown in admin UI |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Record creation time |

**RLS**:
- SELECT: authenticated users can read their own row; admin can read all rows
- UPDATE: admin only
- INSERT: admin only (profiles created during account setup)
- DELETE: admin only

### user_subscriptions

Links a user to creators they can see content from.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Row ID |
| user_id | uuid | NOT NULL, FK → auth.users(id) ON DELETE CASCADE | Subscribing user |
| creator_id | uuid | NOT NULL, FK → creators(id) ON DELETE CASCADE | Subscribed creator |
| created_at | timestamptz | NOT NULL, DEFAULT now() | When subscription was added |

**Unique constraint**: (user_id, creator_id) — one subscription per user per creator.

**Indexes**:
- `idx_user_subscriptions_user` on (user_id) — feed queries filter by user
- `idx_user_subscriptions_creator` on (creator_id) — admin views filter by creator

**RLS**:
- SELECT: authenticated users can read their own subscriptions; admin can read all
- INSERT: admin only (parent manages all subscriptions)
- DELETE: admin only

## Modified Entities

### videos (RLS change only)

No schema changes. RLS policies change from permissive to subscription-scoped.

**New RLS (SELECT)**:
- Admin: can see all videos (via JWT `app_metadata.role = 'admin'`)
- Member: can see videos where `channel_id` belongs to a creator they subscribe to

**RLS query chain**:
```
videos.channel_id
  → curated_channels.channel_id (where curated_channels.creator_id IS NOT NULL)
    → user_subscriptions.creator_id (where user_subscriptions.user_id = auth.uid())
```

**Write policies**: INSERT/UPDATE/DELETE restricted to admin role (or service role for Python scripts).

### creators (RLS change only)

No schema changes. RLS changes from permissive to:
- SELECT: all authenticated users (global resource)
- INSERT/UPDATE/DELETE: admin only

### channels (RLS change only)

No schema changes. RLS changes from permissive to:
- SELECT: all authenticated users (global resource)
- INSERT/UPDATE/DELETE: admin only

### curated_channels (RLS change only)

No schema changes. RLS changes from permissive to:
- SELECT: all authenticated users (needed for feed query joins)
- INSERT/UPDATE/DELETE: admin only

### sync_queue (no change)

Accessed by Python scripts via direct Postgres connection (`DATABASE_URL`), which uses the `postgres` role and bypasses RLS. No RLS changes needed.

## New Database Function

### custom_access_token_hook

A Postgres function registered as a Supabase Auth hook. Runs on every token issuance, injecting the user's role from `profiles` into the JWT `app_metadata`.

**Signature**: `custom_access_token_hook(event jsonb) → jsonb`

**Behavior**:
1. Extract `user_id` from event
2. Look up `role` from `profiles`
3. Set `claims.app_metadata.role` to the found role (default: `'member'`)
4. Return modified event

**Permissions**: `EXECUTE` granted to `supabase_auth_admin`. `profiles` table granted to `supabase_auth_admin`. Revoke `profiles` access from `authenticated`, `anon`, `public` (profiles are read via the hook, not direct queries — except for admin management).

> **Note**: After deploying this migration, the hook must be enabled in the Supabase Dashboard under Authentication → Hooks → Custom Access Token, pointing to `public.custom_access_token_hook`.

## Entity Relationship Diagram

```
auth.users (Supabase managed)
  ├── 1:1 → profiles (role, display_name)
  └── 1:N → user_subscriptions
                └── N:1 → creators
                             └── 1:N → curated_channels
                                          └── N:1 → channels
                                                       └── 1:N → videos
```

## Data Flow: Feed Query

1. User authenticates → JWT contains `app_metadata.role`
2. Browser client calls Supabase with auth token
3. RLS on `videos` evaluates:
   - If admin → pass (see all)
   - If member → check `videos.channel_id` exists in `curated_channels` where `creator_id` is in user's `user_subscriptions`
4. Only matching videos are returned
5. Feed hook processes returned videos as before (scoring, interleaving, pagination)
