-- Add source_tags column to videos table for multi-source discovery.
-- Tracks which source(s) discovered each video: 'popular', 'rated', 'recent'.
-- Used by daily runs to identify reserved (popular/rated) slots that shouldn't be removed.

ALTER TABLE videos ADD COLUMN source_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_videos_source_tags ON videos USING GIN (source_tags);
