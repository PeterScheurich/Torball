@echo off
echo Aktualisiert Torball-Turniere (Git-Pull falls vorhanden, npm install, Neubau) ...
echo Falls der Server laeuft (Fenster "Torball-Turniere (Server ...)"), dieses bitte vorher schliessen.
echo.
cd /d "%~dp0backend"
call npm run torball -- aktualisieren
echo.
pause
