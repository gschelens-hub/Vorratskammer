-- 552 – Update v8: Push-Mitteilungen (angemeldete Handys und ihre Wünsche).
-- Kann gefahrlos mehrfach laufen. Ändert keine bestehenden Daten.

create table if not exists z552_push (
  endpoint    text primary key,                 -- Adresse des Handys beim Push-Dienst
  room_id     text not null references z552_rooms(code) on delete cascade,
  member_id   text not null references z552_members(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  prefs       jsonb not null default '{"morning": true, "notes": true, "dogs": true}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists z552_push_room on z552_push(room_id);

alter table z552_push enable row level security;
drop policy if exists "anon_all" on z552_push;
create policy "anon_all" on z552_push for all to anon, authenticated using (true) with check (true);
