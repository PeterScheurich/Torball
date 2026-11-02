"""Legt die Untertitel (SRT) einer Zeitleiste neu auf die Untertitelspur, am ZEITLEISTENANFANG. Fasst nur Untertitel-Elemente der
angegebenen Zeitleiste im Projekt '...mit-Claude' an. Aufruf: python resolve_untertitel_neu.py "<Zeitleistenname>" "<srt-pfad>" """
import sys
from resolve_verbindung import verbinde
sys.stdout.reconfigure(encoding="utf-8")
name, srt = sys.argv[1], sys.argv[2]
resolve, projekt = verbinde()
if projekt.GetName() != "Torball-Turniere-Tutorials-mit-Claude":
    raise SystemExit("Falsches Projekt.")
t = next(projekt.GetTimelineByIndex(i) for i in range(1, projekt.GetTimelineCount() + 1) if projekt.GetTimelineByIndex(i).GetName() == name)
projekt.SetCurrentTimeline(t)
start = t.GetStartFrame()
alt = t.GetItemListInTrack("subtitle", 1) or []
print("vorhandene Untertitel-Elemente:", len(alt))
if alt:
    print("geloescht:", t.DeleteClips(alt))
mp = projekt.GetMediaPool()
clip = next((c for c in mp.GetCurrentFolder().GetClipList() if c.GetClipProperty("File Path") == srt.replace("/", "\\")), None)
if clip is None:
    raise SystemExit("SRT-Clip im aktuellen Media-Pool-Ordner nicht gefunden.")
for variante in ({"recordFrame": start, "trackIndex": 1, "mediaType": 1}, {"recordFrame": start, "trackIndex": 1}):
    r = mp.AppendToTimeline([{"mediaPoolItem": clip, **variante}])
    items = t.GetItemListInTrack("subtitle", 1) or []
    print(variante, "->", bool(r), "Elemente", len(items), "erstes Start", items[0].GetStart() if items else None, "(Soll", start, ")")
    if items and items[0].GetStart() == start:
        break
    if items:
        t.DeleteClips(items)
