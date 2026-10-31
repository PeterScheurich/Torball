#!/usr/bin/env bash
#
# Lokale Installation von Torball-Turniere auf Linux (Debian/Ubuntu-Familie) - das Gegenstueck zu
# installieren-windows.ps1. Gedacht fuer EINEN Rechner, der die Turniere verwaltet (Betriebsmodus
# "Standalone" bzw. "Lokales Netzwerk"), nicht fuer den Produktiv-Server (dafuer provision.sh +
# deploy-instanz.sh).
#
# Aufruf (im entpackten Quellcode-Ordner):   bash Setup-Linux.sh
#
# Was installiert wird: Node.js LTS (NodeSource), Apache CouchDB (nur 127.0.0.1), die App selbst
# unter /opt/torball-turniere, ein systemd-Dienst "torball-turniere", auf Wunsch eine
# Firewall-Freigabe NUR fuers eigene Netz sowie ein Eintrag im Anwendungsmenue.
# Jede Aenderung an DIESEM Rechner wird vorher in Alltagssprache erklaert und bestaetigt
# (wie im Windows-Installer) - eine Ablehnung bricht die Installation ab, statt still etwas zu
# ueberspringen. Mehrfaches Ausfuehren ist unschaedlich und aktualisiert dabei die App.
#
# Fuer Tests ohne Tastatur (z. B. per SSH): TORBALL_UNBEAUFSICHTIGT=1 beantwortet jede Frage mit
# ihrem Standardwert; TORBALL_PORT und TORBALL_NETZWERK=ja|nein ueberschreiben die zwei echten
# Eingaben.
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-22}"
SERVICE_USER="torball"
SERVICE="torball-turniere"
INSTALL_DIR="/opt/torball-turniere"
APP_DIR="${INSTALL_DIR}/app"
LOG_DIR="${INSTALL_DIR}/logs"
CONF_DIR="/etc/torball-turniere"
COUCH_ADMIN_FILE="${CONF_DIR}/couchdb-admin"
DB_PASS_FILE="${CONF_DIR}/db.pass"
FIREWALL_MERKER="${CONF_DIR}/firewall-regeln"
DB="torball"
DB_USER="torball_backend"
UNBEAUFSICHTIGT="${TORBALL_UNBEAUFSICHTIGT:-}"
QUELLE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fehler() { echo; echo "FEHLER: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------------- Rechte
if [[ $EUID -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    echo "Die Installation braucht Administrator-Rechte - du wirst gleich nach deinem Passwort gefragt."
    exec sudo -E bash "${BASH_SOURCE[0]}" "$@"
  fi
  fehler "Bitte als Administrator ausfuehren. Auf einem Debian ohne 'sudo': erst mit 'su -' zum Administrator werden und dann erneut 'bash Setup-Linux.sh' starten."
fi

# ---------------------------------------------------------------------------------- Fragen
frage_ja_nein() {   # $1 = Frage, $2 = Standard (j|n); Rueckgabe 0 = ja
  local frage="$1" standard="$2" antwort
  if [[ -n "$UNBEAUFSICHTIGT" ]]; then [[ "$standard" == "j" ]]; return; fi
  local hinweis="[J/n]"; [[ "$standard" == "n" ]] && hinweis="[j/N]"
  read -r -p "${frage} ${hinweis} " antwort || antwort=""
  antwort="${antwort,,}"
  [[ -z "$antwort" ]] && antwort="$standard"
  [[ "$antwort" == "j" || "$antwort" == "ja" || "$antwort" == "y" || "$antwort" == "yes" ]]
}

# Jede Aenderung an diesem Rechner: erst erklaeren, dann um Zustimmung bitten. Bei "nein" bricht
# die Installation ab - ohne den Baustein laeuft die App nicht, ein stilles Ueberspringen waere schlimmer.
bestaetige_aenderung() {   # $1 = Titel, $2 = worum geht es, $3 = was bedeutet das fuer diesen Rechner
  echo
  echo "----------------------------------------------------------------------"
  echo "$1"
  echo "  Worum geht es:  $2"
  echo "  Auswirkung:     $3"
  echo "----------------------------------------------------------------------"
  frage_ja_nein "Darf das installiert bzw. geaendert werden?" j \
    || fehler "Ohne diesen Schritt kann Torball-Turniere nicht laufen - die Installation wurde abgebrochen. Es wurde nichts weiter veraendert."
}

# ---------------------------------------------------------------------------------- Vorpruefung
echo "== Torball-Turniere - lokale Installation (Linux) =="
[[ -r /etc/os-release ]] || fehler "Das Betriebssystem konnte nicht erkannt werden (/etc/os-release fehlt)."
# shellcheck disable=SC1091
. /etc/os-release
FAMILIE="${ID:-} ${ID_LIKE:-}"
if [[ "$FAMILIE" != *debian* && "$FAMILIE" != *ubuntu* ]]; then
  fehler "Dieses Skript unterstuetzt Debian, Ubuntu und davon abgeleitete Systeme (z. B. Linux Mint). Erkannt: ${PRETTY_NAME:-unbekannt}."
fi
# Abgeleitete Systeme (Mint, Pop!_OS ...) haben eigene Codenamen - die Paketquellen kennen nur den der Basis.
CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
[[ -n "$CODENAME" ]] || fehler "Der Codename der Distribution konnte nicht ermittelt werden."
ARCH="$(dpkg --print-architecture)"
echo "System: ${PRETTY_NAME:-?} (${CODENAME}, ${ARCH})"
command -v systemctl >/dev/null 2>&1 || fehler "Dieses System nutzt kein systemd - das wird nicht unterstuetzt."
[[ -d "${QUELLE}/backend" && -d "${QUELLE}/frontend" && -d "${QUELLE}/shared" ]] \
  || fehler "Der Projektordner ist unvollstaendig (${QUELLE}). Bitte das Quellcode-ZIP vollstaendig entpacken."

# ---------------------------------------------------------------------------------- 1. Pakete
echo
echo "== [1/9] Grundpakete =="
bestaetige_aenderung \
  "Grundpakete installieren" \
  "Kleine Hilfsprogramme (curl, gnupg, Compiler-Werkzeuge), die die weiteren Schritte und der Bau der App brauchen." \
  "Es werden nur Pakete aus den normalen Paketquellen deines Systems nachinstalliert. Bereits Vorhandenes bleibt unveraendert."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg openssl build-essential python3 iproute2

# ---------------------------------------------------------------------------------- 2. Node.js
echo
echo "== [2/9] Node.js ${NODE_MAJOR} =="
if command -v node >/dev/null 2>&1 && [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -ge "$NODE_MAJOR" ]]; then
  echo "Node.js $(node -v) ist bereits vorhanden."
else
  bestaetige_aenderung \
    "Node.js ${NODE_MAJOR} installieren" \
    "Node.js ist das Programm, mit dem die Torball-Turniere-Anwendung laeuft." \
    "Es wird die offizielle Paketquelle 'NodeSource' eingetragen und Node.js daraus installiert. Eine aeltere Version wird dabei ersetzt."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
echo "node $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------------------------- 3. CouchDB
echo
echo "== [3/9] CouchDB (die Datenbank) =="
mkdir -p "$CONF_DIR"; chmod 700 "$CONF_DIR"
if dpkg -s couchdb >/dev/null 2>&1; then
  echo "CouchDB ist bereits installiert."
  [[ -f "$COUCH_ADMIN_FILE" ]] || fehler "CouchDB ist schon vorhanden, aber ohne die von diesem Installer angelegte Zugangsdatei (${COUCH_ADMIN_FILE}). Bitte die vorhandene Installation nicht ueberschreiben - Hilfe: siehe INSTALLATION-LINUX.md."
else
  bestaetige_aenderung \
    "CouchDB installieren" \
    "CouchDB ist die Datenbank, in der alle Turnierdaten gespeichert werden." \
    "Die Paketquelle 'Apache CouchDB' wird eingetragen und CouchDB installiert. Sie ist nur auf diesem Rechner erreichbar (127.0.0.1) und startet kuenftig automatisch mit dem Rechner."
  # Gibt es fuer diese Distribution ueberhaupt Pakete? Lieber hier klar scheitern als bei apt kryptisch.
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://apache.jfrog.io/artifactory/couchdb-deb/dists/${CODENAME}/Release" || true)"
  [[ "$CODE" == "200" ]] || fehler "Fuer '${CODENAME}' gibt es keine CouchDB-Pakete (HTTP ${CODE}). Unterstuetzt sind die jeweils aktuellen Debian- und Ubuntu-LTS-Versionen."
  openssl rand -base64 24 > "$COUCH_ADMIN_FILE"; chmod 600 "$COUCH_ADMIN_FILE"
  COUCH_ADMIN_PASS="$(cat "$COUCH_ADMIN_FILE")"
  curl -fsSL https://couchdb.apache.org/repo/keys.asc | gpg --batch --yes --dearmor -o /usr/share/keyrings/couchdb-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/couchdb-archive-keyring.gpg] https://apache.jfrog.io/artifactory/couchdb-deb/ ${CODENAME} main" \
    > /etc/apt/sources.list.d/couchdb.list
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
COUCH_ADMIN_PASS="$(cat "$COUCH_ADMIN_FILE")"

# Zugangsdaten nicht auf die Kommandozeile (in 'ps' fuer jeden lokalen Prozess sichtbar), sondern
# ueber eine kurzlebige, nur fuer root lesbare curl-Konfigurationsdatei - wie in deploy-instanz.sh.
CURL_AUTH_CFG="$(mktemp "${CONF_DIR}/curl-auth.XXXXXX")"
chmod 600 "$CURL_AUTH_CFG"
printf 'user = "admin:%s"\n' "$COUCH_ADMIN_PASS" > "$CURL_AUTH_CFG"
trap 'rm -f "$CURL_AUTH_CFG"' EXIT

couch_pruefe() {   # Beschreibung, erlaubte Codes, curl-Argumente...
  local beschreibung="$1" erlaubte="$2" code; shift 2
  code="$(curl -s -o /dev/null -w '%{http_code}' -K "$CURL_AUTH_CFG" -H "Content-Type: application/json" "$@")"
  [[ " ${erlaubte} " == *" ${code} "* ]] || fehler "${beschreibung} fehlgeschlagen (HTTP ${code}, erwartet: ${erlaubte})."
}

echo "Warte auf CouchDB ..."
BEREIT=false
for _ in $(seq 1 30); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5984/ || true)" == "200" ]] && { BEREIT=true; break; }
  sleep 2
done
[[ "$BEREIT" == true ]] || fehler "CouchDB antwortet nicht (Pruefen mit: systemctl status couchdb)."

# Ohne die System-Datenbanken kann sich kein normaler CouchDB-Benutzer anmelden - der unbeaufsichtigte
# Installationsweg legt sie nicht an (live beim Windows-Installer erlebt, siehe CLAUDE.md).
for sysdb in _users _replicator _global_changes; do
  couch_pruefe "System-Datenbank ${sysdb} anlegen" "201 412" -X PUT "http://127.0.0.1:5984/${sysdb}"
done

# ---------------------------------------------------------------------------------- 4. Datenbank
echo
echo "== [4/9] Datenbank fuer die App =="
[[ -f "$DB_PASS_FILE" ]] || { openssl rand -base64 24 > "$DB_PASS_FILE"; chmod 600 "$DB_PASS_FILE"; }
DB_PASS="$(cat "$DB_PASS_FILE")"
couch_pruefe "Datenbank ${DB} anlegen" "201 412" -X PUT "http://127.0.0.1:5984/${DB}"
USER_URL="http://127.0.0.1:5984/_users/org.couchdb.user:${DB_USER}"
USER_REV="$(curl -s -K "$CURL_AUTH_CFG" "$USER_URL" | sed -n 's/.*"_rev":"\([^"]*\)".*/\1/p' || true)"
[[ -n "$USER_REV" ]] && USER_REV_FELD="\"_rev\":\"${USER_REV}\"," || USER_REV_FELD=""
couch_pruefe "Datenbank-Benutzer ${DB_USER} anlegen" "201" -X PUT "$USER_URL" -d @- <<JSON
{${USER_REV_FELD}"name":"${DB_USER}","password":"${DB_PASS}","roles":[],"type":"user"}
JSON
# Als admins eintragen: das Backend legt beim Start Indizes (Design-Dokumente) an und braucht dafuer
# Admin-Rechte auf DIESER Datenbank - kein Server-Admin (siehe CLAUDE.md, Betrieb).
couch_pruefe "Zugriffsrechte fuer ${DB} setzen" "200" -X PUT "http://127.0.0.1:5984/${DB}/_security" \
  -d "{\"admins\":{\"names\":[\"${DB_USER}\"],\"roles\":[]},\"members\":{\"names\":[\"${DB_USER}\"],\"roles\":[]}}"

# ---------------------------------------------------------------------------------- 5. Programm
echo
echo "== [5/9] Programmdateien nach ${APP_DIR} =="
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 755 "$INSTALL_DIR" "$APP_DIR"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 750 "$LOG_DIR"
if [[ "$QUELLE" != "$APP_DIR" ]]; then
  # Eine vorhandene backend/.env gehoert dem Rechner, nicht dem Quellcode - sie darf beim Update nie ueberschrieben werden.
  tar -C "$QUELLE" \
    --exclude='./node_modules' --exclude='./backend/node_modules' --exclude='./frontend/node_modules' --exclude='./shared/node_modules' \
    --exclude='./backend/.env' --exclude='./backend/.env.test.local' --exclude='./frontend/.env' \
    -cf - . | tar -C "$APP_DIR" -xf -
fi
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$APP_DIR"

als_dienstbenutzer() {
  runuser -u "$SERVICE_USER" -- env HOME="$INSTALL_DIR" npm_config_cache="${INSTALL_DIR}/.npm" "$@"
}

ENV_DATEI="${APP_DIR}/backend/.env"
if [[ -f "$ENV_DATEI" ]]; then
  echo "backend/.env existiert bereits - unveraendert gelassen (Update)."
else
  PORT="${TORBALL_PORT:-3000}"
  if [[ -z "$UNBEAUFSICHTIGT" ]]; then
    read -r -p "Unter welcher Portnummer soll die App erreichbar sein? [${PORT}] " EINGABE || EINGABE=""
    [[ -n "$EINGABE" ]] && PORT="$EINGABE"
  fi
  [[ "$PORT" =~ ^[0-9]+$ && "$PORT" -ge 1024 && "$PORT" -le 65535 ]] || fehler "Ungueltige Portnummer '${PORT}' (erlaubt: 1024-65535)."
  if ss -ltn "sport = :${PORT}" 2>/dev/null | grep -q LISTEN; then
    fehler "Der Port ${PORT} wird bereits von einem anderen Programm benutzt. Bitte eine andere Portnummer waehlen."
  fi

  echo
  echo "Netzwerkzugriff: Sollen auch ANDERE Geraete im selben Netzwerk (z. B. Helfer-Handys und -Tablets"
  echo "am Spieltag) auf diese Installation zugreifen koennen? Ohne das ist die App nur auf diesem"
  echo "Rechner erreichbar. Die Verbindung im Netz ist unverschluesselt - nur in einem Netz verwenden,"
  echo "dem du vertraust (z. B. eigener WLAN-Router), nicht im oeffentlichen Hallen-WLAN."
  NETZ="${TORBALL_NETZWERK:-}"
  if [[ -z "$NETZ" ]]; then
    frage_ja_nein "Netzwerkzugriff erlauben?" j && NETZ=ja || NETZ=nein
  fi
  [[ "$NETZ" == "ja" ]] && HOST_WERT="0.0.0.0" || HOST_WERT="127.0.0.1"

  umask 077
  cat > "$ENV_DATEI" <<EOF
PORT=${PORT}
# 0.0.0.0 = auch fuer andere Geraete im lokalen Netzwerk erreichbar (Turnier-Codes, Ergebniserfassung
# durch Helfer); 127.0.0.1 = nur auf diesem Rechner.
HOST=${HOST_WERT}
COUCHDB_URL=http://127.0.0.1:5984
COUCHDB_DB=${DB}
COUCHDB_USER=${DB_USER}
COUCHDB_PASSWORD=${DB_PASS}
COOKIE_SECURE=false
FRONTEND_URL=http://localhost:${PORT}
KANBAN_BOARD_AKTIV=false
# Das Backend liefert das gebaute Frontend selbst mit aus (Einzelprozess-Modus wie unter Windows).
SERVE_FRONTEND=true
TZ=Europe/Berlin
# Zusaetzlich zum Systemprotokoll (journalctl -u ${SERVICE}) eine Logdatei - fuer 'torball diagnose'.
LOG_DATEI=${LOG_DIR}/torball-server.log
EOF
  umask 022
  chown "${SERVICE_USER}:${SERVICE_USER}" "$ENV_DATEI"; chmod 600 "$ENV_DATEI"
  echo "backend/.env angelegt."
fi
PORT="$(grep -m1 '^PORT=' "$ENV_DATEI" | cut -d= -f2)"
HOST_WERT="$(grep -m1 '^HOST=' "$ENV_DATEI" | cut -d= -f2 || true)"

# ---------------------------------------------------------------------------------- 6. Bauen
echo
echo "== [6/9] App bauen (das dauert einige Minuten) =="
# Zuerst 'shared', dann der Rest - der Root-Build laeuft nicht in Abhaengigkeitsreihenfolge (siehe CLAUDE.md).
( cd "$APP_DIR"
  als_dienstbenutzer npm ci --no-audit --no-fund
  als_dienstbenutzer npm run build --workspace=shared
  als_dienstbenutzer npm run build )

# ---------------------------------------------------------------------------------- 7. Dienst
echo
echo "== [7/9] Dienst einrichten =="
bestaetige_aenderung \
  "Torball-Turniere als Dienst einrichten" \
  "Damit die App im Hintergrund laeuft und automatisch mit dem Rechner startet, wird sie als Systemdienst '${SERVICE}' eingetragen." \
  "Nach dem Start des Rechners ist die App von selbst erreichbar. Beenden/Starten: 'sudo systemctl stop|start ${SERVICE}'."
NODE_BIN="$(command -v node)"
cat > "/etc/systemd/system/${SERVICE}.service" <<UNIT
[Unit]
Description=Torball-Turniere (lokale Installation)
After=network.target couchdb.service
Wants=couchdb.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}/backend
ExecStart=${NODE_BIN} --env-file=${APP_DIR}/backend/.env dist/index.js
Restart=on-failure
RestartSec=3
# Haertung wie auf dem Server (provision.sh): nichts ausser dem Log-Ordner wird beschrieben.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"

echo "Warte auf die App ..."
LAEUFT=false
for _ in $(seq 1 45); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" || true)" == "200" ]] && { LAEUFT=true; break; }
  sleep 2
done
if [[ "$LAEUFT" != true ]]; then
  journalctl -u "$SERVICE" -n 30 --no-pager || true
  fehler "Die App antwortet nicht unter Port ${PORT}. Die letzten Meldungen stehen oben (auch: journalctl -u ${SERVICE})."
fi

# ---------------------------------------------------------------------------------- 8. Firewall
echo
echo "== [8/9] Firewall =="
if [[ "$HOST_WERT" != "0.0.0.0" ]]; then
  echo "Nur lokaler Zugriff gewaehlt - keine Firewall-Freigabe noetig."
else
  NETZE="$(ip -4 route show default 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
  [[ -n "$NETZE" ]] && NETZE="$(ip -4 route show dev "$NETZE" scope link 2>/dev/null | awk '$1 ~ /\// {print $1}')"
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    [[ -n "$NETZE" ]] || fehler "Die Firewall ist aktiv, aber das eigene Netz wurde nicht erkannt. Bitte die Freigabe von Hand einrichten: siehe INSTALLATION-LINUX.md."
    bestaetige_aenderung \
      "Firewall-Freigabe (ufw)" \
      "Andere Geraete im eigenen Netz duerfen sich mit der App auf Port ${PORT} verbinden." \
      "Freigegeben wird NUR fuer das eigene Netz (${NETZE//$'\n'/, }), nicht fuer das Internet. Die Freigabe laesst sich spaeter mit dem Deinstaller wieder entfernen."
    for netz in $NETZE; do
      ufw allow from "$netz" to any port "$PORT" proto tcp comment "Torball-Turniere" >/dev/null
      echo "ufw|${netz}|${PORT}" >> "$FIREWALL_MERKER"
    done
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    [[ -n "$NETZE" ]] || fehler "Die Firewall ist aktiv, aber das eigene Netz wurde nicht erkannt. Bitte die Freigabe von Hand einrichten: siehe INSTALLATION-LINUX.md."
    bestaetige_aenderung \
      "Firewall-Freigabe (firewalld)" \
      "Andere Geraete im eigenen Netz duerfen sich mit der App auf Port ${PORT} verbinden." \
      "Freigegeben wird NUR fuer das eigene Netz (${NETZE//$'\n'/, }), nicht fuer das Internet."
    for netz in $NETZE; do
      firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=${netz} port port=${PORT} protocol=tcp accept" >/dev/null
      echo "firewalld|${netz}|${PORT}" >> "$FIREWALL_MERKER"
    done
    firewall-cmd --reload >/dev/null
  else
    echo "Auf diesem Rechner ist keine Firewall aktiv - es ist nichts freizugeben."
  fi
fi

# ---------------------------------------------------------------------------------- 9. Komfort
echo
echo "== [9/9] Befehle und Anwendungsmenue =="
ln -sf "${APP_DIR}/deploy/aktualisieren-linux.sh" /usr/local/bin/torball-turniere-aktualisieren
ln -sf "${APP_DIR}/deploy/deinstallieren-linux.sh" /usr/local/bin/torball-turniere-deinstallieren
# Konsolen-Tool (Konto entsperren, Diagnose-Bericht ...) - laeuft als Dienstbenutzer, der die .env lesen darf.
cat > /usr/local/bin/torball-turniere-konsole <<KONSOLE
#!/usr/bin/env bash
# Aufruf z. B.:  sudo torball-turniere-konsole diagnose     oder     sudo torball-turniere-konsole --hilfe
cd "${APP_DIR}/backend" || exit 1
exec runuser -u ${SERVICE_USER} -- env HOME="${INSTALL_DIR}" npm run torball --silent -- "\$@"
KONSOLE
chmod 755 /usr/local/bin/torball-turniere-konsole
chmod 755 "${APP_DIR}/deploy/aktualisieren-linux.sh" "${APP_DIR}/deploy/deinstallieren-linux.sh" 2>/dev/null || true

START_URL="http://localhost:${PORT}"
ICON="${APP_DIR}/frontend/public/images/torball-logo-1024.png"
cat > /usr/share/applications/torball-turniere.desktop <<DESKTOP
[Desktop Entry]
Type=Application
Name=Torball-Turniere
Comment=Torball-Turniere planen und protokollieren
Exec=xdg-open ${START_URL}
Icon=${ICON}
Terminal=false
Categories=Office;Utility;
DESKTOP
# Zusaetzlich eine Verknuepfung auf dem Schreibtisch der Person, die die Installation gestartet hat.
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  BENUTZER_HEIM="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
  for desktop in "${BENUTZER_HEIM}/Desktop" "${BENUTZER_HEIM}/Schreibtisch"; do
    if [[ -d "$desktop" ]]; then
      cp /usr/share/applications/torball-turniere.desktop "${desktop}/Torball-Turniere.desktop"
      chown "${SUDO_USER}:" "${desktop}/Torball-Turniere.desktop"; chmod 755 "${desktop}/Torball-Turniere.desktop"
      break
    fi
  done
fi

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "======================================================================"
echo "Fertig! Torball-Turniere laeuft."
echo "  Auf diesem Rechner:   ${START_URL}"
[[ "$HOST_WERT" == "0.0.0.0" && -n "$LAN_IP" ]] && echo "  Fuer andere Geraete:  http://${LAN_IP}:${PORT}   (im selben Netzwerk)"
echo
echo "Erster Start: Es gibt noch kein Benutzerkonto - die Anmeldeseite fuehrt durch die einmalige"
echo "Einrichtung des ersten Administrator-Kontos. Das ist ein EIGENES Konto auf diesem Rechner,"
echo "unabhaengig von einem Konto auf dem Online-Server."
echo
echo "Spaeter:"
echo "  Aktualisieren:   sudo torball-turniere-aktualisieren"
echo "  Logs ansehen:    journalctl -u ${SERVICE} -f"
echo "  Diagnose-Bericht: sudo torball-turniere-konsole diagnose"
echo "  Deinstallieren:  sudo torball-turniere-deinstallieren"
echo "======================================================================"
