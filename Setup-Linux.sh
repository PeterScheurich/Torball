#!/usr/bin/env bash
# Startet den Linux-Installer (liegt aus Ordnungsgruenden unter deploy/) - diese Datei liegt bewusst
# auf der obersten Ebene des entpackten Quellcode-ZIPs, damit sie sofort auffindbar ist (Gegenstueck
# zu Setup.cmd unter Windows). Aufruf:  bash Setup-Linux.sh
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy/installieren-linux.sh" "$@"
