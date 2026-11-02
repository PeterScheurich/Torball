# Aktualisiert eine lokale Windows-Installation (aus dem fertigen Paket) auf die neueste veroeffentlichte
# Version - mit einem Doppelklick auf "Aktualisieren-Torball.cmd", ohne dass etwas von Hand heruntergeladen
# oder entpackt werden muss (Stufe 1, 2026-11-02).
#
# Ablauf: neueste Version bei den GitHub-Releases des Projekts nachsehen -> mit der installierten
# vergleichen -> Paket herunterladen und die Pruefsumme kontrollieren -> entpacken -> den Installer
# DIESES (neueren) Pakets starten. Der erkennt die bestehende Installation und tauscht nur die Programmdateien
# aus (Dienst anhalten, Sicherung, Austausch, Start, Pruefung, bei Fehlschlag automatisch zurueck). Die
# Update-Logik steckt damit an einer einzigen Stelle (im Installer), und jede Aenderung daran gilt sofort.
#
# "Veroeffentlicht" heisst: als GitHub-Release mit dem Windows-Paket als Anhang. Nicht jeder Commit ist damit
# installierbar - die Entwicklung steuert, wann ein Update bereitsteht.
#
# Verlangt Administratorrechte (Dienst anhalten/starten) - elevatiert bei Bedarf automatisch.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest ist mit Fortschrittsbalken extrem langsam
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

. (Join-Path $PSScriptRoot "windows-paket.ps1")

$unbeaufsichtigt = [bool]$env:TORBALL_UNBEAUFSICHTIGT

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "Das Aktualisieren braucht Administratorrechte - starte neu mit UAC-Abfrage ..."
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$PSCommandPath`"" -Verb RunAs
    Write-Host "Bitte im neu geoeffneten Fenster (mit Administratorrechten) fortfahren."
    exit
}

$AppOrdner = Split-Path -Parent $PSScriptRoot
$info = Get-PaketInfo -Ordner $AppOrdner
Write-Host "Torball-Turniere - Aktualisieren"
Write-Host ""

if (-not $info) {
    Write-Host "Diese Installation wurde nicht mit dem neuen Installationspaket eingerichtet und kann sich deshalb"
    Write-Host "nicht selbst aktualisieren. Bitte einmalig das aktuelle Paket herunterladen (Datei"
    Write-Host "'Torball-Turniere-Windows-....zip' bei den Releases des Projekts), entpacken und 'Setup.cmd' starten -"
    Write-Host "Konfiguration und alle Turnierdaten bleiben dabei erhalten. Danach genuegt dieses Aktualisieren."
    exit 1
}

$repo = $info.updateQuelle.github
if ([string]::IsNullOrWhiteSpace($repo) -and -not $env:TORBALL_UPDATE_BASIS) {
    Write-Host "In diesem Paket ist keine Update-Quelle eingetragen. Bitte das aktuelle Paket von Hand herunterladen."
    exit 1
}
$installiert = [string]$info.version
Write-Host "Installierte Version: $installiert"

# --- Neueste Version nachsehen ------------------------------------------------------------------
$basis = if ($env:TORBALL_UPDATE_BASIS) { $env:TORBALL_UPDATE_BASIS.TrimEnd('/') } else { "https://api.github.com/repos/$repo" }
try {
    $releases = Invoke-RestMethod -Uri "$basis/releases?per_page=15" -UseBasicParsing `
        -Headers @{ "User-Agent" = "Torball-Turniere-Updater"; "Accept" = "application/vnd.github+json" }
} catch {
    Write-Host "Es konnte nicht nachgesehen werden, ob es eine neue Version gibt."
    Write-Host "Bitte die Internetverbindung pruefen und es spaeter noch einmal versuchen."
    Write-Host "($($_.Exception.Message))"
    exit 1
}

$neuestes = Waehle-NeuestesRelease -Releases $releases -Installiert $installiert
if (-not $neuestes) {
    Write-Host "Es sind noch keine veroeffentlichten Versionen gefunden worden."
    exit 1
}
$neueVersion = ([string]$neuestes.tag_name).TrimStart('v')
Write-Host "Neueste Version:      $neueVersion"

if ((Vergleiche-Version $neueVersion $installiert) -le 0) {
    Write-Host ""
    Write-Host "Du hast bereits die neueste Version. Es ist nichts zu tun."
    exit 0
}

Write-Host ""
Write-Host "Es gibt eine neue Version: $neueVersion (installiert ist $installiert)."
if ($neuestes.body) {
    Write-Host "Das ist neu:"
    ($neuestes.body -split "`r?`n" | Select-Object -First 15) | ForEach-Object { Write-Host "  $_" }
}
Write-Host ""
Write-Host "Die Turnierdaten und die Konfiguration bleiben unveraendert. Waehrend des Aktualisierens ist die"
Write-Host "Anwendung kurz nicht erreichbar - bitte nicht mitten in einem Turnier aktualisieren."
if (-not $unbeaufsichtigt) {
    $antwort = Read-Host "Jetzt aktualisieren? (j/n) [j]"
    if ($antwort -and $antwort -notin @("j", "J", "ja", "Ja", "JA")) { Write-Host "Abgebrochen."; exit 0 }
}

# --- Herunterladen + pruefen ----------------------------------------------------------------------
$zipAnhang = $neuestes.assets | Where-Object { $_.name -like "Torball-Turniere-Windows-*.zip" } | Select-Object -First 1
$summeAnhang = $neuestes.assets | Where-Object { $_.name -like "Torball-Turniere-Windows-*.zip.sha256" } | Select-Object -First 1
if (-not $zipAnhang -or -not $summeAnhang) {
    Write-Host "Zu dieser Version gehoert (noch) kein Windows-Paket. Bitte spaeter noch einmal versuchen."
    exit 1
}

$arbeit = Join-Path ([IO.Path]::GetTempPath()) "torball-update-$neueVersion"
Remove-Item -Recurse -Force $arbeit -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $arbeit | Out-Null
try {
    $zipDatei = Join-Path $arbeit $zipAnhang.name
    Write-Host "Lade $($zipAnhang.name) herunter ($([math]::Round($zipAnhang.size / 1MB)) MB) ..."
    Invoke-WebRequest -Uri $zipAnhang.browser_download_url -OutFile $zipDatei -UseBasicParsing
    # Die Pruefsumme in eine Datei laden und von dort lesen: GitHub liefert Anhaenge als application/octet-stream,
    # dann gaebe .Content Bytes statt Text zurueck.
    $summeDatei = Join-Path $arbeit $summeAnhang.name
    Invoke-WebRequest -Uri $summeAnhang.browser_download_url -OutFile $summeDatei -UseBasicParsing
    $erwartet = ((Get-Content -Path $summeDatei -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
    $tatsaechlich = (Get-FileHash -Path $zipDatei -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($erwartet -ne $tatsaechlich) {
        throw "Die heruntergeladene Datei ist beschaedigt (Pruefsumme stimmt nicht). Bitte noch einmal versuchen."
    }
    Write-Host "Pruefsumme stimmt."

    $entpackt = Join-Path $arbeit "paket"
    New-Item -ItemType Directory -Force -Path $entpackt | Out-Null
    Write-Host "Entpacke ..."
    # tar (in Windows 10/11 enthalten) braucht Sekunden; Expand-Archive wuerde fuer dieses Paket gut zweieinhalb
    # Minuten brauchen und dient deshalb nur als Rueckfall.
    & tar.exe -xf $zipDatei -C $entpackt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "(tar hat nicht funktioniert - nehme das langsamere Entpacken, bitte etwas Geduld.)"
        Remove-Item -Recurse -Force $entpackt -ErrorAction SilentlyContinue
        Expand-Archive -Path $zipDatei -DestinationPath $entpackt -Force
    }

    $installer = Join-Path $entpackt "deploy\installieren-windows.ps1"
    if (-not (Test-Path $installer)) { throw "Das Paket ist unvollstaendig (Installer fehlt)." }
    Write-Host ""
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
    exit $LASTEXITCODE
} finally {
    Remove-Item -Recurse -Force $arbeit -ErrorAction SilentlyContinue
}
