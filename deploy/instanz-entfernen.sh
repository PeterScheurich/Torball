#!/usr/bin/env bash
#
# Entfernt eine Instanz vollstaendig - Gegenstueck zu deploy-instanz.sh. Stoppt den systemd-
# Service, entfernt die nginx-Site, loescht die CouchDB-Datenbank + den Instanz-Benutzer und den
# Checkout unter /opt/torball/<name>. UNWIDERRUFLICH - kein Backup, keine Papierkorb-Funktion.
#
# Nutzung (als root):
#   deploy/instanz-entfernen.sh <name>
#
# Fragt vor dem eigentlichen Loeschen zur Sicherheit den Instanznamen nochmal zum Eintippen ab
# (Tippfehler-/Verwechslungsschutz - ein einfaches "ja/nein" waere hier zu leicht versehentlich
# durchgeklickt, gerade bei aehnlich klingenden Namen wie "prod"/"prod-neu").
set -euo pipefail

BASE_DIR="/opt/torball"
CONF_DIR="/etc/torball"

NAME="${1:?Instanzname fehlt (z. B. prod) - Nutzung: deploy/instanz-entfernen.sh <name>}"
DIR="${BASE_DIR}/${NAME}"
DB="torball_${NAME}"

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausfuehren."; exit 1; }
[[ -f "${CONF_DIR}/couchdb-admin" ]] || { echo "CouchDB-Admin-Passwort fehlt (${CONF_DIR}/couchdb-admin)."; exit 1; }
[[ -d "$DIR" ]] || { echo "Keine Instanz '${NAME}' gefunden unter ${DIR} - nichts zu tun."; exit 1; }

COUCH_ADMIN_PASS="$(cat "${CONF_DIR}/couchdb-admin")"

echo "Folgendes wird UNWIDERRUFLICH entfernt:"
echo "  - systemd-Service torball@${NAME}"
echo "  - nginx-Site /etc/nginx/sites-available/torball-${NAME} (+ sites-enabled)"
echo "  - CouchDB-Datenbank ${DB} (inkl. aller Turniere/Benutzer/Systemeinstellungen darin)"
echo "  - CouchDB-Benutzer torball_${NAME}"
echo "  - Checkout ${DIR} (inkl. backend/.env)"
echo "  - Passwort-Datei ${CONF_DIR}/db-${NAME}.pass"
echo
echo "WICHTIG: Systemeinstellungen dieser Instanz (SMTP-Zugangsdaten, Benachrichtigungs-Empfaenger,"
echo "Wartungsmodus, ...) stecken nur in dieser Datenbank - falls du sie auf einer anderen Instanz"
echo "weiterverwenden willst, jetzt notieren, danach sind sie weg."
echo
read -r -p "Zum Bestaetigen den Instanznamen exakt eintippen (${NAME}): " BESTAETIGUNG
[[ "$BESTAETIGUNG" == "$NAME" ]] || { echo "Abgebrochen (Eingabe stimmte nicht mit '${NAME}' ueberein)."; exit 1; }

echo "== systemd-Service stoppen =="
systemctl stop "torball@${NAME}" 2>/dev/null || true
systemctl disable "torball@${NAME}" 2>/dev/null || true

echo "== nginx-Site entfernen =="
rm -f "/etc/nginx/sites-enabled/torball-${NAME}" "/etc/nginx/sites-available/torball-${NAME}"
if nginx -t 2>/dev/null; then
  systemctl reload nginx
else
  echo "WARNUNG: 'nginx -t' meldet einen Fehler - nginx NICHT neu geladen, bitte manuell pruefen."
fi

echo "== CouchDB: Datenbank + Benutzer loeschen =="
AUTH=(-s -u "admin:${COUCH_ADMIN_PASS}")
curl "${AUTH[@]}" -X DELETE "http://127.0.0.1:5984/${DB}" >/dev/null || true
# Der _users-Eintrag braucht zum Loeschen die aktuelle _rev - erst abrufen, dann mit Rev loeschen.
USER_REV="$(curl "${AUTH[@]}" "http://127.0.0.1:5984/_users/org.couchdb.user:torball_${NAME}" \
  | sed -n 's/.*"_rev":"\([^"]*\)".*/\1/p')"
if [[ -n "$USER_REV" ]]; then
  curl "${AUTH[@]}" -X DELETE "http://127.0.0.1:5984/_users/org.couchdb.user:torball_${NAME}?rev=${USER_REV}" >/dev/null || true
fi

echo "== Checkout + Passwort-Datei entfernen =="
rm -rf "$DIR"
rm -f "${CONF_DIR}/db-${NAME}.pass"

echo
echo "Instanz '${NAME}' vollstaendig entfernt."
echo "Denk daran, falls eingerichtet: externe DNS-/Reverse-Proxy-Eintraege (z. B. im Nginx Proxy"
echo "Manager), die noch auf diese Instanz zeigten, manuell anzupassen oder zu entfernen."
