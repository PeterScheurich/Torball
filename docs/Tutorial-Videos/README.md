# Tutorial-Videos — Skripte

Skripte für eine YouTube-Tutorialserie zu Torball-Turniere. Ziel: kurze Videos (3–5 Minuten),
ein Funktionsbereich pro Video, durchgängig so beschrieben, dass sie auch ohne Bild (Screenreader,
Audio-Beschreibung) verständlich sind — passend zur Barrierefreiheits-Ausrichtung der App selbst.

Diese Dateien sind **Sprech-/Drehskripte** für die Videoproduktion, keine Anwender-Dokumentation
wie die übrigen Dateien unter `docs/` — deshalb im eigenen Unterordner und bewusst außerhalb des
automatischen BookStack-Abgleichs (`scripts/bookstack-push.mjs` liest nur die Markdown-Dateien
direkt unter `docs/`, nicht rekursiv aus Unterordnern).

**Zum Lesen während der Aufnahme:** Fließtext in kleiner Schrift ist zum Ablesen unpraktisch. Bei
Bedarf einfach fragen — die Skripte lassen sich auch als große, gut lesbare Webseite (Artifact)
aufbereiten.

## Der Baukasten

Jedes Skript folgt derselben Struktur:

| Teil | Inhalt |
|---|---|
| Intro (~15–20 Sek.) | Begrüßung, Videotitel, wer/was, bei Serie „Teil X von Y". |
| Ausgangspunkt (1 Satz) | Wo befinden wir uns genau (Seite + Menüpunkt) — Verortung in Worten, nicht nur im Bild. |
| Schritte | Je Schritt: Ziel (1 Satz) → Element (exakte Beschriftung nennen) → Handlung → Ergebnis (als Text beschreibbar). Stolperfallen nur wenn wirklich relevant. |
| Outro (~10–15 Sek.) | Zusammenfassung, Verweis aufs nächste Video/die Hilfeseite, Feedback-Hinweis. |

### Sprechregeln (durchgängig)

- Nie „hier"/„dort" allein — immer die Beschriftung des Elements nennen.
- Reihenfolge einhalten, wie ein Screenreader die Seite vorlesen würde, nicht optisch springen.
- Farbe nie als einziges Merkmal („der grüne Button" → „der grüne Button mit der Beschriftung
  ‚Speichern'").
- Nach jeder Aktion kurz das Ergebnis bestätigen, bevor es weitergeht.
- Fachbegriffe beim ersten Vorkommen kurz erklären.
- Ruhiges Tempo, kleine Pause zwischen den Schritten (erleichtert später den Schnitt).

## Die Serie

1. [Einführung](01-einfuehrung.md) — was ist Torball-Turniere, wer kommt wie rein.
2. [Turnier anlegen](02-turnier-anlegen.md) — Grunddaten + Regeln.
3. [Mannschaften & Kader erfassen](03-mannschaften-kader.md)
4. [Schiedsrichter verwalten](04-schiedsrichter.md) — nur bei aktivierter Schiedsrichterplanung.
5. [Spielplan erzeugen und anpassen](05-spielplan.md)
6. [Ergebnisse erfassen](06-ergebnisse.md) — intern und über den externen Erfassungslink.
7. [Turnier abschließen, öffentliche Seite, Ausdrucke](07-abschliessen-oeffentlich.md)
8. [Für Zuschauer:innen](08-zuschauer-oeffentliche-seite.md) *(optional)* — die öffentliche
   Turnierseite ohne Anmeldung.
9. [Turnier-Codes / Lokales Netzwerk](09-turnier-codes.md) *(optional)* — nur relevant, wenn diese
   Betriebsart genutzt wird.

## Später: Einbindung in die App

Sobald Videos existieren, lassen sich Links in `frontend/src/hilfe/inhalte.ts` ergänzen (bestehende
Struktur: Kurztext → aufklappbarer Abschnitt → „Mehr Infos") — eigener kleiner Schritt für später.
