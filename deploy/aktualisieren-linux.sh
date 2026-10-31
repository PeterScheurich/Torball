#!/usr/bin/env bash
#
# Aktualisiert die lokale Linux-Installation (siehe installieren-linux.sh). Gedacht als
# "sudo torball-turniere-aktualisieren". Gegenstueck zu Aktualisieren-Torball.cmd unter Windows.
#
# Mit Git-Checkout (.git im Programmordner): holt den neuen Stand, baut und startet neu.
# Ohne Git (Installation aus dem Quellcode-ZIP): dieser Befehl kann den Quellcode nicht selbst holen -
# er sagt das deutlich, statt ein "Fertig aktualisiert" zu behaupten (gleiche Lehre wie
# 'torball aktualisieren' unter Windows, 2026-08-20).
set -euo pipefail

SERVICE_USER="torball"
SERVICE="torball-turniere"
INSTALL_DIR="/opt/torball-turniere"
APP_DIR="${INSTALL_DIR}/app"

if [[ $EUID -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 && exec sudo -E bash "$(readlink -f "${BASH_SOURCE[0]}")" "$@"
  echo "FEHLER: Bitte als Administrator ausfuehren." >&2; exit 1
fi
[[ -d "$APP_DIR/backend" ]] || { echo "FEHLER: Keine Installation unter ${APP_DIR} gefunden." >&2; exit 1; }

als_dienstbenutzer() {
  runuser -u "$SERVICE_USER" -- env HOME="$INSTALL_DIR" npm_config_cache="${INSTALL_DIR}/.npm" "$@"
}

if [[ ! -d "${APP_DIR}/.git" ]]; then
  cat <<'TEXT'

=====================================================================
ACHTUNG: Der Quellcode wurde NICHT aktualisiert!
Diese Installation stammt aus einem heruntergeladenen ZIP, nicht aus einem Git-Repository -
dieser Befehl kann den Quellcode deshalb nicht selbst herunterladen.

Um wirklich eine neue Version zu bekommen:
1. Das aktuelle Quellcode-ZIP herunterladen (siehe README) und an einer neuen Stelle entpacken.
2. Dort 'bash Setup-Linux.sh' erneut ausfuehren. Die vorhandene Konfiguration (backend/.env) und
   alle Turnierdaten bleiben dabei erhalten.
Siehe auch INSTALLATION-LINUX.md.
=====================================================================
TEXT
  exit 0
fi

echo "== Neuen Stand holen =="
als_dienstbenutzer git -c safe.directory="$APP_DIR" -C "$APP_DIR" pull

echo "== Bauen =="
( cd "$APP_DIR"
  als_dienstbenutzer npm ci --no-audit --no-fund
  als_dienstbenutzer npm run build --workspace=shared
  als_dienstbenutzer npm run build )

echo "== Dienst neu starten =="
systemctl restart "$SERVICE"
PORT="$(grep -m1 '^PORT=' "${APP_DIR}/backend/.env" | cut -d= -f2)"
for _ in $(seq 1 45); do
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" || true)" == "200" ]]; then
    echo "Fertig aktualisiert - die App laeuft wieder."
    exit 0
  fi
  sleep 2
done
journalctl -u "$SERVICE" -n 30 --no-pager || true
echo "FEHLER: Die App antwortet nach dem Neustart nicht (Meldungen siehe oben)." >&2
exit 1
