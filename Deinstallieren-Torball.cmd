@echo off
rem Doppelklick-Einstieg fuer deploy/deinstallieren-windows.ps1 - umgeht die Ausfuehrungsrichtlinie
rem (ExecutionPolicy Bypass gilt nur fuer diesen einen Aufruf, keine dauerhafte Aenderung)
rem und haelt das Fenster am Ende offen, damit Meldungen lesbar bleiben.
rem Zuerst aus dem Programmordner herauswechseln: Ein Fenster, das noch IM Ordner steht, verhindert sonst, dass die
rem Deinstallation ihn loeschen kann (live erlebt). %~dp0 bleibt davon unberuehrt, es kommt aus dem Namen dieser Datei.
cd /d "%TEMP%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\deinstallieren-windows.ps1"
rem Code 42 = Uebergabe an ein zweites Fenster mit Administratorrechten: dieses hier schliesst sich selbst.
if %errorlevel%==42 exit
echo.
pause
