# Konfigurierbare Video-URLs statt fest verdrahteter Links

**Datum:** 17.08.2026

## Ausgangslage

Das Einführungsvideo auf der öffentlichen Gäste-Startseite war als YouTube-Link fest im Code
hinterlegt – ein Tippfehler in genau diesem Link war der konkrete Auslöser, die Verwaltung der
Video-Adressen aus dem Code zu holen (Nutzer-Vorgabe).

## Entscheidung

`Systemeinstellungen.videos?: VideoEintrag[]` (`{schluessel, url}`) – ein generisches Array am
bestehenden Systemeinstellungen-Singleton, keine eigene Entität. Die **bekannten
Einbindungsstellen** definiert `frontend/src/videoSlots.ts` (aktuell nur
`VIDEO_SLOT_STARTSEITE_INTRO`, mit Label + Beschreibung fürs Admin-Formular): eine neue
Einbindungsstelle braucht nur einen neuen Eintrag dort (erscheint automatisch als Zeile unter
„Admin → Systemeinstellungen → Video-URLs") und eine UI-Stelle, die ihre URL per `schluessel`
nachschlägt – keine Schema-Änderung nötig.

## Wichtige Umsetzungsdetails

- `GET /systemeinstellungen/videos` ist bewusst **öffentlich** (kein Login), anders als die sonst
  admin-only `GET /systemeinstellungen` – URLs sind nicht sensibel, werden aber auf öffentlichen
  Seiten (Gäste-Startseite) gebraucht.
- `frontend/src/youtube.ts::youtubeEmbedUrl()` wandelt beliebige YouTube-URL-Formen
  (`youtu.be/…`, `youtube.com/watch?v=…`) in eine **`youtube-nocookie.com`**-Embed-URL um
  (setzt erst bei tatsächlicher Wiedergabe Tracking-Cookies). Bei nicht erkannter URL liefert
  sie `undefined` – der Video-Slot wird dann einfach nicht gerendert statt eine kaputte
  Einbettung zu zeigen.
- Nebenbefund gefixt: das Systemeinstellungen-Formular war bisher vom globalen
  `form { max-width: 420px }` zusammengequetscht (gleiche Falle wie zuvor beim
  Kanban-Detail-Dialog) – Formular verbreitert.
