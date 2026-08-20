# Windows-Installer: CouchDB-MSI-Aufklärung, Zustimmungs-Muster, Deinstaller

**Datum:** 19.08.2026 (ergänzt 20.08.2026)

Ein ganzer Testtag am echten Zielrechner einer technisch wenig versierten Zielperson deckte eine
Kette von Problemen im Windows-Installationsweg (`Setup.cmd` →
`deploy/installieren-windows.ps1`) auf. Festgehalten hier vor allem wegen des mühsam erarbeiteten
Diagnose-Wissens – falls dieselben Fehlerbilder bei anderen Nutzern wieder auftauchen.

## Setup.cmd als Einstiegspunkt

Nach dem Entpacken des Quellcode-ZIPs sieht man auf der obersten Ebene nur den Repo-Ordnerbaum –
niemand liest erfahrungsgemäß die README, um den Installer unter `deploy/` zu finden.
`Setup.cmd` (oberste Ebene) ruft per `call` nur `deploy/Installieren-Windows.cmd` auf; das
eigentliche Skript bleibt unter `deploy/` (funktioniert unverändert, da es seinen `$RepoRoot`
über `$PSScriptRoot` auflöst).

## Erklären-und-Zustimmen-Muster (zweistufig entwickelt)

Zielgruppe sind explizit auch technisch wenig versierte Personen. Erster Anlauf war „gar keine
automatische Systemänderung, nur eine Anleitung zum Selbermachen in einer Admin-Kommandozeile" –
laut Nutzer-Test **zu viel verlangt**. Jetzige Lösung: `Bestaetige-Systemaenderung` zeigt vor
jeder System-Änderung Titel + Erklärung + Auswirkung in Alltagssprache, fragt per J/N (Default J)
und **führt die Änderung bei Zustimmung selbst aus**; bei Ablehnung bricht die Installation ab
(nichts wird stillschweigend übersprungen). Gilt für alle System-Änderungen (Node.js, CouchDB,
Sonderfälle unten); reine Projektordner-Änderungen (npm install/build, `.env`, Verknüpfung)
durchlaufen das bewusst nicht.

## Die CouchDB-MSI-Kette (Error 1324) – mehrstufig aufgeklärt

**Symptom:** `msiexec` bricht mit Exit-Code 1603 ab, im MSI-Log (UTF-16, `Get-Content -Encoding
Unicode`!) steht „Error 1324 … contains an invalid character" aus der nativen Aktion
`CostFinalize`.

1. **Erste Theorie (falsch): 8.3-Kurznamen deaktiviert.** Registry-Umschalten
   (`NtfsDisable8dot3NameCreation`) + Neustart halfen **nicht** – der Wert wirkt nur auf neu
   erzeugte Ordner; „Program Files" selbst hatte auf dem Testrechner nie einen Kurznamen bekommen
   (`dir /x C:\` zeigt keinen `PROGRA~1`-Eintrag).
2. **Zwischen-Fix: Installationsordner verlegen.** Per MSI-Tabellenabfrage
   (`WindowsInstaller.Installer`-COM-Objekt) verifiziert, dass `APPLICATIONFOLDER` eine
   öffentliche, überschreibbare WiX-Eigenschaft ist – mit Ziel außerhalb „Program Files" tritt
   der Fehler dort nicht mehr auf. Der 8.3-Zustimmungspfad bleibt nur noch als Fallback im Code.
3. **Karteileiche: fehlgeschlagene Installation bleibt registriert.** Ein gescheiterter
   `msiexec`-Lauf hatte das Produkt trotzdem bei Windows registriert (inkl. eines vom Installer
   selbst falsch gewählten Zielordners); jeder weitere Versuch lief in den MSI-„Reparatur"-Modus
   und ignorierte `APPLICATIONFOLDER` stillschweigend („entering maintenance mode" im Log). Das
   Skript erkennt solche Einträge jetzt per `Get-Package` (Produkt registriert, Zielordner fehlt/
   leer) und bietet die Entfernung per `msiexec /x <ProductCode>` an.
4. **Tatsächliche Wurzel: leerer Wechseldatenträger-Laufwerksbuchstabe.** Der CouchDB-Installer
   hat eine eigene fehlerhafte Logik zur Bestimmung von „PROGRAMFILESFORSURE", die auf dem
   Testrechner (11 Laufwerksbuchstaben) einen **leeren Kartenleser-Steckplatz** als Ziel wählte
   (`Win32_LogicalDisk`, `DriveType 2`, kein Medium, 0 Byte) – unabhängig vom vorgegebenen
   `APPLICATIONFOLDER`, bei Installation **und** Deinstallation. **Kein Fix im Skript möglich**
   – lösbar nur über die Windows-Datenträgerverwaltung (Laufwerksbuchstaben entziehen). Bei
   Wiederauftreten gezielt danach suchen: `Get-CimInstance Win32_LogicalDisk`, `DriveType 2`
   ohne `VolumeName`/Größe.
5. **Nachwirkung: verwaister Windows-Dienst.** Der bereits registrierte Dienst „Apache CouchDB"
   (NSSM) behielt nach der Reparatur den alten `ImagePath` und die NSSM-Parameter
   (`…\Services\Apache CouchDB\Parameters`) – Dienststart scheiterte mit Ereignis-ID 7000. Das
   Skript prüft jetzt nach jeder Installation, ob `Win32_Service.PathName` zum aktuellen
   Zielordner passt, und korrigiert SCM-`binPath` + NSSM-Parameter.
6. **Fehlende Systemdatenbanken.** Der unbeaufsichtigte MSI-Weg durchläuft den
   Fauxton-„Single Node Setup"-Assistenten nie – `_users`/`_replicator`/`_global_changes` fehlen
   (`GET /_cluster_setup` → `cluster_disabled`), wodurch sich **kein** regulärer Benutzer
   anmelden kann (Symptom: irreführendes 401 „Name or password is incorrect"). Das Skript legt
   die drei Datenbanken jetzt idempotent per `PUT` an (412 bei vorhandener DB wird ignoriert) –
   betrifft jede Neuinstallation auf frischem CouchDB.

## Weitere Erkenntnisse desselben Tages

- **Alles außerhalb des Projektordners gebündelt unter `C:\Torball-Turniere`** (CouchDB-
  Installation, Passwort-Dateien, Log; Nutzer-Vorgabe – leichter wiederzufinden/aufzuräumen als
  `C:\ProgramData`). Die Admin-Passwort-Datei behält ihre eigene Administratoren-only-ACL.
- **Node ignoriert `--env-file`-Werte, wenn dieselbe Variable im Prozessumfeld schon existiert:**
  trotz `PORT=3001` in `.env` startete der Server auf 3000 (dauerhaft hinterlegte
  `PORT`-Umgebungsvariable auf dem Testrechner). `Start-Torball.cmd` liest den Port jetzt selbst
  aus `.env` (`findstr`) und setzt ihn explizit per `set "PORT=…"`, bevor node startet.
- **Server-Fenster startet minimiert** mit Titel „Torball-Turniere-Server - NICHT SCHLIESSEN!"
  (`start … /min cmd /k …`) – kein versehentliches Wegklicken mehr, Konsolenausgabe bleibt über
  die Taskleiste erreichbar (bewusst kein Dienst: gerade in der Beta war diese Ausgabe wiederholt
  der einzige Diagnose-Weg).
- **Desktop-Verknüpfung mit eigenem mehrstufigem Icon**
  (`frontend/public/images/torball-app-icon.ico`, 16–256 px) statt des einzeln-16×16-Favicons,
  das auf dem Desktop unscharf hochskaliert wurde.
- **`Aktualisieren-Torball.cmd` ist jetzt eine normale, mitversionierte Datei** (Inhalt war schon
  immer statisch); `AKTUALISIEREN.md` fasst den Update-Weg für Laien zusammen.
- **Deinstaller** (`Deinstallieren-Torball.cmd` → `deploy/deinstallieren-windows.ps1`): gleiches
  Erklären-und-Zustimmen-Muster, aber eine Ablehnung überspringt nur den einen Schritt statt
  abzubrechen (Standardantwort „nein"). Vier unabhängige Schritte: Verknüpfung/Startskript,
  `.env` + Build-Artefakte, CouchDB inkl. `C:\Torball-Turniere` (mit deutlicher Warnung: löscht
  ALLE Turnierdaten), Node.js. Der Projektordner selbst wird nie automatisch gelöscht (das Skript
  liegt darin).

## Ergänzungen 20.08.2026

- **`torball aktualisieren` meldete bei ZIP-Installationen fälschlich Erfolg:** ohne
  `.git`-Ordner wird `git pull` übersprungen (einzeilige, leicht übersehbare Meldung), gebaut
  wurde nur der alte Stand. Die Erfolgsmeldung ist jetzt an `istGitRepo` gekoppelt; im ZIP-Fall
  erscheint ein deutlicher Warnblock mit den konkreten nächsten Schritten (neues ZIP laden,
  `.env` übernehmen, `Setup.cmd` erneut ausführen).
- **Erneuter `Setup.cmd`-Lauf aktualisiert jetzt auch:** vor dem Bauen derselbe
  `git pull`-Versuch wie in `torball aktualisieren` (nur falls `.git` vorhanden) – „nochmal
  installieren" soll der naheliegenden Erwartung entsprechend auch aktualisieren.

## Lehre

Eine Auswirkungs-Behauptung („kein Neustart nötig") nicht ungeprüft übernehmen, auch wenn sie
plausibel klingt – und bei einem wiederkehrenden Fehlerbild die Ursachen-Annahme selbst
hinterfragen (z. B. direkt in der MSI-Datei nachsehen), statt nur den nächsten naheliegenden
Workaround zu versuchen.
