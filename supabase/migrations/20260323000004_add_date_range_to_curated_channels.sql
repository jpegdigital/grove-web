-- Per-channel date range override for ytdl-sub
-- NULL means use the default (today-6months), otherwise a ytdl-sub date string like "today-2years"
ALTER TABLE curated_channels
  ADD COLUMN IF NOT EXISTS date_range_override text;

COMMENT ON COLUMN curated_channels.date_range_override IS 'ytdl-sub date_range.after override, e.g. "today-2years". NULL = use default.';
