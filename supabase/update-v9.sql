-- 552 – Update v9: neuer Status "Schulung" (training). Kann gefahrlos mehrfach laufen.
alter table z552_overrides drop constraint if exists z552_overrides_status_check;
alter table z552_overrides add constraint z552_overrides_status_check
  check (status in ('office', 'mobile', 'away', 'kreditnext', 'training'));
alter table z552_overrides drop constraint if exists z552_overrides_status_pm_check;
alter table z552_overrides add constraint z552_overrides_status_pm_check
  check (status_pm in ('office', 'mobile', 'away', 'kreditnext', 'training'));
alter table z552_plans drop constraint if exists z552_plans_status_check;
alter table z552_plans add constraint z552_plans_status_check
  check (status in ('office', 'mobile', 'away', 'kreditnext', 'training'));
