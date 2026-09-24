-- ============================================
-- True Talkie — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- CHANNELS (rooms / frequencies)
-- ─────────────────────────────────────────
create table if not exists channels (
  id          uuid primary key default uuid_generate_v4(),
  code        text unique not null,   -- e.g. "CH-7"
  name        text,                   -- e.g. "Electrical Team"
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────
-- SIGNALING (WebRTC offer/answer/ICE)
-- ─────────────────────────────────────────
create table if not exists signaling (
  id          uuid primary key default uuid_generate_v4(),
  channel_id  uuid references channels(id) on delete cascade,
  from_device text not null,
  to_device   text,                   -- null = broadcast to all in channel
  type        text not null,          -- 'offer' | 'answer' | 'ice-candidate'
  payload     jsonb not null,
  created_at  timestamptz default now()
);

-- Auto-clean old signaling rows (keep it lightweight)
create or replace function delete_old_signaling()
returns trigger language plpgsql as $$
begin
  delete from signaling
  where created_at < now() - interval '5 minutes';
  return new;
end;
$$;

create trigger cleanup_signaling
  after insert on signaling
  execute procedure delete_old_signaling();

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────
alter table channels  enable row level security;
alter table signaling enable row level security;

-- Allow all authenticated + anonymous reads/writes for now (dev mode)
create policy "allow all on channels"  on channels  for all using (true) with check (true);
create policy "allow all on signaling" on signaling for all using (true) with check (true);

-- ─────────────────────────────────────────
-- REALTIME
-- Enable realtime on signaling table so devices get instant updates
-- ─────────────────────────────────────────
-- Run these in Supabase Dashboard → Database → Replication:
-- Enable realtime for: signaling table
-- (Or run below — works in some Supabase versions)
alter publication supabase_realtime add table signaling;
alter publication supabase_realtime add table channels;
