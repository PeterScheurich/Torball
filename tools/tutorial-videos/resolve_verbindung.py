"""Gemeinsamer Zugang zu DaVinci Resolve Studio (externe Skript-Schnittstelle).

Voraussetzung in Resolve: Preferences > System > General > External scripting using = Local, und Resolve laeuft.
Die Pfade gelten fuer eine Standardinstallation unter Windows. Die Module laden fusionscript.dll aus dem Resolve-Ordner.
"""
import os
import sys

API = r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting"
LIB = r"C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll"
os.environ.setdefault("RESOLVE_SCRIPT_API", API)
os.environ.setdefault("RESOLVE_SCRIPT_LIB", LIB)
sys.path.append(os.path.join(API, "Modules"))

import DaVinciResolveScript as dvr  # noqa: E402


def verbinde():
    """Liefert (resolve, projekt). Bricht mit einer klaren Meldung ab, wenn Resolve nicht antwortet."""
    resolve = dvr.scriptapp("Resolve")
    if resolve is None:
        raise SystemExit("Keine Verbindung zu Resolve: laeuft es, und ist 'External scripting using' auf Local gestellt?")
    projekt = resolve.GetProjectManager().GetCurrentProject()
    if projekt is None:
        raise SystemExit("In Resolve ist kein Projekt geoeffnet.")
    return resolve, projekt
