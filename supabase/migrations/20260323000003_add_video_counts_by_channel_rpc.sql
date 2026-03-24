-- RPC function: returns downloaded + R2-uploaded video counts per channel
CREATE OR REPLACE FUNCTION video_counts_by_channel()
RETURNS TABLE(channel_id text, downloaded bigint, uploaded bigint) AS $$
  SELECT v.channel_id,
    COUNT(*) FILTER (WHERE v.is_downloaded = true) AS downloaded,
    COUNT(*) FILTER (WHERE v.r2_synced_at IS NOT NULL) AS uploaded
  FROM videos v
  WHERE v.channel_id IS NOT NULL
  GROUP BY v.channel_id;
$$ LANGUAGE sql STABLE;
