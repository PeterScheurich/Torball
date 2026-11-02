@echo off
rem Doppelklick-Einstieg fuer aktualisieren-windows.ps1 (laedt die neueste Version und installiert sie) -
rem ExecutionPolicy Bypass gilt nur fuer diesen einen Aufruf, keine dauerhafte Aenderung. Das Fenster
rem bleibt am Ende offen, damit die Meldungen lesbar bleiben.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0aktualisieren-windows.ps1"
echo.
pause
