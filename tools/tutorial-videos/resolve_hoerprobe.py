"""Baut in Resolve eine HOERPROBE-Zeitleiste aus plan.json: alle Saetze an ihrer Stelle, mit den eingestellten Pausen, plus ein Marker
je Satz. Arbeitet NUR im Projekt '...mit-Claude'. Der Name der Zeitleiste enthaelt die Pausenwerte, damit man Varianten vergleichen kann.
Aufruf: python resolve_hoerprobe.py "<ordner mit plan.json>" """
import json
import os
import sys

from resolve_verbindung import verbinde

sys.stdout.reconfigure(encoding="utf-8")
ERLAUBTES_PROJEKT = "Torball-Turniere-Tutorials-mit-Claude"
FPS = 24

ordner = sys.argv[1]
plan = json.load(open(os.path.join(ordner, "plan.json"), encoding="utf-8"))
p = plan["pausen"]

resolve, projekt = verbinde()
if projekt.GetName() != ERLAUBTES_PROJEKT:
    raise SystemExit(f"Abbruch: geoeffnet ist '{projekt.GetName()}', erlaubt ist nur '{ERLAUBTES_PROJEKT}'.")

mp = projekt.GetMediaPool()
wurzel = mp.GetRootFolder()


def unterordner(eltern, name):
    return next((f for f in eltern.GetSubFolderList() if f.GetName() == name), None) or mp.AddSubFolder(eltern, name)


video_ordner = unterordner(wurzel, "02 Neu (Claude)")
saetze_ordner = unterordner(video_ordner, "Saetze")
mp.SetCurrentFolder(saetze_ordner)

vorhanden = {c.GetClipProperty("File Path"): c for c in saetze_ordner.GetClipList()}
neu = [s["datei"].replace("/", "\\") for s in plan["saetze"] if s["datei"].replace("/", "\\") not in vorhanden]
if neu:
    for c in mp.ImportMedia(neu) or []:
        vorhanden[c.GetClipProperty("File Path")] = c
print(f"Clips im Media Pool: {len(vorhanden)} (neu importiert: {len(neu)})")

name = f"Hoerprobe 02 (Claude) - Pausen {p['satzende']}-{p['ueberschrift']}-{p['abschnitt']}"
if any(projekt.GetTimelineByIndex(i).GetName() == name for i in range(1, projekt.GetTimelineCount() + 1)):
    raise SystemExit(f"Die Zeitleiste '{name}' gibt es schon. Pausenwerte aendern (pausen.json), --nur-plan, dann erneut.")

mp.SetCurrentFolder(video_ordner)
zeitleiste = mp.CreateEmptyTimeline(name)
if zeitleiste is None:
    raise SystemExit("Die Zeitleiste konnte nicht angelegt werden.")
projekt.SetCurrentTimeline(zeitleiste)
start = zeitleiste.GetStartFrame()

auftraege = []
for s in plan["saetze"]:
    clip = vorhanden[s["datei"].replace("/", "\\")]
    # Die Datei beginnt bei 0; wir schneiden ab quelleVon und legen den Sprechbeginn auf sprechStart.
    legen_bei = s["sprechStart"] - (0.05 if s["quelleVon"] > 0 else 0)
    auftraege.append({
        "mediaPoolItem": clip,
        "startFrame": int(round(s["quelleVon"] * FPS)),
        "endFrame": int(round(s["quelleBis"] * FPS)),
        "mediaType": 2,
        "trackIndex": 1,
        "recordFrame": start + int(round(max(0, legen_bei) * FPS)),
    })
ergebnis = mp.AppendToTimeline(auftraege)
print("Auf die Zeitleiste gelegt:", len(ergebnis) if ergebnis else ergebnis, "von", len(auftraege))

for s in plan["saetze"]:
    zeitleiste.AddMarker(int(round(s["sprechStart"] * FPS)), "Blue" if s["art"] == "satz" else "Green", s["id"], s["text"], 1)
print(f"Zeitleiste '{name}' fertig. Dauer ca. {plan['gesamtdauer']:.1f} s, {len(plan['saetze'])} Saetze.")
