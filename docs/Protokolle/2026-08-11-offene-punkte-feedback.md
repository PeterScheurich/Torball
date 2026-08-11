# 2026-08-11 – Offene Punkte aus Nutzer-Feedback (Weg zur Beta)

Sammlung aller Wünsche/Funde aus einer umfangreichen Feedback-Runde, die
**nicht** sofort in der laufenden Hilfe-Textrunde umgesetzt wurden. Gruppiert
nach Art und grob priorisiert. Erledigte Hilfe-Textänderungen siehe Commit
„Hilfe: Feedback-Runde eingearbeitet".

## A. Bestätigt sofort behebbar / kleine Features (vor Beta)

1. **QR-Code auf der öffentlichen Turnierseite selbst anzeigen** – damit man ihn
   z. B. auf einem Bildschirm zeigt und mit dem Handy abscannt.
   (`OeffentlicheTurnierseitePage.tsx`, `QrCode.tsx` existiert bereits.)
2. **Ergebnis-Erfassung – Lösch-/Zurücknehmen-Button:** Wenn der Hinweis kommt,
   dass bereits ein Ergebnis eingetragen ist, einen Button ergänzen, der das eben
   erfasste **eigene** Ergebnis wieder löscht. Sinnvolle Benennung statt „Reset".
3. **Pflichtfelder in Eingabemasken kennzeichnen** (querschnittlich, alle Formulare).
4. **Kontextbezogene Hilfe** auf öffentlicher Seite und externer Ergebniserfassung:
   dort NICHT die globale `/hilfe` anbieten, sondern nur kontextbezogene Hilfe.
   Pragmatischer Ansatz (vom Nutzer freigestellt): „Hilfe"-Menüeintrag auf diesen
   Seiten ausblenden (wie „Stammdaten" ohne Login) und stattdessen einen eigenen
   kontextbezogenen Hilfe-Button anzeigen.

## B. Größere Features (vor Beta einplanen)

5. **Turnier-Freigabe-UI:** Ein selbst erstelltes Turnier für andere Benutzer
   freigeben. Datenmodell/Route existieren teils (`TurnierBerechtigung`,
   `routes/turnierBerechtigung.ts`), die Bedien-Oberfläche fehlt.
6. **Admin kann 2FA eines Benutzers deaktivieren.** Hintergrund: Geht einem
   Benutzer die Authenticator-App verloren, ist er ausgesperrt; „neu anlegen +
   Turniere neu zuordnen" ist zu aufwändig. Daher soll ein Admin die 2FA eines
   Benutzers deaktivieren können (die Selbst-Service-2FA-Deaktivierung verlangt
   heute das eigene Passwort – die Admin-Variante ist ein separater Weg). Bis das
   umgesetzt ist, weist die Hilfe („Anmelden") auf die aktuelle Einschränkung hin.
7. **Assistent um Schiedsrichter-Schritt erweitern:** Im Anlege-Assistenten
   abfragen, ob eine Schiedsrichter-Planung genutzt werden soll. Wenn ja, direkt
   nach den Mannschaften auch die Schiedsrichter im Assistenten erfassen.
8. **Sofort-Speichern der Ergebnisse (Entscheidung offen):** Vorschlag, ein
   Ergebnis unmittelbar zu speichern, sobald **beide** Werte (Tore A UND Tore B)
   eingegeben sind – analog zu anderen Stellen der App – und den expliziten
   Speichern-Button einzusparen. Nutzer „am Überlegen"; vor Umsetzung entscheiden.
   Betrifft `ErgebnisVerwaltung.tsx`, `ErgebnisErfassungPage.tsx`,
   `useErgebnisEingaben.ts`. Wechselwirkung mit Punkt 2 (Lösch-Button) beachten.

## C. Bugs / UX vor Veröffentlichung

9. **Marke „Torball Turniere" führt zur Anmeldung:** Auf der öffentlichen Seite
   und der externen Ergebniserfassung führt ein Klick auf „Torball Turniere"
   (Logo/Marke oben links) zur Anmeldemaske. Für nicht angemeldete Besucher
   unerwünscht. Hängt am generellen Startseiten-/Header-Konzept – **Startseite
   ohnehin vor Veröffentlichung überarbeiten.** Vom Nutzer ausdrücklich als
   offener Punkt vor Veröffentlichung markiert.

## D. Spätere Verbesserungen (nach Beta ok)

10. **Spielplan-Vergleich:** Beim Erzeugen eines neuen Vorschlags eine
    Vergleichsmöglichkeit zwischen dem bereits vorhandenen Spielplan und dem neuen
    Vorschlag anbieten (statt nur „übernehmen/verwerfen").

## E. Offene Rückfragen (vor dem Versions-Build klären)

11. **„A n. a." / „B n. a." Beschriftung:** In der Ergebnis-Erfassung sind diese
    Kürzel nicht selbsterklärend (die Hilfe erklärt sie jetzt). Vor dem Build den
    Nutzer fragen, ob ihm eine bessere Beschriftung/Lösung eingefallen ist.
12. **Offline-/Lokal-Turnier:** Die Hilfe („Erste Schritte") sagt jetzt zu, dass
    ein „schnelles" Turnier bei lokaler Installation ohne Serververbindung möglich
    ist. Bestätigen, dass das eine tatsächlich verfügbare Funktion ist (nicht nur
    geplant), sonst Text anpassen.

## F. Doku-Aufgaben (in Arbeit / als Nächstes)

13. **README.md im Repo-Wurzelverzeichnis** neu/aktuell erstellen (sobald die Hilfe
    inhaltlich steht).
14. **`docs/Archiv/` aus der Git-Verwaltung nehmen** (`git rm -r --cached`, Dateien
    auf der Platte behalten) und in `.gitignore` aufnehmen.
15. **`docs/README.md` aktualisieren** (veraltet).

## Bereits geklärt

- **Session-Cross-Browser:** endgültig als Fehlalarm bestätigt – ein geschützter
  Admin-Link führte in einem fremden Browser (Edge) korrekt sofort zur Anmeldung.
  Der frühere „funktioniert ohne Login"-Effekt war ein bewusst öffentlicher
  Token-/Link. Secure-Cookie-Flag ist bereits umgebungsgesteuert gefixt.
