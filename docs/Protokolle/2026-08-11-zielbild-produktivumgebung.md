# 2026-08-11 – Zielbild Produktivumgebung / Beta-Deployment

Planungssitzung (keine Code-Änderung). Festgehalten wird die vereinbarte
Ziel-Architektur für das Deployment einer produktiven Beta-Version, damit sie
bei der späteren Umsetzung (Installations-Skripte, Erreichbarkeit von außen,
Beta-Tester-Zugang) nicht neu diskutiert werden muss.

## Roadmap nach dem Sicherheitsthema

Vereinbarte Reihenfolge der nächsten Arbeitspakete:

1. **Hilfe-Seiten / Benutzerhandbuch in der App** – reines Frontend, `/hilfe`,
   Themen-Karten mit kurzem Kern + ausklappbarer Vertiefung, Quelle als
   Markdown im Repo, ohne Login lesbar. (Wird zuerst gebaut, weil es nichts
   blockiert und für die Beta-Tester ohnehin gebraucht wird.)
2. **Intensiver Test durch den Nutzer + Nachbesserung** – reaktiv, Ziel: ein
   stabiler Stand, der eingefroren werden kann.
3. **Versions-Build** – SemVer, Start als Beta (Vorschlag `0.9.0`),
   Versionsnummer aus `package.json`, im Frontend anzeigen (Footer/„Über"),
   idealerweise mit Git-Commit-Hash.
4. **Installations-Skripte** – (a) PowerShell fürs lokale Windows-Dev-Setup,
   (b) Bash-Provisioning für den Produktiv-LXC (Node, CouchDB, systemd, lokale
   nginx), plus Schritt-für-Schritt-Anleitung als Protokoll hier unter `docs/`.
5. **Erreichbarkeit von außen** – Subdomain, TLS über die bestehende nginx,
   dabei Session-Cookies auf `Secure`/`SameSite` umstellen.
6. **Zugang für Beta-Tester** – Einladungs-/Registrierungsfluss (Token-Mechanik
   im Datenmodell teilweise vorhanden).

## Ziel-Infrastruktur (vom Nutzer bestätigt)

- **Host:** eigener **LXC-Container (Debian 12) auf dem Proxmox VE** (PVE-Gast
  auf dem Minisforum MS-01). Bewusst LXC statt VM: leichter, Snapshots/Backups
  direkt über PVE. Der eigene Prod-Container trennt Test↔Produktion schon auf
  Infrastruktur-Ebene, ohne zweite Maschine.
- **Domain/DNS:** Domain vorhanden, **Subdomain wird angelegt**, **DynDNS ist
  bereits konfiguriert**.
- **Reverse-Proxy (öffentlich):** die **bereits laufende nginx** des Nutzers
  (bedient schon andere lokal gehostete Tools, z. B. Audiobookshelf) wird der
  öffentliche TLS-Endpunkt für die neue Subdomain (Let's Encrypt) und leitet an
  den Prod-Container weiter.

## Trennung Test ↔ Produktion

| Ebene | Test/Dev (bleibt unverändert) | Produktion (neu) |
|---|---|---|
| Ort | jetziges Setup, CouchDB `couchdb-host` | neuer LXC auf dem MS-01 |
| CouchDB | offen im LAN | nur `127.0.0.1:5984`, eigene Instanz + eigener DB-Name |
| Erreichbar | nur lokal | Subdomain von außen via bestehende nginx |

Trennung erfolgt durch **eigene CouchDB-Instanz + eigenen Datenbanknamen**,
nicht durch eine geteilte DB mit Namenspräfix. Die Dev-CouchDB auf
`couchdb-host` bleibt unangetastet.

## Aufbau innerhalb des Prod-Containers

- **CouchDB** lokal im Container, lauscht **nur auf `127.0.0.1`** (nicht ins LAN
  öffnen – sicherer als das aktuelle Dev-Setup, einziger Zugriff vom Backend im
  selben Container).
- **nginx (containerlokal)** serviert das gebaute Frontend als statische Dateien
  und proxied `/api` → Backend. Die öffentliche nginx spricht nur mit dieser
  einen.
- **Backend (Fastify)** als **systemd-Service**: Autostart beim Boot, Logs über
  `journalctl`, liest `.env` beim Start (passt zum `--env-file`-Modell).
- **Node** über NodeSource-Repo, feste LTS-Version.

## Offene Detailfragen (erst bei Punkt 4/5 zu klären)

- **Backups der Prod-CouchDB:** PVE-Snapshot des Containers als Minimum, ein
  zusätzlicher regelmäßiger CouchDB-Dump ist sauberer – dann entscheiden.
- **Session-Sicherheit:** Mit echtem HTTPS die Cookies auf `Secure`/`SameSite`
  setzen; adressiert einen Teil des zurückgestellten Session-Cross-Browser-
  Verdachts (siehe Auto-Memory `project_session_cross_browser`).
