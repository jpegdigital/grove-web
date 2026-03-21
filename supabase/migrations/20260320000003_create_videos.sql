-- Cached video data from YouTube API
-- Initially populated from search endpoint (thin data),
-- can be enriched later via videos.list for duration/view_count

create table videos (
  youtube_id     text primary key,
  channel_id     text not null references channels(youtube_id) on delete cascade,
  title          text not null,
  description    text,
  thumbnail_url  text,
  published_at   timestamptz,
  duration       text,                               -- ISO 8601 e.g. "PT3M45S", null until enriched
  view_count     bigint,                             -- null until enriched via videos.list
  fetched_at     timestamptz default now(),
  created_at     timestamptz default now()
);

create index idx_videos_channel on videos(channel_id, published_at desc);

comment on column videos.duration is 'ISO 8601 duration from videos.list contentDetails (null until enriched)';
comment on column videos.view_count is 'From videos.list statistics (null until enriched)';
