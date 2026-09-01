-- ============================================================================
-- Ownly Calendar Feed Service (PRO)
-- Hosts read-only RFC 5545 ICS projections for Google/Apple/Outlook subscribers.
-- Boundary: Planner owns travel state authority; this table only hosts ICS projections.
-- ============================================================================

create table if not exists public.calendar_feeds (
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
create index if not exists idx_calendar_feeds_token_hash on public.calendar_feeds (token_hash);
create index if not exists idx_calendar_feeds_user_trip on public.calendar_feeds (user_id, trip_id);

-- Enable Row Level Security (RLS)
alter table public.calendar_feeds enable row level security;

-- Policy: Authenticated users can manage their own calendar feeds
create policy "Users can manage own calendar feeds"
  on public.calendar_feeds
  for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Policy: Public service / edge function can read enabled feeds by token_hash
create policy "Public edge can read enabled calendar feeds"
  on public.calendar_feeds
  for select
  using (enabled = true);

-- Auto-update updated_at timestamp trigger
create or replace function public.handle_calendar_feeds_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger set_calendar_feeds_updated_at
  before update on public.calendar_feeds
  for each row
  execute function public.handle_calendar_feeds_updated_at();
