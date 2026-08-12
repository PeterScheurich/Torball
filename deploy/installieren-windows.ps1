# Lokale Windows-Installation der Torball-Turniere-App ("Ein-Klick"-Installer, Option A).
#
# Voraussetzung: dieser Projektordner liegt bereits lokal vor (git clone oder ZIP entpackt).
# Systemanforderungen und Speicherplatzbedarf: docs/installation-konfiguration.md.
# Automatisiert die manuellen Schritte aus docs/installation-konfiguration.md:
#   - Node.js LTS (winget), falls nicht vorhanden
#   - Apache CouchDB als Windows-Dienst (offizieller MSI-Installer, unbeaufsichtigt), falls nicht
#     vorhanden bzw. Wiederverwendung + Abfrage der Zugangsdaten, falls bereits eine laeuft
#   - App-Datenbank + eigener, eingeschraenkter CouchDB-Benutzer (torball_backend) - analog zu
#     deploy/deploy-instanz.sh auf der Linux-Seite
#   - npm install + Build (shared zuerst)
#   - backend/.env (nur wenn noch keine vorhanden ist - vorhandene Konfiguration bleibt unberuehrt;
#     fragt bei einer Neuanlage Port + optionalen SMTP-Versand ab, jeweils mit Standardwert)
#   - Start-Torball.cmd + Aktualisieren-Torball.cmd + Desktop-Verknuepfung
#
# Das Backend liefert dabei das gebaute Frontend selbst mit aus (SERVE_FRONTEND=true, siehe
# backend/src/index.ts) - ein Prozess, kein separater Webserver noetig.
#
# Idempotent: mehrfaches Ausfuehren aktualisiert (Build neu, .env/Verknuepfung bleiben erhalten).
# Fuer eine spaetere Anpassung einzelner Werte (z.B. Port) bzw. zur Aktualisierung ohne die
# CouchDB-/Node-Pruefungen erneut zu durchlaufen: "Aktualisieren-Torball.cmd" bzw. das
# Konsolen-Tool torball ("npm run torball -- konfiguration:anzeigen|konfiguration:setzen|aktualisieren",
# siehe backend/src/cli/torball.ts).
# Verlangt Administratorrechte (Node-/CouchDB-Installation) - elevatiert bei Bedarf automatisch.

$ErrorActionPreference = "Stop"

$CouchdbVersion = "3.5.2-1"
$CouchdbMsiUrl = "https://couchdb.neighbourhood.ie/downloads/$CouchdbVersion/win/apache-couchdb-$CouchdbVersion.msi"
$CouchdbSha256Url = "$CouchdbMsiUrl.sha256"

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "Node.js/CouchDB-Installation braucht Administratorrechte - starte neu mit UAC-Abfrage ..."
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$PSCommandPath`"" `
        -Verb RunAs
    Write-Host "Bitte im neu geoeffneten Fenster (mit Administratorrechten) fortfahren."
    exit
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
Write-Host "Torball-Turniere - lokale Installation"
Write-Host "Projektordner: $RepoRoot"
Write-Host ""

function Update-EnvPath {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

# --- [1/6] Node.js ---------------------------------------------------------------------------
Write-Host "== [1/6] Node.js =="
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Error "winget nicht gefunden. Bitte Node.js LTS manuell von https://nodejs.org installieren und dieses Skript erneut starten."
        exit 1
    }
    Write-Host "Installiere Node.js LTS (winget) ..."
    winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    Update-EnvPath
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js wurde installiert, ist in dieser Konsole aber noch nicht sichtbar. Bitte dieses Fenster schliessen, das Installationsskript per Verknuepfung erneut starten."
    exit 1
}
Write-Host "node $(node -v), npm $(npm -v)"

# --- [2/6] CouchDB -----------------------------------------------------------------------------
Write-Host ""
Write-Host "== [2/6] CouchDB =="
$ConfDir = Join-Path $env:ProgramData "Torball"
New-Item -ItemType Directory -Force -Path $ConfDir | Out-Null
$CouchAdminFile = Join-Path $ConfDir "couchdb-admin.txt"

function Test-Couchdb {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:5984/" -UseBasicParsing -TimeoutSec 3
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function New-ZufallsPasswort {
    -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
}

# Fragt einen Wert ab; leere Eingabe (nur Enter) uebernimmt den vorgeschlagenen Standard.
function Frage-MitDefault {
    param([string]$Text, [string]$Standard)
    $eingabe = Read-Host "$Text [$Standard]"
    if ([string]::IsNullOrWhiteSpace($eingabe)) { return $Standard }
    return $eingabe
}

function Frage-JaNein {
    param([string]$Text, [bool]$StandardJa)
    $hinweis = if ($StandardJa) { "J/n" } else { "j/N" }
    $eingabe = Read-Host "$Text [$hinweis]"
    if ([string]::IsNullOrWhiteSpace($eingabe)) { return $StandardJa }
    return $eingabe -match '^[jJyY]'
}

if (Test-Couchdb) {
    Write-Host "CouchDB laeuft bereits unter http://127.0.0.1:5984."
    if (Test-Path $CouchAdminFile) {
        $CouchAdminUser = "admin"
        $CouchAdminPass = (Get-Content $CouchAdminFile -Raw).Trim()
    } else {
        Write-Host "Admin-Zugang dieser bestehenden CouchDB wird benoetigt, um die App-Datenbank anzulegen."
        $CouchAdminUser = Read-Host "CouchDB-Admin-Benutzername"
        $secure = Read-Host "CouchDB-Admin-Passwort" -AsSecureString
        $CouchAdminPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    }
} else {
    Write-Host "CouchDB nicht gefunden - lade offiziellen Installer herunter (Version $CouchdbVersion) ..."
    $CouchAdminUser = "admin"
    $CouchAdminPass = New-ZufallsPasswort
    Set-Content -Path $CouchAdminFile -Value $CouchAdminPass -NoNewline
    icacls $CouchAdminFile /inheritance:r /grant:r "*S-1-5-32-544:F" | Out-Null

    $msiPath = Join-Path $env:TEMP "apache-couchdb-$CouchdbVersion.msi"
    $shaPath = "$msiPath.sha256"
    Invoke-WebRequest -Uri $CouchdbMsiUrl -OutFile $msiPath
    Invoke-WebRequest -Uri $CouchdbSha256Url -OutFile $shaPath

    $expectedHash = ((Get-Content $shaPath) -split "\s+")[0]
    $actualHash = (Get-FileHash -Path $msiPath -Algorithm SHA256).Hash
    if ($actualHash.ToLower() -ne $expectedHash.ToLower()) {
        Write-Error "Pruefsumme des CouchDB-Installers stimmt nicht ueberein - Abbruch (moeglicher Download-Fehler). Bitte erneut versuchen."
        exit 1
    }

    Write-Host "Installiere CouchDB als Windows-Dienst (unbeaufsichtigt) ..."
    $logPath = Join-Path $ConfDir "couchdb-install.log"
    $msiArgs = @(
        "/i", "`"$msiPath`"",
        "/quiet", "/norestart",
        "INSTALLSERVICE=1",
        "ADMINUSER=$CouchAdminUser",
        "ADMINPASSWORD=$CouchAdminPass",
        "/l*v", "`"$logPath`""
    )
    $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -PassThru
    if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) {
        Write-Error "CouchDB-Installation fehlgeschlagen (Exit-Code $($proc.ExitCode)). Details: $logPath"
        exit 1
    }

    Write-Host "Warte auf CouchDB ..."
    $ok = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        if (Test-Couchdb) { $ok = $true; break }
    }
    if (-not $ok) {
        Write-Error "CouchDB antwortet nach der Installation nicht unter http://127.0.0.1:5984. Dienst 'Apache CouchDB' in services.msc pruefen."
        exit 1
    }
    Write-Host "CouchDB laeuft. Admin-Passwort liegt in $CouchAdminFile (nur Administratoren lesbar)."
}

# --- [3/6] App-Datenbank + eingeschraenkter Benutzer --------------------------------------------
Write-Host ""
Write-Host "== [3/6] CouchDB: App-Datenbank + eingeschraenkter Benutzer =="
$Db = "torball"
$DbUser = "torball_backend"
$DbPassFile = Join-Path $ConfDir "db-lokal.pass"
if (Test-Path $DbPassFile) {
    $DbPass = (Get-Content $DbPassFile -Raw).Trim()
} else {
    $DbPass = New-ZufallsPasswort
    Set-Content -Path $DbPassFile -Value $DbPass -NoNewline
}

$authHeader = @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$CouchAdminUser`:$CouchAdminPass")) }

try { Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:5984/$Db" -Headers $authHeader | Out-Null } catch { }
try {
    $userBody = @{ name = $DbUser; password = $DbPass; roles = @(); type = "user" } | ConvertTo-Json
    Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:5984/_users/org.couchdb.user:$DbUser" -Headers $authHeader -Body $userBody -ContentType "application/json" | Out-Null
} catch { }
# Nur diese eine Datenbank fuer den App-Benutzer freigeben (kein CouchDB-Admin-Zugriff der App).
$securityBody = @{ admins = @{ names = @(); roles = @() }; members = @{ names = @($DbUser); roles = @() } } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:5984/$Db/_security" -Headers $authHeader -Body $securityBody -ContentType "application/json" | Out-Null

# --- [4/6] App bauen ---------------------------------------------------------------------------
Write-Host ""
Write-Host "== [4/6] App bauen (npm install, shared zuerst) =="
Push-Location $RepoRoot
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install fehlgeschlagen" }
    npm run build --workspace=shared
    if ($LASTEXITCODE -ne 0) { throw "Build von 'shared' fehlgeschlagen" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build fehlgeschlagen" }
} finally {
    Pop-Location
}

# --- [5/6] backend/.env --------------------------------------------------------------------------
Write-Host ""
Write-Host "== [5/6] backend/.env =="
$EnvFile = Join-Path $RepoRoot "backend\.env"
if (Test-Path $EnvFile) {
    Write-Host "backend/.env existiert bereits - unveraendert gelassen."
    Write-Host "Aenderungen (z.B. Port) spaeter per 'npm run torball -- konfiguration:setzen' in backend/."
} else {
    Write-Host "Ein paar Angaben zur Konfiguration (Enter uebernimmt den vorgeschlagenen Standardwert):"
    $Port = Frage-MitDefault -Text "Port, unter dem die App laufen soll" -Standard "3000"
    while ($Port -notmatch '^\d+$') {
        Write-Host "Bitte eine Zahl eingeben."
        $Port = Frage-MitDefault -Text "Port, unter dem die App laufen soll" -Standard "3000"
    }

    $SmtpHost = ""; $SmtpPort = "587"; $SmtpUser = ""; $SmtpPassword = ""
    $SmtpFrom = '"Torball-Turniere" <noreply@example.com>'
    $SmtpEinrichten = Frage-JaNein -Text "SMTP-Mailversand jetzt einrichten (Einladungs-/Passwort-Reset-Mails; ohne das erscheint der Link stattdessen im Server-Log)?" -StandardJa $false
    if ($SmtpEinrichten) {
        $SmtpHost = Frage-MitDefault -Text "SMTP-Host" -Standard ""
        $SmtpPort = Frage-MitDefault -Text "SMTP-Port" -Standard "587"
        $SmtpUser = Frage-MitDefault -Text "SMTP-Benutzer" -Standard ""
        $secureSmtp = Read-Host "SMTP-Passwort" -AsSecureString
        $SmtpPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSmtp))
        $SmtpFrom = Frage-MitDefault -Text "Absender-Adresse (Format: `"Name`" <adresse@beispiel.de>)" -Standard $SmtpFrom
    }
    # In Anfuehrungszeichen setzen, falls Sonderzeichen (v.a. #) enthalten sind - sonst wird beim
    # Start alles ab dem # als Kommentar abgeschnitten (siehe CLAUDE.md, Betrieb/Infrastruktur).
    if ($SmtpPassword -match '[\s#]' -and -not $SmtpPassword.StartsWith('"')) { $SmtpPassword = "`"$SmtpPassword`"" }

    @"
PORT=$Port
HOST=127.0.0.1
COUCHDB_URL=http://127.0.0.1:5984
COUCHDB_DB=$Db
COUCHDB_USER=$DbUser
COUCHDB_PASSWORD=$DbPass
COOKIE_SECURE=false
FRONTEND_URL=http://localhost:$Port
SMTP_HOST=$SmtpHost
SMTP_PORT=$SmtpPort
SMTP_USER=$SmtpUser
SMTP_PASSWORD=$SmtpPassword
SMTP_FROM=$SmtpFrom
KANBAN_SYNC=false
SERVE_FRONTEND=true
"@ | Set-Content -Path $EnvFile -Encoding utf8
    Write-Host "backend/.env angelegt."
}

# Port aus der (neu geschriebenen oder bereits vorhandenen) .env lesen - massgeblich fuer die
# Start-Verknuepfung ist immer die tatsaechliche Datei, nicht die Eingabe von eben.
$PortZeile = (Get-Content $EnvFile) | Where-Object { $_ -match '^PORT=' } | Select-Object -First 1
$EffectivePort = if ($PortZeile) { ($PortZeile -split '=', 2)[1].Trim() } else { "3000" }

# --- [6/6] Start-/Aktualisierungs-Skript + Desktop-Verknuepfung ------------------------------------
Write-Host ""
Write-Host "== [6/6] Start-/Aktualisierungs-Skript + Desktop-Verknuepfung =="
$StartCmd = Join-Path $RepoRoot "Start-Torball.cmd"
@"
@echo off
cd /d "%~dp0backend"
start "Torball-Turniere (Server - dieses Fenster offen lassen)" cmd /k node --env-file=.env dist\index.js
timeout /t 3 /nobreak >nul
start "" http://localhost:$EffectivePort
"@ | Set-Content -Path $StartCmd -Encoding ascii

$UpdateCmd = Join-Path $RepoRoot "Aktualisieren-Torball.cmd"
@"
@echo off
echo Aktualisiert Torball-Turniere (Git-Pull falls vorhanden, npm install, Neubau) ...
echo Falls der Server laeuft (Fenster "Torball-Turniere (Server ...)"), dieses bitte vorher schliessen.
echo.
cd /d "%~dp0backend"
call npm run torball -- aktualisieren
echo.
pause
"@ | Set-Content -Path $UpdateCmd -Encoding ascii

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Torball-Turniere.lnk"))
$Shortcut.TargetPath = $StartCmd
$Shortcut.WorkingDirectory = $RepoRoot
$Shortcut.Description = "Torball-Turniere starten"
$Shortcut.Save()

Write-Host ""
Write-Host "Fertig!"
Write-Host "Ueber die Desktop-Verknuepfung 'Torball-Turniere' starten (oeffnet http://localhost:$EffectivePort)."
Write-Host "Beim allerersten Start fuehrt die Anmeldeseite durch die einmalige Ersteinrichtung des ersten Admin-Kontos."
Write-Host ""
Write-Host "Spaeter aktualisieren: $UpdateCmd doppelklicken."
Write-Host "Spaeter Konfiguration anpassen (z.B. Port, SMTP): in backend/ 'npm run torball -- konfiguration:anzeigen' bzw. 'konfiguration:setzen' (siehe --hilfe)."
