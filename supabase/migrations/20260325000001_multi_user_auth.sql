-- ============================================================================
-- Multi-User Authentication & Per-User Subscriptions
-- Creates profiles, user_subscriptions, custom_access_token_hook, is_admin()
-- Replaces all permissive RLS policies with role-based + subscription-scoped
-- ============================================================================

-- 1. New tables

-- profiles: extends auth.users with app-specific fields
CREATE TABLE profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  display_name TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- user_subscriptions: links users to creators
CREATE TABLE user_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id  UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, creator_id)
);

CREATE INDEX idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_creator ON user_subscriptions(creator_id);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- 2. Table grants for authenticated role

GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_subscriptions TO authenticated;

-- 3. Custom Access Token Hook
-- Injects role from profiles into JWT app_metadata on every token issuance.
-- Must be enabled in Supabase Dashboard: Authentication > Hooks > Custom Access Token

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims JSONB;
  user_role TEXT;
BEGIN
  claims := event->'claims';

  SELECT role INTO user_role
  FROM public.profiles
  WHERE user_id = (event->>'user_id')::UUID;

  IF user_role IS NULL THEN
    user_role := 'member';
  END IF;

  claims := jsonb_set(
    claims,
    '{app_metadata}',
    COALESCE(claims->'app_metadata', '{}'::JSONB)
  );
  claims := jsonb_set(
    claims,
    '{app_metadata,role}',
    to_jsonb(user_role)
  );

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.profiles FROM public;

-- 4. Admin helper function
-- Checks profiles table directly instead of JWT claims (no token freshness issues)

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin FROM anon, public;

-- 5. Drop old permissive RLS policies

DROP POLICY IF EXISTS "channels_select" ON channels;
DROP POLICY IF EXISTS "channels_insert" ON channels;
DROP POLICY IF EXISTS "channels_update" ON channels;
DROP POLICY IF EXISTS "channels_delete" ON channels;

DROP POLICY IF EXISTS "curated_channels_select" ON curated_channels;
DROP POLICY IF EXISTS "curated_channels_insert" ON curated_channels;
DROP POLICY IF EXISTS "curated_channels_update" ON curated_channels;
DROP POLICY IF EXISTS "curated_channels_delete" ON curated_channels;

DROP POLICY IF EXISTS "videos_select" ON videos;
DROP POLICY IF EXISTS "videos_insert" ON videos;
DROP POLICY IF EXISTS "videos_update" ON videos;
DROP POLICY IF EXISTS "videos_delete" ON videos;

DROP POLICY IF EXISTS "creators_select" ON creators;
DROP POLICY IF EXISTS "creators_insert" ON creators;
DROP POLICY IF EXISTS "creators_update" ON creators;
DROP POLICY IF EXISTS "creators_delete" ON creators;

-- 6. New RLS policies (using is_admin() for admin checks)

-- profiles
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- user_subscriptions
CREATE POLICY "subscriptions_select_own" ON user_subscriptions
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "subscriptions_select_admin" ON user_subscriptions
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "subscriptions_insert_admin" ON user_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "subscriptions_delete_admin" ON user_subscriptions
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- creators: global read, admin write
CREATE POLICY "creators_select_authed" ON creators
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "creators_insert_admin" ON creators
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "creators_update_admin" ON creators
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "creators_delete_admin" ON creators
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- channels: global read, admin write
CREATE POLICY "channels_select_authed" ON channels
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "channels_insert_admin" ON channels
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "channels_update_admin" ON channels
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "channels_delete_admin" ON channels
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- curated_channels: global read, admin write
CREATE POLICY "curated_channels_select_authed" ON curated_channels
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "curated_channels_insert_admin" ON curated_channels
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "curated_channels_update_admin" ON curated_channels
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "curated_channels_delete_admin" ON curated_channels
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- videos: subscription-scoped read, admin write
CREATE POLICY "videos_select_subscribed" ON videos
  FOR SELECT TO authenticated
  USING (
    channel_id IN (
      SELECT cc.channel_id
      FROM curated_channels cc
      INNER JOIN user_subscriptions us ON us.creator_id = cc.creator_id
      WHERE us.user_id = (select auth.uid())
    )
  );

CREATE POLICY "videos_insert_admin" ON videos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "videos_update_admin" ON videos
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "videos_delete_admin" ON videos
  FOR DELETE TO authenticated
  USING (public.is_admin());
