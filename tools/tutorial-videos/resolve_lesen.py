"""Liest das geoeffnete Resolve-Projekt VOLLSTAENDIG NUR LESEND aus (aendert nichts)."""
import sys

from resolve_verbindung import verbinde

sys.stdout.reconfigure(encoding="utf-8")
resolve, projekt = verbinde()
print("Projekt:", projekt.GetName())
for schluessel in ("timelineResolutionWidth", "timelineResolutionHeight", "timelineFrameRate", "videoMonitoringFormat",
                   "audioCaptureNumChannels", "colorScienceMode"):
    print(f"  Einstellung {schluessel}: {projekt.GetSetting(schluessel)}")

print("Render-Voreinstellungen:", projekt.GetRenderPresetList())
print("Render-Aufgaben:", len(projekt.GetRenderJobList()))

mp = projekt.GetMediaPool()


def ordner(f, tiefe=0):
    clips = f.GetClipList()
    print("  " * tiefe + f"[{f.GetName()}] {len(clips)} Clips")
    for c in clips:
        eig = c.GetClipProperty()
        print("  " * tiefe + f"   - {eig.get('Clip Name')} | {eig.get('Type')} | {eig.get('Duration')} | {eig.get('File Path', '')}")
    for u in f.GetSubFolderList():
        ordner(u, tiefe + 1)


print("\nMedia Pool:")
ordner(mp.GetRootFolder())

print("\nZeitleisten:")
for i in range(1, projekt.GetTimelineCount() + 1):
    t = projekt.GetTimelineByIndex(i)
    print(f"{i}: {t.GetName()} | Start {t.GetStartTimecode()} Ende-Frame {t.GetEndFrame()} | "
          f"Video {t.GetTrackCount('video')} Audio {t.GetTrackCount('audio')} Untertitel {t.GetTrackCount('subtitle')}")
    for art in ("video", "audio", "subtitle"):
        for s in range(1, t.GetTrackCount(art) + 1):
            items = t.GetItemListInTrack(art, s)
            print(f"   {art} {s} ({t.GetTrackName(art, s)}): {len(items)} Elemente")
            for it in items[:12]:
                print(f"      {it.GetName()} | Start {it.GetStart()} Ende {it.GetEnd()}")
    marker = t.GetMarkers()
    print(f"   Marker: {len(marker)}", [(k, v.get('name')) for k, v in list(marker.items())[:8]])
