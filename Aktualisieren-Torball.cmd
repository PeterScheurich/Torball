@echo off
rem Aktualisiert Torball-Turniere.
rem - Installation aus dem fertigen Paket (Datei paket.json vorhanden): laedt die neueste veroeffentlichte Version
rem   selbst herunter und installiert sie - ein Doppelklick genuegt.
rem - Entwicklungs-/Quellcode-Installation (Git bzw. Quellcode-ZIP): wie bisher git pull, npm install, Neubau.
if exist "%~dp0paket.json" (
  call "%~dp0deploy\Aktualisieren-Windows.cmd"
  exit /b
)
echo Aktualisiert Torball-Turniere (Git-Pull falls vorhanden, npm install, Neubau) ...
echo Falls der Server laeuft (Fenster "Torball-Turniere (Server ...)"), dieses bitte vorher schliessen.
echo.
cd /d "%~dp0backend"
call npm run torball -- aktualisieren
echo.
pause
