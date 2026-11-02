"""Entfernt die von resolve_hoerprobe.py angelegten Objekte (Zeitleisten 'Hoerprobe 02 (Claude)...' und die Satz-Clips im Ordner
'02 Neu (Claude)/Saetze'), damit sie nach neu erzeugten Satzdateien frisch aufgebaut werden koennen. Fasst NUR diese Objekte an,
und nur im Projekt '...mit-Claude'."""
import sys

from resolve_verbindung import verbinde

sys.stdout.reconfigure(encoding="utf-8")
ERLAUBTES_PROJEKT = "Torball-Turniere-Tutorials-mit-Claude"

resolve, projekt = verbinde()
if projekt.GetName() != ERLAUBTES_PROJEKT:
    raise SystemExit(f"Abbruch: geoeffnet ist '{projekt.GetName()}', erlaubt ist nur '{ERLAUBTES_PROJEKT}'.")

mp = projekt.GetMediaPool()
zeitleisten = [projekt.GetTimelineByIndex(i) for i in range(1, projekt.GetTimelineCount() + 1)]
meine = [t for t in zeitleisten if t.GetName().startswith("Hoerprobe 02 (Claude)")]
print("Zeitleisten:", [t.GetName() for t in meine])
if meine:
    print("Zeitleisten geloescht:", mp.DeleteTimelines(meine))

video = next((f for f in mp.GetRootFolder().GetSubFolderList() if f.GetName() == "02 Neu (Claude)"), None)
saetze = next((f for f in video.GetSubFolderList() if f.GetName() == "Saetze"), None) if video else None
if saetze:
    clips = saetze.GetClipList()
    print(f"Satz-Clips: {len(clips)}")
    if clips:
        print("Clips geloescht:", mp.DeleteClips(clips))
