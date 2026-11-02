"""Liest (nur lesend) alle Anmerkungen einer Zeitleiste: Marker mit Notiz (Farbe, Zeit, Name, Notiz) und die Kommentarfelder
der Clips (Media-Pool-Metadaten 'Comments') sowie Clip-Farbe/Flags. Aufruf: python resolve_anmerkungen_lesen.py "<Zeitleistenname>" """
import sys
from resolve_verbindung import verbinde

sys.stdout.reconfigure(encoding="utf-8")
FPS = 24
resolve, projekt = verbinde()
name = sys.argv[1]
t = next((projekt.GetTimelineByIndex(i) for i in range(1, projekt.GetTimelineCount() + 1) if projekt.GetTimelineByIndex(i).GetName() == name), None)
if t is None:
    raise SystemExit(f"Zeitleiste '{name}' nicht gefunden.")
start = t.GetStartFrame()
print("== Marker auf der Zeitleiste ==")
for frame, m in sorted((t.GetMarkers() or {}).items()):
    print(f"  {m['color']:8} {frame / FPS:7.2f} s  {m['name']} | {m['note']}")
print("== Clips mit Kommentar, Farbe oder Marker ==")
for art in ("video", "audio"):
    for i in range(1, t.GetTrackCount(art) + 1):
        for it in t.GetItemListInTrack(art, i) or []:
            mpi = it.GetMediaPoolItem()
            kommentar = (mpi.GetMetadata("Comments") if mpi else "") or ""
            farbe = it.GetClipColor()
            marker = it.GetMarkers() or {}
            if kommentar or farbe or marker:
                print(f"  {art} {(it.GetStart() - start) / FPS:7.2f} s  {it.GetName()} | Kommentar: {kommentar} | Farbe: {farbe} | Marker: {[(m['color'], m['note']) for m in marker.values()]}")
