# 552 – Zimmer-App

Wer sitzt heute in Zimmer 552? Grundriss mit den drei Tischen (Julia oben, Marc unten links, Luca unten rechts), Wochenleiste im Wandkalender-Stil mit rotem Schieberegler, Planung für Urlaub und Turnustermine.

**Ausprobieren ohne Backend:** `npm install && npm run dev`, dann `http://localhost:5173/?demo` öffnen. Im Demo-Modus liegen die Daten nur im Browser.

## Funktionen

- **Zimmer**: Status pro Tag (grün = im Büro, gelb = mobil, rot = nicht da, grau = offen) und eine kurze Notiz, die als Sprechblase am Tisch steht. Ein Klick auf der Hauptseite überschreibt die Planung nur für diesen einen Tag; „Auf Planung zurücksetzen“ nimmt das zurück.
- **Planung**: Urlaub/Abwesenheit (von–bis), Einzeltermine und Turnus (wöchentlich bzw. alle n Wochen, oder der n-te/letzte Wochentag im Monat).
- **Vorrang**: Tagesänderung › Urlaub/Einzeltermin › Turnus › Feiertag › offen.
- **Morgen-Erinnerung**: werktags um 8:30 Uhr eine Push-Mitteilung „Bist du heute im Büro?“ mit Antwort-Knöpfen. Sie kommt nur, wenn für den Tag noch nichts eingetragen oder geplant ist. Auf dem iPhone muss die App dafür zum Home-Bildschirm hinzugefügt sein.
- **Pinnwand**: Notizen fürs ganze Zimmer, auf der freien Fläche im Grundriss bzw. auf dem Handy unter dem Bild.
- **Feiertage & Brückentage** (Berlin): erscheinen in der Wochenleiste, dazu ein Hinweis, wer an einem Brückentag noch keinen Urlaub geplant hat.
- **Wochenüberblick**: wer an welchem Tag da ist und wie oft alle drei im Büro sind.
- **Gastplatz**: Ist ein Tisch frei (mobil oder nicht da), kann er für einen Gast reserviert werden.

## Aufbau

| Teil | Technik |
| --- | --- |
| Frontend | Vite, reines JavaScript, als PWA installierbar (`index.html`, `src/`) |
| Backend | Cloudflare Worker (`worker/`), liefert auch die statischen Dateien aus |
| Daten | Supabase (Postgres), nur der Worker greift mit dem Service-Key zu |
| Cron | `wrangler.toml`: täglicher Keep-alive gegen die Supabase-Pausierung, Erinnerung um 8:30 Uhr Berliner Zeit |

Zugriffsschutz: Eine gemeinsame Raum-PIN wird bei jeder API-Anfrage geprüft. In Supabase ist RLS ohne Policies aktiv, der öffentliche Anon-Key kann also nichts lesen.

## Einrichtung

1. **Supabase**: Projekt anlegen und `supabase/schema.sql` im SQL-Editor ausführen.
2. **VAPID-Schlüssel** für Push erzeugen: `npm run vapid`
3. **wrangler.toml** ausfüllen: `SUPABASE_URL`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` (eine mailto-Adresse).
4. **Secrets** setzen:
   ```sh
   npx wrangler secret put SUPABASE_SERVICE_KEY
   npx wrangler secret put ROOM_PIN
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```
5. **Deploy**: `npm run deploy`

Lokal mit Backend: dieselben Werte in eine Datei `.dev.vars` schreiben, `npm run build && npx wrangler dev --test-scheduled`. Die Cron-Jobs lassen sich dann über `curl "localhost:8787/cdn-cgi/handler/scheduled?cron=17+3+*+*+*"` auslösen.

## Tests

`npm test` prüft die Vorrangregeln, Turnusregeln, Feiertage/Brückentage und die Web-Push-Verschlüsselung.

## Bild

`design/buero-552.png` ist das Original. Die App nutzt `public/buero-552.webp`, auf den Raum zugeschnitten und verkleinert. Die Tischpositionen stehen in `src/shared/resolve.js` (Prozent der Bildgröße).
