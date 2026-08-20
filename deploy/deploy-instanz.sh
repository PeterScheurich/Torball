#!/usr/bin/env bash
#
# Deployt bzw. aktualisiert EINE Instanz (z. B. prod oder demo) auf dem Produktiv-Server.
# Voraussetzung: deploy/provision.sh wurde einmal ausgefuehrt. Als root ausfuehren.
#
# Nutzung:
#   Allererster Deploy einer neuen Instanz (REPO_URL noetig, es gibt ja noch keinen Checkout):
#     REPO_URL=<git-url> [BRANCH=main] deploy/deploy-instanz.sh <name> <frontend_port> <backend_port> [server_name]
#   Danach zum Aktualisieren (REPO_URL NICHT mehr noetig - steckt schon im bestehenden Checkout
#   als "origin"-Remote):
#     deploy/deploy-instanz.sh <name> <frontend_port> <backend_port> [server_name]
#
#   name           Instanzname, z. B. prod, demo  (bestimmt Verzeichnis, DB-Name, Service)
#   frontend_port  nginx-Port dieser Instanz (z. B. 8080) - hierueber ist die App erreichbar
#   backend_port   Fastify-Port dieser Instanz (z. B. 3001) - nur 127.0.0.1, intern
#   server_name    optional: Domain fuer spaeteres externes Routing (Default: _  = alle Hosts)
#
# Legt/aktualisiert an: Git-Checkout + Build unter /opt/torball/<name>, eine eigene CouchDB-
# Datenbank torball_<name> mit eigenem DB-Benutzer, eine nginx-Site und den systemd-Service
# torball@<name>. Wiederholtes Ausfuehren = Update (git pull + rebuild + restart).
# backend/.env wird NUR beim allerersten Deploy geschrieben - ein Update laesst eine bereits
# vorhandene Datei unveraendert, damit spaeter manuell gesetzte Werte (COOKIE_SECURE,
# FRONTEND_URL, DEMO_SNAPSHOT_ERLAUBT, per "torball konfiguration:setzen" geaenderte Werte, ...)
# nicht bei jedem Update wieder auf den Bootstrap-Default zurueckfallen. Weicht bei einem
# Update ein angegebener Port vom bisher konfigurierten ab, fragt das Skript interaktiv nach
# (Tippfehler-Schutz, z.B. 8000 statt 8080).
set -euo pipefail

BASE_DIR="/opt/torball"
CONF_DIR="/etc/torball"
SERVICE_USER="torball"
BRANCH="${BRANCH:-main}"

NAME="${1:?Instanzname fehlt (z. B. prod)}"
FE_PORT="${2:?frontend_port fehlt (z. B. 8080)}"
BE_PORT="${3:?backend_port fehlt (z. B. 3001)}"
SERVER_NAME="${4:-_}"
# Der Instanzname landet in Pfaden (/opt/torball/<name>), DB-/Service-Namen und wird von
# instanz-entfernen.sh sogar in ein "rm -rf" eingesetzt - nur einfache Kleinbuchstaben/Ziffern/
# Bindestriche zulassen, damit ein Tippfehler wie "../x" oder ein Leerzeichen nie Pfade
# verlassen oder Namen zerlegen kann (Sicherheitsdurchsicht Deploy, 2026-08-20).
[[ "$NAME" =~ ^[a-z0-9-]+$ ]] || { echo "Ungueltiger Instanzname '${NAME}' - erlaubt sind nur Kleinbuchstaben, Ziffern und Bindestriche."; exit 1; }
# FRONTEND_URL braucht einen echten, erreichbaren Host - "_" ist nur fuer nginx' server_name als
# Catch-all sinnvoll (s.u.), nicht als URL-Bestandteil. Ohne uebergebenen server_name faellt
# FRONTEND_URL stattdessen auf die primaere IP-Adresse des Hosts zurueck, damit Links in E-Mails
# (Einladung/Passwort-Reset) zumindest im LAN tatsaechlich funktionieren, statt woertlich
# "http://_:8080" zu enthalten (live als Bug aufgefallen, 2026-08-15). Nach dem Umstieg auf eine
# echte Domain/HTTPS muss FRONTEND_URL trotzdem manuell aktualisiert werden (siehe Doku) - das
# schreibt dieses Skript bei einem Update bewusst nicht mehr um (siehe unten).
if [[ "$SERVER_NAME" == "_" ]]; then
  FRONTEND_HOST="$(hostname -I | awk '{print $1}')"
else
  FRONTEND_HOST="$SERVER_NAME"
fi

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausfuehren (sudo, falls installiert; sonst direkt als root)."; exit 1; }
[[ -f "${CONF_DIR}/couchdb-admin" ]] || { echo "CouchDB-Admin fehlt - erst deploy/provision.sh ausfuehren."; exit 1; }

DIR="${BASE_DIR}/${NAME}"
DB="torball_${NAME}"
COUCH_ADMIN_PASS="$(cat "${CONF_DIR}/couchdb-admin")"

# CouchDB-Zugangsdaten NICHT als "-u admin:..." auf die curl-Kommandozeile legen - Argumente sind
# waehrend des Aufrufs fuer JEDEN lokalen Prozess in der Prozessliste (ps) sichtbar, auch fuer den
# unprivilegierten Service-Benutzer. Stattdessen eine kurzlebige, nur fuer root lesbare
# curl-Konfigurationsdatei (wird beim Skriptende automatisch geloescht). Passwoerter in
# Request-BODIES gehen aus demselben Grund per stdin (-d @-) statt als Argument.
# (Sicherheitsdurchsicht Deploy, 2026-08-20 - gleiches Muster in provision.sh/
# instanz-entfernen.sh/demo-snapshot-einrichten.sh.)
CURL_AUTH_CFG="$(mktemp "${CONF_DIR}/curl-auth.XXXXXX")"
chmod 600 "$CURL_AUTH_CFG"
printf 'user = "admin:%s"\n' "$COUCH_ADMIN_PASS" > "$CURL_AUTH_CFG"
trap 'rm -f "$CURL_AUTH_CFG"' EXIT

# CouchDB-Aufruf, der den HTTP-Status prueft statt ihn zu verschlucken: curl selbst liefert bei
# HTTP-Fehlern (401/500/...) Exit 0, ein stilles "|| true" liess solche Fehler frueher unbemerkt
# durchrutschen - der Service stuerzte dann erst spaeter mit einer kryptischen Meldung ab (gleiche
# Fehlerklasse wie live beim Windows-Installer erlebt, siehe CLAUDE.md). Erwartete Status-Codes
# (z.B. 412 "existiert schon" beim idempotenten Anlegen) werden explizit mit uebergeben.
couch_pruefe() {
  local beschreibung="$1"; shift
  local erlaubte="$1"; shift
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -K "$CURL_AUTH_CFG" -H "Content-Type: application/json" "$@")"
  if [[ " ${erlaubte} " != *" ${code} "* ]]; then
    echo "FEHLER: ${beschreibung} fehlgeschlagen (HTTP ${code}, erwartet: ${erlaubte})." >&2
    exit 1
  fi
}

echo "== Port-Plausibilitaetspruefung (nur bei bereits bestehender Instanz) =="
# Ein vertippter Port (z.B. 8000 statt 8080) faellt sonst nicht auf: backend_port landet zwar seit
# obigem .env-Fix nicht mehr in einem bereits bestehenden backend/.env, wird aber bedingungslos in
# die nginx-Site geschrieben (proxy_pass) - ein falscher Wert dort fuehrt zu 502 Bad Gateway fuer
# die ganze Instanz, ohne dass beim Ausfuehren selbst etwas auffaellt. Nur ein Hinweis + Rueckfrage,
# kein hartes Verbot - ein bewusster Port-Wechsel (Instanz umziehen) bleibt moeglich.
if [[ -f "${DIR}/backend/.env" ]]; then
  # "|| true": eine .env ohne PORT=-Zeile (untypisch, aber moeglich) darf das Skript nicht ueber
  # set -e abbrechen - dann entfaellt einfach die Plausibilitaetspruefung.
  BISHERIGER_BE_PORT="$(grep -m1 '^PORT=' "${DIR}/backend/.env" | cut -d= -f2 || true)"
  if [[ -n "$BISHERIGER_BE_PORT" && "$BISHERIGER_BE_PORT" != "$BE_PORT" ]]; then
    echo "WARNUNG: backend_port=${BE_PORT} weicht vom bisherigen Wert in backend/.env ab (${BISHERIGER_BE_PORT})."
    read -r -p "Wirklich mit ${BE_PORT} fortfahren? Tippe 'ja': " ANTWORT
    [[ "$ANTWORT" == "ja" ]] || { echo "Abgebrochen."; exit 1; }
  fi
fi
NGINX_SITE="/etc/nginx/sites-available/torball-${NAME}"
if [[ -f "$NGINX_SITE" ]]; then
  BISHERIGER_FE_PORT="$(sed -n 's/^[[:space:]]*listen \([0-9]*\);.*/\1/p' "$NGINX_SITE" | head -1)"
  if [[ -n "$BISHERIGER_FE_PORT" && "$BISHERIGER_FE_PORT" != "$FE_PORT" ]]; then
    echo "WARNUNG: frontend_port=${FE_PORT} weicht vom bisherigen Wert in der nginx-Site ab (${BISHERIGER_FE_PORT})."
    read -r -p "Wirklich mit ${FE_PORT} fortfahren? Tippe 'ja': " ANTWORT
    [[ "$ANTWORT" == "ja" ]] || { echo "Abgebrochen."; exit 1; }
  fi
fi

echo "== Code holen/aktualisieren (${DIR}, Branch ${BRANCH}) =="
if [[ -d "${DIR}/.git" ]]; then
  # -c safe.directory="$DIR": das Verzeichnis gehoert nach dem chown weiter unten dem
  # Service-Benutzer "torball", nicht root - neuere Git-Versionen verweigern sonst mit "dubious
  # ownership" JEDEN Zugriff auf ein Repo, das einem anderen Benutzer gehoert (auch fuer root
  # kein automatischer Vorrang mehr). Nur als Kommandozeilen-Override, keine dauerhafte
  # ~/.gitconfig-Aenderung fuer root noetig.
  git -c safe.directory="$DIR" -C "$DIR" fetch origin "$BRANCH"
  git -c safe.directory="$DIR" -C "$DIR" reset --hard "origin/${BRANCH}"
else
  # Nur der allererste Deploy braucht REPO_URL noch von aussen - danach steht die Adresse im
  # "origin"-Remote des Checkouts und wird beim naechsten Lauf automatisch wiederverwendet.
  : "${REPO_URL:?REPO_URL muss gesetzt sein (Git-URL des Repos) - nur beim allerersten Deploy dieser Instanz noetig, danach nicht mehr}"
  git clone -b "$BRANCH" "$REPO_URL" "$DIR"
fi

echo "== Downloadbares Quellcode-ZIP (fuer die lokale Windows-Installation, siehe /hilfe) =="
# Der Gitea-Server liegt nur im internen LAN - ohne diese Kopie waere der Quellcode fuer eine
# lokale Installation an einem Turnierort ohne Zugriff auf dieses Netz gar nicht erreichbar.
# "git archive" packt den aktuellen Stand (nur getrackte Dateien, kein .git/node_modules) neu -
# bewusst bei JEDEM Deploy-Lauf neu erzeugt (nicht bei jedem Push), stabiler Dateiname statt
# Versionierung, da immer nur der jeweils aktuelle Stand angeboten werden soll.
DOWNLOAD_DIR="${DIR}/downloads"
mkdir -p "$DOWNLOAD_DIR"
git -c safe.directory="$DIR" -C "$DIR" archive --format=zip -o "${DOWNLOAD_DIR}/torball-quellcode.zip" HEAD
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$DOWNLOAD_DIR"

echo "== Bauen (shared zuerst) =="
# Instanzname als Vite-Build-Variable durchreichen, damit das Frontend bei jeder Nicht-Prod-Instanz
# (z.B. "demo") einen auffaelligen Umgebungs-Banner anzeigen kann (siehe UmgebungsBanner.tsx) -
# rein zur Build-Zeit, kein Laufzeit-API-Aufruf noetig. Wird bei jedem Lauf neu geschrieben.
echo "VITE_INSTANZ_NAME=${NAME}" > "${DIR}/frontend/.env"
# --no-audit/--no-fund: Audit-Hinweise gehoeren in die Entwicklung (dort werden Schwachstellen
# beobachtet/behoben), nicht in den Deploy-Lauf - sie verunsichern nur und kosten Zeit.
( cd "$DIR"
  npm ci --no-audit --no-fund
  npm run build --workspace=shared
  npm run build )

echo "== CouchDB: Datenbank + Instanz-Benutzer =="
PW_FILE="${CONF_DIR}/db-${NAME}.pass"
[[ -f "$PW_FILE" ]] || { openssl rand -base64 24 > "$PW_FILE"; chmod 600 "$PW_FILE"; }
DB_PASS="$(cat "$PW_FILE")"
# 412 = Datenbank existiert bereits (idempotenter Wiederholungslauf) - alles andere ausser 201
# ist ein echter Fehler (z.B. 401 bei falschem Admin-Passwort) und bricht ab.
couch_pruefe "Datenbank ${DB} anlegen" "201 412" -X PUT "http://127.0.0.1:5984/${DB}"
# Erst die _rev eines evtl. schon vorhandenen Benutzers holen und MIT ihr schreiben, statt ein
# PUT-ohne-_rev-409 zu schlucken: existiert der Benutzer mit einem ANDEREN Passwort (z.B. nach
# manuell neu erzeugter db-<name>.pass), wuerde das stille 409 sonst das alte Passwort in CouchDB
# stehen lassen, waehrend .env schon das neue enthaelt - "Name or password is incorrect" beim
# Start (gleicher Fix wie im Windows-Installer, dort live erlebt). Passwort im Body per stdin.
USER_URL="http://127.0.0.1:5984/_users/org.couchdb.user:torball_${NAME}"
USER_REV="$(curl -s -K "$CURL_AUTH_CFG" "$USER_URL" | sed -n 's/.*"_rev":"\([^"]*\)".*/\1/p' || true)"
if [[ -n "$USER_REV" ]]; then
  USER_REV_FELD="\"_rev\":\"${USER_REV}\","
else
  USER_REV_FELD=""
fi
couch_pruefe "Instanz-Benutzer torball_${NAME} anlegen/aktualisieren" "201" \
  -X PUT "$USER_URL" -d @- <<JSON
{${USER_REV_FELD}"name":"torball_${NAME}","password":"${DB_PASS}","roles":[],"type":"user"}
JSON
# Nur diese eine DB fuer den Instanz-Benutzer freigeben (Instanzen sehen sich gegenseitig nicht).
# Als admins (nicht nur members) eintragen: CouchDB verlangt fuer das Anlegen von Mango-Indizes
# (ensureIndexes() in backend/src/db.ts, technisch ein Design-Dokument) Admin-Rechte auf der
# jeweiligen Datenbank - ein reiner "member" bekommt beim Start "forbidden" und der Service
# stuerzt ab. Bleibt trotzdem auf genau diese eine DB beschraenkt (kein Server-Admin).
# Dieses PUT MUSS klappen (200) - ohne _security-Eintrag kann sich das Backend nicht verbinden.
couch_pruefe "Zugriffsrechte (_security) fuer ${DB} setzen" "200" \
  -X PUT "http://127.0.0.1:5984/${DB}/_security" \
  -d "{\"admins\":{\"names\":[\"torball_${NAME}\"],\"roles\":[]},\"members\":{\"names\":[\"torball_${NAME}\"],\"roles\":[]}}"

if [[ -f "${DIR}/backend/.env" ]]; then
  # NUR beim allerersten Deploy neu schreiben - ein Update wuerde sonst jeden manuell gesetzten
  # Wert (COOKIE_SECURE/FRONTEND_URL fuer HTTPS, DEMO_SNAPSHOT_ERLAUBT, ...) stillschweigend auf
  # den Bootstrap-Default zuruecksetzen. Live erlebt: ein "torball-
  # aktualisieren demo" hat DEMO_SNAPSHOT_ERLAUBT so unbemerkt wieder auf false gedreht, obwohl
  # deploy/demo-snapshot-einrichten.sh es zuvor gezielt auf true gesetzt hatte.
  echo "== backend/.env existiert bereits - unveraendert gelassen (Update) =="
else
  echo "== backend/.env schreiben (Erstanlage) =="
  cat > "${DIR}/backend/.env" <<EOF
PORT=${BE_PORT}
HOST=127.0.0.1
COUCHDB_URL=http://127.0.0.1:5984
COUCHDB_DB=${DB}
COUCHDB_USER=torball_${NAME}
COUCHDB_PASSWORD=${DB_PASS}
# Vorerst false (Zugriff via HTTP im LAN). Sobald die Instanz hinter HTTPS haengt: auf true
# setzen UND FRONTEND_URL auf die https-Adresse aendern (siehe Doku), dann Service neu starten.
COOKIE_SECURE=false
FRONTEND_URL=http://${FRONTEND_HOST}:${FE_PORT}
# Ohne explizite Zeitzone interpretiert Node Datum/Uhrzeit-Strings ohne Offset (z.B. Turnier-
# Startzeiten, siehe backend/src/spielplan/zeitplanung.ts) in der Systemzeitzone des Servers - die
# ist auf einer frischen Debian-Installation i.d.R. UTC, nicht deutsche Zeit. Europe/Berlin statt
# eines festen Offsets, damit Node die Sommer-/Winterzeit-Umstellung automatisch beruecksichtigt.
TZ=Europe/Berlin
# E-Mail-Versand (Einladung/Passwort-Reset) wird NICHT hier eingetragen, sondern spaeter ueber die
# Oberflaeche (Admin -> Systemeinstellungen -> "E-Mail-Versand (SMTP)") - kein .env-Wert mehr.
KANBAN_BOARD_AKTIV=false
# Schaltet die demo:*-CLI-Befehle frei (Snapshot/Restore, siehe backend/src/demo/snapshot.ts) -
# bleibt fuer jede Instanz false, bis deploy/demo-snapshot-einrichten.sh gezielt fuer eine
# Demo-Instanz durchlaeuft. Nie versehentlich gegen Produktivdaten aktivieren.
DEMO_SNAPSHOT_ERLAUBT=false
EOF
  chmod 600 "${DIR}/backend/.env"
fi
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$DIR"

echo "== nginx-Site (Port ${FE_PORT}) =="
cat > "/etc/nginx/sites-available/torball-${NAME}" <<EOF
server {
    listen ${FE_PORT};
    server_name ${SERVER_NAME};
    root ${DIR}/frontend/dist;
    index index.html;

    client_max_body_size 5m;            # Logo-Uploads (Data-URL im PUT) etc.

    # API dieser Instanz; das /api-Praefix wird durch den trailing slash abgeschnitten.
    location /api/ {
        proxy_pass http://127.0.0.1:${BE_PORT}/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Downloadbares Quellcode-ZIP fuer die lokale Windows-Installation (siehe /hilfe#lokale-installation).
    location /download/ {
        alias ${DIR}/downloads/;
    }

    # SPA (React Router): unbekannte Pfade auf index.html. Sicherheits-Header hier (nicht global),
    # damit /api-Antworten sie nicht doppelt bekommen - die setzt das Backend selbst und nginx
    # reicht sie durch (siehe backend/src/sicherheitsHeader.ts). HSTS bewusst NICHT hier, sondern
    # am externen TLS-Endpunkt (Nginx Proxy Manager) bzw. backend-seitig gated auf COOKIE_SECURE.
    location / {
        try_files \$uri /index.html;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" always;
        add_header Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=()" always;
    }
}
EOF
ln -sf "/etc/nginx/sites-available/torball-${NAME}" "/etc/nginx/sites-enabled/torball-${NAME}"
nginx -t
systemctl reload nginx

echo "== systemd-Service torball@${NAME} =="
systemctl enable "torball@${NAME}" >/dev/null 2>&1 || true
systemctl restart "torball@${NAME}"

echo
echo "Instanz '${NAME}' aktualisiert und gestartet."
echo "  Frontend:  http://<server-ip>:${FE_PORT}"
echo "  Backend:   127.0.0.1:${BE_PORT}   DB: ${DB}"
echo "  Logs:      journalctl -u torball@${NAME} -f"
echo
echo "Erststart: Es existiert noch kein Benutzer - die Anmeldeseite fuehrt durch die einmalige"
echo "Ersteinrichtung des ersten Admin-Kontos."
