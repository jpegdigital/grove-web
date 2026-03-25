-- Fix: admin users could not SELECT from videos (video_counts_by_channel RPC returned 0).
-- The multi_user_auth migration added insert/update/delete admin policies but missed SELECT.
CREATE POLICY "videos_select_admin" ON videos
  FOR SELECT TO authenticated
  USING (public.is_admin());
