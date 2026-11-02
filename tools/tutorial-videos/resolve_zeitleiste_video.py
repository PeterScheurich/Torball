"""Baut in Resolve die ZEITLEISTE eines Videos aus plan.json (Sprache), Aufnahme/aufnahme.json (Bild) und aufbau.json (Intro, Kapitelueberschriften,
Outro): Bild auf V1, Intro/Titel/Outro auf V2 (das Intro ueberlappt am Ende mit dem Video), Saetze auf A1, Untertitel auf der Untertitelspur, Marker je Satz.
Arbeitet NUR im Projekt '...mit-Claude' und fasst nur eigene Objekte an: Jeder Bau bekommt einen eigenen Media-Pool-Ordner (mit KOPIEN der Dateien),
fruehere Zeitleisten bleiben dadurch unberuehrt (auch mit Anmerkungen). Aufruf: python resolve_zeitleiste_video.py "<Ordner>" "<Zeitleistenname>" """
import json
import os
import re
import shutil
import sys

from resolve_verbindung import verbinde

sys.stdout.reconfigure(encoding="utf-8")
ERLAUBTES_PROJEKT = "Torball-Turniere-Tutorials-mit-Claude"
FPS = 24
HIER = os.path.dirname(os.path.abspath(__file__))

ordner, name = sys.argv[1], sys.argv[2]
plan = json.load(open(os.path.join(ordner, "plan.json"), encoding="utf-8"))
aufnahme = json.load(open(os.path.join(ordner, "Aufnahme", "aufnahme.json"), encoding="utf-8"))
aufbau_pfad = os.path.join(ordner, "aufbau.json")
aufbau = json.load(open(aufbau_pfad, encoding="utf-8")) if os.path.exists(aufbau_pfad) else {}
saetze = plan["saetze"]
nr = {s["id"]: i for i, s in enumerate(saetze)}


def fr(sek):
    return int(round(sek * FPS))


def frames_aus(dauer):
    h, m, s, f = [int(x) for x in dauer.split(":")]
    return ((h * 60 + m) * 60 + s) * FPS + f


resolve, projekt = verbinde()
if projekt.GetName() != ERLAUBTES_PROJEKT:
    raise SystemExit(f"Abbruch: geoeffnet ist '{projekt.GetName()}', erlaubt ist nur '{ERLAUBTES_PROJEKT}'.")
mp = projekt.GetMediaPool()
wurzel = mp.GetRootFolder()


def unterordner(eltern, n):
    return next((f for f in eltern.GetSubFolderList() if f.GetName() == n), None) or mp.AddSubFolder(eltern, n)


if any(projekt.GetTimelineByIndex(i).GetName() == name for i in range(1, projekt.GetTimelineCount() + 1)):
    raise SystemExit(f"Die Zeitleiste '{name}' gibt es schon.")

# ---- Dateien dieses Baus kopieren (eigener Ordner, damit nichts Bestehendes ueberschrieben oder veraltet wiederverwendet wird)
sicher = re.sub(r"[^A-Za-z0-9._ -]", "_", name)
bau_ordner = os.path.join(ordner, "Zeitleisten", sicher)
os.makedirs(bau_ordner, exist_ok=True)
bild_pfad = os.path.join(bau_ordner, "Bild.webm")
shutil.copy2(aufnahme["datei"], bild_pfad)
wav = {}
for s in saetze:
    ziel = os.path.join(bau_ordner, s["id"] + ".wav")
    quelle = s["datei"].replace(".mp3", ".wav")  # Resolve dekodiert manche mp3-Dateien nicht bis zum Ende, WAV schon (siehe mp3-zu-wav.mjs)
    if not os.path.exists(quelle):
        raise SystemExit(f"{quelle} fehlt - erst node mp3-zu-wav.mjs ausfuehren.")
    shutil.copy2(quelle, ziel)
    wav[s["id"]] = ziel

video_ordner = unterordner(wurzel, "02 Neu (Claude)")
bau = unterordner(video_ordner, sicher)
mp.SetCurrentFolder(bau)
alle = mp.ImportMedia([bild_pfad] + [wav[s["id"]] for s in saetze]) or []
clips = {os.path.normcase(c.GetClipProperty("File Path")): c for c in alle}
bild = clips.get(os.path.normcase(bild_pfad))
fehlt = [s["id"] for s in saetze if os.path.normcase(wav[s["id"]]) not in clips]
if bild is None or fehlt:
    raise SystemExit(f"Nicht alle Dateien liessen sich importieren (Bild: {bild is not None}, Saetze: {fehlt}).")
bild_frames = frames_aus(bild.GetClipProperty("Duration"))
print("Bild:", bild.GetClipProperty("Duration"), "| Saetze:", len(saetze))


# ---- Intro und Outro (vorhandene Zeitleisten des Projekts) finden
def finde_zeitleiste_clip(n):
    def suche(ordner_):
        for c in ordner_.GetClipList() or []:
            if c.GetName() == n and c.GetClipProperty("Type") == "Timeline":
                return c
        for u in ordner_.GetSubFolderList() or []:
            r = suche(u)
            if r:
                return r
        return None

    return suche(wurzel)


intro_clip = finde_zeitleiste_clip("Intro") if aufbau.get("intro") else None
outro_clip = finde_zeitleiste_clip("Outro") if aufbau.get("outro") else None
intro_sek = frames_aus(intro_clip.GetClipProperty("Duration")) / FPS if intro_clip else 0
outro_sek = frames_aus(outro_clip.GetClipProperty("Duration")) / FPS if outro_clip else 0

# ---- Zeitplan: ab dem Intro verschieben sich alle spaeteren Zeiten um `versatz`
versatz, N = 0.0, float("inf")
T = None  # Beginn des Intros
if intro_clip:
    a = aufbau["intro"]
    i = nr[a["nach"]]
    T = saetze[i]["sprechEnde"] + a["abstand"]
    N = saetze[i + 1]["sprechStart"]
    versatz = (T + intro_sek + a["nachlauf"]) - N


def neu(t):
    """Zeit auf der Zeitleiste fuer eine Zeit des urspruenglichen Plans."""
    return t + versatz if t >= N - 1e-6 else t


ende_text = neu(saetze[-1]["sprechEnde"])
outro_start = ende_text + aufbau["outro"]["abstand"] if outro_clip else None
if intro_clip:
    print(f"Intro bei {T:.2f} s ({intro_sek:.2f} s lang), alles danach {versatz:+.2f} s verschoben")
if outro_clip:
    print(f"Outro bei {outro_start:.2f} s ({outro_sek:.2f} s lang)")

# ---- Kapitelueberschriften: je eine kleine Zeitleiste mit Text+ (wird spaeter auf V2 gelegt)
titel_clips = []
vorlage = os.path.join(HIER, "vorlagen", "titel-kapitel.comp")
for t_ in aufbau.get("titel", []):
    mp.SetCurrentFolder(bau)
    tt = mp.CreateEmptyTimeline(f"Titel {t_['text']} ({sicher})")
    projekt.SetCurrentTimeline(tt)
    tt.SetCurrentTimecode("01:00:00:00")
    item = tt.InsertFusionTitleIntoTimeline("Text+")
    if item is None:
        raise SystemExit("Der Titel konnte nicht eingefuegt werden.")
    item.ImportFusionComp(vorlage)
    comp = item.GetFusionCompByIndex(item.GetFusionCompCount())
    werkzeug = comp.FindToolByID("TextPlus") or next(iter(comp.GetToolList(False).values()))
    werkzeug.SetInput("StyledText", t_["text"])
    clip = next((c for c in bau.GetClipList() if c.GetName() == f"Titel {t_['text']} ({sicher})"), None)
    titel_clips.append((t_, clip))
    print(f"Titel '{t_['text']}':", "ok" if clip else "NICHT GEFUNDEN")

# ---- Hauptzeitleiste
mp.SetCurrentFolder(video_ordner)
zeitleiste = mp.CreateEmptyTimeline(name)
if zeitleiste is None:
    raise SystemExit("Die Zeitleiste konnte nicht angelegt werden.")
projekt.SetCurrentTimeline(zeitleiste)
start = zeitleiste.GetStartFrame()


def srt_zeit(sek):
    ms = int(round(sek * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


# Untertitel ZUERST (Resolve haengt eine Untertitelspur ans Ende der belegten Zeitleiste und ignoriert recordFrame) - mit den verschobenen Zeiten
srt_pfad = os.path.join(bau_ordner, "Untertitel de.srt")
with open(srt_pfad, "w", encoding="utf-8") as f:
    for k, z in enumerate(plan["zeilen"], 1):
        f.write(f"{k}\n{srt_zeit(neu(z['start']))} --> {srt_zeit(neu(z['ende']))}\n{z['text']}\n\n")
mp.SetCurrentFolder(bau)
srt = mp.ImportMedia([srt_pfad])
mp.SetCurrentFolder(video_ordner)
if srt:
    zeitleiste.AddTrack("subtitle")
    mp.AppendToTimeline([{"mediaPoolItem": srt[0], "trackIndex": 1, "recordFrame": start}])

zeitleiste.AddTrack("video")  # V2: Intro, Titel, Outro
zeitleiste.AddTrack("audio")  # A2: Ton von Intro und Outro

# Bild (V1): vor dem Intro bis T, danach ab dem durchsichtigen Teil des Intros
if intro_clip:
    schwanz = T + intro_sek - aufbau["intro"]["ueberlappung"]  # ab hier ist das Intro durchsichtig, das Video muss schon laufen
    bild_ende = outro_start + aufbau["outro"]["videoNachlauf"] if outro_clip else bild_frames / FPS + versatz
    teil1 = {"mediaPoolItem": bild, "mediaType": 1, "trackIndex": 1, "startFrame": 0, "endFrame": fr(T), "recordFrame": start}
    teil2 = {"mediaPoolItem": bild, "mediaType": 1, "trackIndex": 1, "startFrame": fr(schwanz - versatz),
             "endFrame": min(bild_frames, fr(bild_ende - versatz)), "recordFrame": start + fr(schwanz)}
    print("Bild gelegt:", bool(mp.AppendToTimeline([teil1])), bool(mp.AppendToTimeline([teil2])))
else:
    print("Bild gelegt:", bool(mp.AppendToTimeline([{"mediaPoolItem": bild, "mediaType": 1, "trackIndex": 1, "recordFrame": start}])))

# Intro, Titel, Outro (V2/A2). Start- und Endbild muessen bei verschachtelten Zeitleisten ausdruecklich angegeben werden - sonst legt Resolve
# manche (z. B. das Outro) nur mit einem einzigen Bild ab.
def verschachtelt(clip, typ, spur, bei):
    return {"mediaPoolItem": clip, "mediaType": typ, "trackIndex": spur, "startFrame": 0,
            "endFrame": frames_aus(clip.GetClipProperty("Duration")), "recordFrame": start + fr(bei)}


if intro_clip:
    r1 = mp.AppendToTimeline([verschachtelt(intro_clip, 1, 2, T)])
    r2 = mp.AppendToTimeline([verschachtelt(intro_clip, 2, 2, T)])
    print("Intro gelegt:", bool(r1), bool(r2))
for t_, clip in titel_clips:
    s = saetze[nr[t_["bei"]]]
    bei = neu(s["sprechStart"]) - aufbau.get("titelVorlauf", 0.15)
    r = mp.AppendToTimeline([verschachtelt(clip, 1, 2, bei)])
    print(f"Titel '{t_['text']}' bei {bei:.2f} s:", bool(r))
if outro_clip:
    r1 = mp.AppendToTimeline([verschachtelt(outro_clip, 1, 2, outro_start)])
    r2 = mp.AppendToTimeline([verschachtelt(outro_clip, 2, 2, outro_start)])
    print("Outro gelegt:", bool(r1), bool(r2))

# Saetze (A1)
auftraege = []
for s in saetze:
    clip = clips[os.path.normcase(wav[s["id"]])]
    legen_bei = neu(s["sprechStart"]) - (0.05 if s["quelleVon"] > 0 else 0)
    clip_frames = frames_aus(clip.GetClipProperty("Duration"))
    auftraege.append({
        "mediaPoolItem": clip, "startFrame": fr(s["quelleVon"]), "endFrame": min(clip_frames, fr(s["quelleBis"])),
        "mediaType": 2, "trackIndex": 1, "recordFrame": start + fr(max(0, legen_bei)),
    })
ergebnis = mp.AppendToTimeline(auftraege)
print("Saetze gelegt:", len(ergebnis) if ergebnis else ergebnis, "von", len(auftraege))

for s in saetze:
    zeitleiste.AddMarker(fr(neu(s["sprechStart"])), "Cream" if s["art"] == "satz" else "Mint", s["id"], s["text"], 1)
if intro_clip:
    zeitleiste.AddMarker(fr(T), "Cream", "Intro", "Beginn des Intros", 1)
if outro_clip:
    zeitleiste.AddMarker(fr(outro_start), "Cream", "Outro", "Beginn des Outros", 1)

print("Spuren: Video", zeitleiste.GetTrackCount("video"), "Audio", zeitleiste.GetTrackCount("audio"), "Untertitel", zeitleiste.GetTrackCount("subtitle"))
for art in ("video", "audio", "subtitle"):
    for k in range(1, zeitleiste.GetTrackCount(art) + 1):
        items = zeitleiste.GetItemListInTrack(art, k) or []
        if art == "subtitle" or len(items) > 6:
            print(f"  {art} {k}: {len(items)} Elemente")
        else:
            for it in items:
                print(f"  {art} {k}: {(it.GetStart() - start) / FPS:7.2f}-{(it.GetEnd() - start) / FPS:7.2f} s  {it.GetName()}")
print(f"Zeitleiste '{name}' fertig.")
