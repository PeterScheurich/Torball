#!/usr/bin/env bash
#
# Ein-Befehl-Update fuer eine Produktiv-Instanz: System-Pakete (apt) UND App-Code (Git+Build) in
# einem Rutsch, mit Rueckfrage an den Stellen, wo eine echte Entscheidung ansteht - statt entweder
# alles blind durchzuwinken oder bei jedem Update von Hand zwischen apt und dem Deploy-Skript zu
# unterscheiden (das sind zwei unabhaengige Mechanismen: apt aktualisiert das Betriebssystem,
# deploy-instanz.sh den App-Code - siehe docs/installation-konfiguration.md).
#
# Nutzung (dieselben Parameter wie deploy-instanz.sh, an das dieses Skript den App-Teil delegiert),
# entweder direkt im Checkout oder von ueberall ueber den Symlink torball-aktualisieren. REPO_URL
# wird fuer eine BEREITS bestehende Instanz nicht mehr gebraucht (steckt schon im "origin"-Remote
# ihres Checkouts, siehe deploy-instanz.sh) - nur beim allerersten Deploy einer neuen Instanz noetig:
#   deploy/aktualisieren.sh <name> <frontend_port> <backend_port> [server_name]
#   torball-aktualisieren <name> <frontend_port> <backend_port> [server_name]
#
# Ablauf:
#   1) apt-get update, zeigt verfuegbare System-Updates an, fragt VOR "dist-upgrade" nach.
#      Bewusst OHNE DEBIAN_FRONTEND=noninteractive: native dpkg-Rueckfragen bei
#      Konfigurationsdatei-Konflikten bleiben interaktiv, statt automatisch ueberschrieben zu
#      werden - genau dort, wo eine echte Entscheidung noetig ist.
#   2) Prueft danach, ob ein Neustart erforderlich ist (neuer Kernel o.ae.) und fragt, ob JETZT
#      neu gestartet werden soll, statt das stillschweigend zu tun oder zu ignorieren.
#   3) Ruft deploy-instanz.sh mit denselben Parametern auf (Git-Pull des App-Codes, Build,
#      CouchDB-Setup, Service-Neustart) - keine doppelte Logik.
#
# Aktualisiert NICHT sich selbst / den umgebenden Checkout (~/torball-src): falls sich die
# Deploy-Skripte seit dem letzten Lauf geaendert haben, vorher "git pull" dort ausfuehren.
#
# Global aufrufbar ueber den Symlink /usr/local/bin/torball-aktualisieren (von provision.sh
# angelegt) - deshalb ueber readlink -f aufgeloest statt direkt ueber BASH_SOURCE: ein Symlink
# wuerde sonst dazu fuehren, dass "eigener Ordner" faelschlich /usr/local/bin waere statt des
# tatsaechlichen deploy/-Ordners im Checkout (dort liegt deploy-instanz.sh).
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausfuehren."; exit 1; }

SKRIPT_PFAD="$(readlink -f "${BASH_SOURCE[0]}")"
SKRIPT_ORDNER="$(cd "$(dirname "$SKRIPT_PFAD")" && pwd)"

echo "== [1/3] System-Pakete pruefen (apt) =="
apt-get update

VERFUEGBAR="$(apt list --upgradable 2>/dev/null | grep -v '^Listing' || true)"
if [[ -n "$VERFUEGBAR" ]]; then
  echo "Folgende System-Pakete koennen aktualisiert werden:"
  echo "$VERFUEGBAR"
  echo
  read -rp "Jetzt aktualisieren (apt-get dist-upgrade)? [j/N] " ANTWORT
  if [[ "$ANTWORT" =~ ^[jJ] ]]; then
    apt-get dist-upgrade -y
  else
    echo "System-Pakete unveraendert gelassen."
  fi
else
  echo "System-Pakete sind bereits aktuell."
fi

echo
echo "== [2/3] Neustart-Bedarf pruefen =="
NEUSTART_NOETIG=false
[[ -f /var/run/reboot-required ]] && NEUSTART_NOETIG=true

LAUFENDER_KERNEL="$(uname -r)"
NEUESTER_KERNEL="$(dpkg-query -W -f='${Package}\n' 'linux-image-[0-9]*' 2>/dev/null | sed 's/^linux-image-//' | sort -V | tail -1 || true)"
if [[ -n "$NEUESTER_KERNEL" && "$NEUESTER_KERNEL" != "$LAUFENDER_KERNEL" ]]; then
  NEUSTART_NOETIG=true
fi

if [[ "$NEUSTART_NOETIG" == true ]]; then
  echo "Ein Neustart des Servers ist jetzt erforderlich (neuer Kernel/neue Systembibliotheken)."
  echo "Laufender Kernel: ${LAUFENDER_KERNEL}   Neuester installierter Kernel: ${NEUESTER_KERNEL:-unbekannt}"
  read -rp "Jetzt neu starten (alle Dienste auf diesem Host gehen kurz down)? [j/N] " REBOOT_ANTWORT
  if [[ "$REBOOT_ANTWORT" =~ ^[jJ] ]]; then
    echo "Starte in 5 Sekunden neu (Strg+C zum Abbrechen) ..."
    sleep 5
    reboot
    exit 0
  else
    echo "Neustart aufgeschoben - bitte bei Gelegenheit selbst \"reboot\" ausfuehren."
  fi
else
  echo "Kein Neustart noetig."
fi

echo
echo "== [3/3] App-Instanz aktualisieren (Git-Pull + Build + Dienst-Neustart) =="
bash "${SKRIPT_ORDNER}/deploy-instanz.sh" "$@"

CHECKOUT_ORDNER="$(cd "${SKRIPT_ORDNER}/.." && pwd)"
echo
echo "Fertig - System und App-Instanz sind auf dem aktuellen Stand."
echo
echo "Hinweis: Dieses Skript (deploy/aktualisieren.sh) aktualisiert sich nicht selbst - es kann also"
echo "sein, dass beim naechsten Update-Lauf noch eine aeltere Fassung verwendet wird. Vor dem"
echo "naechsten Lauf einmal pruefen/aktualisieren mit:"
echo "  cd ${CHECKOUT_ORDNER} && git pull"
