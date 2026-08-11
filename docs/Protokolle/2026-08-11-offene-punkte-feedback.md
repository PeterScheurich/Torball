# 2026-08-11 – Offene Punkte aus Nutzer-Feedback (Weg zur Beta)

Sammlung aller Wünsche/Funde aus einer umfangreichen Feedback-Runde, die
**nicht** sofort in der laufenden Hilfe-Textrunde umgesetzt wurden. Gruppiert
nach Art und grob priorisiert. Erledigte Hilfe-Textänderungen siehe Commit
„Hilfe: Feedback-Runde eingearbeitet".

## A. Bestätigt sofort behebbar / kleine Features (vor Beta)

1. **[ERLEDIGT 2026-08-11]** QR-Code auf der öffentlichen Turnierseite selbst
   anzeigen (aufklappbar „Seite auf dem Smartphone öffnen", ohne Download-Links).
2. **[ERLEDIGT 2026-08-11]** Konfliktfall: statt „Reset" zwei klare Buttons
   („Vorhandenes übernehmen" / „Mit meinem Wert überschreiben"). Umgesetzt im
   Zuge des Ergebnis-Erfassung-Umbaus (siehe Punkt 8).
3. **[ERLEDIGT 2026-08-11]** Pflichtfelder in Eingabemasken kennzeichnen (rotes
   Sternchen per CSS an Labels von .feld-Bloecken mit Pflicht-Eingabe, plus Legende).
4. **[ERLEDIGT 2026-08-11]** Kontextbezogene Hilfe auf öffentlicher Seite und
   externer Ergebniserfassung (neue Komponente `KontextHilfe`); globale App-Nav
   inkl. „Hilfe" für nicht angemeldete Besucher auf diesen Seiten ausgeblendet
   (minimale Kopfzeile).

## B. Größere Features (vor Beta einplanen)

5. **[ERLEDIGT 2026-08-11]** Turnier-Freigabe-UI (Komponente `TurnierFreigabe` im
   Reiter „Übersicht"): Freigaben auflisten/vergeben/entziehen über die vorhandenen
   `TurnierBerechtigung`-Routen.
6. **[ERLEDIGT 2026-08-11]** Admin kann 2FA eines Benutzers deaktivieren (admin-only
   Route `POST /benutzer/:id/2fa/deaktivieren` + Button in der Benutzerverwaltung;
   eigenes Konto ausgenommen). Der Hilfe-Hinweis unter „Anmelden" beschreibt weiter
   die Nutzersicht (Selbsthilfe nur über Passwort-Reset).
7. **[ERLEDIGT 2026-08-11]** Assistent um optionalen Schiedsrichter-Schritt
   erweitert (Feld `Turnier.schiedsrichterPlanung`, Default aus; 4-stufiger Ablauf
   Grunddaten → Mannschaften → Schiedsrichter → Spielplan, sonst weiter 3-stufig).
8. **[ERLEDIGT 2026-08-11]** Ergebnis-Erfassung überarbeitet (beide Oberflächen):
   **Sofort-Speichern** onBlur (kein Speichern-Knopf mehr, kurze ✓-Bestätigung),
   **Konflikt-Auflösung** mit zwei Buttons (Punkt 2), **„n. a."** als kompakter
   Knopf direkt beim Team mit Tooltip (Punkt 11) – nur intern, extern ohne „n. a."
   und ohne die nun leere „Aktion"-Spalte. `useErgebnisEingaben.ts` um
   `uebernehmeServer` erweitert. Kein Backend-Umbau nötig.

## C. Bugs / UX vor Veröffentlichung

9. **[ERLEDIGT 2026-08-11] (für nicht angemeldete Besucher)** „Torball Turniere"
   führte auf öffentlicher Seite / externer Erfassung zur Anmeldung. Behoben:
   Marke ist dort für nicht angemeldete Besucher reiner Text (nicht klickbar).
   **Offen bleibt** die generelle Startseiten-/Header-Überarbeitung vor
   Veröffentlichung (z. B. sinnvolles Ziel der Marke für angemeldete Nutzer,
   allgemeines Startseiten-Konzept).

## D. Spätere Verbesserungen (nach Beta ok)

10. **Spielplan-Vergleich:** Beim Erzeugen eines neuen Vorschlags eine
    Vergleichsmöglichkeit zwischen dem bereits vorhandenen Spielplan und dem neuen
    Vorschlag anbieten (statt nur „übernehmen/verwerfen").

## E. Offene Rückfragen (vor dem Versions-Build klären)

11. **[ERLEDIGT 2026-08-11]** „n. a." jetzt als kompakter Knopf **direkt beim
    jeweiligen Team** (Tooltip „<Mannschaft> nicht angetreten") statt kryptisch am
    Zeilenende – vom Nutzer so bevorzugt. Die Hilfe erklärt „n. a." zusätzlich.
12. **Offline-/Lokal-Betrieb (spezifiziertes Kernfeature, noch genauer zu
    spezifizieren):** Vom Nutzer bestätigt als von Anfang an vorgesehener
    Bestandteil mit drei Ausprägungen:
    - **(a)** Turnier lokal ohne Internet/Server planen und später beim Anmelden
      am zentralen Server dorthin übernehmen.
    - **(b)** Reines Offline-Turnier, das bewusst **nicht** mit dem Server geteilt
      wird (z. B. Hobbyturniere ohne Veröffentlichung).
    - **(c)** **Host-Modus im lokalen Netz** (kein WLAN/Internet in der Halle):
      einer der Rechner fungiert als Host; Turnier vorher lokal abgelegt oder neu
      erstellt.
    Umsetzungsstand/Spezifikation der drei Modi vor Umsetzung noch schärfen. Der
    aktuelle Hilfe-Satz („bei lokaler Installation offline möglich") bleibt so, da
    er nur die einfachste, zutreffende Aussage macht.
    - **Anforderung an den Übergabe-Dropdown (Modus a):** Turniere dort mit
      **Name + Datum** anzeigen, damit die Auswahl auch bei gleichem Namen eindeutig
      ist. Entscheidung des Nutzers (2026-08-11): Eindeutigkeit nicht beim Anlegen
      erzwingen, sondern über die Anzeige (Name + Datum) sicherstellen. Alle
      heutigen Oberflächen erfüllen das bereits (Turnierliste zeigt beide Spalten);
      neu zu beachten nur beim künftigen Übergabe-Dropdown.

## F. Doku-Aufgaben

13. **[ERLEDIGT 2026-08-11]** README.md im Repo-Wurzelverzeichnis als vollständige
    Projektbeschreibung neu erstellt.
14. **[ERLEDIGT 2026-08-11]** `docs/Archiv/` aus der Git-Verwaltung genommen
    (`git rm -r --cached`, Dateien lokal behalten) und in `.gitignore` aufgenommen;
    Hinweis in CLAUDE.md aktualisiert.
15. **[ERLEDIGT 2026-08-11]** `docs/README.md` auf die real vorhandenen Dateien
    aktualisiert.

## G. Zweite Feedback-Runde (2026-08-11)

16. **[ERLEDIGT]** Pflichtfelder auch in Datentabellen kennzeichnen: Die
    Anlege-Formulare waren markiert, in den Tabellen (Übersicht-Name; Stammdaten
    Vereine/Teams; Turnier Schiedsrichter/Mannschaften/Kader) fehlte das Sternchen.
    Jetzt tragen die Pflicht-Spaltenköpfe bzw. das Übersicht-Namensfeld ein `*`.
    (Profil-E-Mail/-Passwort bewusst nicht markiert – optionale Änderungsformulare.)
17. **[ERLEDIGT]** Turnierregeln pflegbar (Spielzeit, Pausen, Timeouts, Wertung, …):
    gemeinsamer Typ `Turnierregeln`; Bearbeitung je Turnier (Reiter „Regeln" + im
    Anlage-Assistenten als eigener Schritt) UND zentrale Standardwerte
    (Systemkonfiguration, Admin-Seite „Standardregeln"). Nachgezogen (2. Iteration):
    **`forfaitErgebnis`** in die Regeln aufgenommen und mit den „n. a."-Aktionen
    verdrahtet; Formular vertikal mit eingerückten abhängigen Feldern; Pflichtfelder
    markiert; „Auf Standardwerte zurücksetzen" im Turnier-Regeln-Reiter.
    **Fürs nächste Release vorgesehen** (Nutzerwunsch): `passwortMindestlaenge` und
    weitere reine Systemeinstellungen tatsächlich verdrahten und in die UI aufnehmen.
    Für den Assistenten-Regeln-Schritt gilt noch: geänderte Werte müssen im Formular
    „Regeln speichern" bestätigt werden, bevor „Weiter" – kein Auto-Save beim Weitergehen.
18. **[ERLEDIGT]** Basiskonfig-Änderung nach Spielplan-Erzeugung: Schnappschuss am
    Turnier (`spielplanBasis`); auf dem Spielplan ein Hinweis, der konkret auflistet,
    was sich geändert hat (Modus/Felder/Mannschaften/Spielzeit/Pause/Halbzeiten/
    Startzeit); proaktive Rückfrage bei Modus- und Mannschafts-Änderung, solange ein
    Spielplan existiert.

## Bereits geklärt

- **Session-Cross-Browser:** endgültig als Fehlalarm bestätigt – ein geschützter
  Admin-Link führte in einem fremden Browser (Edge) korrekt sofort zur Anmeldung.
  Der frühere „funktioniert ohne Login"-Effekt war ein bewusst öffentlicher
  Token-/Link. Secure-Cookie-Flag ist bereits umgebungsgesteuert gefixt.
