@echo off
rem Ruft den eigentlichen Windows-Installer auf (liegt aus Ordnungsgruenden unter deploy/) - diese
rem Datei liegt bewusst auf der obersten Ebene des entpackten Quellcode-ZIPs, damit sie sofort
rem auffindbar ist, ohne die Ordnerstruktur durchsuchen zu muessen (README.md liest erfahrungsgemaess
rem kaum jemand).
call "%~dp0deploy\Installieren-Windows.cmd"
