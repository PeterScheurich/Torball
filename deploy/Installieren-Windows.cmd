@echo off
rem Doppelklick-Einstieg fuer installieren-windows.ps1 - umgeht die Ausfuehrungsrichtlinie
rem (ExecutionPolicy Bypass gilt nur fuer diesen einen Aufruf, keine dauerhafte Aenderung)
rem und haelt das Fenster am Ende offen, damit Meldungen lesbar bleiben.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installieren-windows.ps1"
echo.
pause
