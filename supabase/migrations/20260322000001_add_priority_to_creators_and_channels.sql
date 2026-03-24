-- Add priority (0-100) to creators and curated_channels for feed scoring

ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 50
    CHECK (priority >= 0 AND priority <= 100);

ALTER TABLE curated_channels
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 50
    CHECK (priority >= 0 AND priority <= 100);
