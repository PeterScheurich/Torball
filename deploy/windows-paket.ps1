# Gemeinsame Helfer fuer die Windows-Installation aus dem fertigen Paket (Stufe 2, 2026-11-02).
# Wird per Punkt-Aufruf (". windows-paket.ps1") von installieren-windows.ps1 und aktualisieren-windows.ps1
# eingebunden. Enthaelt nur Funktionen, keine Aktionen - beim Einbinden passiert also nichts.
#
# Der Ablauf im Ueberblick: das Paket (entpackt in einem beliebigen Ordner) wird nach
# C:\Torball-Turniere\App kopiert, die Anwendung laeuft dort als Windows-Dienst "TorballTurniere"
# (WinSW-Huelle um die mitgelieferte node.exe). Ein Update ist derselbe Ablauf mit einem neueren Paket:
# Dienst anhalten, alten Stand sichern (App.alt), Dateien austauschen (backend\.env bleibt), Dienst
# starten, pruefen - antwortet die neue Version nicht, wird automatisch zurueckgesetzt.
#
# Ausgaben bewusst ohne Umlaute: die Konsole von Windows zeigt sie je nach Codepage sonst als Kauderwelsch.

$DienstName = "TorballTurniere"

# Basisordner aller Torball-Dateien. Die Umgebungsvariable gibt es nur fuer Tests (nie fuer Anwender).
function Get-TorballBasisOrdner {
    if ($env:TORBALL_ORDNER) { return $env:TORBALL_ORDNER }
    return "C:\Torball-Turniere"
}

# Liest paket.json eines (installierten oder entpackten) Pakets; $null, wenn es keine gibt.
function Get-PaketInfo {
    param([string]$Ordner)
    $datei = Join-Path $Ordner "paket.json"
    if (-not (Test-Path $datei)) { return $null }
    try { return (Get-Content $datei -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

# Vergleicht zwei Versionsnummern der Form 1.2.3 bzw. 1.2.3-beta (Semantic Versioning).
# Rueckgabe: -1 (A aelter), 0 (gleich), 1 (A neuer). Eine Version OHNE Zusatz ist neuer als dieselbe
# mit Zusatz (0.10.0 > 0.10.0-beta); Zusaetze werden Teil fuer Teil verglichen (Zahlen als Zahlen).
function Vergleiche-Version {
    param([string]$A, [string]$B)
    $muster = '^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?'
    $ma = [regex]::Match($A, $muster)
    $mb = [regex]::Match($B, $muster)
    if (-not $ma.Success -or -not $mb.Success) { throw "Versionsnummer nicht lesbar: '$A' bzw. '$B'" }
    foreach ($i in 1..3) {
        $x = [int]$ma.Groups[$i].Value
        $y = [int]$mb.Groups[$i].Value
        if ($x -lt $y) { return -1 }
        if ($x -gt $y) { return 1 }
    }
    $za = $ma.Groups[4].Value
    $zb = $mb.Groups[4].Value
    if ($za -eq $zb) { return 0 }
    if ($za -eq "") { return 1 }
    if ($zb -eq "") { return -1 }
    $ta = $za -split '\.'
    $tb = $zb -split '\.'
    for ($i = 0; $i -lt [Math]::Max($ta.Count, $tb.Count); $i++) {
        if ($i -ge $ta.Count) { return -1 }
        if ($i -ge $tb.Count) { return 1 }
        $naA = $ta[$i] -match '^\d+$'
        $naB = $tb[$i] -match '^\d+$'
        if ($naA -and $naB) {
            if ([int]$ta[$i] -lt [int]$tb[$i]) { return -1 }
            if ([int]$ta[$i] -gt [int]$tb[$i]) { return 1 }
        } elseif ($naA) { return -1 }
        elseif ($naB) { return 1 }
        else {
            $c = [string]::CompareOrdinal($ta[$i], $tb[$i])
            if ($c -ne 0) { return [Math]::Sign($c) }
        }
    }
    return 0
}

# Erster freier TCP-Port ab $Start - damit der Installer den Port nicht erfragen muss. Ports, auf
# denen schon etwas lauscht (Entwicklungsumgebungen, andere Software), werden uebersprungen.
function Get-FreierPort {
    param([int]$Start = 3000)
    for ($port = $Start; $port -lt $Start + 100; $port++) {
        if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { return $port }
    }
    throw "Kein freier Port zwischen $Start und $($Start + 99) gefunden."
}

function Get-TorballDienst {
    return (Get-Service -Name $DienstName -ErrorAction SilentlyContinue)
}

# Haelt den Dienst an und wartet, bis er wirklich steht (sonst sind die Dateien noch gesperrt).
function Stop-TorballDienst {
    $dienst = Get-TorballDienst
    if (-not $dienst) { return }
    if ($dienst.Status -ne "Stopped") {
        Write-Host "Halte den Torball-Dienst an ..."
        Stop-Service -Name $DienstName -Force -ErrorAction SilentlyContinue
        try { $dienst.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(40)) } catch { }
    }
}

# Beendet einen Server, der noch nach der alten Installationsart laeuft (ein Konsolenfenster
# "Torball-Turniere-Server - NICHT SCHLIESSEN!" mit node dist\index.js). Sonst wuerde er den Port und
# Dateien blockieren, und nach der Umstellung auf den Dienst liefen zwei Server gegeneinander.
function Stop-AlterTorballServer {
    $gefunden = $false
    $prozesse = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'dist[\\/]index\.js' }
    foreach ($p in $prozesse) {
        $gefunden = $true
        Write-Host "Beende den bisherigen Torball-Server (Prozess $($p.ProcessId)) ..."
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    # Das zugehoerige Konsolenfenster (cmd /k) schliessen - es bliebe sonst leer offen stehen.
    Get-Process cmd -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -like "*Torball-Turniere-Server*" } |
        ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
    if ($gefunden) { Start-Sleep -Seconds 2 }
    return $gefunden
}

# robocopy meldet Erfolg mit Rueckgabewerten 0-7 (verschiedene Arten von "kopiert"); erst ab 8 ist es ein Fehler.
function Invoke-Robocopy {
    param([string[]]$Argumente)
    & robocopy.exe @Argumente | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Dateien kopieren fehlgeschlagen (robocopy Code $LASTEXITCODE)." }
}

# Sichert den bisherigen Stand nach <App>.alt (nur eine Generation) - Grundlage fuer das automatische
# Zuruecksetzen, falls die neue Version nicht startet.
# Prueft vor dem Sichern/Austauschen, ob der bestehende Programmordner lesbar ist. Ist er es nicht (z. B. nach einer
# unterbrochenen Installation mit kaputten Zugriffsrechten), wuerde robocopy bei jeder Datei mehrfach warten - lieber
# gleich mit einer klaren Anweisung abbrechen.
function Pruefe-AppLesbar {
    param([string]$AppOrdner)
    foreach ($probe in @("paket.json", "node\node.exe", "backend\dist\index.js")) {
        $pfad = Join-Path $AppOrdner $probe
        if (-not (Test-Path $pfad)) { continue }
        try { $strom = [IO.File]::OpenRead($pfad); $strom.Close() }
        catch { throw "Der bisherige Programmordner ($AppOrdner) ist nicht lesbar (Zugriffsrechte beschaedigt: $probe). Bitte den Ordner im Explorer loeschen (bei einer Rueckfrage nach Rechten 'Fortfahren') und das Setup erneut starten - die Turnierdaten liegen in der Datenbank und bleiben erhalten." }
    }
}

function Sichere-App {
    param([string]$AppOrdner)
    Pruefe-AppLesbar -AppOrdner $AppOrdner
    $sicherung = "$AppOrdner.alt"
    Write-Host "Sichere den bisherigen Stand ($sicherung) ..."
    Invoke-Robocopy -Argumente @($AppOrdner, $sicherung, "/MIR", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
}

function Stelle-AppWiederHer {
    param([string]$AppOrdner)
    $sicherung = "$AppOrdner.alt"
    if (-not (Test-Path $sicherung)) { throw "Keine Sicherung vorhanden ($sicherung)." }
    Write-Host "Stelle den bisherigen Stand wieder her ..."
    Invoke-Robocopy -Argumente @($sicherung, $AppOrdner, "/MIR", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
}

# Kopiert das Paket nach $Ziel. /MIR raeumt dabei Dateien weg, die es in der neuen Version nicht mehr
# gibt; die Konfiguration (backend\.env) und Sicherungsdateien bleiben bewusst unangetastet.
function Kopiere-PaketNachApp {
    param([string]$Quelle, [string]$Ziel)
    if (Test-Path $Ziel) { Pruefe-AppLesbar -AppOrdner $Ziel }
    New-Item -ItemType Directory -Force -Path $Ziel | Out-Null
    Write-Host "Kopiere die Programmdateien nach $Ziel ..."
    Invoke-Robocopy -Argumente @(
        $Quelle, $Ziel, "/MIR", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP",
        "/XF", ".env", ".env.test.local", "anschluss.txt"
    )
}

# Zugriffsrechte: Normale Benutzer duerfen die Programmdateien nur LESEN - der Dienst fuehrt diesen Code
# aus, und wer ihn ersetzen koennte, haette damit die Rechte des Dienstes. Die Konfiguration mit dem
# Datenbank-Passwort sehen nur Administratoren, das System und der Dienst selbst (LocalService).
# SIDs statt Namen, damit es auf jedem Windows unabhaengig von der Sprache funktioniert:
#   S-1-5-32-544 Administratoren, S-1-5-18 SYSTEM, S-1-5-32-545 Benutzer, S-1-5-19 LocalService.
function Setze-AppRechte {
    param([string]$AppOrdner, [string]$LogOrdner, [bool]$Rekursiv)
    # Nur der ORDNER selbst bekommt die festen, vererbbaren Rechte; alles darin erbt sie. Bewusst NICHT
    # "/inheritance:r" zusammen mit "/T" ueber den ganzen Baum: das entzog den Dateien JEDE Berechtigung (live
    # erlebt, 2026-11-02: danach kam nicht einmal ein Administrator an node.exe) - bei vererbbaren Rechten auf
    # Dateien greifen die Vererbungs-Markierungen (OI)(CI) nicht.
    & icacls.exe $AppOrdner /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" "*S-1-5-19:(OI)(CI)RX" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Die Zugriffsrechte auf $AppOrdner konnten nicht gesetzt werden (icacls Code $LASTEXITCODE)." }
    if ($Rekursiv) {
        # Schon vorhandene Dateien (Umstellung einer aelteren Installation) sollen ab jetzt vom Ordner erben.
        Get-ChildItem -Path $AppOrdner -Force | ForEach-Object { & icacls.exe $_.FullName /reset /T /C /Q | Out-Null }
    }
    $envDatei = Join-Path $AppOrdner "backend\.env"
    if (Test-Path $envDatei) {
        & icacls.exe $envDatei /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" "*S-1-5-19:R" | Out-Null
    }
    New-Item -ItemType Directory -Force -Path $LogOrdner | Out-Null
    & icacls.exe $LogOrdner /grant "*S-1-5-19:(OI)(CI)M" /C /Q | Out-Null
}

# Wartet, bis ein entfernter Dienst WIRKLICH weg ist. "uninstall" markiert ihn nur zum Loeschen; weg ist er erst, wenn
# nirgends mehr ein Zugriff offen ist (auch nicht in diesem Prozess durch die Dienst-Abfragen) - erst dann laesst sich
# derselbe Name neu anlegen. sc.exe meldet Code 1060, wenn es den Dienst nicht mehr gibt.
function Warte-DienstWeg {
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    for ($i = 0; $i -lt 30; $i++) {
        & sc.exe query $DienstName | Out-Null
        if ($LASTEXITCODE -eq 1060) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

# Legt den Windows-Dienst an (bzw. ersetzt einen vorhandenen). Die XML-Datei wird aus der Vorlage im
# Paket erzeugt; der Dienst laeuft als LocalService (nicht als SYSTEM: ein Webserver braucht keine
# Vollrechte), startet automatisch (verzoegert, nach CouchDB) und wird bei einem Absturz neu gestartet.
function Registriere-TorballDienst {
    param([string]$AppOrdner, [string]$LogOrdner)
    $dienstOrdner = Join-Path $AppOrdner "dienst"
    $exe = Join-Path $dienstOrdner "torball-dienst.exe"
    $vorlage = Join-Path $dienstOrdner "torball-dienst.xml.vorlage"
    if (-not (Test-Path $exe) -or -not (Test-Path $vorlage)) { throw "Dienst-Dateien fehlen im Ordner $dienstOrdner." }

    # Die Konfigurationsdatei ZUERST erzeugen: WinSW braucht sie auch zum Entfernen eines vorhandenen Dienstes, und beim
    # Austausch der Programmdateien (robocopy /MIR) wird sie als "nicht im Paket" geloescht (live im Test erlebt: ohne sie
    # schlug das Entfernen still fehl, und das Neuanlegen scheiterte mit "Dienst existiert bereits", Code 1073).
    $xml = (Get-Content $vorlage -Raw -Encoding UTF8).Replace("@@LOGPFAD@@", [Security.SecurityElement]::Escape($LogOrdner))
    [IO.File]::WriteAllText((Join-Path $dienstOrdner "torball-dienst.xml"), $xml, (New-Object Text.UTF8Encoding($false)))

    if (Get-TorballDienst) {
        Stop-TorballDienst
        Entferne-DienstRegistrierung -Exe $exe
    }

    Write-Host "Richte den Torball-Dienst ein ..."
    # Code 1073 = "Dienst existiert bereits": ein gerade entfernter Dienst bleibt noch kurz "zum Loeschen markiert".
    # Deshalb ein paar Mal wiederholen, statt sofort aufzugeben.
    for ($versuch = 1; $versuch -le 10; $versuch++) {
        & $exe install | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        if ($LASTEXITCODE -ne 1073 -or $versuch -eq 10) { throw "Der Dienst konnte nicht eingerichtet werden (Code $LASTEXITCODE)." }
        Start-Sleep -Seconds 2
    }
    & sc.exe config $DienstName obj= "NT AUTHORITY\LocalService" | Out-Null
    & sc.exe config $DienstName start= delayed-auto | Out-Null
    & sc.exe description $DienstName "Lokaler Server der Anwendung Torball-Turniere (Turnierverwaltung)." | Out-Null
}

function Start-TorballDienst {
    Write-Host "Starte den Torball-Dienst ..."
    Start-Service -Name $DienstName
}

# Wartet, bis die Anwendung wirklich antwortet (nicht nur der Dienst "laeuft"). Rueckgabe $true/$false.
function Warte-AufAnwendung {
    param([string]$AppOrdner, [string]$Port)
    $node = Join-Path $AppOrdner "node\node.exe"
    $skript = Join-Path $AppOrdner "deploy\warte-auf-dienste.mjs"
    $alterPort = $env:PORT
    $env:PORT = $Port
    try {
        # "| Out-Host": die Textausgabe der Wartehilfe soll auf den Bildschirm, NICHT in den Rueckgabewert. Ohne das
        # lieferte die Funktion ein Array aus Textzeilen (in PowerShell immer "wahr") und meldete nie "nicht erreichbar":
        # live im Test erlebt - eine defekte neue Version galt als erfolgreich installiert, der Rueckfall griff nie.
        & $node $skript anwendung | Out-Host
        $ok = ($LASTEXITCODE -eq 0)
    } finally {
        $env:PORT = $alterPort
    }
    return [bool]$ok
}

# Port aus der .env (Administratoren-Sicht) - Grundlage fuer die Erreichbarkeitspruefung nach einem Update.
function Get-PortAusEnv {
    param([string]$AppOrdner)
    $envDatei = Join-Path $AppOrdner "backend\.env"
    if (-not (Test-Path $envDatei)) { return "3000" }
    $zeile = (Get-Content $envDatei) | Where-Object { $_ -match '^PORT=' } | Select-Object -First 1
    if ($zeile) { return ($zeile -split '=', 2)[1].Trim() }
    return "3000"
}

# Schreibt den Port in eine fuer ALLE Benutzer lesbare Datei: die Verknuepfung "Torball-Turniere" darf die
# .env (Datenbank-Passwort) nicht lesen, braucht aber den Port, um den Browser zu oeffnen.
function Schreibe-Anschluss {
    param([string]$AppOrdner, [string]$Port)
    Set-Content -Path (Join-Path $AppOrdner "anschluss.txt") -Value $Port -Encoding ascii
}

# Inhalt von Start-Torball.cmd (Paket-Modus): stellt sicher, dass der Dienst laeuft, wartet bis die Anwendung
# antwortet und oeffnet erst dann den Browser. Der Server selbst laeuft im Hintergrund als Dienst - es gibt
# kein Fenster mehr, das man nicht schliessen darf.
function Get-StartSkriptInhalt {
    return @'
@echo off
setlocal
cd /d "%~dp0"
set "PORT=3000"
if exist "anschluss.txt" set /p PORT=<"anschluss.txt"

rem Laeuft der Dienst? Ein normaler Benutzer darf ihn nicht starten - dann gibt es einen Hinweis.
sc query TorballTurniere | find "RUNNING" >nul
if errorlevel 1 (
  echo Der Torball-Dienst laeuft gerade nicht - versuche ihn zu starten ...
  net start TorballTurniere >nul 2>&1
)

echo.
echo Torball-Turniere wird geoeffnet. Bitte einen Moment Geduld -
echo der Browser startet automatisch, sobald alles bereit ist.
echo.
node\node.exe deploy\warte-auf-dienste.mjs anwendung
if errorlevel 1 goto :nicht_bereit
start "" http://localhost:%PORT%
exit /b 0

:nicht_bereit
echo.
echo Die Anwendung antwortet nicht.
echo.
echo Das ist meist einer dieser Faelle:
echo  - Der Rechner wurde gerade erst hochgefahren: in einer Minute noch einmal versuchen.
echo  - Der Dienst "Torball-Turniere" oder die Datenbank "Apache CouchDB" laeuft nicht:
echo    in der Windows-Suche "Dienste" oeffnen, beide Eintraege suchen und starten.
echo  - Es hilft ein Neustart des Rechners.
echo Bleibt es dabei, hilft der Diagnose-Bericht: "Konsole-Torball.cmd diagnose" im Programmordner.
echo.
pause
exit /b 1
'@
}

# Konsolen-Tool fuer den Paket-Modus (ersetzt "npm run torball", denn ohne npm gibt es das hier nicht).
function Get-KonsoleSkriptInhalt {
    return @'
@echo off
rem Konsolen-Tool der Torball-Turniere (Konto entsperren, Diagnose-Bericht ...).
rem Aufruf:  Konsole-Torball.cmd --hilfe      oder      Konsole-Torball.cmd diagnose
rem Braucht Administratorrechte (liest die Konfiguration mit dem Datenbank-Passwort).
cd /d "%~dp0backend"
"%~dp0node\node.exe" --env-file=.env dist\cli\torball.js %*
'@
}

# Entfernt den Dienst (anhalten + abmelden), z. B. beim Zuruecksetzen einer fehlgeschlagenen Umstellung
# oder beim Deinstallieren. Muss VOR dem Austausch der Dateien laufen, solange torball-dienst.exe noch da ist.
function Entferne-TorballDienst {
    param([string]$AppOrdner)
    if (-not (Get-TorballDienst)) { return }
    Stop-TorballDienst
    Entferne-DienstRegistrierung -Exe (Join-Path $AppOrdner "dienst\torball-dienst.exe")
}

# Meldet den (angehaltenen) Dienst ab: zuerst ueber WinSW (braucht deren XML neben der exe), schlaegt das fehl oder gibt
# es die Dateien nicht mehr, ueber "sc delete". Wartet danach, bis der Dienst wirklich weg ist.
function Entferne-DienstRegistrierung {
    param([string]$Exe)
    $abgemeldet = $false
    $xml = Join-Path (Split-Path -Parent $Exe) "torball-dienst.xml"
    if ((Test-Path $Exe) -and (Test-Path $xml)) {
        & $Exe uninstall | Out-Null
        $abgemeldet = ($LASTEXITCODE -eq 0)
    }
    if (-not $abgemeldet) { & sc.exe delete $DienstName | Out-Null }
    $null = Warte-DienstWeg
}

# Waehlt aus der Release-Liste (GitHub-API) die neueste passende Version aus. Entwuerfe zaehlen nie; Vorab-Versionen
# (Beta) nur, wenn die installierte Version selbst eine ist - so rutscht niemand versehentlich auf eine unfertige
# Version, solange es stabile gibt. Gibt das Release-Objekt zurueck oder $null.
function Waehle-NeuestesRelease {
    param($Releases, [string]$Installiert)
    $mitVorab = $Installiert -match '-'
    $kandidaten = @($Releases | Where-Object {
        -not $_.draft -and ($mitVorab -or -not $_.prerelease) -and $_.tag_name -match '^v?\d+\.\d+\.\d+'
    })
    $neuestes = $null
    foreach ($r in $kandidaten) {
        if (-not $neuestes -or (Vergleiche-Version $r.tag_name $neuestes.tag_name) -gt 0) { $neuestes = $r }
    }
    return $neuestes
}
