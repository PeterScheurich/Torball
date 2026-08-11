# 2026-08-11 – Turnier abschließen & Übersicht geplant/abgeschlossen

## Anlass

Nutzerwunsch: In der Turnierübersicht sollen **geplante** (inkl. laufender) von
**abgeschlossenen** Turnieren getrennt werden, und der Knopf „Neues Turnier anlegen"
soll **oberhalb** der Übersicht stehen. Das Abschließen soll ein **bewusster Schritt der
Turnierleitung** sein.

## Fachlicher Befund (Abweichung von der Spezifikation)

Die Gesamtspezifikation (Abschnitt 10.3) kennt nur drei Turnierstatus:

| Status | Beschreibung |
|---|---|
| Entwurf | In Planung |
| Aktiv | Läuft **oder abgeschlossen** |
| Archiviert | Nur Ergebnisse (Langzeit-Archiv), Übergang laut Spez „nur durch Admin" |

Damit gibt es **keinen eigenen „abgeschlossen"-Status**, und „aktiv" vermischt *läuft* und
*abgeschlossen*. Zusätzlich wurde der Status im Code bisher nie von „entwurf" weggeschaltet
(kein Lebenszyklus implementiert). Die gewünschte Trennung ließ sich also nicht sauber aus
dem bestehenden Feld ableiten.

## Entscheidung

Neuer Status **`abgeschlossen`** zwischen `aktiv` und `archiviert` eingeführt
(`shared/src/types/turnier.ts`):

- **`entwurf` + `aktiv`** → Gruppe „Geplant" (laufende Turniere gehören laut Nutzer zu den
  geplanten).
- **`abgeschlossen` + `archiviert`** → Gruppe „Abgeschlossen".

Abschließen ist **reversibel** (Wiederöffnen → `aktiv`), damit ein versehentlicher Abschluss
korrigierbar bleibt; deshalb nur eine kurze Rückfrage statt einer harten Sperre.

**„Turnierleitung"** ist im implementierten Berechtigungsmodell = **Schreibzugriff**
(`hatMindestens(..., "schreiben")`: Admin, Manager-Ersteller oder vergebene
`turnierleitung`/`spielleitung`-Berechtigung, siehe `backend/src/auth/turnierZugriff.ts`).
Das weicht bewusst von der Spez-Notiz „Archivieren nur durch Admin" ab – Abschließen ist ein
leichterer, reversibler Schritt als das (weiterhin offene) Langzeit-`archiviert`.

## Umsetzung

- `shared/src/types/turnier.ts`: `TurnierStatus` um `"abgeschlossen"` erweitert (mit Doku-Kommentar).
- `backend/src/routes/turnier.ts`: zwei schreibgeschützte Endpunkte
  `POST /turniere/:id/abschliessen` (→ `abgeschlossen`) und
  `POST /turniere/:id/wieder-oeffnen` (→ `aktiv`); Status-Enum im POST-Schema ergänzt.
- `frontend/src/api.ts`: `turnierAbschliessen` / `turnierWiederOeffnen`.
- `frontend/src/pages/TurnierListePage.tsx`: Anlegen-Knopf nach oben, Trennung in
  „Geplante" / „Abgeschlossene Turniere", lesbare Status-Labels.
- `frontend/src/pages/TurnierVerwaltenPage.tsx`: Knopf „Turnier abschließen" / „Wieder öffnen"
  in der Übersicht, lesbares Status-Label.

## Ausgeführte Prüfungen

```bash
npm run build --workspace=shared
npm run build
npm run lint --workspace=frontend
npm run test --workspace=backend
```

Alle grün (Lint nur die vorbestehende `auth.tsx`-Warnung). Zusätzlich im Browser als Admin
end-to-end verifiziert: Abschließen setzt `abgeschlossen`, Wiederöffnen `aktiv`; die Übersicht
trennt korrekt in beide Gruppen; der Knopf schaltet je nach Status zwischen „Abschließen" und
„Wieder öffnen" um.

## Offener Folgepunkt

Die **Spezifikation Abschnitt 10.3** (Statustabelle + „nur durch Admin") ist noch nicht auf
den neuen `abgeschlossen`-Status und die Turnierleitungs-Berechtigung angepasst – bewusst
offen gelassen, bis mit dem Nutzer abgestimmt (die Spez ist die verbindliche Referenz).
