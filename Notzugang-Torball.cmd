@echo off
rem NOTZUGANG fuer Administratoren: Wenn alle Zugangsdaten vergessen wurden.
rem Erzeugt einen einmaligen Link (60 Minuten gueltig), ueber den im Browser ein neues Passwort gewaehlt wird.
rem Funktioniert nur auf dem Rechner, auf dem Torball-Turniere installiert ist. Als Administrator ausfuehren
rem (Rechtsklick -> "Als Administrator ausfuehren"), weil die Konfiguration das Datenbank-Passwort enthaelt.
setlocal
echo.
echo NOTZUGANG fuer Administratoren
echo ------------------------------
echo Es wird ein einmaliger Link erzeugt, mit dem du im Browser ein neues Passwort waehlst.
echo.
set "EMAIL="
set /p "EMAIL=E-Mail-Adresse des Administrator-Kontos (nur Enter, wenn es nur eines gibt): "
set "ANTWORT="
set /p "ANTWORT=Authenticator-App verloren? Dann auch die Zwei-Faktor-Anmeldung ausschalten (j/N): "
set "ZUSATZ="
if /i "%ANTWORT%"=="j" set "ZUSATZ=--zwei-fa-zuruecksetzen"
set "MAILTEIL="
if not "%EMAIL%"=="" set "MAILTEIL=--email=%EMAIL%"
echo.
if exist "%~dp0Konsole-Torball.cmd" goto paket
cd /d "%~dp0backend"
call npm run torball -- admin:notzugang %MAILTEIL% %ZUSATZ%
goto ende
:paket
call "%~dp0Konsole-Torball.cmd" admin:notzugang %MAILTEIL% %ZUSATZ%
:ende
echo.
pause
