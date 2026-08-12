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

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausfuehren (sudo)."; exit 1; }

echo "== [1/6] apt: Grundpakete =="
apt-get update
apt-get install -y ca-certificates curl gnupg git build-essential apt-transport-https lsb-release openssl

echo "== [2/6] Node.js ${NODE_MAJOR}.x (NodeSource) =="
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
echo "node $(node -v), npm $(npm -v)"

echo "== [3/6] nginx =="
apt-get install -y nginx

echo "== [4/6] CouchDB (single node, nur 127.0.0.1) =="
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
# System-Datenbanken anlegen (idempotent), damit der Single-Node-Betrieb sauber ist.
sleep 2
for sysdb in _users _replicator _global_changes; do
  curl -s -u "admin:${COUCH_ADMIN_PASS}" -X PUT "http://127.0.0.1:5984/${sysdb}" >/dev/null || true
done

echo "== [5/6] Service-Benutzer + Basisverzeichnis =="
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home "$BASE_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$BASE_DIR"; chown "$SERVICE_USER":"$SERVICE_USER" "$BASE_DIR"

echo "== [6/6] systemd-Template torball@.service =="
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

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload

echo
echo "Basis fertig."
echo "  CouchDB-Admin-Passwort:  ${COUCH_ADMIN_FILE}  (nur root lesbar)"
echo "  Naechster Schritt je Instanz:"
echo "    REPO_URL=<git-url> deploy/deploy-instanz.sh prod 8080 3001"
echo "    REPO_URL=<git-url> deploy/deploy-instanz.sh demo 8081 3002"
