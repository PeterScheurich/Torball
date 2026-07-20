# Entwicklungs-Workflow

## 1. Projekt öffnen

```
code D:\Projekte\Entwicklung\Torball\Torball-Turniere
```

Alternativ in VS Code: **File → Open Folder** → Ordner auswählen.

## 2. Dienste starten

**Backend** (eigenes Terminal):

```
npm run dev:backend
```

Läuft unter `http://localhost:3000`

**Frontend** (eigenes Terminal):

```
cd frontend
npm run dev
```

Läuft unter `http://localhost:5173`

Beide Terminals offen lassen (Hot-Reload bei Codeänderungen). Beenden mit `Strg + C`.

**Nach Änderungen an `shared`:**

```
npm run build --workspace=shared
```

Danach Backend- und Frontend-Dev-Server neu starten.

## 3. Aktuellen Stand von Gitea holen

```
cd D:\Projekte\Entwicklung\Torball\Torball-Turniere
git pull
npm install
```

`npm install` ist nur nötig, falls neue Abhängigkeiten hinzugekommen sind.

## 4. Eigene Änderungen nach Gitea zurückspielen

```
git add .
git commit -m "Kurze, aussagekräftige Beschreibung der Änderung"
git push
```

**Hilfreiche Zusatzbefehle:**

- `git status` – zeigt geänderte und noch nicht committete Dateien
- `git diff` – zeigt die konkreten Zeilenänderungen

**Faustregel:** Lieber häufige, kleine Commits mit klarer Beschreibung als seltene Sammelcommits.

## Dokumentation nach BookStack übertragen

Das Repository ist die führende Quelle. Änderungen in `docs/` werden mit folgendem Aufruf nach BookStack übertragen:

```
node --env-file=scripts/.env scripts/bookstack-push.mjs --dry-run
```

Der Probelauf zeigt an, was passieren würde. Ohne `--dry-run` erfolgt die Übertragung.

Der Seitenname ergibt sich aus der ersten Überschrift der Datei, nicht aus dem Dateinamen. Wird die Überschrift geändert, legt das Skript in BookStack eine neue Seite an, statt die vorhandene zu aktualisieren.

## Referenz: Projektstruktur

```
Torball-Turniere/
├── shared/       gemeinsame TypeScript-Typen
├── backend/      Fastify-API (Port 3000)
├── frontend/     React/Vite-App (Port 5173)
├── docs/         Projektdokumentation (führend)
├── scripts/      Hilfsskripte, u. a. BookStack-Sync
└── package.json  Root mit npm workspaces
```

## Referenz: Adressen

| Dienst | Adresse |
|---|---|
| Gitea | http://192.168.188.188:3000 |
| BookStack | http://192.168.188.114 |
| CouchDB (Fauxton) | http://192.168.188.227:5984/_utils/ |
| Proxmox Dev-Container (torball-dev) | 192.168.188.227 |

## Referenz: Besonderheiten dieser Installation

- Der SSH-Benutzer für Gitea heißt `gitea`, nicht wie sonst üblich `git`. Remote-URLs lauten entsprechend `gitea@192.168.188.188:PeterScheurich/Torball-Turniere.git`.
- Für npm in PowerShell muss die Execution Policy auf `RemoteSigned` stehen: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`
- `scripts/.env` enthält das BookStack-Token und ist über `.gitignore` ausgeschlossen. Sie darf nicht ins Repository gelangen.
