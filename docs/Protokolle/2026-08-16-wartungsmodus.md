# Wartungsmodus: Ankündigung + Sperre

**Datum:** 16.08.2026

## Ausgangslage

Für geplante Wartungsarbeiten (Updates, Server-Umzüge) gab es bisher keinen Mechanismus, Nutzer
vorzuwarnen oder die App kontrolliert zu sperren – ein Deploy mitten in einer laufenden
Ergebniserfassung hätte unbemerkt Eingaben verwerfen können.

## Entscheidung

**Zwei unabhängige, manuell gesetzte Schalter statt einer Automatik** (Nutzer-Vorgabe) – keiner
schaltet den anderen um:

1. **Ankündigung** (`angekuendigtAb`/`angekuendigtBis`, beide optional): reiner Warnhinweis auf
   der Startseite (für alle, auch Gäste), solange der Beginn in der Zukunft liegt; zusätzlich ein
   dringlicherer Kurzfrist-Hinweis in der Kopfzeile für angemeldete Personen ab 15 Minuten vorher
   („bitte Arbeit abschließen, um Datenverlust zu vermeiden").
2. **Sperre** (`aktiv`): blockiert die komplette App für alle außer angemeldeten Admins –
   doppelt abgesichert im Frontend (`App.tsx` rendert nur noch `WartungPage`) **und** Backend,
   damit weder ein direkter API-Aufruf noch ein Frontend-Bug die Sperre umgeht.

Datenhaltung als Singleton-Dokument (`docType: "wartung"`), eigene Route `/wartung`, eigener
Admin-Menüpunkt „Wartungsmodus".

## Wichtige Umsetzungsdetails

- Der Backend-Teil (`backend/src/wartung.ts::wartungPreHandler`) ist als `preHandler`-Hook
  **innerhalb** `registerApiRoutes()` registriert (nicht global auf der Root-Instanz wie
  `authPreHandler`): im Einzelprozess-Modus (`SERVE_FRONTEND`) trifft die Sperre so nur die
  API-Routen, nicht das Ausliefern der statischen `frontend/dist`-Dateien – sonst könnte die
  SPA-Hülle selbst während aktiver Wartung nicht mehr laden.
- **Bewusst 403 statt 503** als Statuscode: `frontend/src/api.ts` behandelt 502/503/504 pauschal
  als „Backend nicht erreichbar" und würde die eigene Wartungs-Fehlermeldung verwerfen.
- Feste Ausnahmeliste bleibt immer erreichbar (`/wartung/status`, `/auth/login`, `/auth/logout`,
  `/auth/me` im Backend; `/login`, `/passwort-vergessen`, `/passwort-reset/:token`,
  `/ersteinrichtung` im Frontend) – sonst könnte sich während aktiver Sperre niemand mehr als
  Admin anmelden, um sie aufzuheben. `WartungPage` verlinkt deshalb explizit auf `/login`.
- Frontend pollt `GET /wartung/status` (öffentlich) alle 30 s bei sichtbarem Tab plus sofort bei
  `visibilitychange` – analog dem übrigen Live-Polling-Muster im Projekt.
