-- Replace Bunny Stream columns with R2 tracking
-- Bunny columns were never deployed to production (POC only)

-- Drop Bunny indexes
DROP INDEX IF EXISTS idx_videos_bunny_pending;
DROP INDEX IF EXISTS idx_videos_bunny_video_id;

-- Drop Bunny columns
ALTER TABLE videos
  DROP COLUMN IF EXISTS bunny_video_id,
  DROP COLUMN IF EXISTS bunny_collection_id,
  DROP COLUMN IF EXISTS bunny_status,
  DROP COLUMN IF EXISTS bunny_uploaded_at;

-- Add R2 sync tracking column
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS r2_synced_at timestamptz;

-- Index for finding videos that need R2 upload (downloaded but not yet synced)
CREATE INDEX IF NOT EXISTS idx_videos_r2_pending
  ON videos (is_downloaded)
  WHERE r2_synced_at IS NULL AND is_downloaded = true;

-- Index for feed query: only show R2-synced videos
CREATE INDEX IF NOT EXISTS idx_videos_r2_synced
  ON videos (r2_synced_at)
  WHERE r2_synced_at IS NOT NULL;
