# 2026-08-10: Öffentliche Turnierseite (Abschnitt 13)

## Ausgangslage

Die vier Sichtbarkeits-Felder am Turnier (`oeffentlichTurnierinfos`,
`oeffentlichAnfahrtDokumente`, `oeffentlichSpielplan`, `oeffentlichErgebnisse`)
existierten bereits im Datenmodell, wurden aber nirgends gelesen oder gesetzt.
Diese Änderung baut die eigentliche öffentliche Seite dazu.

## Umgesetzt

**Backend** (neu: `backend/src/routes/oeffentlich.ts`, registriert in
`index.ts`)
- `GET /oeffentlich/turniere/:id` - kein Login (kein `requireAuth`-Aufruf,
  wie bei `ergebnisToken.ts`s öffentlichem Zweig). Die Turnier-ID selbst
  dient als Adresse; anders als beim Ergebnis-Token gibt es keinen zweiten
  Geheimwert, weil reiner Lesezugriff unkritisch ist - die eigentliche
  Freigabe steuern die vier Sichtbarkeits-Felder.
- Response: `name` immer sichtbar (auch unveröffentlicht, damit ein Link
  wenigstens den richtigen Turniernamen zeigt), die vier Sektionen einzeln
  `null`, wenn nicht freigeschaltet.
- **Entscheidung:** `mannschaften` und `felder` werden immer mitgeliefert,
  nicht hinter `oeffentlichTurnierinfos` versteckt - Spielplan/Ergebnisse
  brauchen sie zum Auflösen von `mannschaftAId`/`mannschaftBId`/`feldId`,
  auch wenn die reinen Turnierinfos separat abgeschaltet sind. Namen sind
  nicht sensibel.
- Schiedsrichter werden nie ausgeliefert (`oeffentlichesSpiel()` filtert
  `schiedsrichterId` konsequent heraus) - aktuell zwar noch nirgends
  gesetzt, aber Abschnitt 13/24.3 verlangen das explizit.

**Frontend**
- Neue Route `/turniere/:id/oeffentlich` (neu:
  `OeffentlicheTurnierseitePage.tsx`), außerhalb von `GeschuetzteRoute`.
  Reiter (Turnierinfos/Anfahrt & Dokumente/Spielplan/Ergebnisse) nur für
  freigeschaltete Sektionen, aktiver Reiter als `?tab=...` in der URL
  (gleiches Muster wie `TurnierVerwaltenPage.tsx`). Ohne freigeschaltete
  Sektion: Hinweistext statt leerer Seite.
- Kartendienst-Links (Google Maps/OpenStreetMap) im Anfahrt-Tab, gleiche
  Logik wie in der Turnier-Übersicht (Koordinaten aus dem Geo-Feld
  erkennen, sonst Namens-/Adress-Suche) - dupliziert statt geteilt, da
  `shared` keine Laufzeit-Funktionen fürs Frontend bereitstellen kann
  (siehe CLAUDE.md).
- Neue Sektion "Öffentliche Turnierseite" auf dem Übersicht-Reiter
  (`TurnierVerwaltenPage.tsx`): vier Checkboxen (sofort speichernd),
  kopierbarer Link (Zwischenablage) + Öffnen-Link.

**Nebenbei gefunden:** Die erste Checkbox der gesamten App deckte einen
CSS-Bug auf - die globale `input`-Regel (Padding/Rahmen für alle
`<input>`-Typen) hätte Checkboxen zu großen, deformierten Kästchen gemacht.
`input:not([type="checkbox"]):not([type="radio"])` jetzt sowohl in der
Standard- als auch der "schmal"-Tabellendichte-Regel.

## Verifikation

```bash
npm run build --workspace=shared
npm run build
npm run lint --workspace=frontend
npm run test --workspace=backend
```
Alle vier grün (18 Tests bestanden, 1 Integrationstest ohne `COUCHDB_*`
übersprungen).

Live gegen den echten Dev-Server und die echte CouchDB geprüft: alle vier
Sektionen einzeln über die Checkboxen freigeschaltet und in einem separaten
Browser-Tab ohne Login geöffnet (Turnierinfos, Anfahrt inkl. Kartendienst-
Links, Spielplan mit korrekt aufgelösten Mannschaftsnamen und ohne
Feld-Spalte bei nur einem Feld, Ergebnisse mit Tabelle + Spielen). Zustand
"nichts freigeschaltet" zeigt korrekt nur den Turniernamen + Hinweistext.
Nicht existierendes Turnier liefert sauber 404 statt Absturz. Danach alle
vier Checkboxen wieder auf den ursprünglichen Zustand (aus) zurückgesetzt.

Commit: `3b39113`.

## Offen

- Dokumenten-Anhänge (Abschnitt 5.1/20.13) sind weiterhin nicht umgesetzt -
  der "Anfahrt & Dokumente"-Tab zeigt daher aktuell nur die Ortsangabe,
  keine Dateiliste.
- "Spiel läuft"-Live-Hinweis ist im Code vorbereitet (Status-Mapping kennt
  `laeuft`), wird aber vom `manuell`-Protokollierungspfad nie gesetzt - erst
  mit der (bewusst zurückgestellten) digitalen Live-Protokollierung
  relevant.
