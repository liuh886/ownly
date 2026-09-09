-- ============================================================================
-- Ownly Calendar Feed Service (PRO): align table name with production.
-- Production Supabase hosts `public.ownly_calendar_feeds`; the original
-- migration created `public.calendar_feeds`. This migration renames the old
-- table when present, or creates the prefixed table for fresh environments.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'calendar_feeds'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'ownly_calendar_feeds'
  ) then
    alter table public.calendar_feeds rename to ownly_calendar_feeds;
  end if;
end
$$;

create table if not exists public.ownly_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  trip_id text not null,
  token_hash text not null unique,
  ics_content text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices for fast public feed lookups & user trip queries
create index if not exists idx_ownly_calendar_feeds_token_hash on public.ownly_calendar_feeds (token_hash);
create index if not exists idx_ownly_calendar_feeds_user_trip on public.ownly_calendar_feeds (user_id, trip_id);

-- Enable Row Level Security (RLS)
alter table public.ownly_calendar_feeds enable row level security;

-- Policy: Authenticated users can manage their own calendar feeds
drop policy if exists "Users can manage own calendar feeds" on public.ownly_calendar_feeds;
create policy "Users can manage own calendar feeds"
  on public.ownly_calendar_feeds
  for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Policy: Public service / edge function can read enabled feeds by token_hash
drop policy if exists "Public edge can read enabled calendar feeds" on public.ownly_calendar_feeds;
create policy "Public edge can read enabled calendar feeds"
  on public.ownly_calendar_feeds
  for select
  using (enabled = true);

-- Auto-update updated_at timestamp trigger
create or replace function public.handle_ownly_calendar_feeds_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_calendar_feeds_updated_at on public.ownly_calendar_feeds;
drop trigger if exists set_ownly_calendar_feeds_updated_at on public.ownly_calendar_feeds;
create trigger set_ownly_calendar_feeds_updated_at
  before update on public.ownly_calendar_feeds
  for each row
  execute function public.handle_ownly_calendar_feeds_updated_at();
