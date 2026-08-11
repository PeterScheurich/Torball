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

## Nachtrag: Schreibschutz + Abschluss-Vorbedingung (später am 2026-08-11)

**Abgeschlossenes Turnier ist inhaltlich schreibgeschützt.** Solange der Status
`abgeschlossen` (oder `archiviert`) ist, lehnt das Backend Inhaltsänderungen mit **HTTP 409**
ab (Mannschaften, Spieler, Schiedsrichter, Spielplan, Ergebnisse, Turnier-Grunddaten). Zum
Bearbeiten muss erst „Wieder öffnen" gedrückt werden (Status → `aktiv`). Zentral über den
Helfer `turnierGesperrt()` + `TURNIER_GESPERRT_FEHLER` (`backend/src/auth/turnierZugriff.ts`),
angewandt an den Schreib-Pfaden der Routen (`turnier`, `mannschaft`, `spieler`, `schiedsrichter`,
`spiel`, `spielplan`, `ergebnis`).

**Bewusst NICHT gesperrt (Nutzer-Entscheidung):** die **Öffentlich-Freigabe** (die vier
`oeffentlich*`-Flags + `spielernamenOeffentlich`) und das **Teilen** (Leserechte vergeben,
`turnierBerechtigung`). Begründung: Ergebnisse werden oft erst *nach* dem Abschließen
veröffentlicht/geteilt – dafür soll man das Turnier nicht extra wieder öffnen müssen. Umsetzung:
`PUT /turniere/:id` erlaubt bei gesperrtem Turnier nur eine Whitelist von Veröffentlichungs-
Feldern, alles andere → 409.

**Vorbedingung fürs Abschließen.** `POST /turniere/:id/abschliessen` prüft jetzt: **jedes Spiel
muss ein erfasstes Ergebnis haben** (kein „offenes"/`geplant`-Spiel). Sonst 409 mit Anzahl.
Beim Abschließen werden alle noch nicht finalisierten Ergebnisse (`beendet` = „Erfasst") auf
`abgeschlossen` („Fertig") gesetzt – ein abgeschlossenes Turnier ist damit immer ein
konsistenter Endstand. Das Frontend (`TurnierVerwaltenPage`) prüft vorab, blockiert mit klarer
Meldung, wenn Ergebnisse fehlen, und fragt bei noch nicht finalisierten Ergebnissen nach, ob
alle auf „Fertig" gesetzt werden sollen. Ein Hinweis-Banner signalisiert den gesperrten Zustand.

**Berechtigung** (unverändert): Abschließen/Wiederöffnen verlangen Schreibzugriff (= Admin,
Manager-Ersteller oder `turnierleitung`/`spielleitung`-Berechtigung), erfüllt damit die Vorgabe
„nur Turnierleitung/Verwalter" für nicht rein lokale Turniere. Der lokal-erstellte Sonderfall
(Codes statt Konten) ist noch nicht gebaut (siehe lokaler Offline-Betrieb).

Backend-Enforcement + Frontend-Verhalten im Browser end-to-end geprüft (Abschließen blockiert
bei fehlenden Ergebnissen; Inhaltsänderung am abgeschlossenen Turnier 409; Freigabe erlaubt;
Banner sichtbar).

## Offener Folgepunkt

Die **Spezifikation Abschnitt 10.3** (Statustabelle + „nur durch Admin") ist noch nicht auf
den neuen `abgeschlossen`-Status und die Turnierleitungs-Berechtigung angepasst – bewusst
offen gelassen, bis mit dem Nutzer abgestimmt (die Spez ist die verbindliche Referenz).
