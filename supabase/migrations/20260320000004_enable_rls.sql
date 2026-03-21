-- Enable RLS on all tables with permissive policies
-- Single-user POC: allow all access via publishable key

alter table channels enable row level security;
alter table curated_channels enable row level security;
alter table videos enable row level security;

-- Channels: full access
create policy "channels_select" on channels for select using (true);
create policy "channels_insert" on channels for insert with check (true);
create policy "channels_update" on channels for update using (true) with check (true);
create policy "channels_delete" on channels for delete using (true);

-- Curated channels: full access
create policy "curated_channels_select" on curated_channels for select using (true);
create policy "curated_channels_insert" on curated_channels for insert with check (true);
create policy "curated_channels_update" on curated_channels for update using (true) with check (true);
create policy "curated_channels_delete" on curated_channels for delete using (true);

-- Videos: full access
create policy "videos_select" on videos for select using (true);
create policy "videos_insert" on videos for insert with check (true);
create policy "videos_update" on videos for update using (true) with check (true);
create policy "videos_delete" on videos for delete using (true);
