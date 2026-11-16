-- 552 – Update v5: Hundekörbchen (wer liegt an welchem Tag im Körbchen: Hazel oder Koko).
-- Kann gefahrlos mehrfach laufen.
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
