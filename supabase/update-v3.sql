-- 552 – Update v3: Entwicklermenü (Raum-Einstellungen) und Störer-Bilder.
-- Kann gefahrlos mehrfach laufen.

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
