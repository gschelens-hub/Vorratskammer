-- 552 – Supabase schema. Run once in the Supabase SQL editor.
-- All access goes through the Cloudflare Worker with the service role key.
-- RLS is enabled without policies, so the public anon key cannot read or write anything.

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  person text not null check (person in ('julia', 'marc', 'luca')),
  kind text not null check (kind in ('absence', 'single', 'recurring')),
  status text not null check (status in ('office', 'mobile', 'away')),
  note text not null default '',
  start_date date not null,
  end_date date,
  repeat text check (repeat in ('weekly', 'monthly_nth')),
  weekday smallint check (weekday between 0 and 6),   -- 0 = Monday
  "interval" smallint default 1,                       -- weekly: every n weeks
  nth smallint,                                        -- monthly_nth: 1..4, -1 = last
  created_at timestamptz not null default now()
);

create table if not exists overrides (
  person text not null check (person in ('julia', 'marc', 'luca')),
  date date not null,
  status text check (status in ('office', 'mobile', 'away')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (person, date)
);

create table if not exists guests (
  date date not null,
  desk text not null check (desk in ('julia', 'marc', 'luca')),
  guest_name text not null,
  booked_by text not null default '',
  created_at timestamptz not null default now(),
  primary key (date, desk)
);

create table if not exists board_notes (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) <= 140),
  author text not null default '',
  color text not null default 'yellow',
  created_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  endpoint text primary key,
  person text not null check (person in ('julia', 'marc', 'luca')),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Used by the keep-alive cron job.
create table if not exists heartbeat (
  id smallint primary key default 1,
  beat_at timestamptz not null default now()
);
insert into heartbeat (id) values (1) on conflict do nothing;

alter table plans enable row level security;
alter table overrides enable row level security;
alter table guests enable row level security;
alter table board_notes enable row level security;
alter table push_subscriptions enable row level security;
alter table heartbeat enable row level security;
