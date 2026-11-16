# 552 – Zimmer-App

Wer sitzt heute in Zimmer 552? Grundriss mit drei Tischen, Wochenleiste im Wandkalender-Stil mit rotem Schieberegler, Planung für Urlaub und Turnustermine, Pinnwand, Wochenüberblick und Gastplatz.

Aufbau wie beim Abwesenheitsplaner: eine statische App (kein Build-Schritt), Supabase direkt aus dem Browser mit dem Anon-Key, Räume über einen Raumcode.

## Deploy

1. **Supabase**: `supabase/schema.sql` im SQL-Editor ausführen (einmalig; erneutes Ausführen schadet nicht).
2. **ZIP bauen**: `./scripts/make-zip.sh` → `552.zip` (ein fertiges ZIP liegt auch im Repo).
3. **Cloudflare**: Pages → Projekt → neue Bereitstellung → `552.zip` hochladen.

Supabase-Verbindung: `app/config.js`. Vorbelegt ist dasselbe Projekt wie beim Abwesenheitsplaner. Die Tabellen heißen `z552_*` und stören dort nichts, und der vorhandene Cron gegen die Pausierung hält damit auch 552 wach. Für ein eigenes Projekt URL und Anon-Key dort ersetzen und dafür einen eigenen Keep-alive-Cron einrichten.

**Neue Version**: in `app/sw.js` `CACHE` hochzählen (`552-v2` …) und `app/version.txt` anpassen. Dann zeigt die App „Neue Version verfügbar“.

## Räume und Benutzer

- **Erster Start**: „Neuen Raum erstellen“ legt einen Raum mit Code an (z. B. `KAFFEE-4821`) und darin Julia (oben), Marc (unten links) und Luca (unten rechts). Die anderen geben auf ihrem Gerät den Raumcode ein.
- **Wer bist du?** Danach wählt man sich einmal aus. Das Gerät merkt sich Raum und Person, z. B. für Pinnwand-Einträge. Mit „Ich bin neu hier“ legt man sich selbst an.
- **Einstellungen** (Klick auf den eigenen Namen): Raumcode teilen, Person wechseln, Mitglieder umbenennen, hinzufügen, entfernen und Tische zuordnen, Raum verlassen.
- Wie beim Abwesenheitsplaner ist der Raumcode der Schlüssel: Wer ihn kennt, kann mitmachen.

## Funktionen

- **Zimmer**: Status pro Tag (grün = im Büro, gelb = mobil, rot = nicht da, grau = offen) und eine kurze Notiz als Sprechblase am Tisch. Eine Änderung hier gilt nur für diesen einen Tag; „Auf Planung zurücksetzen“ nimmt sie zurück.
- **Planung**: Urlaub/Abwesenheit (von–bis), Einzeltermine und Turnus (wöchentlich bzw. alle n Wochen, oder der n-te/letzte Wochentag im Monat).
- **Vorrang**: Tagesänderung › Urlaub/Einzeltermin › Turnus › Feiertag › offen.
- **Pinnwand**, **Feiertage & Brückentage** (Berlin, plus 24.12./31.12.), **Wochenüberblick**, **Gastplatz** auf freien Tischen.
- **Live**: Änderungen der anderen erscheinen sofort (Supabase Realtime).
- **Demo ohne Datenbank**: `index.html?demo`.

Später geplant: Morgen-Erinnerung per Push. Der Service Worker (`app/sw.js`) ist dafür schon vorhanden.

## Entwicklung

- Lokal starten: `cd app && python3 -m http.server 8000` → `http://localhost:8000/index.html?demo`
- Tests: `node --test test/logic.test.js`
- Tischpositionen: `DESKS` in `app/logic.js` (Prozent der Bildgröße). Originalbild: `design/buero-552.png`.
