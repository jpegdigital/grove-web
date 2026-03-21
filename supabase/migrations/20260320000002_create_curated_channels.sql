-- Parent's approved channel list
-- Tracks which channels are curated and in what order

create table curated_channels (
  id             uuid primary key default gen_random_uuid(),
  channel_id     text not null references channels(youtube_id) on delete cascade,
  display_order  integer default 0,
  notes          text,                               -- parent's private notes about this channel
  created_at     timestamptz default now(),

  unique(channel_id)                                 -- single-user: one entry per channel
);

create index idx_curated_display_order on curated_channels(display_order);
