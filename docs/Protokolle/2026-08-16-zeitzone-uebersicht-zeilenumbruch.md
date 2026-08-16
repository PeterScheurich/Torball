# 2026-08-16 – Zeitzonen-Bug in Produktion, veraltete Turnier-Übersicht, Zeilenumbruch bei Turniernamen

Ausgangspunkt: drei Fehlermeldungen von Peter (Rolle Manager) direkt aus der Produktivinstanz
`turniere.blindentorball.de`, automatisch per Mail-Postfach als Kanban-Karten angelegt. Alle drei
gemeinsam mit dem Nutzer besprochen und abgestimmt, bevor implementiert wurde.

## 1. Zeitzonen-Abweichung (2h) bei Turnier-Startzeit

**Symptom:** Turnier mit Startzeit 09:00 erzeugt im Spielplan-Vorschlag ein erstes Spiel um 11:00.

**Ursache:** `berechneStartzeit()` (`backend/src/spielplan/zeitplanung.ts`, ebenso die
Frontend-Kopie `frontend/src/zeitplanung.ts`) baut den Zeitstempel über
`new Date(\`${datum}T${startzeit}:00\`)` – ein ISO-String **ohne** Zeitzonen-Suffix wird von
Node.js in der **Systemzeitzone des Prozesses** interpretiert, nicht in der des Nutzers. Per
Read-only-SSH auf dem Prod-Server verifiziert:

```
$ ssh -i ~/.ssh/id_ed25519_torball_prod_readonly claude-readonly@<prod-ip> "timedatectl status"
Time zone: Etc/UTC (UTC, +0000)
```

09:00 wird dort als 09:00 UTC interpretiert = 11:00 deutscher Sommerzeit (CEST, UTC+2) – exakt der
gemeldete Versatz. Auf der Windows-Dev-Maschine (lokale Zeitzone Deutschland) tritt der Bug nicht
auf, deshalb ist er dort nie aufgefallen.

**Fix:** `TZ=Europe/Berlin` als Umgebungsvariable für den Backend-Prozess statt eines festen
Offsets – Node bringt die volle IANA-Zeitzonendatenbank mit (ICU) und wendet automatisch den zum
jeweiligen **Datum** passenden Offset an (CET/UTC+1 im Winter, CEST/UTC+2 im Sommer). Empirisch
geprüft:

```
$ TZ=Europe/Berlin node -e "console.log(new Date('2026-08-15T09:00:00').toISOString())"
2026-08-15T07:00:00.000Z   # Sommer, Offset +2
$ TZ=Europe/Berlin node -e "console.log(new Date('2026-01-15T09:00:00').toISOString())"
2026-01-15T08:00:00.000Z   # Winter, Offset +1
```

Auch für den Fall "heute (Sommer) ein Turnier für November (Winter) anlegen" bleibt es korrekt,
weil der Offset immer aus dem im Zeitstempel **enthaltenen** Datum berechnet wird, nicht aus dem
Datum des Erfassungszeitpunkts:

```
$ TZ=Europe/Berlin node -e "
const d = new Date('2026-11-11T09:00:00');
console.log(d.toISOString(), '->', d.getHours()+':'+d.getMinutes());
"
2026-11-11T08:00:00.000Z -> 9:0
```

**Umgesetzt:**
- `TZ` neu in die Allowlist von `konfiguration:setzen` aufgenommen (`backend/src/cli/torball.ts`).
- `deploy/deploy-instanz.sh`: `TZ=Europe/Berlin` im `.env`-Template für neu angelegte Instanzen.
- `deploy/installieren-windows.ps1`: dieselbe Zeile im generierten `.env` des Windows-Installers.
- `docs/installation-konfiguration.md`: neue Tabellenzeile für `TZ`.
- Lokale Dev-`.env` ebenfalls ergänzt (nicht im Repo, git-ignoriert).

**Wichtig – noch offen, nicht von mir ausführbar:** `deploy-instanz.sh` schreibt `backend/.env`
nur bei der **Erstanlage** einer Instanz (siehe CLAUDE.md). Prod und Demo laufen bereits und
bekommen die neue Zeile dadurch **nicht** automatisch. Mein Zugriff auf `torball-prod` ist
strukturell read-only (kein Sudo-Pfad, siehe `reference-prod-readonly-zugriff`) – die folgenden
Befehle muss der Nutzer selbst ausführen:

```bash
cd /opt/torball/prod/backend
npm run torball -- konfiguration:setzen --schluessel="TZ" --wert="Europe/Berlin"
systemctl restart torball@prod

cd /opt/torball/demo/backend
npm run torball -- konfiguration:setzen --schluessel="TZ" --wert="Europe/Berlin"
systemctl restart torball@demo
```

## 2. Turnier-Übersicht aktualisiert sich nicht automatisch

**Symptom:** Ändert man im Spielplan-Tab die Startzeit von Spiel 1 (schreibt serverseitig
`turnier.startzeit` mit, siehe `backend/src/routes/spiel.ts`), zeigt der Übersicht-Tab weiterhin
den alten Wert – erst ein manuelles Neuladen (F5) hilft.

**Ursache:** `TurnierVerwaltenPage.tsx` lädt `turnier` einmalig beim Mount in einen eigenen State;
`SpielplanVerwaltung.tsx` lädt/aktualisiert sein **eigenes** `turnier` unabhängig davon und hatte
keinen Weg, den Eltern-State zu benachrichtigen.

**Fix:** Neuer optionaler Callback-Prop `onTurnierGeaendert` an `SpielplanVerwaltung`, aufgerufen
nach jedem `laden()` mit dem frisch geladenen Turnier (analog zum bestehenden `onGeaendert` für die
Spieleliste). `TurnierVerwaltenPage` reicht `setTurnier` durch. Live geprüft: Startzeit von Spiel 1
im Spielplan-Tab geändert, ohne Neuladen zum Übersicht-Tab gewechselt (reiner SPA-Tab-Wechsel) –
zeigt sofort den neuen Wert.

## 3. Zeilenumbruch bei Turniernamen in den Listen

**Symptom:** In der Turnierliste (Startseite bzw. öffentliche Startseite) bricht der Turniername
oft schon nach wenigen Zeichen um, obwohl die Tabellenzelle noch viel Platz bis zur Datumsspalte
hat.

**Ursache:** Live vermessen (`getBoundingClientRect()`): die `<td>`-Zelle hatte 613px Breite zur
Verfügung, der `<span class="turnier-name-mit-logo">` (`display: inline-flex`) wurde aber nur mit
~255px gerendert und der Name brach dadurch um – ein bekanntes Zusammenspiel-Problem von
`inline-flex`-Inhalt mit der automatischen Spaltenbreiten-Berechnung des Browsers bei
`table-layout: auto`.

**Fix:** `white-space: nowrap` auf `.turnier-name-mit-logo` (`frontend/src/index.css`) – erzwingt
die korrekte Breitenmessung beim Tabellen-Layout, bereits etabliertes Muster an vielen anderen
Stellen derselben Datei. Live geprüft: Höhe des Namens-Elements vorher 48px (2 Zeilen), nachher
24px (1 Zeile), bei identischem Turniernamen.

## Ausgeführte Befehle

```bash
npm run build --workspace=shared && npm run build
npm run lint --workspace=frontend
npm run test --workspace=backend   # 59 Tests, alle gruen
```

Alle drei Fixes zusätzlich live im Dev-Browser verifiziert (siehe oben je Abschnitt).
