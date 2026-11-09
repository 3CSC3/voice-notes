-- Voice Notes prototype schema for Supabase
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run

-- 1) Notes table
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  title text,
  audio_path text not null,
  duration numeric not null default 0
);

-- Newest-first feed
create index if not exists notes_created_at_idx on public.notes (created_at desc);

-- Table privileges for the anon (publishable) role.
-- RLS alone is not enough: PostgREST needs GRANT privileges too.
grant select, insert on table public.notes to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- 2) Row Level Security (prototype: anyone can read and insert)
alter table public.notes enable row level security;

drop policy if exists "Public read notes" on public.notes;
create policy "Public read notes"
  on public.notes for select
  using (true);

drop policy if exists "Public insert notes" on public.notes;
create policy "Public insert notes"
  on public.notes for insert
  with check (true);

-- No public update/delete in this prototype.

-- 3) Storage bucket for audio
-- Create the bucket in the dashboard (Storage → New bucket) named: voice-notes
-- Make it PUBLIC so the feed can play files without signed URLs.
-- Then run the policies below.

-- Allow anyone to upload into the voice-notes bucket
drop policy if exists "Public upload voice-notes" on storage.objects;
create policy "Public upload voice-notes"
  on storage.objects for insert
  with check (bucket_id = 'voice-notes');

-- Allow anyone to read/download from the voice-notes bucket
drop policy if exists "Public read voice-notes" on storage.objects;
create policy "Public read voice-notes"
  on storage.objects for select
  using (bucket_id = 'voice-notes');

-- SECURITY NOTE (prototype only):
-- These policies allow anonymous public insert + read. Anyone with your page URL
-- can post notes and listen. For a real school community, add authentication
-- (e.g. LearnWorlds SSO / Supabase Auth) and tighten policies before going live.
