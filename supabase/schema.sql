-- 552 – Supabase-Schema
-- Einmal im Supabase SQL-Editor ausführen (kann gefahrlos erneut ausgeführt werden).
-- Alle Tabellen beginnen mit z552_ und vertragen sich daher mit anderen Apps im selben Projekt.
-- Zugriff wie beim Abwesenheitsplaner: über den Anon-Key; der Raumcode trennt die Räume.

create table if not exists z552_rooms (
  code        text primary key,                 -- z. B. BUERO-5521
  name        text not null default 'Zimmer 552',
  created_at  timestamptz not null default now()
);

create table if not exists z552_members (
  id          text primary key,                 -- vom Gerät erzeugt, z. B. m_k3j9x2
  room_id     text not null references z552_rooms(code) on delete cascade,
  name        text not null check (char_length(name) between 1 and 20),
  desk        text check (desk in ('top', 'bottom_left', 'bottom_right')),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);
create index if not exists z552_members_room on z552_members(room_id);

create table if not exists z552_plans (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null references z552_rooms(code) on delete cascade,
  member_id   text not null references z552_members(id) on delete cascade,
  kind        text not null check (kind in ('absence', 'single', 'recurring')),
  status      text not null check (status in ('office', 'mobile', 'away')),
  note        text not null default '',
  start_date  date not null,
  end_date    date,
  repeat      text check (repeat in ('weekly', 'monthly_nth')),
  weekday     smallint check (weekday between 0 and 6),   -- 0 = Montag
  "interval"  smallint default 1,                          -- wöchentlich: alle n Wochen
  nth         smallint,                                    -- monatlich: 1..4, -1 = letzter
  created_at  timestamptz not null default now()
);
create index if not exists z552_plans_room on z552_plans(room_id);

create table if not exists z552_overrides (
  room_id     text not null references z552_rooms(code) on delete cascade,
  member_id   text not null references z552_members(id) on delete cascade,
  date        date not null,
  status      text check (status in ('office', 'mobile', 'away')),
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (member_id, date)
);
create index if not exists z552_overrides_room_date on z552_overrides(room_id, date);

create table if not exists z552_guests (
  room_id     text not null references z552_rooms(code) on delete cascade,
  date        date not null,
  desk        text not null check (desk in ('top', 'bottom_left', 'bottom_right')),
  guest_name  text not null check (char_length(guest_name) between 1 and 40),
  booked_by   text not null default '',
  created_at  timestamptz not null default now(),
  primary key (room_id, date, desk)
);

create table if not exists z552_board (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null references z552_rooms(code) on delete cascade,
  title       text not null default '' check (char_length(title) <= 40),
  text        text not null default '' check (char_length(text) <= 1000),
  color       text not null default 'yellow',
  author_id   text,
  author_name text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists z552_board_room on z552_board(room_id);

-- Update v2 (Pinnwand mit Überschrift) für bereits angelegte Tabellen
alter table z552_board add column if not exists title text not null default '';
alter table z552_board drop constraint if exists z552_board_text_check;
alter table z552_board drop constraint if exists z552_board_title_check;
alter table z552_board add constraint z552_board_text_check check (char_length(text) <= 1000);
alter table z552_board add constraint z552_board_title_check check (char_length(title) <= 40);

-- Zeilenschutz: Zugriff mit dem Anon-Key erlauben (wie beim Abwesenheitsplaner).
do $$
declare t text;
begin
  foreach t in array array['z552_rooms','z552_members','z552_plans','z552_overrides','z552_guests','z552_board'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon_all" on %I', t);
    execute format('create policy "anon_all" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Live-Aktualisierung (Realtime) für alle Tabellen eines Raums.
do $$
declare t text;
begin
  foreach t in array array['z552_members','z552_plans','z552_overrides','z552_guests','z552_board'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ===== Entwicklermenü und Störer (Update v3) =====
create table if not exists z552_roomconfig (
  room_id     text primary key references z552_rooms(code) on delete cascade,
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table z552_roomconfig enable row level security;
drop policy if exists "anon_all" on z552_roomconfig;
create policy "anon_all" on z552_roomconfig for all to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'z552_roomconfig'
  ) then
    alter publication supabase_realtime add table z552_roomconfig;
  end if;
end $$;

-- Störer-Bilder: gleicher öffentlicher Speicher-Bucket wie beim Abwesenheitsplaner ("stoerer").
-- 552 legt seine Dateien dort im Ordner 552/ ab. Falls der Bucket schon existiert, ändert sich nichts.
insert into storage.buckets (id, name, public)
values ('stoerer', 'stoerer', true)
on conflict (id) do nothing;

drop policy if exists "z552_stoerer_read" on storage.objects;
drop policy if exists "z552_stoerer_insert" on storage.objects;
drop policy if exists "z552_stoerer_update" on storage.objects;
drop policy if exists "z552_stoerer_delete" on storage.objects;
create policy "z552_stoerer_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'stoerer' and name like '552/%');
create policy "z552_stoerer_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'stoerer' and name like '552/%');
create policy "z552_stoerer_update" on storage.objects for update to anon, authenticated
  using (bucket_id = 'stoerer' and name like '552/%');
create policy "z552_stoerer_delete" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'stoerer' and name like '552/%');

-- ===== Zusatz-Status KreditNext (Update v4) =====
alter table z552_overrides drop constraint if exists z552_overrides_status_check;
alter table z552_overrides add constraint z552_overrides_status_check
  check (status in ('office', 'mobile', 'away', 'kreditnext'));
alter table z552_plans drop constraint if exists z552_plans_status_check;
alter table z552_plans add constraint z552_plans_status_check
  check (status in ('office', 'mobile', 'away', 'kreditnext'));

-- ===== Hundekörbchen (Update v5) =====
create table if not exists z552_dogs (
  room_id     text not null references z552_rooms(code) on delete cascade,
  date        date not null,
  dog         text not null check (dog in ('hazel', 'koko')),
  updated_at  timestamptz not null default now(),
  primary key (room_id, date)
);
alter table z552_dogs enable row level security;
drop policy if exists "anon_all" on z552_dogs;
create policy "anon_all" on z552_dogs for all to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'z552_dogs'
  ) then
    alter publication supabase_realtime add table z552_dogs;
  end if;
end $$;

-- ===== Logbuch (Update v6) =====
create table if not exists z552_log (
  id          bigserial primary key,
  room_id     text,
  at          timestamptz not null default now(),
  actor_id    text,          -- wer (aus der App mitgeschickt), leer = unbekannt
  actor_name  text,
  tbl         text not null, -- betroffene Tabelle
  op          text not null, -- INSERT / UPDATE / DELETE
  old_row     jsonb,
  new_row     jsonb
);
create index if not exists z552_log_room_at on z552_log(room_id, at desc);
create index if not exists z552_log_at on z552_log(at);

alter table z552_log enable row level security;
drop policy if exists "anon_read" on z552_log;
create policy "anon_read" on z552_log for select to anon, authenticated using (true);
-- Schreiben nur über den Trigger unten (security definer), nicht direkt aus der App.

create or replace function z552_log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hdr   json;
  actor text;
  aname text;
  rid   text;
  o     jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) end;
  n     jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) end;
begin
  -- reine Zeitstempel-Updates (z. B. "zuletzt gesehen") nicht protokollieren
  if TG_OP = 'UPDATE' and (o - 'updated_at' - 'last_seen') = (n - 'updated_at' - 'last_seen') then
    return null;
  end if;
  begin
    hdr := current_setting('request.headers', true)::json;
  exception when others then
    hdr := null;
  end;
  actor := nullif(hdr ->> 'x-552-member', '');
  if actor is not null then
    select name into aname from z552_members where id = actor;
  end if;
  rid := coalesce(n ->> 'room_id', o ->> 'room_id');
  insert into z552_log (room_id, actor_id, actor_name, tbl, op, old_row, new_row)
  values (rid, actor, aname, TG_TABLE_NAME, TG_OP, o, n);
  delete from z552_log where at < now() - interval '90 days';
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['z552_members','z552_plans','z552_overrides','z552_guests','z552_board','z552_dogs','z552_roomconfig'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists z552_log_trg on %I', t);
      execute format('create trigger z552_log_trg after insert or update or delete on %I for each row execute function z552_log_change()', t);
    end if;
  end loop;
end $$;

-- ===== Geteilte Tage (Update v7) =====
-- Tagesänderung: status = Vormittag bzw. ganzer Tag, status_pm = Nachmittag, wenn anders (leer = wie vormittags)
alter table z552_overrides add column if not exists status_pm text;
alter table z552_overrides drop constraint if exists z552_overrides_status_pm_check;
alter table z552_overrides add constraint z552_overrides_status_pm_check
  check (status_pm in ('office', 'mobile', 'away', 'kreditnext'));

-- Planung: half = leer (ganzer Tag), 'am' (vormittags) oder 'pm' (nachmittags)
alter table z552_plans add column if not exists half text;
alter table z552_plans drop constraint if exists z552_plans_half_check;
alter table z552_plans add constraint z552_plans_half_check check (half in ('am', 'pm'));

-- ===== Push-Mitteilungen (Update v8) =====
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

-- ===== Status Schulung (Update v9) =====
alter table z552_overrides drop constraint if exists z552_overrides_status_check;
alter table z552_overrides add constraint z552_overrides_status_check
  check (status in ('office', 'mobile', 'away', 'kreditnext', 'training'));
alter table z552_overrides drop constraint if exists z552_overrides_status_pm_check;
alter table z552_overrides add constraint z552_overrides_status_pm_check
  check (status_pm in ('office', 'mobile', 'away', 'kreditnext', 'training'));
alter table z552_plans drop constraint if exists z552_plans_status_check;
alter table z552_plans add constraint z552_plans_status_check
  check (status in ('office', 'mobile', 'away', 'kreditnext', 'training'));
