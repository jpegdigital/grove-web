# RLS Policy Contracts

**Branch**: `009-multi-user-auth` | **Date**: 2026-03-25

All existing permissive policies (`using (true)`) will be dropped and replaced.

## Helper Expressions

```sql
-- Cached per-statement (not per-row) for performance
(select auth.uid())                                    -- current user ID
(select auth.jwt() -> 'app_metadata' ->> 'role')      -- current user role
```

## profiles

| Policy | Operation | Target | Expression |
|--------|-----------|--------|------------|
| profiles_select_own | SELECT | authenticated | `(select auth.uid()) = user_id` |
| profiles_select_admin | SELECT | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| profiles_insert_admin | INSERT | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| profiles_update_admin | UPDATE | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |

## user_subscriptions

| Policy | Operation | Target | Expression |
|--------|-----------|--------|------------|
| subscriptions_select_own | SELECT | authenticated | `(select auth.uid()) = user_id` |
| subscriptions_select_admin | SELECT | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| subscriptions_insert_admin | INSERT | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| subscriptions_delete_admin | DELETE | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |

## creators

| Policy | Operation | Target | Expression |
|--------|-----------|--------|------------|
| creators_select_authed | SELECT | authenticated | `true` (global resource) |
| creators_insert_admin | INSERT | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| creators_update_admin | UPDATE | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| creators_delete_admin | DELETE | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |

## channels

| Policy | Operation | Target | Expression |
|--------|-----------|--------|------------|
| channels_select_authed | SELECT | authenticated | `true` (global resource) |
| channels_insert_admin | INSERT | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| channels_update_admin | UPDATE | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| channels_delete_admin | DELETE | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |

## curated_channels

| Policy | Operation | Target | Expression |
|--------|-----------|--------|------------|
| curated_channels_select_authed | SELECT | authenticated | `true` (global resource) |
| curated_channels_insert_admin | INSERT | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| curated_channels_update_admin | UPDATE | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| curated_channels_delete_admin | DELETE | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |

## videos

| Policy | Operation | Target | Expression |
|--------|-----------|--------|------------|
| videos_select_subscribed | SELECT | authenticated | See below |
| videos_insert_admin | INSERT | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| videos_update_admin | UPDATE | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |
| videos_delete_admin | DELETE | authenticated | `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` |

### videos_select_subscribed expression

```sql
-- Admin sees all, members see only subscribed creators' videos
(select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
OR
channel_id IN (
  SELECT cc.channel_id
  FROM curated_channels cc
  INNER JOIN user_subscriptions us ON us.creator_id = cc.creator_id
  WHERE us.user_id = (select auth.uid())
)
```

## sync_queue

No RLS changes. Accessed by Python scripts via `DATABASE_URL` (postgres role, bypasses RLS).

## anon role

All tables: no policies for `anon` role. Unauthenticated requests get zero rows.
