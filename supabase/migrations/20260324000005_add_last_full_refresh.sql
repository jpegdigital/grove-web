-- Track when each channel last had a full (popular+rated+recent) discovery run.
-- Used by rolling refresh: --mode full picks the oldest-refreshed channels first.

ALTER TABLE curated_channels ADD COLUMN last_full_refresh_at timestamptz;
