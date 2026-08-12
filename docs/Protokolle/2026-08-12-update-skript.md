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

## Dritter Nachtrag: echter Bug in deploy-instanz.sh gefunden (erster funktionierender Update-Lauf)

Nach dem Fix des ausführbaren Bits (siehe unten) lief `torball-aktualisieren` zum ersten Mal
wirklich durch bis zum App-Update-Schritt – und schlug dort fehl:

```
== Code holen/aktualisieren (/opt/torball/prod, Branch main) ==
fatal: detected dubious ownership in repository at '/opt/torball/prod'
```

**Ursache:** Neuere Git-Versionen (CVE-2022-24765-Absicherung) verweigern jeden Zugriff auf ein
Repository, dessen Besitzer nicht dem aktuellen Benutzer entspricht – **auch für `root`**, anders
als in älteren Git-Versionen. `deploy-instanz.sh` klont beim allerersten Deploy noch als `root`
(Verzeichnis gehört in dem Moment `root`), setzt den Besitz danach aber bewusst per
`chown -R torball:torball "$DIR"` auf den Service-Benutzer um (Sicherheitsprinzip: der laufende
Node-Prozess soll nicht als root laufen). Jeder **weitere** Lauf nimmt den `git fetch`/
`reset --hard`-Zweig (nicht mehr `clone`) – und der lief in dieser Installation bis heute **nie
wirklich durch einen zweiten echten Skript-Aufruf**: der CouchDB-Berechtigungsfix weiter oben in
dieser Sitzung wurde manuell per `curl` direkt gegen CouchDB angewendet (unabhängig vom App-Code)
und der Dienst nur manuell neu gestartet – nie über `deploy-instanz.sh`. Deshalb blieb der Bug bis
zum ersten echten Update-Versuch unentdeckt; der Server stand zu diesem Zeitpunkt noch auf dem
Commit des allerersten Deploys, mehr als zehn Commits hinter dem aktuellen Stand.

**Diagnose (read-only SSH-Zugriff genutzt):** `git log -1` in
`/opt/torball/prod` (mit demselben `-c safe.directory=`-Override, da auch der unprivilegierte
Diagnose-Account beim reinen Lesen an derselben Sperre scheiterte) zeigte den alten Commit;
`systemctl show torball@prod --property=ActiveEnterTimestamp` zeigte denselben Zeitstempel wie der
manuelle Neustart nach dem CouchDB-Fix, Stunden zuvor – der Dienst war seither nie neu gestartet
worden. Kein hängender Prozess (`ps aux`) - das Skript war nicht "stecken geblieben", sondern mit
einem klaren Fehler abgebrochen (`set -euo pipefail`), nur stand der Fehler nicht in der zuvor
geteilten, abgeschnittenen Ausgabe.

**Fix:** `deploy-instanz.sh`, `git -C "$DIR" fetch`/`reset --hard` um `-c safe.directory="$DIR"`
ergänzt – ein reiner Kommandozeilen-Override für genau diesen einen Aufruf, keine dauerhafte
Änderung an `root`s `~/.gitconfig` (die bräuchte ohnehin einen Eintrag pro Instanz-Verzeichnis).

## Vierter Nachtrag: REPO_URL für Updates nicht mehr nötig

Ursprüngliches Anliegen (Grund für den ganzen `aktualisieren.sh`-Umbau) war eigentlich nicht der
apt/App-Unterschied allein, sondern dass `REPO_URL=...` bei **jedem** Aufruf erneut angegeben
werden musste – das war beim ersten Formulieren nicht klar genug rübergekommen.

**Lösung:** `REPO_URL` steckt nach dem allerersten `git clone` bereits im `origin`-Remote des
Checkouts unter `/opt/torball/<name>` – `git fetch origin`/`git reset --hard origin/<branch>`
brauchen die URL selbst gar nicht mehr, nur den bereits konfigurierten Remote-Namen `origin`. Die
verpflichtende `REPO_URL`-Prüfung in `deploy-instanz.sh` stand bisher aber unbedingt ganz oben im
Skript, unabhängig davon, ob es sich um den ersten Deploy oder ein Update handelte. Verschoben in
den `else`-Zweig (nur beim `git clone`, also nur wenn `${DIR}/.git` noch nicht existiert) – für
eine bestehende Instanz reicht damit `bash deploy/deploy-instanz.sh prod 8080 3001` bzw.
`torball-aktualisieren prod 8080 3001`, ganz ohne `REPO_URL`.

Nur syntaktisch geprüft (`bash -n`), nicht live gegen den echten Produktiv-Server ausgeführt (würde
System-Pakete aktualisieren bzw. ggf. neu starten – das soll der Nutzer selbst anstoßen).

## Dokumentation

`docs/installation-konfiguration.md` (neuer Abschnitt „Aktualisieren" unter der produktiven
Installation) und `CLAUDE.md` (Betrieb/Infrastruktur) ergänzt.
