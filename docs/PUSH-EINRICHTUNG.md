# 552 – Push-Mitteilungen einrichten

Einmalig, etwa 15 Minuten. Danach schaltet jede Person die Mitteilungen auf ihrem Handy selbst ein.

## 1. Supabase

`supabase/update-v8.sql` im SQL-Editor ausführen.

## 2. Push-Zentrale in Cloudflare anlegen

1. Cloudflare → **Workers & Pages** → **Erstellen** → **Worker erstellen** („Hello World“), Name z. B. `552-push` → **Bereitstellen**.
2. **Code bearbeiten**, den gesamten Inhalt durch `push-worker/552-push.js` ersetzen → **Bereitstellen**.
3. **Einstellungen → Variablen und Geheimnisse** – diese fünf Werte anlegen (die Werte stehen in deiner persönlichen Datei `push-schluessel.txt`):

   | Name | Art | Wert |
   | --- | --- | --- |
   | `SUPABASE_URL` | Text | Supabase-Adresse |
   | `SUPABASE_KEY` | Text | Supabase Anon-Key (derselbe wie in der App) |
   | `VAPID_PUBLIC_KEY` | Text | öffentlicher Schlüssel |
   | `VAPID_PRIVATE_KEY` | **Geheimnis** | privater Schlüssel |
   | `VAPID_SUBJECT` | Text | `https://552.gschelens.workers.dev` |

4. **Einstellungen → Trigger → Cron-Trigger** hinzufügen: `*/30 5-10 * * 1-5`
   (alle 30 Minuten Mo–Fr; die Zentrale schickt die Morgen-Erinnerung nur zur im Entwicklermenü eingestellten Uhrzeit. Die Zeiten sind in UTC, deckt Sommer- und Winterzeit ab.)
5. Die Adresse des Workers kopieren (z. B. `https://552-push.<dein-name>.workers.dev`). Im Browser aufgerufen zeigt sie `{"ok":true,"publicKey":"…"}`.

## 3. App

1. Neues `552.zip` hochladen.
2. Entwicklermenü (5× aufs Icon, PIN) → **Push-Mitteilungen** → Adresse der Push-Zentrale eintragen → **Für alle speichern**.
3. Jede Person: Name oben rechts → **Mitteilungen einschalten** → erlauben → **Test senden**.

Auf dem iPhone geht das nur, wenn 552 über „Teilen → Zum Home-Bildschirm“ installiert ist und von dort geöffnet wird (ab iOS 16.4). Die Antwort-Knöpfe in der Morgen-Erinnerung zeigen nur Android und Computer; auf dem iPhone öffnet ein Tipp die App.

## Was verschickt wird

| Mitteilung | Wann | An wen |
| --- | --- | --- |
| Morgen-Erinnerung „Bist du heute im Büro?“ | Mo–Fr zur eingestellten Uhrzeit, nicht an Feiertagen | nur wer für heute noch nichts eingetragen oder geplant hat |
| 📌 Neue Notiz | sobald jemand etwas an die Pinnwand heftet | alle außer der Person, die sie angeheftet hat |
| 🐾 Hund im Körbchen | sobald jemand einen Hund einträgt | alle außer der Person, die ihn eingetragen hat |
| Manuelle Mitteilung | Entwicklermenü → „Mitteilung senden“ | alle oder eine Person |

Abschalten: im Entwicklermenü für alle (ganz oder je Art), in den eigenen Einstellungen pro Gerät (ganz oder je Art).
