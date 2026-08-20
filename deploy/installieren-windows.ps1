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
#     fragt bei einer Neuanlage nach dem Port, mit Standardwert. SMTP-Mailversand wird NICHT mehr
#     hier abgefragt, sondern spaeter ueber die Oberflaeche unter Systemeinstellungen gepflegt)
#   - Start-Torball.cmd + Aktualisieren-Torball.cmd + Desktop-Verknuepfung
#
# Das Backend liefert dabei das gebaute Frontend selbst mit aus (SERVE_FRONTEND=true, siehe
# backend/src/index.ts) - ein Prozess, kein separater Webserver noetig.
#
# Idempotent: mehrfaches Ausfuehren aktualisiert (git pull bei Git-Installation, Build neu,
# .env/Verknuepfung bleiben erhalten). Bei einer ZIP-Installation (kein .git-Ordner) gibt es
# keinen Quellcode zum Nachladen - dafuer muss ein neues Quellcode-ZIP her, siehe AKTUALISIEREN.md.
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
Write-Host "Um Torball-Turniere auf diesem Rechner lokal zu nutzen, werden ein paar zusaetzliche"
Write-Host "Programme/Funktionen benoetigt, die hier vielleicht noch fehlen. Fuer jeden solchen"
Write-Host "Schritt fragt dieses Skript vorher nach, erklaert kurz, worum es geht und was es fuer"
Write-Host "diesen Rechner bedeutet - es aendert nichts ohne deine Zustimmung. Lehnst du einen"
Write-Host "noetigen Schritt ab, kann die Installation an der Stelle nicht weitergehen."
Write-Host ""

function Update-EnvPath {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

# Fragt einen Wert ab; leere Eingabe (nur Enter) uebernimmt den vorgeschlagenen Standard.
function Frage-MitDefault {
    param([string]$Text, [string]$Standard)
    $eingabe = Read-Host "$Text [$Standard]"
    if ([string]::IsNullOrWhiteSpace($eingabe)) { return $Standard }
    return $eingabe
}

# Erklaert eine bevorstehende Aenderung an DIESEM Rechner (nicht am Projektordner selbst) und
# fragt um ausdrueckliche Zustimmung, bevor sie ausgefuehrt wird. Bricht bei Ablehnung die gesamte
# Installation ab (Nutzer-Vorgabe 2026-08-19: keine Aenderung an einem fremden Rechner ohne
# informierte Zustimmung - lieber keine Installation als eine ungewollte Systemaenderung; die
# Zielgruppe ist ausdruecklich auch technisch wenig versiert, deshalb Alltagssprache statt
# Fachbegriffen in Titel/Erklaerung/Auswirkung).
function Bestaetige-Systemaenderung {
    param([string]$Titel, [string]$Erklaerung, [string]$Auswirkung)
    Write-Host ""
    Write-Host "-- $Titel --"
    Write-Host $Erklaerung
    Write-Host "Auswirkung auf diesen Rechner: $Auswirkung"
    $antwort = Frage-MitDefault -Text "Einverstanden? (j/n)" -Standard "j"
    if ($antwort -notin @("j", "J", "ja", "Ja", "JA")) {
        Write-Host ""
        Write-Host "Ohne diesen Schritt kann die Installation nicht fortgesetzt werden. Abgebrochen."
        exit 1
    }
}

# Legt (bzw. erneuert) die Windows-Firewall-Regel fuer eingehende Verbindungen auf den App-Port
# an. -Profile Any statt nur "Privat": Hallen-/Vereins-WLANs stuft Windows haeufig als
# "oeffentliches Netzwerk" ein - eine auf private Netze beschraenkte Regel wuerde den
# Hauptanwendungsfall (Helfer-Geraete am Turnierort) stillschweigend blockieren. Der Zugriff
# bleibt trotzdem aufs lokale Netz beschraenkt (kein Port-Forwarding ins Internet), und die App
# verlangt weiterhin Anmeldung bzw. Turnier-Code. Loeschen+Neuanlegen statt Aktualisieren haelt
# die Regel auch bei geaendertem Port aktuell und ist idempotent.
function Set-TorballFirewallRegel {
    param([int]$Port)
    $regelName = "Torball-Turniere Server"
    Get-NetFirewallRule -DisplayName $regelName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $regelName -Direction Inbound -Action Allow -Protocol TCP `
        -LocalPort $Port -Profile Any | Out-Null
    Write-Host "Windows-Firewall-Regel '$regelName' angelegt (eingehend, TCP-Port $Port)."
}

# Fragt, ob andere Geraete im lokalen Netzwerk auf die App zugreifen koennen sollen (Betriebsmodus
# "Lokales Netzwerk": Turnier-Codes, Ergebniserfassung durch Helfer-Geraete). Ohne diesen Schritt
# lauscht die App nur auf dem Rechner selbst (HOST=127.0.0.1) - der Betriebsmodus liefe dann an
# einer unsichtbaren Huerde ins Leere (Nutzer-Fund 2026-08-21). Kein Bestaetige-Systemaenderung:
# eine Ablehnung ist hier voellig in Ordnung (die App laeuft dann eben nur lokal), sie darf die
# Installation nicht abbrechen.
function Frage-Netzwerkzugriff {
    param([string]$Standard)
    Write-Host ""
    Write-Host "-- Zugriff aus dem lokalen Netzwerk --"
    Write-Host "Sollen sich andere Geraete im selben Netzwerk mit der App verbinden koennen - z.B. Handys"
    Write-Host "oder Tablets von Helfern fuer die Ergebniserfassung oder den Zugriff per Turnier-Code?"
    Write-Host "Auswirkung auf diesen Rechner: Die App wird im lokalen Netzwerk erreichbar gemacht und in"
    Write-Host "der Windows-Firewall wird eine Regel angelegt, die eingehende Verbindungen auf dem App-Port"
    Write-Host "erlaubt. Zugriff hat nur, wer im selben (W)LAN ist UND sich in der App anmeldet bzw. einen"
    Write-Host "Turnier-Code kennt - aus dem Internet ist der Rechner dadurch nicht erreichbar. Ohne diesen"
    Write-Host "Schritt laesst sich die App nur auf diesem Rechner selbst benutzen."
    $antwort = Frage-MitDefault -Text "Netzwerkzugriff aktivieren? (j/n)" -Standard $Standard
    return ($antwort -in @("j", "J", "ja", "Ja", "JA"))
}

# --- [0/6] Projektordner an einen dauerhaften Ort verlegen ---------------------------------------
# Alles, was dieses Skript ausserhalb des Projektordners ablegt, liegt gebuendelt unter
# C:\Torball-Turniere (Nutzer-Vorgabe 2026-08-19, siehe Kommentar beim CouchDB-Schritt) - und seit
# 2026-08-21 gehoert auf Wunsch auch der Projektordner selbst dorthin (C:\Torball-Turniere\App):
# Live-Erfahrung: das Quellcode-ZIP wird typischerweise im Downloads-Ordner entpackt und dort
# installiert - die komplette Installation (Programmdateien, backend/.env, Ziel der Desktop-
# Verknuepfung) haengt dann an einem Ordner, der beim naechsten "Downloads aufraeumen" mitgeloescht
# wird. Nur fuer ZIP-Installationen (kein .git) - wer per git clone installiert, hat seinen
# Ablageort bewusst gewaehlt. Praktischer Nebeneffekt: ein spaeteres Update per neuem ZIP wird
# damit zum selben Ablauf (neues ZIP irgendwo entpacken, Setup.cmd starten, Verlegung bejahen -
# der neue Quellcode landet ueber dem alten in App\, die dortige backend/.env bleibt erhalten,
# weil sie im ZIP nicht vorkommt).
$TorballOrdner = "C:\Torball-Turniere"
$AppZielOrdner = Join-Path $TorballOrdner "App"
if (-not (Test-Path (Join-Path $RepoRoot ".git")) -and
    -not $RepoRoot.StartsWith($TorballOrdner, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Host ""
    Write-Host "-- Projektordner an einen dauerhaften Ort verlegen --"
    Write-Host "Der Projektordner liegt aktuell unter: $RepoRoot"
    Write-Host "Die Installation wird DAUERHAFT von diesem Ordner aus laufen (Programmdateien,"
    Write-Host "Konfiguration, Desktop-Verknuepfung zeigen dorthin). Liegt er z.B. im Downloads-"
    Write-Host "Ordner, wuerde ein spaeteres 'Downloads aufraeumen' die Installation zerstoeren."
    Write-Host "Empfehlung: den Ordner jetzt nach $AppZielOrdner verlegen lassen - dort liegt"
    Write-Host "gebuendelt alles, was zu Torball-Turniere gehoert (auch die Datenbank)."
    $verlegenAntwort = Frage-MitDefault -Text "Projektordner nach $AppZielOrdner verlegen? (j/n)" -Standard "j"
    if ($verlegenAntwort -in @("j", "J", "ja", "Ja", "JA")) {
        New-Item -ItemType Directory -Force -Path $AppZielOrdner | Out-Null
        Write-Host "Kopiere Projektordner nach $AppZielOrdner ..."
        Copy-Item -Path (Join-Path $RepoRoot "*") -Destination $AppZielOrdner -Recurse -Force
        $AlterOrdner = $RepoRoot
        $RepoRoot = $AppZielOrdner
        Write-Host "Die Installation laeuft ab jetzt unter $RepoRoot weiter."
        Write-Host "Der alte Ordner ($AlterOrdner) wird nicht mehr gebraucht und kann NACH Abschluss"
        Write-Host "der Installation geloescht werden."
    } elseif ($RepoRoot -match '\\Downloads\\|\\Downloads$|\\Temp\\|\\Desktop\\') {
        Write-Warning "Der Ordner bleibt an einem Ort, der erfahrungsgemaess irgendwann aufgeraeumt wird - wird er geloescht, funktioniert die Installation nicht mehr (die Turnierdaten in der Datenbank bleiben davon unberuehrt)."
    }
}

# --- [1/6] Node.js ---------------------------------------------------------------------------
Write-Host "== [1/6] Node.js =="
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Error "winget nicht gefunden. Bitte Node.js LTS manuell von https://nodejs.org installieren und dieses Skript erneut starten."
        exit 1
    }
    Bestaetige-Systemaenderung -Titel "Node.js installieren" `
        -Erklaerung "Node.js ist die Software-Umgebung, mit der die Torball-Turniere-App laeuft (sie ist in der Programmiersprache JavaScript geschrieben) - ohne Node.js kann die App auf diesem Rechner nicht gestartet werden." `
        -Auswirkung "Node.js wird ganz normal als eigenstaendiges Programm installiert (ueber den offiziellen Windows-Paketmanager 'winget'), so wie jede andere Software auch. Es laeuft nur, wenn eine Anwendung wie Torball-Turniere es aufruft - nicht dauerhaft im Hintergrund. Laesst sich jederzeit ganz normal ueber 'Apps & Features' wieder entfernen."
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
# Alles, was dieses Skript ausserhalb des Projektordners auf dem Rechner ablegt (CouchDB-
# Installation, Konfigurationsdateien, Installations-Log), bewusst gebuendelt in einem einzigen,
# klar benannten Ordner - erleichtert spaeteres manuelles Aufraeumen (Nutzer-Vorgabe 2026-08-19):
# einfach "C:\Torball-Turniere" loeschen statt an mehreren Stellen (ProgramData, Program Files, ...)
# suchen zu muessen. Bewusst direkt unter C:\ statt unter dem versteckten/geschuetzten
# C:\ProgramData - fuer die Zielgruppe (auch technisch wenig versiert) leichter wiederzufinden.
# Sicherheitsrelevante Dateien darin (Admin-Passwort) bleiben trotzdem einzeln per icacls
# geschuetzt, unabhaengig vom Ordner. ($TorballOrdner ist oben beim Verlege-Schritt definiert.)
New-Item -ItemType Directory -Force -Path $TorballOrdner | Out-Null
$ConfDir = $TorballOrdner
$CouchAdminFile = Join-Path $ConfDir "couchdb-admin.txt"

function Test-Couchdb {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:5984/" -UseBasicParsing -TimeoutSec 3
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

# Kryptographischer Zufall statt Get-Random (kein CSPRNG; -Count zieht zudem OHNE Zuruecklegen,
# also nur unterschiedliche Zeichen). Rejection-Sampling gegen Modulo-Bias: 62 Zeichen, nur
# Byte-Werte < 248 (= 4*62) verwenden, damit jedes Zeichen exakt gleich wahrscheinlich ist.
function New-ZufallsPasswort {
    $zeichen = [char[]](48..57) + [char[]](65..90) + [char[]](97..122)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $byte = New-Object byte[] 1
    $ergebnis = ""
    while ($ergebnis.Length -lt 24) {
        $rng.GetBytes($byte)
        if ($byte[0] -lt 248) { $ergebnis += $zeichen[$byte[0] % 62] }
    }
    $rng.Dispose()
    return $ergebnis
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
    Bestaetige-Systemaenderung -Titel "CouchDB installieren" `
        -Erklaerung "CouchDB ist die Datenbank, in der Torball-Turniere alle Turnierdaten speichert (Mannschaften, Spielplaene, Ergebnisse usw.) - ohne CouchDB hat die App keinen Ort, um Daten zu speichern." `
        -Auswirkung "CouchDB wird als Hintergrunddienst installiert (nach C:\Torball-Turniere\CouchDB, nicht wie sonst ueblich nach 'Programme' - so bleibt alles, was diese Installation auf dem Rechner ablegt, an einer einzigen, leicht wiederzufindenden Stelle): es startet automatisch mit Windows und laeuft dauerhaft im Hintergrund, auch wenn Torball-Turniere gerade nicht benutzt wird (aehnlich wie z.B. ein Antivirenprogramm). Es ist ausschliesslich von diesem Rechner selbst erreichbar, nicht ueber das Internet. Laesst sich jederzeit ganz normal ueber 'Apps & Features' wieder entfernen."
    Write-Host "CouchDB nicht gefunden - lade offiziellen Installer herunter (Version $CouchdbVersion) ..."
    $CouchAdminUser = "admin"
    $CouchAdminPass = New-ZufallsPasswort
    Set-Content -Path $CouchAdminFile -Value $CouchAdminPass -NoNewline
    icacls $CouchAdminFile /inheritance:r /grant:r "*S-1-5-32-544:F" | Out-Null

    $msiPath = Join-Path $env:TEMP "apache-couchdb-$CouchdbVersion.msi"
    $shaPath = "$msiPath.sha256"
    Invoke-WebRequest -Uri $CouchdbMsiUrl -OutFile $msiPath

    # Die .sha256-Datei liegt auf demselben Hoster (couchdb.neighbourhood.ie -> DigitalOcean
    # Spaces) wie der Installer selbst, aber als eigenes Objekt - kann unabhaengig vom .msi
    # nicht verfuegbar sein (live erlebt: .msi lud problemlos, .sha256 lieferte 403 AccessDenied,
    # offenbar eine Bucket-Berechtigung nur fuer dieses eine Objekt). Kein Abbruch bei fehlender
    # Pruefsumme - das waere ein reines Fremd-Server-Problem, keines dieser Installation -,
    # sondern eine bewusste Nachfrage, ob trotzdem fortgefahren werden soll.
    $pruefsummeVerfuegbar = $true
    try {
        Invoke-WebRequest -Uri $CouchdbSha256Url -OutFile $shaPath -ErrorAction Stop
    } catch {
        $pruefsummeVerfuegbar = $false
    }

    if ($pruefsummeVerfuegbar) {
        $expectedHash = ((Get-Content $shaPath) -split "\s+")[0]
        $actualHash = (Get-FileHash -Path $msiPath -Algorithm SHA256).Hash
        if ($actualHash.ToLower() -ne $expectedHash.ToLower()) {
            Write-Error "Pruefsumme des CouchDB-Installers stimmt nicht ueberein - Abbruch (moeglicher Download-Fehler). Bitte erneut versuchen."
            exit 1
        }
    } else {
        Write-Host ""
        Write-Warning "Die Pruefsummen-Datei konnte nicht vom CouchDB-Anbieter (couchdb.neighbourhood.ie) heruntergeladen werden - das liegt an dessen Server, nicht an dieser Installation. Der Installer selbst wurde erfolgreich heruntergeladen, nur die Verifikation war nicht moeglich."
        $weiter = Frage-MitDefault -Text "Trotzdem mit der heruntergeladenen (nicht verifizierten) Installationsdatei fortfahren? (j/n)" -Standard "n"
        if ($weiter -notin @("j", "J", "ja", "Ja", "JA")) {
            Write-Host "Abgebrochen."
            exit 1
        }
    }

    # Verwaiste Installations-Registrierung erkennen und entfernen: schlaegt eine Installation
    # fehl, kann Windows das Produkt trotzdem als "installiert" fuehren (mit dem damaligen,
    # moeglicherweise nicht mehr passenden Zielordner). Jeder weitere Versuch landet dann
    # automatisch im "Reparatur"-Modus und uebernimmt den ALTEN Zielordner aus der Registrierung -
    # der APPLICATIONFOLDER-Wert weiter unten wird dabei stillschweigend ignoriert. Live erlebt:
    # ein frueher Testlauf (noch ohne den APPLICATIONFOLDER-Fix) hatte CouchDB mit einem vom
    # Installer selbst falsch gewaehlten, leeren Laufwerk registriert - jeder folgende Versuch
    # scheiterte seitdem an genau diesem Karteileichen-Eintrag, unabhaengig vom eigentlichen Fehler.
    $vorhandenesPaket = Get-Package -Name "Apache CouchDB" -ErrorAction SilentlyContinue
    if ($vorhandenesPaket) {
        $zielInhaltVorhanden = (Test-Path $vorhandenesPaket.Source) -and
            ((Get-ChildItem $vorhandenesPaket.Source -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0)
        if (-not $zielInhaltVorhanden) {
            Bestaetige-Systemaenderung -Titel "Fehlerhaften CouchDB-Installationseintrag entfernen" `
                -Erklaerung "Ein frueherer, fehlgeschlagener Installationsversuch hat einen unvollstaendigen Eintrag hinterlassen: Windows fuehrt CouchDB als installiert, obwohl am hinterlegten Ort ('$($vorhandenesPaket.Source)') keine Dateien liegen. Dieser Eintrag verhindert eine saubere Neuinstallation." `
                -Auswirkung "Es wird nur dieser eine fehlerhafte Eintrag entfernt - kein echtes Programm, da nie erfolgreich installiert. Danach kann CouchDB regulaer neu installiert werden."
            Start-Process -FilePath "msiexec.exe" -ArgumentList @("/x", $vorhandenesPaket.FastPackageReference, "/quiet", "/norestart") -Wait | Out-Null
        }
    }

    Write-Host "Installiere CouchDB als Windows-Dienst (unbeaufsichtigt) ..."
    $logPath = Join-Path $ConfDir "couchdb-install.log"
    # Installationsordner bewusst NICHT unter "Program Files" (der MSI-Standard): auf Rechnern, auf
    # denen "Program Files" selbst keinen 8.3-Kurznamen hat (z.B. weil 8.3-Kurznamen von Anfang an
    # deaktiviert waren, kein reines "seither deaktiviert"), scheitert CostFinalize sonst mit Error
    # 1324/Exit-Code 1603 - per direkter MSI-Tabellenabfrage (Property "APPLICATIONFOLDER", von
    # "PROGRAMFILESFORSURE" alias Program Files abgeleitet) und zwei Testinstallationen verifiziert
    # (auch mit dem hier verschachtelten Pfad): mit einem Zielordner ausserhalb von Program Files
    # tritt der Fehler gar nicht erst auf. Vermeidet damit von vornherein jede Notwendigkeit, eine
    # Windows-Systemeinstellung anzufassen. Liegt unter demselben $TorballOrdner wie die
    # Konfigurationsdateien oben (Buendelung fuers Aufraeumen, siehe Kommentar dort).
    $CouchdbInstallDir = Join-Path $TorballOrdner "CouchDB\"
    $msiArgs = @(
        "/i", "`"$msiPath`"",
        "APPLICATIONFOLDER=$CouchdbInstallDir",
        "/quiet", "/norestart",
        "INSTALLSERVICE=1",
        "ADMINUSER=$CouchAdminUser",
        "ADMINPASSWORD=$CouchAdminPass",
        "/l*v", "`"$logPath`""
    )
    $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -PassThru
    # Das ausfuehrliche MSI-Log kann das per Parameter uebergebene ADMINPASSWORD im Klartext
    # enthalten - sofort (unabhaengig vom Erfolg) auf Administratoren beschraenken, wie die
    # Passwort-Dateien selbst (Sicherheitsdurchsicht Deploy, 2026-08-20).
    if (Test-Path $logPath) {
        icacls $logPath /inheritance:r /grant:r "*S-1-5-32-544:F" | Out-Null
    }
    if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) {
        # Reine Vorsichtsmassnahme, sollte durch APPLICATIONFOLDER oben (Installation ausserhalb
        # Program Files) jetzt eigentlich nicht mehr auftreten - falls Error 1324 trotzdem irgendwo
        # anders auftaucht (z.B. ein voellig anderer Zielordner, der ebenfalls keinen 8.3-Kurznamen
        # hat), hier trotzdem noch ein Fallback: 8.3-Kurznamen sind dann systemweit deaktiviert,
        # CostFinalize kann keinen Kurznamen fuer den (noch nicht existierenden) Zielordner
        # ermitteln. Kein Fehler dieses Skripts oder des CouchDB-Pakets an sich. Wie bei Node.js/
        # CouchDB oben: nicht stillschweigend aendern, sondern erklaeren und per
        # Bestaetige-Systemaenderung um Zustimmung fragen (Nutzer-Vorgabe 2026-08-19).
        $logInhalt = if (Test-Path $logPath) { Get-Content -Path $logPath -Raw -Encoding Unicode } else { "" }
        if ($proc.ExitCode -eq 1603 -and $logInhalt -match "1324") {
            # Die Registry-Einstellung allein reicht nicht - live festgestellt (zweiter Testlauf):
            # Wert stand bereits auf aktiviert (von einem vorherigen Lauf dieses Skripts), der
            # sofortige erneute Versuch scheiterte trotzdem identisch. Windows uebernimmt diese
            # Einstellung offenbar erst nach einem Neustart (wird beim Volume-Mount ausgewertet,
            # nicht pro Dateizugriff) - ein direkter Retry ohne Neustart ist also zwecklos. Deshalb:
            # Wert nur EINMAL setzen (falls noch nicht geschehen) und danach immer zum Neustart
            # auffordern, statt es sofort nochmal zu versuchen.
            $bereitsAktiviert = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "NtfsDisable8dot3NameCreation" -ErrorAction SilentlyContinue).NtfsDisable8dot3NameCreation -eq 0
            if (-not $bereitsAktiviert) {
                Bestaetige-Systemaenderung -Titel "Windows-Kompatibilitaetsfunktion einschalten" `
                    -Erklaerung "Die CouchDB-Installation ist an einer Windows-Einstellung gescheitert: auf diesem Rechner ist eine aeltere Kompatibilitaetsfunktion abgeschaltet ('8.3-Kurznamen', z.B. 'PROGRA~1' statt 'Program Files'), die der CouchDB-Installer intern noch braucht." `
                    -Auswirkung "Diese Funktion wird wieder eingeschaltet. Windows erzeugt dann zusaetzlich zu den normalen Dateinamen auch kurze Zusatznamen fuer neue Dateien/Ordner - auf einem normalen PC praktisch nicht spuerbar. Wird aber erst nach einem Neustart von Windows wirksam (siehe unten). Laesst sich jederzeit wieder abschalten (falls gewuenscht: 'fsutil 8dot3name set 1' in einer Administrator-Eingabeaufforderung)."
                Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "NtfsDisable8dot3NameCreation" -Value 0
            }
            Write-Host ""
            Write-Warning "Diese Windows-Einstellung wird erst nach einem Neustart wirksam - ein erneuter Versuch jetzt wuerde wieder fehlschlagen."
            Write-Host "Bitte den Rechner neu starten und danach 'Setup.cmd' erneut ausfuehren."
            Write-Host ""
            exit 1
        }
        Write-Error "CouchDB-Installation fehlgeschlagen (Exit-Code $($proc.ExitCode)). Details: $logPath"
        exit 1
    }

    # Der Windows-Dienst kann trotz erfolgreicher Datei-Installation noch auf einen veralteten Ort
    # zeigen, wenn zuvor schon einmal ein Dienst mit diesem Namen registriert war (z.B. von einem
    # frueheren fehlgeschlagenen Versuch) - der Installer registriert den Dienst dann u.U. nicht
    # sauber neu. Live erlebt: Dateien lagen korrekt unter $CouchdbInstallDir, der Dienst zeigte
    # aber noch auf ein laengst nicht mehr vorhandenes Laufwerk ("Das System kann die angegebene
    # Datei nicht finden", Ereignis-ID 7000) - CouchDB liess sich dadurch nicht starten. Der
    # Dienst wird ueber NSSM (Non-Sucking Service Manager) betrieben, dessen eigentliches Ziel
    # zusaetzlich zum SCM-Pfad separat in der Registry steht.
    $nssmPfad = Join-Path $CouchdbInstallDir "bin\nssm.exe"
    $serviceInfo = Get-CimInstance -ClassName Win32_Service -Filter "Name='Apache CouchDB'" -ErrorAction SilentlyContinue
    if ($serviceInfo -and $serviceInfo.PathName -notmatch [regex]::Escape($nssmPfad)) {
        Bestaetige-Systemaenderung -Titel "CouchDB-Dienstpfad korrigieren" `
            -Erklaerung "Der Windows-Dienst fuer CouchDB zeigt noch auf einen veralteten Installationsort von einem frueheren Versuch, nicht auf die gerade installierten Dateien - dadurch startet CouchDB nicht." `
            -Auswirkung "Es wird nur der hinterlegte Pfad des bereits vorhandenen CouchDB-Dienstes korrigiert, damit er die gerade installierten Dateien findet. Es wird nichts zusaetzlich installiert."
        $couchdbCmd = Join-Path $CouchdbInstallDir "bin\couchdb.cmd"
        $binDir = Join-Path $CouchdbInstallDir "bin"
        & sc.exe config "Apache CouchDB" binPath= "`"$nssmPfad`"" | Out-Null
        Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Apache CouchDB\Parameters" -Name "Application" -Value $couchdbCmd
        Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Apache CouchDB\Parameters" -Name "AppDirectory" -Value $binDir
        Write-Host "Dienstpfad korrigiert."
    }
    try { Start-Service -Name "Apache CouchDB" -ErrorAction SilentlyContinue } catch {}

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
# Wie couchdb-admin.txt nur fuer Administratoren lesbar machen - C:\Torball-Turniere selbst hat
# bewusst Standard-Rechte (leicht wiederzufinden), die Geheimwert-Dateien darin aber nicht
# (Sicherheitsdurchsicht Deploy, 2026-08-20; vorher war nur die Admin-Passwort-Datei geschuetzt).
icacls $DbPassFile /inheritance:r /grant:r "*S-1-5-32-544:F" | Out-Null

$authHeader = @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$CouchAdminUser`:$CouchAdminPass")) }

# System-Datenbanken sicherstellen (_users, _replicator, _global_changes): der unbeaufsichtigte
# MSI-Installer (ADMINUSER/ADMINPASSWORD als Parameter, kein interaktiver Einrichtungsassistent)
# legt zwar den Admin-Zugang an, richtet dabei aber NICHT die internen System-Datenbanken ein -
# das uebernimmt sonst der "Cluster-Setup"-Einrichtungsassistent von Fauxton, den es hier nie gibt.
# Ohne die Datenbank "_users" kann sich kein regulaerer (Nicht-Admin-)Benutzer wie torball_backend
# anmelden - CouchDB meldet dann "Name or password is incorrect", obwohl das Passwort stimmt (der
# eigentliche Grund ist ein 404 "Database does not exist" beim Nachschlagen des Benutzers, das aber
# nirgends sichtbar wird, weil nano/das Backend nur den 401 der Anmeldung selbst sieht). Live
# erlebt. PUT ist idempotent - eine bereits vorhandene Datenbank liefert 412, wird ignoriert.
foreach ($systemDb in @("_users", "_replicator", "_global_changes")) {
    try { Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:5984/$systemDb" -Headers $authHeader -ErrorAction Stop | Out-Null } catch { }
}

try { Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:5984/$Db" -Headers $authHeader | Out-Null } catch { }
# Bewusst erst lesen (fuer die _rev) und dann schreiben statt einfach blind PUT + Fehler ignorieren:
# existiert der Benutzer schon (z.B. von einem frueheren Lauf mit einem inzwischen anderen
# db-lokal.pass, etwa nach einer Ordner-Umstrukturierung), scheitert ein PUT ohne _rev mit 409 -
# der vorherige try/catch schluckte das stillschweigend, wodurch CouchDB weiterhin das ALTE
# Passwort erwartete, waehrend .env schon das NEUE enthielt ("Name or password is incorrect" beim
# Start). Live erlebt. Mit _rev wird der Benutzer stattdessen korrekt auf das aktuelle
# db-lokal.pass-Passwort aktualisiert.
try {
    $vorhandenerBenutzer = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:5984/_users/org.couchdb.user:$DbUser" -Headers $authHeader -ErrorAction Stop
} catch {
    $vorhandenerBenutzer = $null
}
$userBody = @{ name = $DbUser; password = $DbPass; roles = @(); type = "user" }
if ($vorhandenerBenutzer) { $userBody["_rev"] = $vorhandenerBenutzer._rev }
try {
    Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:5984/_users/org.couchdb.user:$DbUser" -Headers $authHeader -Body ($userBody | ConvertTo-Json) -ContentType "application/json" | Out-Null
} catch { }
# Als admins (nicht nur members) eintragen: CouchDB verlangt fuer das Anlegen von Mango-Indizes
# (ensureIndexes() in backend/src/db.ts, technisch ein Design-Dokument) Admin-Rechte auf der
# jeweiligen Datenbank - ein reiner "member" bekommt beim Start "forbidden" und der Prozess
# stuerzt ab. Bleibt trotzdem auf genau diese eine Datenbank beschraenkt (kein CouchDB-Server-Admin).
$securityBody = @{ admins = @{ names = @($DbUser); roles = @() }; members = @{ names = @($DbUser); roles = @() } } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:5984/$Db/_security" -Headers $authHeader -Body $securityBody -ContentType "application/json" | Out-Null

# --- [4/6] App bauen ---------------------------------------------------------------------------
Write-Host ""
Write-Host "== [4/6] App bauen (npm install, shared zuerst) =="
Push-Location $RepoRoot
try {
    # Bei einem erneuten Lauf auf einer bereits bestehenden Git-Installation gleich den neuesten
    # Stand holen - sonst baut dieses Skript sonst nur den ohnehin schon vorhandenen (ggf.
    # veralteten) Quellcode neu, was beim erneuten Ausfuehren leicht als "hat aktualisiert"
    # missverstanden wird (Nutzer-Vorgabe 2026-08-20, analog zum "torball aktualisieren"-Befehl).
    # Bei einer ZIP-Installation (kein .git-Ordner) gibt es hier nichts zu holen - unveraendert.
    if (Test-Path (Join-Path $RepoRoot ".git")) {
        Write-Host "Git-Repository erkannt - hole neuesten Quellcode (git pull) ..."
        git pull
        if ($LASTEXITCODE -ne 0) { throw "git pull fehlgeschlagen" }
    }
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
# Merker fuer die Firewall-Regel - wird weiter unten angewendet, sobald der massgebliche Port
# feststeht (bei einer Bestandsinstallation steht er erst nach dem Lesen der .env fest).
$FirewallRegelNoetig = $false
if (Test-Path $EnvFile) {
    Write-Host "backend/.env existiert bereits - unveraendert gelassen."
    Write-Host "Aenderungen (z.B. Port) spaeter per 'npm run torball -- konfiguration:setzen' in backend/."
    # Bestandsinstallation ohne Netzwerkzugriff: das Aktivieren einmal ANBIETEN (Standard "nein" -
    # ein reiner Update-Lauf soll den Zustand nicht ungefragt aendern; wer per erneutem Setup.cmd
    # gezielt aktivieren will, antwortet mit j). Aeltere Installationen hatten immer HOST=127.0.0.1.
    $hostZeile = (Get-Content $EnvFile) | Where-Object { $_ -match '^HOST=' } | Select-Object -First 1
    if ($hostZeile -and ($hostZeile -split '=', 2)[1].Trim() -eq "127.0.0.1") {
        if (Frage-Netzwerkzugriff -Standard "n") {
            ((Get-Content $EnvFile) -replace '^HOST=.*', 'HOST=0.0.0.0') | Set-Content -Path $EnvFile -Encoding utf8
            $FirewallRegelNoetig = $true
            Write-Host "HOST in backend/.env auf 0.0.0.0 gesetzt - wirkt ab dem naechsten Start der App."
        }
    }
} else {
    Write-Host "Ein paar Angaben zur Konfiguration (Enter uebernimmt den vorgeschlagenen Standardwert):"
    # Belegte Ports frueh erkennen: laeuft auf dem Rechner bereits etwas auf dem gewaehlten Port
    # (z.B. eine Entwicklungsumgebung oder andere Software), wuerde der Server spaeter beim Start
    # kommentarlos scheitern und der Browser landete verwirrend bei der fremden Anwendung
    # (live erlebt, 2026-08-21).
    $Port = Frage-MitDefault -Text "Port, unter dem die App laufen soll" -Standard "3000"
    while ($true) {
        while ($Port -notmatch '^\d+$') {
            Write-Host "Bitte eine Zahl eingeben."
            $Port = Frage-MitDefault -Text "Port, unter dem die App laufen soll" -Standard "3000"
        }
        $portBelegt = Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue
        if (-not $portBelegt) { break }
        Write-Warning "Port $Port wird auf diesem Rechner gerade von einem anderen Programm verwendet - die App koennte dann nicht starten. Bitte einen anderen Port waehlen."
        $Port = Frage-MitDefault -Text "Port, unter dem die App laufen soll" -Standard "$([int]$Port + 5)"
    }

    # Standard "ja": der Betriebsmodus "Lokales Netzwerk" (Turnier-Codes, Helfer-Erfassung) ist
    # ein Kernanwendungsfall der lokalen Installation - wer nur allein am Rechner arbeitet,
    # antwortet mit n und die App bleibt rein lokal (HOST=127.0.0.1, keine Firewall-Regel).
    $NetzwerkZugriff = Frage-Netzwerkzugriff -Standard "j"
    $HostWert = if ($NetzwerkZugriff) { "0.0.0.0" } else { "127.0.0.1" }
    if ($NetzwerkZugriff) { $FirewallRegelNoetig = $true }

    # SMTP-Mailversand (Einladungen/Passwort-Reset) wird NICHT hier abgefragt - seit 2026-08-15
    # ueber die Oberflaeche gepflegt (Admin-Menue -> Systemeinstellungen -> "E-Mail-Versand (SMTP)"),
    # kein .env-Wert mehr.
    @"
PORT=$Port
# 0.0.0.0 = auch fuer andere Geraete im lokalen Netzwerk erreichbar (Betriebsmodus "Lokales
# Netzwerk": Turnier-Codes, Ergebniserfassung durch Helfer); 127.0.0.1 = nur auf diesem Rechner.
# Nachtraeglich aenderbar durch erneutes Ausfuehren von Setup.cmd (fragt dann danach) - beim
# Aktivieren gehoert eine Windows-Firewall-Regel fuer den Port dazu.
HOST=$HostWert
COUCHDB_URL=http://127.0.0.1:5984
COUCHDB_DB=$Db
COUCHDB_USER=$DbUser
COUCHDB_PASSWORD=$DbPass
COOKIE_SECURE=false
FRONTEND_URL=http://localhost:$Port
KANBAN_BOARD_AKTIV=false
SERVE_FRONTEND=true
# Explizit statt der Systemzeitzone des Rechners - siehe deploy-instanz.sh fuer die Begruendung
# (Turnier-Startzeiten sollen unabhaengig von der lokalen Windows-Zeitzoneneinstellung als
# deutsche Zeit interpretiert werden, inkl. korrekter Sommer-/Winterzeit-Umstellung).
TZ=Europe/Berlin
"@ | Set-Content -Path $EnvFile -Encoding utf8
    Write-Host "backend/.env angelegt."
}

# Port aus der (neu geschriebenen oder bereits vorhandenen) .env lesen - massgeblich fuer die
# Start-Verknuepfung ist immer die tatsaechliche Datei, nicht die Eingabe von eben.
$PortZeile = (Get-Content $EnvFile) | Where-Object { $_ -match '^PORT=' } | Select-Object -First 1
$EffectivePort = if ($PortZeile) { ($PortZeile -split '=', 2)[1].Trim() } else { "3000" }

# Firewall-Regel erst hier anlegen: jetzt steht der massgebliche Port fest (bei einer
# Bestandsinstallation kommt er aus der vorhandenen .env, nicht aus einer Eingabe von eben).
# Auch bei einem Update-Lauf mit BEREITS aktiviertem Netzwerkzugriff (HOST=0.0.0.0 in der
# vorhandenen .env) die Regel neu schreiben: wurde der Port zwischenzeitlich geaendert (z.B. per
# "konfiguration:setzen"), zeigte die alte Regel sonst dauerhaft auf den falschen Port.
$hostZeileAktuell = (Get-Content $EnvFile) | Where-Object { $_ -match '^HOST=' } | Select-Object -First 1
$netzwerkBereitsAktiv = $hostZeileAktuell -and (($hostZeileAktuell -split '=', 2)[1].Trim() -ne "127.0.0.1")
if (($FirewallRegelNoetig -or $netzwerkBereitsAktiv) -and $EffectivePort -match '^\d+$') {
    Set-TorballFirewallRegel -Port ([int]$EffectivePort)
}

# --- [6/6] Start-Skript + Desktop-Verknuepfung ---------------------------------------------------
# "Aktualisieren-Torball.cmd" wird hier bewusst NICHT (mehr) generiert: ihr Inhalt ist rein
# statisch (kein einziger installationsspezifischer Wert), deshalb liegt sie seit 2026-08-19 als
# normale, mitversionierte Datei direkt im Projekt-Wurzelverzeichnis - taucht damit schon vor der
# allerersten Installation auf (auch im per "git archive" erzeugten Quellcode-ZIP) statt erst
# danach, und ein "git pull"/eine neue ZIP-Version bringt Aenderungen daran automatisch mit statt
# sie bei jedem Lauf dieses Skripts neu ausschreiben zu muessen.
Write-Host ""
Write-Host "== [6/6] Start-Skript + Desktop-Verknuepfung =="
$StartCmd = Join-Path $RepoRoot "Start-Torball.cmd"
@"
@echo off
cd /d "%~dp0backend"
rem Port aus backend\.env lesen und im Prozessumfeld EXPLIZIT setzen, bevor der Server startet:
rem eine evtl. bereits auf diesem Windows-Konto vorhandene PORT-Umgebungsvariable wuerde sonst den
rem Wert aus .env stillschweigend ueberstimmen (Node uebernimmt per "--env-file" keine Werte, die
rem im Prozessumfeld schon existieren) - live erlebt: Server startete trotz PORT=3001 in .env auf
rem Port 3000. "tokens=2 delims==" liefert den Wert hinter dem "="; funktioniert auch, wenn die
rem allererste Zeile durch das Byte-Order-Mark von PowerShells Set-Content mit unsichtbaren
rem Extra-Zeichen beginnt, weil nur nach dem GLEICHHEITSZEICHEN gesplittet wird.
set "PORT=$EffectivePort"
for /f "tokens=2 delims==" %%P in ('findstr "PORT=" .env') do set "PORT=%%P"
rem /min startet das Server-Fenster minimiert (nur in der Taskleiste) - bleibt so nicht im Weg fuer
rem ein versehentliches Wegklicken, ist aber bei Bedarf weiterhin ueber die Taskleiste erreichbar
rem (z.B. um im Fehlerfall die Ausgabe zu sehen). Titel weist zusaetzlich deutlich darauf hin, dass
rem dieses Fenster den Server darstellt und nicht geschlossen werden soll.
start "Torball-Turniere-Server - NICHT SCHLIESSEN!" /min cmd /k node --env-file=.env dist\index.js
timeout /t 3 /nobreak >nul
start "" http://localhost:%PORT%
"@ | Set-Content -Path $StartCmd -Encoding ascii

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Torball-Turniere.lnk"))
$Shortcut.TargetPath = $StartCmd
$Shortcut.WorkingDirectory = $RepoRoot
$Shortcut.Description = "Torball-Turniere starten"
# Eigenes mehrstufiges .ico (16-256px, aus frontend/public/images/torball-logo-1024.png erzeugt,
# siehe dortiger Kommentar) statt des Browser-favicon.ico - das ist nur 16x16 und wirkte auf dem
# Desktop (dort meist 32-48px groß dargestellt) sichtbar unscharf hochskaliert (Nutzer-Feedback
# 2026-08-19). Faellt auf das Windows-Standard-.exe-Symbol zurueck, falls die Datei fehlen sollte.
$AppIconPfad = Join-Path $RepoRoot "frontend\dist\images\torball-app-icon.ico"
if (Test-Path $AppIconPfad) {
    $Shortcut.IconLocation = $AppIconPfad
}
$Shortcut.Save()

Write-Host ""
Write-Host "Fertig!"
Write-Host "Ueber die Desktop-Verknuepfung 'Torball-Turniere' starten (oeffnet http://localhost:$EffectivePort)."
if ($FirewallRegelNoetig) {
    Write-Host "Netzwerkzugriff ist aktiv: andere Geraete im selben (W)LAN erreichen die App ueber die"
    Write-Host "Netzwerk-Adresse dieses Rechners (Port $EffectivePort) - die genaue Adresse zeigt die App im"
    Write-Host "Turnier unter 'Teilen' bei den Codes fuer das Lokale Netzwerk an."
}
Write-Host "Beim allerersten Start fuehrt die Anmeldeseite durch die einmalige Ersteinrichtung des ersten Admin-Kontos."
Write-Host ""
Write-Host "Spaeter aktualisieren: 'Aktualisieren-Torball.cmd' im Projektordner doppelklicken (siehe auch AKTUALISIEREN.md)."
Write-Host "Spaeter Konfiguration anpassen (z.B. Port): in backend/ 'npm run torball -- konfiguration:anzeigen' bzw. 'konfiguration:setzen' (siehe --hilfe)."
Write-Host "E-Mail-Versand (SMTP) ist optional und nur sinnvoll, wenn dieser Rechner Internetzugang hat:"
Write-Host "ohne ihn zeigt die App Einladungs- und Passwort-Reset-Links einfach direkt an (zum Weitergeben"
Write-Host "von Hand). Bei Bedarf spaeter im Admin-Menue unter Systemeinstellungen einrichten."
