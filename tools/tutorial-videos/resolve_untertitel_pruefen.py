"""Liest (nur) die Untertitelspur der aktuellen Zeitleiste: Start der ersten Zeilen im Vergleich zu Video und Ton."""
import sys
from resolve_verbindung import verbinde
sys.stdout.reconfigure(encoding="utf-8")
resolve, projekt = verbinde()
t = projekt.GetCurrentTimeline()
print("Zeitleiste:", t.GetName(), "Start", t.GetStartFrame(), "Ende", t.GetEndFrame())
for art in ("video", "audio", "subtitle"):
    for i in range(1, t.GetTrackCount(art) + 1):
        items = t.GetItemListInTrack(art, i) or []
        if items:
            print(art, i, len(items), "erstes Start/Ende:", items[0].GetStart(), items[0].GetEnd(), "letztes:", items[-1].GetStart(), items[-1].GetEnd())
