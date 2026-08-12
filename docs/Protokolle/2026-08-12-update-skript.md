# 2026-08-12 – Standardisiertes Update-Skript (System + App)

## Anlass

Beim ersten echten Produktiv-Deploy kam die Frage auf, ob `apt-get update && apt-get dist-upgrade -y`
auf dem Server ausreicht, um die App zu aktualisieren – tut es nicht: `apt` verwaltet nur die
System-Pakete (Node/CouchDB/nginx, falls per apt installiert), der App-Code liegt in einem
eigenen Git-Checkout unter `/opt/torball/<name>` und wird ausschließlich über `deploy-instanz.sh`
aktualisiert. Wunsch danach: **ein** Befehl, der beides standardisiert erledigt, mit Rückfrage
überall dort, wo eine echte Entscheidung ansteht.

## Umsetzung

`deploy/aktualisieren.sh` (root, gleiche Parameter wie `deploy-instanz.sh`):

1. `apt-get update`, zeigt verfügbare System-Updates, fragt **vor** `dist-upgrade` nach.
2. Bewusst **ohne** `DEBIAN_FRONTEND=noninteractive` – native dpkg-Rückfragen bei
   Konfigurationsdatei-Konflikten (z. B. wenn ein Paket-Update eine lokal angepasste Config
   überschreiben würde) bleiben dadurch interaktiv, statt automatisch überschrieben zu werden.
   Genau dort soll der Mensch entscheiden, nicht das Skript.
3. Prüft danach per `/var/run/reboot-required` **und** einem Vergleich des laufenden gegen den
   neuesten installierten Kernel, ob ein Neustart nötig ist (der Marker allein ist auf einer
   minimalen Debian-Installation nicht zuverlässig, da das dafür zuständige Hook-Paket dort nicht
   automatisch installiert ist) – fragt auch dafür nach, statt automatisch neu zu starten oder es
   stillschweigend zu ignorieren.
4. Ruft für den App-Teil **direkt `deploy-instanz.sh`** mit denselben Parametern auf (Git-Pull,
   Build, CouchDB-Setup, Dienst-Neustart) – keine doppelte Logik.

**Bewusst nicht umgesetzt:** ein Selbst-Update des umgebenden Checkouts (`~/torball-src`). Ein
laufendes Bash-Skript, das sich selbst per `git reset --hard` unter den Füßen wegzieht, ist ein
bekanntes Footgun (unvorhersehbares Verhalten, falls sich Zeilenoffsets während der Ausführung
verschieben). Stattdessen bleibt es bei der bestehenden Regel: vor einem Lauf ggf. manuell
`git pull` im Checkout, falls sich die Deploy-Skripte seit dem letzten Mal geändert haben.

**Nachtrag (selbe Sitzung):** Nutzer-Wunsch, diesen Hinweis nicht nur in der Doku, sondern auch am
Ende jedes Skript-Laufs auszugeben – sonst geht er in der Praxis leicht unter. Das Skript ermittelt
dafür zur Laufzeit den tatsächlichen Checkout-Pfad (`cd "${SKRIPT_ORDNER}/.." && pwd`) und gibt am
Ende einen direkt copy-pasteable `cd ... && git pull`-Befehl aus, keinen Platzhalter.

**Zweiter Nachtrag (selbe Sitzung):** Live beim ersten echten Einsatz aufgefallen – der Befehl war
nur relativ zum Checkout aufrufbar (`bash deploy/aktualisieren.sh`, abhängig vom aktuellen
Arbeitsverzeichnis; zweimal live danebengegriffen: einmal aus `deploy/` heraus aufgerufen, einmal
mit dem neuen Skript noch vor dem nötigen `git pull`). Nutzer-Wunsch: von jedem Verzeichnis aus
aufrufbar. Umsetzung: `provision.sh` legt einen Symlink `/usr/local/bin/torball-aktualisieren` an
(neuer Schritt `[7/7]`, alle vorherigen Schritte entsprechend umnummeriert). Dabei ein Detail, das
sonst zu einem stillen Fehler geführt hätte: `aktualisieren.sh` bestimmte seinen eigenen Ordner
bisher direkt über `BASH_SOURCE[0]`, um darüber `deploy-instanz.sh` zu finden – bei Aufruf über
einen Symlink liefert das aber den Pfad des Symlinks (`/usr/local/bin`), nicht den der Zieldatei.
Fix: `readlink -f "${BASH_SOURCE[0]}"` löst den Symlink zuerst auf, danach stimmt der ermittelte
Ordner (und damit auch der Checkout-Pfad für den Git-Pull-Hinweis) unabhängig vom Aufrufweg.

Nur syntaktisch geprüft (`bash -n`), nicht live gegen den echten Produktiv-Server ausgeführt (würde
System-Pakete aktualisieren bzw. ggf. neu starten – das soll der Nutzer selbst anstoßen).

## Dokumentation

`docs/installation-konfiguration.md` (neuer Abschnitt „Aktualisieren" unter der produktiven
Installation) und `CLAUDE.md` (Betrieb/Infrastruktur) ergänzt.
