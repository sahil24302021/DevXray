-- Run this once in your Supabase SQL editor
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Optional: enable RLS and allow service role full access
alter table settings enable row level security;

create policy "Service role full access" on settings
  for all using (true) with check (true);
