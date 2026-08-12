# 2026-08-12 – Umgebungs-Banner (Demo/Entwicklung unübersehbar kennzeichnen)

## Anlass

Nach der ersten Demo-Installation die Sorge geäußert, versehentlich auf der Demo-Instanz etwas zu
pflegen, das dort regelmäßig gelöscht werden soll (oder umgekehrt Demo-Daten für echte zu halten).
Frage nach einer einfachen UI-Kennzeichnung.

## Entscheidung

Rein **build-zeit-gesteuert**, kein neuer Laufzeit-API-Aufruf:

- **Entwicklung:** `import.meta.env.DEV` – von Vite selbst gesetzt (`true` bei `npm run
  dev:frontend`), keine eigene Konfiguration nötig.
- **Demo/weitere Nicht-Prod-Instanzen:** `deploy-instanz.sh` schreibt vor jedem Build
  `frontend/.env` mit `VITE_INSTANZ_NAME=<name>` – der Instanzname ist ohnehin schon der erste
  Parameter des Skripts. Zeigt einen Banner, sobald der Wert gesetzt und **nicht** `"prod"` ist.
- **Prod und der Windows-Installer** (kein `VITE_INSTANZ_NAME` gesetzt): bewusst kein Banner.

Alternative verworfen: ein Backend-Flag + eigene Route, die das Frontend beim Laden abfragt – hätte
einen zusätzlichen Request auf jeder Seite gebraucht und wäre nicht automatisch korrekt gewesen
(hätte eine zusätzliche Konfiguration je Instanz erfordert, die man vergessen kann). Die
build-zeit-Variante ist automatisch richtig, sobald man die passende Deploy-Instanz aufruft.

## Umsetzung

- `frontend/src/components/UmgebungsBanner.tsx` (neu): reine Anzeige-Logik wie oben beschrieben.
- `frontend/src/index.css`: `.umgebungs-banner*`-Klassen, nutzt bestehende Theme-Variablen
  (`--danger`/`--bg` für Demo, `--bg-subtle`/`--text-muted`/`--border` für Entwicklung).
- `frontend/src/App.tsx`: `<UmgebungsBanner />` direkt vor `<Kopfzeile />` – erscheint dadurch auf
  jeder Route, unabhängig von Anmeldestatus.
- `deploy/deploy-instanz.sh`: schreibt vor dem Build-Schritt `frontend/.env` mit
  `VITE_INSTANZ_NAME=${NAME}`.

## Verifiziert (lokal)

- `npm run dev:frontend`: Banner „Entwicklungsumgebung" erscheint.
- Produktions-Build mit `VITE_INSTANZ_NAME=demo`: gebautes JS-Bundle enthält den Demo-Text.
- Produktions-Build mit `VITE_INSTANZ_NAME=prod`: kein Demo-Text im Bundle.
- Danach lokales `frontend/.env` wieder entfernt und sauberen Prod-Build wiederhergestellt (Datei
  ist ohnehin über die bestehende `.env`-Regel in `.gitignore` abgedeckt).
