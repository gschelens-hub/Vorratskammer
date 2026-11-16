-- 552 – Update v2: Pinnwand-Notizen mit Überschrift und längerem Text.
-- Nur nötig, wenn schema.sql schon vorher ausgeführt wurde. Kann gefahrlos mehrfach laufen.
alter table z552_board add column if not exists title text not null default '';
alter table z552_board drop constraint if exists z552_board_text_check;
alter table z552_board drop constraint if exists z552_board_title_check;
alter table z552_board add constraint z552_board_text_check check (char_length(text) <= 1000);
alter table z552_board add constraint z552_board_title_check check (char_length(title) <= 40);
