# Deinstalliert eine lokale Windows-Installation von Torball-Turniere (Gegenstueck zu
# installieren-windows.ps1 / Setup.cmd) wieder von diesem Rechner.
#
# Geht in einzelnen, unabhaengigen Schritten vor, jeweils mit Erklaerung + ausdruecklicher
# Zustimmungsfrage vorher (gleiches Muster wie beim Installer, siehe Bestaetige-Systemaenderung
# dort) - anders als beim Installer fuehrt eine Ablehnung hier aber nicht zum Abbruch der gesamten
# Deinstallation, sondern ueberspringt nur diesen einen Schritt (jeder Schritt fuer sich ist
# sinnvoll, auch ohne die anderen). Standardantwort bei jeder Frage hier bewusst "nein" (anders als
# beim Installer "ja") - Deinstallieren ist im Zweifel die folgenreichere Richtung.
#
# Entfernt je nach Zustimmung:
#   - Desktop-Verknuepfung + generierte Start-Datei (immer, reine Aufraeumarbeit im Projektordner)
#   - backend/.env (Datenbank-Zugangsdaten dieser Installation) + node_modules/dist-Ordner
#   - CouchDB (Windows-Dienst + Programm) inkl. ALLER darin gespeicherten Turnierdaten
#   - Node.js
#
# NICHT entfernt: der Projektordner selbst (das Skript liegt darin) - kann danach von Hand
# geloescht werden (z.B. in den Papierkorb verschieben).
#
# Verlangt Administratorrechte fuer die System-Schritte (CouchDB/Node.js) - elevatiert bei Bedarf
# automatisch, auch wenn am Ende nur die Projektordner-Schritte gewaehlt werden (einfacher als vorab
# zu erraten, welche Schritte die Person gleich bejahen wird).

$ErrorActionPreference = "Stop"

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "Die Deinstallation braucht Administratorrechte - starte neu mit UAC-Abfrage ..."
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$PSCommandPath`"" `
        -Verb RunAs
    Write-Host "Bitte im neu geoeffneten Fenster (mit Administratorrechten) fortfahren."
    exit
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$TorballOrdner = "C:\Torball-Turniere"

Write-Host "Torball-Turniere - lokale Installation entfernen"
Write-Host "Projektordner: $RepoRoot"
Write-Host ""
Write-Host "Jeder der folgenden Schritte wird einzeln erklaert und einzeln abgefragt - du kannst"
Write-Host "z.B. nur die Programmdateien entfernen und CouchDB/Node.js auf dem Rechner belassen,"
Write-Host "falls du dir nicht sicher bist, ob sie noch woanders gebraucht werden."
Write-Host ""

function Frage-MitDefault {
    param([string]$Text, [string]$Standard)
    $eingabe = Read-Host "$Text [$Standard]"
    if ([string]::IsNullOrWhiteSpace($eingabe)) { return $Standard }
    return $eingabe
}

# Wie Bestaetige-Systemaenderung im Installer, aber OHNE Abbruch bei Ablehnung - gibt stattdessen
# zurueck, ob der jeweilige Schritt durchgefuehrt werden soll. Standardantwort "nein".
function Frage-OptionalerSchritt {
    param([string]$Titel, [string]$Erklaerung, [string]$Auswirkung)
    Write-Host ""
    Write-Host "-- $Titel --"
    Write-Host $Erklaerung
    Write-Host "Auswirkung auf diesen Rechner: $Auswirkung"
    $antwort = Frage-MitDefault -Text "Jetzt entfernen? (j/n)" -Standard "n"
    return ($antwort -in @("j", "J", "ja", "Ja", "JA"))
}

# --- [1/4] Desktop-Verknuepfung + generierte Start-Datei -----------------------------------------
# Reine Aufraeumarbeit im Projektordner bzw. einer selbst erzeugten Verknuepfung, kein
# Systemeingriff - deshalb ohne Rueckfrage, analog zu den anderen Projektordner-Schritten des
# Installers.
Write-Host "== [1/4] Desktop-Verknuepfung + Start-Datei =="
$Shortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Torball-Turniere.lnk"
if (Test-Path $Shortcut) {
    Remove-Item -Path $Shortcut -Force
    Write-Host "Desktop-Verknuepfung entfernt."
} else {
    Write-Host "Keine Desktop-Verknuepfung gefunden."
}
$StartCmd = Join-Path $RepoRoot "Start-Torball.cmd"
if (Test-Path $StartCmd) {
    Remove-Item -Path $StartCmd -Force
    Write-Host "Start-Torball.cmd entfernt."
}
# Vom Installer ggf. angelegte Firewall-Regel (Netzwerkzugriff fuer Helfer-Geraete) mit
# aufraeumen - reines Entfernen einer Erlaubnis-Regel, macht den Rechner nur restriktiver.
$fwRegel = Get-NetFirewallRule -DisplayName "Torball-Turniere Server" -ErrorAction SilentlyContinue
if ($fwRegel) {
    $fwRegel | Remove-NetFirewallRule
    Write-Host "Windows-Firewall-Regel 'Torball-Turniere Server' entfernt."
}

# --- [2/4] Projektdateien: .env + heruntergeladene/gebaute Programmdateien -----------------------
Write-Host ""
Write-Host "== [2/4] Konfigurationsdatei + Programmdateien im Projektordner =="
$projektSchritt = Frage-OptionalerSchritt -Titel "Konfigurationsdatei und Programmdateien loeschen" `
    -Erklaerung "Im Projektordner liegen 'backend/.env' (die Zugangsdaten dieser Installation zur Datenbank) sowie mehrere 'node_modules'- und 'dist'-Ordner (heruntergeladene bzw. aus dem Quellcode gebaute Programmdateien, kein eigener Inhalt)." `
    -Auswirkung "Diese Dateien werden geloescht. Der Projektordner selbst und dein eigener Quellcode bleiben erhalten - du kannst den Ordner danach z.B. per Hand in den Papierkorb verschieben, wenn du auch den Rest nicht mehr brauchst."
if ($projektSchritt) {
    # Laeuft der Torball-Server noch (minimiertes "NICHT SCHLIESSEN"-Fenster), haelt sein
    # node-Prozess Dateien in node_modules/dist offen - das Loeschen wuerde dann mittendrin mit
    # einer wenig hilfreichen "Zugriff verweigert"-Meldung abbrechen. Deshalb gezielt die
    # node-Prozesse DIESES Projektordners beenden (andere node-Prozesse bleiben unberuehrt).
    $serverProzesse = Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match [regex]::Escape($RepoRoot) }
    if ($serverProzesse) {
        Write-Host "Der Torball-Turniere-Server laeuft noch - er wird jetzt beendet, damit die Dateien geloescht werden koennen."
        $serverProzesse | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
        Start-Sleep -Seconds 1
    }
    $EnvFile = Join-Path $RepoRoot "backend\.env"
    if (Test-Path $EnvFile) { Remove-Item -Path $EnvFile -Force; Write-Host "backend/.env geloescht." }
    foreach ($ordner in @("node_modules", "backend\node_modules", "frontend\node_modules", "shared\node_modules", "backend\dist", "frontend\dist", "shared\dist")) {
        $pfad = Join-Path $RepoRoot $ordner
        if (Test-Path $pfad) {
            Remove-Item -Path $pfad -Recurse -Force
            Write-Host "$ordner entfernt."
        }
    }
} else {
    Write-Host "Uebersprungen."
}

# --- [3/4] CouchDB (Dienst + Programm + alle Turnierdaten) ---------------------------------------
Write-Host ""
Write-Host "== [3/4] CouchDB =="
$couchdbSchritt = Frage-OptionalerSchritt -Titel "CouchDB entfernen" `
    -Erklaerung "CouchDB ist die Datenbank, in der Torball-Turniere alle Turnierdaten speichert (Mannschaften, Spielplaene, Ergebnisse usw.). Falls CouchDB auf diesem Rechner nur fuer Torball-Turniere installiert wurde, kann es mit entfernt werden." `
    -Auswirkung "ACHTUNG: Dabei werden nicht nur das Programm und der Hintergrunddienst entfernt, sondern auch ALLE bisher gespeicherten Turnierdaten in '$TorballOrdner' UNWIDERRUFLICH geloescht. Nur bestaetigen, wenn diese Daten nicht mehr gebraucht werden (z.B. vorher exportiert/gesichert wurden) und CouchDB auf diesem Rechner sonst von keiner anderen Anwendung genutzt wird."
if ($couchdbSchritt) {
    Write-Host "Stoppe Dienst 'Apache CouchDB' ..."
    try { Stop-Service -Name "Apache CouchDB" -Force -ErrorAction Stop } catch { }

    $paket = Get-Package -Name "Apache CouchDB" -ErrorAction SilentlyContinue
    if ($paket) {
        Write-Host "Deinstalliere CouchDB (msiexec) ..."
        $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/x", $paket.FastPackageReference, "/quiet", "/norestart") -Wait -PassThru
        if ($proc.ExitCode -eq 0 -or $proc.ExitCode -eq 3010) {
            Write-Host "CouchDB-Programm entfernt."
        } else {
            Write-Host "Deinstallation ueber msiexec fehlgeschlagen (Exit-Code $($proc.ExitCode)) - CouchDB-Ordner wird trotzdem geloescht."
        }
    } else {
        Write-Host "Kein CouchDB-Installationseintrag gefunden - vermutlich schon entfernt oder anders installiert."
    }

    try { & sc.exe delete "Apache CouchDB" | Out-Null } catch { }

    if (Test-Path $TorballOrdner) {
        Remove-Item -Path $TorballOrdner -Recurse -Force
        Write-Host "'$TorballOrdner' (Programm + alle Turnierdaten) geloescht."
    }
} else {
    Write-Host "Uebersprungen - CouchDB und die gespeicherten Turnierdaten bleiben erhalten."
}

# --- [4/4] Node.js ---------------------------------------------------------------------------
Write-Host ""
Write-Host "== [4/4] Node.js =="
$nodeSchritt = Frage-OptionalerSchritt -Titel "Node.js entfernen" `
    -Erklaerung "Node.js ist die Software-Umgebung, mit der Torball-Turniere laeuft. Sie wurde beim Einrichten evtl. eigens fuer diese App installiert." `
    -Auswirkung "Node.js wird ganz normal deinstalliert (wie jedes andere Programm auch). WICHTIG: Falls auf diesem Rechner noch andere Programme Node.js benoetigen, wuerden auch diese danach nicht mehr funktionieren - im Zweifel diesen Schritt ueberspringen und Node.js spaeter manuell ueber 'Apps & Features' entfernen, wenn sicher ist, dass es nicht mehr gebraucht wird."
if ($nodeSchritt) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "Deinstalliere Node.js (winget) ..."
        winget uninstall -e --id OpenJS.NodeJS.LTS --silent
    } else {
        Write-Host "winget nicht gefunden - bitte Node.js manuell ueber 'Apps & Features' entfernen."
    }
} else {
    Write-Host "Uebersprungen."
}

Write-Host ""
Write-Host "Fertig."
Write-Host "Der Projektordner selbst ('$RepoRoot') wurde nicht geloescht - falls gewuenscht, jetzt von Hand entfernen (z.B. in den Papierkorb verschieben)."
