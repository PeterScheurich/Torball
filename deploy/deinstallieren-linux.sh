#!/usr/bin/env bash
#
# Entfernt die lokale Linux-Installation (siehe installieren-linux.sh) - Gegenstueck zu
# deinstallieren-windows.ps1, gleiches Muster: jeder Schritt wird erklaert und einzeln bestaetigt.
# ANDERS als beim Installer bricht eine Ablehnung NICHT alles ab, sondern ueberspringt nur diesen
# einen Schritt (jemand moechte vielleicht nur die App entfernen, aber CouchDB/Node.js behalten).
# Die Standardantwort ist deshalb bei den riskanten Schritten "nein".
#
# Fuer Tests ohne Tastatur: TORBALL_UNBEAUFSICHTIGT=1 beantwortet mit dem Standard; mit
# TORBALL_ALLES_ENTFERNEN=1 zusaetzlich jede Frage mit "ja" (loescht auch alle Turnierdaten!).
set -euo pipefail

SERVICE_USER="torball"
SERVICE="torball-turniere"
INSTALL_DIR="/opt/torball-turniere"
CONF_DIR="/etc/torball-turniere"
FIREWALL_MERKER="${CONF_DIR}/firewall-regeln"
UNBEAUFSICHTIGT="${TORBALL_UNBEAUFSICHTIGT:-}"
ALLES="${TORBALL_ALLES_ENTFERNEN:-}"

if [[ $EUID -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 && exec sudo --preserve-env=TORBALL_UNBEAUFSICHTIGT,TORBALL_PORT,TORBALL_NETZWERK,TORBALL_ADMIN_NAME,TORBALL_ADMIN_VORNAME,TORBALL_ADMIN_EMAIL,TORBALL_ADMIN_PASSWORT,TORBALL_ADMIN_PASSWORT_DATEI,TORBALL_ALLES_ENTFERNEN bash "$(readlink -f "${BASH_SOURCE[0]}")" "$@"
  echo "FEHLER: Bitte als Administrator ausfuehren." >&2; exit 1
fi

frage() {   # $1 = Frage, $2 = Standard (j|n); Rueckgabe 0 = ja
  local standard="$2" antwort hinweis="[j/N]"
  [[ "$standard" == "j" ]] && hinweis="[J/n]"
  if [[ -n "$ALLES" ]]; then return 0; fi
  if [[ -n "$UNBEAUFSICHTIGT" ]]; then [[ "$standard" == "j" ]]; return; fi
  read -r -p "$1 ${hinweis} " antwort || antwort=""
  antwort="${antwort,,}"; [[ -z "$antwort" ]] && antwort="$standard"
  [[ "$antwort" == "j" || "$antwort" == "ja" ]]
}

schritt() {   # $1 = Titel, $2 = Erklaerung, $3 = Standard
  echo; echo "----------------------------------------------------------------------"
  echo "$1"; echo "  $2"; echo "----------------------------------------------------------------------"
}

echo "== Torball-Turniere deinstallieren =="

schritt "1. Dienst und Verknuepfungen entfernen" \
  "Die App wird gestoppt, der Hintergrunddienst entfernt, ebenso Menue-Eintrag und die Befehle torball-turniere-*. Turnierdaten bleiben erhalten." j
if frage "Entfernen?" j; then
  systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/${SERVICE}.service"; systemctl daemon-reload
  rm -f /usr/share/applications/torball-turniere.desktop
  for heim in /home/*; do rm -f "${heim}/Desktop/Torball-Turniere.desktop" "${heim}/Schreibtisch/Torball-Turniere.desktop"; done
  rm -f /usr/local/bin/torball-turniere-aktualisieren /usr/local/bin/torball-turniere-deinstallieren /usr/local/bin/torball-turniere-konsole
  echo "Erledigt."
fi

if [[ -f "$FIREWALL_MERKER" ]]; then
  schritt "2. Firewall-Freigabe entfernen" "Die vom Installer eingerichtete Freigabe fuer das eigene Netz wird wieder geschlossen." j
  if frage "Entfernen?" j; then
    while IFS='|' read -r art netz port; do
      case "$art" in
        ufw) ufw delete allow from "$netz" to any port "$port" proto tcp >/dev/null 2>&1 || true ;;
        firewalld) firewall-cmd --permanent --remove-rich-rule="rule family=ipv4 source address=${netz} port port=${port} protocol=tcp accept" >/dev/null 2>&1 || true ;;
      esac
    done < "$FIREWALL_MERKER"
    command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 || true
    rm -f "$FIREWALL_MERKER"
    echo "Erledigt."
  fi
fi

schritt "3. Programmdateien und Konfiguration entfernen" \
  "Der Ordner ${INSTALL_DIR} (Programm, Logdatei, Zugangsdaten der App) wird geloescht. Die Turnierdaten selbst liegen in CouchDB und sind davon NICHT betroffen." n
if frage "Entfernen?" n; then
  rm -rf "$INSTALL_DIR"
  userdel "$SERVICE_USER" >/dev/null 2>&1 || true
  echo "Erledigt."
fi

schritt "4. CouchDB samt ALLEN Turnierdaten entfernen" \
  "ACHTUNG: Das loescht die Datenbank und damit ALLE gespeicherten Turniere, Mannschaften und Ergebnisse unwiderruflich. Ohne vorherige Sicherung (Systemeinstellungen -> Sicherung) ist nichts wiederherstellbar." n
if frage "WIRKLICH alle Daten loeschen?" n; then
  systemctl disable --now couchdb >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive apt-get purge -y couchdb >/dev/null 2>&1 || true
  rm -rf /opt/couchdb /var/lib/couchdb
  rm -f /etc/apt/sources.list.d/couchdb.list /usr/share/keyrings/couchdb-archive-keyring.gpg
  rm -rf "$CONF_DIR"
  echo "Erledigt."
fi

schritt "5. Node.js entfernen" \
  "Node.js wird deinstalliert. ACHTUNG: Andere Programme auf diesem Rechner koennten es ebenfalls brauchen." n
if frage "Entfernen?" n; then
  DEBIAN_FRONTEND=noninteractive apt-get purge -y nodejs >/dev/null 2>&1 || true
  # NodeSource legt seine Quelle heute als nodesource.sources (deb822) ab, aeltere Setups als nodesource.list; dazu
  # kommen Pin-Dateien. Bliebe die Quelle ohne Schluessel stehen, meldete jedes spaetere 'apt update' einen Signaturfehler.
  rm -f /etc/apt/sources.list.d/nodesource.list /etc/apt/sources.list.d/nodesource.sources \
    /etc/apt/preferences.d/nodejs /etc/apt/preferences.d/nsolid \
    /etc/apt/keyrings/nodesource.gpg /usr/share/keyrings/nodesource.gpg
  echo "Erledigt."
fi

echo
echo "Deinstallation abgeschlossen. Der entpackte Quellcode-Ordner, aus dem installiert wurde, bleibt bestehen -"
echo "er laesst sich von Hand loeschen."
