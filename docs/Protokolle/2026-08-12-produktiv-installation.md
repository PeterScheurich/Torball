# 2026-08-12 – Produktiv-Installation (Debian 13, mehrere Instanzen)

Setzt das „Zielbild Produktivumgebung" (`2026-08-11-zielbild-produktivumgebung.md`) in eine konkrete,
**parametrierte Installations-Routine** um. Neu gegenüber dem Zielbild: **mehrere Instanzen auf einem
Host** (z. B. `prod` + `demo`) statt einer – dafür ist der Backend-Port jetzt über `PORT` (Env)
konfigurierbar (Default 3000; Dev unverändert).

## Was auf dem Server installiert wird

Alles über **`deploy/provision.sh`** (einmalig, als root):

| Komponente | Zweck |
|---|---|
| **Node.js LTS** (NodeSource, Default v22) | Backend-Runtime + Build |
| **Apache CouchDB** (single node, **nur `127.0.0.1`**) | Datenbank; je Instanz eine eigene DB |
| **nginx** | serviert je Instanz das gebaute Frontend + proxied `/api` ans Backend |
| **git, build-essential** | Checkout + Build auf dem Server |
| Service-Benutzer `torball`, `/opt/torball`, systemd-Template `torball@.service` | Betrieb je Instanz |

Backend läuft **API-only** als `node --env-file=.env dist/index.js` (kein tsx in Prod); nginx liefert
das statische Frontend. Kein Docker nötig.

## Struktur bei mehreren Instanzen (ein Host)

| Instanz | Verzeichnis | Frontend-Port (nginx) | Backend-Port (Fastify, intern) | CouchDB-DB |
|---|---|---|---|---|
| prod | `/opt/torball/prod` | 8080 | 127.0.0.1:3001 | `torball_prod` |
| demo | `/opt/torball/demo` | 8081 | 127.0.0.1:3002 | `torball_demo` |

- **Eine** CouchDB-Instanz, **pro Instanz eine eigene Datenbank + eigener DB-Benutzer** (Member nur
  auf der eigenen DB – Instanzen sehen sich gegenseitig nicht). Admin-Passwort in
  `/etc/torball/couchdb-admin` (nur root), DB-Passwörter in `/etc/torball/db-<name>.pass`.
- Jede Instanz: eigener systemd-Service `torball@<name>`, eigene nginx-Site `torball-<name>`.

## Installation Schritt für Schritt

Auf dem Debian-13-Server (als root bzw. `sudo`):

```bash
# 1) Repo einmal holen, um die Skripte zu haben (der spätere per-Instanz-Checkout ist separat).
#    Der Server muss das Git-Repo erreichen (Netz + SSH-Deploy-Key oder HTTP-Token).
git clone <REPO_URL> /root/torball-src && cd /root/torball-src

# 2) Basis installieren (Node, CouchDB, nginx, systemd-Template, Service-User).
sudo bash deploy/provision.sh

# 3) Instanzen ausrollen (REPO_URL wird zum Klonen der jeweiligen Instanz gebraucht).
sudo REPO_URL=<REPO_URL> bash deploy/deploy-instanz.sh prod 8080 3001
sudo REPO_URL=<REPO_URL> bash deploy/deploy-instanz.sh demo 8081 3002
```

Danach erreichbar (aus dem Netz des Servers): `http://<server-ip>:8080` (prod), `:8081` (demo).
Beim **Erststart** führt die Anmeldeseite durch die einmalige Ersteinrichtung des ersten Admin-Kontos.

**Update einer Instanz** (neuer Stand aus `main`): einfach das Deploy-Skript erneut laufen lassen –
es macht `git pull` + Rebuild + `systemctl restart`:

```bash
sudo REPO_URL=<REPO_URL> bash deploy/deploy-instanz.sh prod 8080 3001
```

Logs: `journalctl -u torball@prod -f` · CouchDB: `journalctl -u couchdb -f` · nginx: `nginx -t`.

## Bewusst später (nicht Teil dieser Routine)

- **Erreichbarkeit von außen:** Die bereits laufende externe nginx des Nutzers wird der öffentliche
  TLS-Endpunkt (Let's Encrypt) und proxied je Subdomain auf den internen Frontend-Port dieses Servers
  (prod.domain → `:8080`, demo.domain → `:8081`). Das Netz-Routing (das andere VLAN, Zugriff in beide
  Richtungen) ist noch offen und spielt hier bewusst noch keine Rolle.
- **Sobald HTTPS steht:** je Instanz in `backend/.env` `COOKIE_SECURE=true` setzen und `FRONTEND_URL`
  auf die `https://…`-Adresse ändern, dann `systemctl restart torball@<name>`. (Ohne HTTPS würde das
  Secure-Cookie den Login verhindern – siehe CLAUDE.md „Betrieb/Infrastruktur".)
- **Demo-Instanz:** technisch identisch zur prod-Instanz (eigene DB `torball_demo`). Wie genau die
  Demo „zum Anschauen" aufbereitet wird (z. B. regelmäßiges Zurücksetzen auf einen Seed-Stand,
  Demo-Hinweis im UI, Gast-Login), klären wir separat.
- **Backups:** PVE-Snapshot des Containers als Minimum; zusätzlich ein regelmäßiger CouchDB-Dump je
  DB ist sauberer (Cron + `curl .../_all_docs` bzw. `couchbackup`).

## Caveats / Prüfen

- **CouchDB-Apt-Repo für Debian 13 (trixie):** hat evtl. noch keine `trixie`-Pakete. Falls
  `apt-get install couchdb` fehlschlägt, das Provisioning mit `COUCH_CODENAME=bookworm bash
  deploy/provision.sh` erneut ausführen (Debian-12-Pakete laufen auf 13) – oder CouchDB per Docker
  betreiben und `COUCHDB_URL` entsprechend setzen.
- **Git-Zugriff vom Server:** Für `git clone`/`pull` braucht der Server Zugang zum Repo (SSH-Deploy-Key
  hinterlegen oder eine HTTP-URL mit Token). `REPO_URL` entsprechend wählen.
- Die Skripte sind **idempotent** (mehrfaches Ausführen unschädlich); trotzdem beim ersten Mal die
  Ausgabe je Schritt prüfen (v. a. CouchDB-Installation und `nginx -t`).

## Zugehörige Dateien

- `deploy/provision.sh` – Basis-Provisionierung (einmalig).
- `deploy/deploy-instanz.sh` – Deploy/Update je Instanz (parametriert).
- `backend/.env.example` – Referenz aller Konfigurationswerte (inkl. `PORT`).
