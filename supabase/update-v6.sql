-- 552 – Update v6: Logbuch (alle Änderungen der letzten 90 Tage, im Entwicklermenü einsehbar).
-- Kann gefahrlos mehrfach laufen. Ändert keine bestehenden Daten.

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
