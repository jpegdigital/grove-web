-- Creators: group curated channels by content creator
-- e.g. "Brooke and Riley", "Dash", "Aaron & LB"

create table creators (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  avatar_channel_id  text references channels(youtube_id) on delete set null,
  cover_channel_id   text references channels(youtube_id) on delete set null,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

create index idx_creators_display_order on creators(display_order);
create index idx_creators_slug on creators(slug);

-- Add creator_id FK to curated_channels (nullable — null means ungrouped)
alter table curated_channels
  add column creator_id uuid references creators(id) on delete set null;

create index idx_curated_creator on curated_channels(creator_id);

-- RLS: permissive for single-user POC
alter table creators enable row level security;

create policy "creators_select" on creators for select using (true);
create policy "creators_insert" on creators for insert with check (true);
create policy "creators_update" on creators for update using (true) with check (true);
create policy "creators_delete" on creators for delete using (true);
