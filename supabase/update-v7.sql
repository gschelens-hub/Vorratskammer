-- 552 – Update v7: geteilte Tage (vormittags / nachmittags).
-- Kann gefahrlos mehrfach laufen. Bestehende Einträge gelten weiter für den ganzen Tag.

-- Tagesänderung: status = Vormittag bzw. ganzer Tag, status_pm = Nachmittag, wenn anders (leer = wie vormittags)
alter table z552_overrides add column if not exists status_pm text;
alter table z552_overrides drop constraint if exists z552_overrides_status_pm_check;
alter table z552_overrides add constraint z552_overrides_status_pm_check
  check (status_pm in ('office', 'mobile', 'away', 'kreditnext'));

-- Planung: half = leer (ganzer Tag), 'am' (vormittags) oder 'pm' (nachmittags)
alter table z552_plans add column if not exists half text;
alter table z552_plans drop constraint if exists z552_plans_half_check;
alter table z552_plans add constraint z552_plans_half_check check (half in ('am', 'pm'));
