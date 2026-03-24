-- Add download tracking columns to videos and channels
-- Tracks which videos have been downloaded by ytdl-sub and enriched from .info.json

-- Videos: download state and sidecar file paths
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS is_downloaded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS subtitle_path text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS like_count bigint,
  ADD COLUMN IF NOT EXISTS comment_count bigint,
  ADD COLUMN IF NOT EXISTS tags text[],
  ADD COLUMN IF NOT EXISTS categories text[],
  ADD COLUMN IF NOT EXISTS chapters jsonb,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS fps real,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS webpage_url text,
  ADD COLUMN IF NOT EXISTS handle text,
  ADD COLUMN IF NOT EXISTS downloaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS info_json_synced_at timestamptz;

COMMENT ON COLUMN videos.is_downloaded IS 'True when ytdl-sub has downloaded the video to MEDIA_DIRECTORY';
COMMENT ON COLUMN videos.media_path IS 'Relative path from MEDIA_DIRECTORY e.g. @handle/2024-03/VIDEO_ID.mp4';
COMMENT ON COLUMN videos.duration_seconds IS 'Precise duration in seconds from yt-dlp .info.json';
COMMENT ON COLUMN videos.chapters IS 'Array of {title, start_time, end_time} from yt-dlp';

-- Channels: track when videos were last synced
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS videos_fetched_at timestamptz;

COMMENT ON COLUMN channels.videos_fetched_at IS 'Last time videos were synced for this channel (null = never synced)';

-- Index for finding downloaded videos
CREATE INDEX IF NOT EXISTS idx_videos_downloaded
  ON videos (is_downloaded)
  WHERE is_downloaded = true;
