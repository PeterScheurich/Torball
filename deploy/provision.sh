#!/usr/bin/env bash
#
# Basis-Provisionierung des Produktiv-Servers (Debian 13, als root ausfuehren).
#
# Installiert alles, was die Torball-Turniere-App zum Laufen braucht, und legt die
# gemeinsame Grundlage fuer beliebig viele Instanzen (z. B. prod + demo) auf DIESEM Host an:
#   - Node.js LTS (NodeSource)
#   - Apache CouchDB (single node, lauscht NUR auf 127.0.0.1)
#   - nginx (container-/hostlokal; serviert je Instanz das gebaute Frontend + proxied /api)
#   - git + Build-Tools
#   - Service-Benutzer `torball`, Basisverzeichnis /opt/torball, systemd-Template torball@.service
#   - Symlink /usr/local/bin/torball-aktualisieren -> deploy/aktualisieren.sh (von ueberall aufrufbar)
#
# Danach je Instanz:  deploy/deploy-instanz.sh <name> <frontend_port> <backend_port> [server_name]
#
# Idempotent: mehrfaches Ausfuehren ist unschaedlich (bereits Installiertes wird uebersprungen).
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-22}"                 # Node LTS-Major
COUCH_CODENAME="${COUCH_CODENAME:-$(. /etc/os-release; echo "${VERSION_CODENAME:-bookworm}")}"
SERVICE_USER="torball"
BASE_DIR="/opt/torball"
CONF_DIR="/etc/torball"
COUCH_ADMIN_FILE="${CONF_DIR}/couchdb-admin"

# Als root ausfuehren. Auf einer minimalen Debian-Installation ist `sudo` NICHT vorhanden - dann
# direkt als root anmelden (kein sudo noetig). Dieses Skript installiert sudo/curl/git selbst mit,
# sodass sie danach zur Verfuegung stehen (apt-get ist auch minimal immer vorhanden).
[[ $EUID -eq 0 ]] || { echo "Bitte als root ausfuehren (auf minimalem Debian ohne sudo direkt als root anmelden)."; exit 1; }

echo "== [1/7] apt: Grundpakete (inkl. sudo/curl/git fuer minimale Installationen) =="
apt-get update
apt-get install -y sudo ca-certificates curl gnupg git build-essential apt-transport-https lsb-release openssl

echo "== [2/7] Node.js ${NODE_MAJOR}.x (NodeSource) =="
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
echo "node $(node -v), npm $(npm -v)"

echo "== [3/7] nginx =="
apt-get install -y nginx

echo "== [4/7] CouchDB (single node, nur 127.0.0.1) =="
mkdir -p "$CONF_DIR"; chmod 700 "$CONF_DIR"
if [[ ! -f "$COUCH_ADMIN_FILE" ]]; then
  openssl rand -base64 24 > "$COUCH_ADMIN_FILE"; chmod 600 "$COUCH_ADMIN_FILE"
fi
COUCH_ADMIN_PASS="$(cat "$COUCH_ADMIN_FILE")"
if ! dpkg -s couchdb >/dev/null 2>&1; then
  curl -fsSL https://couchdb.apache.org/repo/keys.asc \
    | gpg --dearmor -o /usr/share/keyrings/couchdb-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/couchdb-archive-keyring.gpg] https://apache.jfrog.io/artifactory/couchdb-deb/ ${COUCH_CODENAME} main" \
    > /etc/apt/sources.list.d/couchdb.list
  # Unbeaufsichtigte Installation vorbelegen: standalone, Bind 127.0.0.1, Admin-Passwort, Erlang-Cookie.
  debconf-set-selections <<EOF
couchdb couchdb/mode select standalone
couchdb couchdb/bindaddress string 127.0.0.1
couchdb couchdb/adminpass password ${COUCH_ADMIN_PASS}
couchdb couchdb/adminpass_again password ${COUCH_ADMIN_PASS}
couchdb couchdb/cookie string $(openssl rand -hex 16)
EOF
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y couchdb
fi
systemctl enable --now couchdb

# Zugangsdaten nicht als Kommandozeilen-Argument (in "ps" fuer jeden lokalen Prozess sichtbar),
# sondern ueber eine kurzlebige, nur fuer root lesbare curl-Konfigurationsdatei - gleiches Muster
# wie in deploy-instanz.sh (Sicherheitsdurchsicht Deploy, 2026-08-20).
CURL_AUTH_CFG="$(mktemp "${CONF_DIR}/curl-auth.XXXXXX")"
chmod 600 "$CURL_AUTH_CFG"
printf 'user = "admin:%s"\n' "$COUCH_ADMIN_PASS" > "$CURL_AUTH_CFG"
trap 'rm -f "$CURL_AUTH_CFG"' EXIT

# Auf tatsaechliche Erreichbarkeit warten statt pauschal zu schlafen: ein zu fruehes, still
# fehlschlagendes Anlegen der System-Datenbanken (frueher "|| true") fiele sonst erst viel
# spaeter als kryptischer Anmeldefehler des Instanz-Benutzers auf (ohne "_users" kann sich kein
# regulaerer CouchDB-Benutzer anmelden - live beim Windows-Installer erlebt, siehe CLAUDE.md).
echo "Warte auf CouchDB ..."
COUCH_BEREIT=false
for _ in $(seq 1 30); do
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:5984/" || true)" == "200" ]]; then
    COUCH_BEREIT=true
    break
  fi
  sleep 2
done
[[ "$COUCH_BEREIT" == true ]] || { echo "FEHLER: CouchDB antwortet nicht unter http://127.0.0.1:5984 (systemctl status couchdb pruefen)."; exit 1; }

# System-Datenbanken anlegen (idempotent: 412 = existiert bereits). Jeder andere Status ausser
# 201/412 (z.B. 401 bei falschem Admin-Passwort) ist ein echter Fehler und bricht ab.
for sysdb in _users _replicator _global_changes; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -K "$CURL_AUTH_CFG" -X PUT "http://127.0.0.1:5984/${sysdb}")"
  if [[ "$code" != "201" && "$code" != "412" ]]; then
    echo "FEHLER: System-Datenbank ${sysdb} konnte nicht angelegt werden (HTTP ${code})." >&2
    exit 1
  fi
done

echo "== [5/7] Service-Benutzer + Basisverzeichnis =="
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home "$BASE_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$BASE_DIR"; chown "$SERVICE_USER":"$SERVICE_USER" "$BASE_DIR"

echo "== [6/7] systemd-Template torball@.service =="
cat > /etc/systemd/system/torball@.service <<'UNIT'
[Unit]
Description=Torball-Turniere Backend (Instanz %i)
After=network.target couchdb.service
Wants=couchdb.service

[Service]
Type=simple
User=torball
WorkingDirectory=/opt/torball/%i/backend
# Port/DB/Zugang kommen aus dieser .env (siehe deploy-instanz.sh).
ExecStart=/usr/bin/node --env-file=/opt/torball/%i/backend/.env dist/index.js
Restart=on-failure
RestartSec=3
# Haertung (Sicherheitsdurchsicht Deploy, 2026-08-20): das Backend schreibt im Betrieb nichts
# auf die Platte (alle Daten in CouchDB, Logs ins Journal) - diese Einschraenkungen kosten daher
# nichts, machen einen kompromittierten Prozess aber deutlich weniger nuetzlich. ProtectSystem=full
# haengt /usr, /boot und /etc nur lesbar ein (/opt bleibt unberuehrt). Wirkt erst nach einem
# erneuten provision.sh-Lauf + Service-Neustart - bei Problemen zuerst auf der Demo-Instanz
# testen (systemctl restart torball@demo), dann erst prod.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload

echo "== [7/7] Globaler Befehl torball-aktualisieren =="
# Symlink statt Kopie, damit ein spaeteres "git pull" im Checkout automatisch auch den global
# aufrufbaren Befehl aktualisiert. /usr/local/bin liegt bei praktisch jeder Debian-Installation
# bereits im PATH von root.
SKRIPT_ORDNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ln -sf "${SKRIPT_ORDNER}/aktualisieren.sh" /usr/local/bin/torball-aktualisieren

echo
echo "Basis fertig."
echo "  CouchDB-Admin-Passwort:  ${COUCH_ADMIN_FILE}  (nur root lesbar)"
echo "  Naechster Schritt je Instanz:"
echo "    REPO_URL=<git-url> deploy/deploy-instanz.sh prod 8080 3001"
echo "    REPO_URL=<git-url> deploy/deploy-instanz.sh demo 8081 3002"
echo "  Aktualisieren (von ueberall aufrufbar): REPO_URL=<git-url> torball-aktualisieren prod 8080 3001"
