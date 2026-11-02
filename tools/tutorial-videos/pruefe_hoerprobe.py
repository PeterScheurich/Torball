import json, sys
from resolve_verbindung import verbinde
sys.stdout.reconfigure(encoding="utf-8")
resolve, projekt = verbinde()
t = projekt.GetCurrentTimeline()
plan = json.load(open("D:/Projekte/Videos/Tutorials/Torball/Neu/02 Turnier anlegen/plan.json", encoding="utf-8"))
start = t.GetStartFrame()
items = t.GetItemListInTrack("audio", 1)
print("Zeitleiste:", t.GetName(), "| Elemente:", len(items), "| Marker:", len(t.GetMarkers()))
abw = 0
for it, s in zip(items, plan["saetze"]):
    soll = round(s["sprechStart"] * 24)
    ist = it.GetStart() - start
    dauer = it.GetEnd() - it.GetStart()
    abw = max(abw, abs(ist - soll))
    print(f"  {s['id']}: Beginn Frame {ist} (soll ~{soll}), Laenge {dauer/24:.2f} s, Satz {s['sprechEnde']-s['sprechStart']:.2f} s")
print("Groesste Abweichung am Beginn (Frames):", abw)
