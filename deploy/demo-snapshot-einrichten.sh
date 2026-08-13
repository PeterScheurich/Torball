#!/usr/bin/env bash
#
# Einmalige Einrichtung des naechtlichen Demo-Reset-Mechanismus (Snapshot/Restore auf CouchDB-
# Ebene, siehe backend/src/demo/snapshot.ts) fuer EINE bereits per deploy-instanz.sh ausgerollte
# Instanz (normalerweise "demo" - niemals gegen "prod" ausfuehren). Als root ausfuehren.
#
# Nutzung:
#   deploy/demo-snapshot-einrichten.sh <name> [stunde]
#
#   name    Instanzname, z. B. demo (muss bereits per deploy-instanz.sh angelegt sein)
#   stunde  optional: Uhrzeit (0-23) fuer den naechtlichen Reset, Default 0 (Mitternacht)
#
# Legt an: eine zweite CouchDB-Datenbank "torball_<name>_golden" (derselbe Instanz-DB-Benutzer wie
# die Live-Datenbank bekommt dort ebenfalls Admin-Rechte), setzt DEMO_SNAPSHOT_ERLAUBT=true in
# backend/.env, richtet den systemd-Timer torball-demo-reset@<name> fuer den taeglichen Aufruf von
# "demo:snapshot:wiederherstellen" ein. Fuehrt danach EINMALIG "demo:beispieldaten" +
# "demo:snapshot:erstellen" aus, um die Demo-Inhalte zu erzeugen und als Ausgangszustand
# festzuhalten - wiederholtes Ausfuehren dieses Skripts legt weitere Beispieldaten an (siehe
# Hinweis am Ende fuer den sauberen Weg, den Ausgangszustand spaeter zu aktualisieren).
#
# Idempotent bezueglich Datenbank/Timer/.env-Flag; NICHT idempotent bezueglich der Beispieldaten
# (demo:beispieldaten legt bei jedem Aufruf weitere Vereine/Turniere an, siehe CLAUDE.md).
set -euo pipefail

BASE_DIR="/opt/torball"
CONF_DIR="/etc/torball"
SERVICE_USER="torball"

NAME="${1:?Instanzname fehlt (z. B. demo)}"
STUNDE="${2:-0}"

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausfuehren."; exit 1; }
[[ "$NAME" != "prod" ]] || { echo "Sicherheitsnetz: nicht gegen die Instanz 'prod' ausfuehren."; exit 1; }
[[ -f "${CONF_DIR}/couchdb-admin" ]] || { echo "CouchDB-Admin fehlt - erst deploy/provision.sh ausfuehren."; exit 1; }

DIR="${BASE_DIR}/${NAME}"
DB="torball_${NAME}"
GOLDEN_DB="${DB}_golden"
PW_FILE="${CONF_DIR}/db-${NAME}.pass"

[[ -d "$DIR" ]] || { echo "Instanz '${NAME}' existiert nicht unter ${DIR} - erst deploy/deploy-instanz.sh ausfuehren."; exit 1; }
[[ -f "$PW_FILE" ]] || { echo "DB-Passwort fuer '${NAME}' fehlt (${PW_FILE}) - erst deploy/deploy-instanz.sh ausfuehren."; exit 1; }

COUCH_ADMIN_PASS="$(cat "${CONF_DIR}/couchdb-admin")"
AUTH=(-s -u "admin:${COUCH_ADMIN_PASS}" -H "Content-Type: application/json")

echo "== [1/4] CouchDB: '_golden'-Datenbank anlegen =="
curl "${AUTH[@]}" -X PUT "http://127.0.0.1:5984/${GOLDEN_DB}" >/dev/null || true
# Derselbe Instanz-DB-Benutzer wie fuer die Live-DB (kein zweites Passwort noetig) - als admins
# (nicht nur members), analog zur Live-DB (siehe deploy-instanz.sh): demo:snapshot:* laeuft unter
# diesem Benutzer und braucht auf BEIDEN Datenbanken vollen Zugriff.
curl "${AUTH[@]}" -X PUT "http://127.0.0.1:5984/${GOLDEN_DB}/_security" \
  -d "{\"admins\":{\"names\":[\"torball_${NAME}\"],\"roles\":[]},\"members\":{\"names\":[\"torball_${NAME}\"],\"roles\":[]}}" >/dev/null

echo "== [2/4] backend/.env: DEMO_SNAPSHOT_ERLAUBT aktivieren =="
if grep -q '^DEMO_SNAPSHOT_ERLAUBT=' "${DIR}/backend/.env"; then
  sed -i 's/^DEMO_SNAPSHOT_ERLAUBT=.*/DEMO_SNAPSHOT_ERLAUBT=true/' "${DIR}/backend/.env"
else
  echo "DEMO_SNAPSHOT_ERLAUBT=true" >> "${DIR}/backend/.env"
fi
systemctl restart "torball@${NAME}"

echo "== [3/4] systemd-Timer fuer den naechtlichen Reset =="
cat > "/etc/systemd/system/torball-demo-reset@.service" <<'UNIT'
[Unit]
Description=Torball-Turniere Demo-Snapshot-Restore (Instanz %i)
After=network.target couchdb.service

[Service]
Type=oneshot
User=torball
WorkingDirectory=/opt/torball/%i/backend
ExecStart=/opt/torball/%i/node_modules/.bin/tsx --env-file=/opt/torball/%i/backend/.env /opt/torball/%i/backend/src/cli/torball.ts demo:snapshot:wiederherstellen
UNIT

cat > "/etc/systemd/system/torball-demo-reset@.timer" <<UNIT
[Unit]
Description=Naechtlicher Demo-Reset (Instanz %i)

[Timer]
OnCalendar=*-*-* $(printf '%02d' "${STUNDE}"):00:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now "torball-demo-reset@${NAME}.timer"

echo "== [4/4] Erstbefuellung: Beispieldaten anlegen + als Ausgangszustand sichern =="
su -s /bin/bash "$SERVICE_USER" -c "cd '${DIR}/backend' && ../node_modules/.bin/tsx --env-file=.env src/cli/torball.ts demo:beispieldaten"
su -s /bin/bash "$SERVICE_USER" -c "cd '${DIR}/backend' && ../node_modules/.bin/tsx --env-file=.env src/cli/torball.ts demo:snapshot:erstellen"

echo
echo "Fertig. Naechtlicher Reset laeuft ab jetzt um ${STUNDE}:00 Uhr (systemd-Timer torball-demo-reset@${NAME})."
echo "  Status:          systemctl status torball-demo-reset@${NAME}.timer"
echo "  Manuell testen:  systemctl start torball-demo-reset@${NAME}.service"
echo
echo "Um die Demo-Inhalte spaeter zu aendern (z. B. Termine auffrischen) und als neuen"
echo "Ausgangszustand festzuhalten:"
echo "  su -s /bin/bash ${SERVICE_USER} -c \"cd ${DIR}/backend && ../node_modules/.bin/tsx --env-file=.env src/cli/torball.ts demo:snapshot:erstellen\""
