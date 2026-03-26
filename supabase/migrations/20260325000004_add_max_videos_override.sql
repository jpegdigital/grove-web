ALTER TABLE curated_channels
  ADD COLUMN IF NOT EXISTS max_videos_override integer;

COMMENT ON COLUMN curated_channels.max_videos_override
  IS 'Per-channel override for max videos. NULL = use global config default.';
