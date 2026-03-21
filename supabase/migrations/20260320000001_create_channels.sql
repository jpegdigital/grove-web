-- YouTube channel metadata cache
-- Stores channel info fetched from YouTube Data API v3
-- Keyed on youtube_id (the UC... channel ID) which is immutable

create table channels (
  youtube_id              text primary key,
  title                   text not null,
  description             text,
  custom_url              text,                     -- @handle, can change over time
  thumbnail_url           text,
  banner_url              text,
  subscriber_count        bigint default 0,
  subscriber_count_hidden boolean default false,     -- API returns "0" when hidden
  video_count             bigint default 0,
  view_count              bigint default 0,
  published_at            timestamptz,               -- channel creation date
  fetched_at              timestamptz default now(),  -- last time channel metadata was refreshed
  videos_fetched_at       timestamptz,               -- last time videos were synced (null = never)
  created_at              timestamptz default now()
);

comment on column channels.fetched_at is 'Last time channel metadata was refreshed from YouTube API';
comment on column channels.videos_fetched_at is 'Last time videos were synced for this channel (null = never synced)';
comment on column channels.subscriber_count_hidden is 'True when channel hides subscriber count (API returns 0)';
