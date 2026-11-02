"""Baut in Resolve die ZEITLEISTE eines Videos: Bildaufnahme (Playwright-WebM) auf V1, die Saetze (Sprache) auf A1 an den Stellen aus
plan.json, ein Marker je Satz und - wenn moeglich - die Untertitel (SRT). Arbeitet NUR im Projekt '...mit-Claude'.
Aufruf: python resolve_zeitleiste_video.py "<ordner mit plan.json>" "<Zeitleistenname>" """
import json
import os
import sys

from resolve_verbindung import verbinde

sys.stdout.reconfigure(encoding="utf-8")
ERLAUBTES_PROJEKT = "Torball-Turniere-Tutorials-mit-Claude"
FPS = 24

ordner, name = sys.argv[1], sys.argv[2]
plan = json.load(open(os.path.join(ordner, "plan.json"), encoding="utf-8"))
aufnahme = json.load(open(os.path.join(ordner, "Aufnahme", "aufnahme.json"), encoding="utf-8"))
srt = next((os.path.join(ordner, f) for f in os.listdir(ordner) if f.endswith(".srt")), None)

resolve, projekt = verbinde()
if projekt.GetName() != ERLAUBTES_PROJEKT:
    raise SystemExit(f"Abbruch: geoeffnet ist '{projekt.GetName()}', erlaubt ist nur '{ERLAUBTES_PROJEKT}'.")
mp = projekt.GetMediaPool()
wurzel = mp.GetRootFolder()


def unterordner(eltern, n):
    return next((f for f in eltern.GetSubFolderList() if f.GetName() == n), None) or mp.AddSubFolder(eltern, n)


video_ordner = unterordner(wurzel, "02 Neu (Claude)")
saetze_ordner = unterordner(video_ordner, "Saetze")
bild_ordner = unterordner(video_ordner, "Bild")

if any(projekt.GetTimelineByIndex(i).GetName() == name for i in range(1, projekt.GetTimelineCount() + 1)):
    raise SystemExit(f"Die Zeitleiste '{name}' gibt es schon.")

# Medien IMMER frisch importieren: Wird eine Datei neu erzeugt (neue Aufnahme, neu gesprochener Satz), behaelt Resolve sonst die
# Daten der alten Fassung (falsche Dauer, "Media Offline"). Die beiden Ordner enthalten nur Importe dieses Skripts.
for ordner_alt in (saetze_ordner, bild_ordner):
    alte = ordner_alt.GetClipList() or []
    if alte:
        print(f"Alte Clips in '{ordner_alt.GetName()}' entfernt:", mp.DeleteClips(alte))

mp.SetCurrentFolder(saetze_ordner)
satz_clips = {}
for c in mp.ImportMedia([s["datei"].replace("/", "\\") for s in plan["saetze"]]) or []:
    satz_clips[c.GetClipProperty("File Path")] = c
fehlend = [s["id"] for s in plan["saetze"] if s["datei"].replace("/", "\\") not in satz_clips]
if fehlend:
    raise SystemExit(f"Diese Satz-Dateien konnten nicht importiert werden: {fehlend}")

mp.SetCurrentFolder(bild_ordner)
bild_pfad = aufnahme["datei"]
importiert = mp.ImportMedia([bild_pfad])
bild = importiert[0] if importiert else None
if bild is None:
    raise SystemExit("Das Bild konnte nicht importiert werden.")
print("Bild-Clip:", bild.GetName(), "Dauer", bild.GetClipProperty("Duration"), "FPS", bild.GetClipProperty("FPS"))

mp.SetCurrentFolder(video_ordner)
zeitleiste = mp.CreateEmptyTimeline(name)
if zeitleiste is None:
    raise SystemExit("Die Zeitleiste konnte nicht angelegt werden.")
projekt.SetCurrentTimeline(zeitleiste)
start = zeitleiste.GetStartFrame()

# Untertitel ZUERST: Resolve haengt eine Untertitelspur ans Ende der bereits belegten Zeitleiste an und ignoriert recordFrame.
# Nur auf der noch leeren Zeitleiste landen sie am Anfang. Bild und Ton danach beachten recordFrame.
if srt:
    mp.SetCurrentFolder(video_ordner)
    # Eine schon importierte SRT wuerde Resolve unveraendert weiterverwenden (veralteter Stand) - deshalb zuerst entfernen
    alte = [c for c in video_ordner.GetClipList() if os.path.normcase(c.GetClipProperty("File Path") or "") == os.path.normcase(os.path.normpath(srt))]
    if alte:
        print("alte SRT im Media Pool entfernt:", mp.DeleteClips(alte))
    t = mp.ImportMedia([srt])
    print("SRT importiert:", bool(t))
    if t:
        zeitleiste.AddTrack("subtitle")
        r = mp.AppendToTimeline([{"mediaPoolItem": t[0], "trackIndex": 1, "recordFrame": start}])
        print("SRT auf Zeitleiste:", bool(r))

# Bild: nur die Bildspur (mediaType 1), ab Frame 0 der Aufnahme
ok = mp.AppendToTimeline([{"mediaPoolItem": bild, "mediaType": 1, "trackIndex": 1, "recordFrame": start}])
print("Bild gelegt:", bool(ok))

auftraege = []
for s in plan["saetze"]:
    clip = satz_clips[s["datei"].replace("/", "\\")]
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
print("Saetze gelegt:", len(ergebnis) if ergebnis else ergebnis, "von", len(auftraege))

for s in plan["saetze"]:
    zeitleiste.AddMarker(int(round(s["sprechStart"] * FPS)), "Blue" if s["art"] == "satz" else "Green", s["id"], s["text"], 1)

print("Spuren: Video", zeitleiste.GetTrackCount("video"), "Audio", zeitleiste.GetTrackCount("audio"), "Untertitel", zeitleiste.GetTrackCount("subtitle"))
for art in ("video", "audio", "subtitle"):
    for i in range(1, zeitleiste.GetTrackCount(art) + 1):
        print(f"  {art} {i}: {len(zeitleiste.GetItemListInTrack(art, i) or [])} Elemente")
print(f"Zeitleiste '{name}' fertig.")
