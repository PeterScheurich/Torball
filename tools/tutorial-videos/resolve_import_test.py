"""Testet, ob Resolve die Playwright-Aufnahme (WebM) importieren kann. Arbeitet NUR im Projekt '...mit-Claude' und legt dafuer
einen eigenen Ordner im Media Pool an. Aufruf: python resolve_import_test.py <pfad-zur-webm>"""
import sys

from resolve_verbindung import verbinde

sys.stdout.reconfigure(encoding="utf-8")
ERLAUBTES_PROJEKT = "Torball-Turniere-Tutorials-mit-Claude"

resolve, projekt = verbinde()
if projekt.GetName() != ERLAUBTES_PROJEKT:
    raise SystemExit(f"Abbruch: geoeffnet ist '{projekt.GetName()}', erlaubt ist nur '{ERLAUBTES_PROJEKT}'.")

mp = projekt.GetMediaPool()
wurzel = mp.GetRootFolder()
ordner = next((f for f in wurzel.GetSubFolderList() if f.GetName() == "00 Test (Claude)"), None) or mp.AddSubFolder(wurzel, "00 Test (Claude)")
mp.SetCurrentFolder(ordner)

pfad = sys.argv[1]
clips = mp.ImportMedia([pfad])
print("Importiert:", [c.GetName() for c in clips] if clips else clips)
for c in clips or []:
    eig = c.GetClipProperty()
    for k in ("Type", "Format", "Video Codec", "FPS", "Resolution", "Duration", "Frames", "Audio Codec"):
        print(f"  {k}: {eig.get(k)}")
