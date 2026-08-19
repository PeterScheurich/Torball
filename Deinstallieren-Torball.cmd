@echo off
rem Doppelklick-Einstieg fuer deploy/deinstallieren-windows.ps1 - umgeht die Ausfuehrungsrichtlinie
rem (ExecutionPolicy Bypass gilt nur fuer diesen einen Aufruf, keine dauerhafte Aenderung)
rem und haelt das Fenster am Ende offen, damit Meldungen lesbar bleiben.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\deinstallieren-windows.ps1"
echo.
pause
