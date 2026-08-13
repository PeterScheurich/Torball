# 2026-08-13 – Turnier-Sync: Lokale Installation ↔ Zentrale Plattform (Grundlage)

Fortsetzung von Turnier-Codes (Abschnitt 21.3, „Lokales Netzwerk", Commit `514a137`/`e93bf55`):
deckt den Fall ab, dass ein Turnier auf der Zentralen Plattform geplant wurde, am Spieltag aber
kein/unzuverlässiges Internet besteht. Volle PouchDB↔CouchDB-Synchronisation (Abschnitt 17/23) ist
weiterhin offen ([[feedback_offline_kernfeature]]) – deutlich komplexer (generische
Konfliktauflösung), als für diesen Anwendungsfall nötig.

## Finalisierte fachliche Spec (mit dem Nutzer abgestimmt)

- **Kein genereller Sync, keine Merge-/Konfliktlogik mit mehreren Kandidaten** – stattdessen eine
  strikte **1:1-Beziehung** ("Checkout"): zu jedem Zeitpunkt ist ein Server-Turnier entweder frei
  oder an genau eine lokale Installation ausgecheckt.
- **Kein manueller Datei-Download/-Upload** (bewusste Abkehr von einer ersten, datei-basierten
  Entwurfsidee) – stattdessen eine dauerhafte **Instanz-Kopplung**: Download wird ausschließlich
  vom Server aus angestoßen, Upload ausschließlich vom Client aus. Technisch meldet sich dabei
  immer die lokale Instanz aktiv per **Check-in** (alle ~45s) beim Server, da der Server die lokale
  Installation wegen NAT/Firewall in der Regel nicht direkt erreichen kann – ein serverseitig
  angestoßener Download wird als Auftrag hinterlegt und beim nächsten Check-in abgeholt.
- **Kopplung per Kopplungscode** (nicht per echtem Server-Login auf der lokalen Instanz): Admin/
  Manager/Turnierleitung erzeugt im eigenen Profil einen kurzlebigen Code, die lokale Installation
  tauscht ihn einmalig gegen ein dauerhaftes, gehashtes Instanz-Token.
- **Download-Dialog fragt "Stammdaten (Vereine/Teams) mitnehmen?", Standard NEIN.**
- **Freigabe aufheben ist bewusst rein manuell**, keine automatische Erinnerung bei langer
  Inaktivität.
- **Neu-Verknüpfen (Admin-Ausnahmefall):** falls versehentlich zwei lokale Kopien entstehen (z. B.
  weil die Freigabe fälschlich aufgehoben wurde), kann ein Admin den Stand eines "verlorenen"
  Geräts per `ersetzen: true` erneut hochladen und verknüpfen – nur erlaubt, solange kein aktives
  Checkout besteht.

## Umgesetzt

- **Datenmodell** (`shared/src/types/sync.ts`, neu): `VerbundeneInstanz` (Kopplung, gehashtes
  Dauer-Token), `TurnierCheckout` (Zustand `angefordert→aktiv→freigegeben`, genau ein
  nicht-`freigegeben`-Checkout pro Turnier = ausgecheckt), `LokaleSyncKonfiguration` (lokales
  Singleton, Vorbild `Systemeinstellungen`). `Benutzer` um `instanzKopplungscodeHash`/-`Ablauf`
  ergänzt (Vorbild: Einladungs-Token). `Turnier` um `lokalerSyncCheckoutId` (rein lokale
  Buchführung, nicht bewusst exportiert) und `turnierleitungCodeHash`-Nachbarfeld ergänzt.
- **Turnier-Exportpaket** (`backend/src/sync/export.ts`, `sammleTurnierExport()`): Umfang
  orientiert an der bestehenden Kaskaden-Lösch-Logik in `turnier.ts` (Mannschaften, Spieler, Spiele,
  Schiedsrichter) + optional referenzierte Stammdaten (Vereine/Teams) + `Wettbewerb` falls
  `wettbewerbId` gesetzt. Bewusst ausgeschlossen: `turnierBerechtigung`, `ergebnisToken`,
  `ergebnisAenderung`, `auditLogEintrag`, `session` (instanzlokale/ephemere Artefakte).
- **Import-Gegenstück** (`backend/src/sync/import.ts`, `importiereTurnierExport()`):
  `BenutzerId`-Referenzen (`erstelltVon`/`geaendertVon`/`zuletztBearbeitetVon`/`abgeschlossenVon`)
  werden verworfen (bedeutungslos auf der Zielinstanz), die denormalisierten `*Name`-Felder bleiben
  als Historie erhalten. `ersetzen: true` überschreibt bestehende Dokumente mit dem aktuellen
  lokalen `_rev` je Dokument statt neu anzulegen.
- **Instanz-Kopplung + Check-in** (`backend/src/routes/instanzSync.ts`, öffentlich, Auth nur per
  `Authorization: Bearer <instanzToken>` – kein Cookie/Session, läuft zwischen zwei
  Backend-Prozessen): `POST /instanzen/kopplung-einloesen` tauscht den Kopplungscode gegen das
  Instanz-Token; `POST /instanzen/checkin` liefert ausstehende Downloads (komplettes Exportpaket
  direkt im Response, kein zweiter Roundtrip) und nimmt Ergebnis-Push + Bestätigungen bereits
  empfangener Downloads entgegen. Kopplungscode-Erzeugung/-Verwaltung sitzt in `benutzer.ts`
  (`POST /benutzer/mich/instanz-kopplungscode`, `GET/POST .../instanzen`).
- **Download/Freigabe/Upload** (`backend/src/routes/turnierSync.ts`, turnierbezogen über die
  normale `requireZugriff`+`hatMindestens`-Prüfung wie die übrigen Turnier-Routen):
  `POST /turniere/:id/download-anfordern` (legt `TurnierCheckout` "angefordert" an, 409 bei
  bereits aktivem Checkout), `GET /turniere/:id/checkout-status`,
  `POST /turniere/:id/checkout-freigeben`. `POST /turniere/:id/sync-upload` (lokal, client-initiiert
  – ruft aktiv den gekoppelten Server auf). `POST /turniere/sync-import` (Server-seitig, Auth wie
  Check-in): neu anlegen falls Turnier-ID unbekannt (+ automatisches aktives Checkout, Warnung bei
  fehlender `basisTurnierId`-Referenz), 409 falls bereits vorhanden, `ersetzen`-Pfad nur mit
  `globaleRolle: "admin"` und ohne aktives Checkout.
- **Lokaler Check-in-Timer** (`backend/src/sync/checkin.ts`): `setInterval` (45s) in
  `backend/src/index.ts`, bewusst backend-seitig statt an einen offenen Browser-Tab gebunden.
  Sammelt für alle Turniere mit gesetztem `lokalerSyncCheckoutId` die aktuellen Spiel-Felder,
  verarbeitet ausstehende Downloads aus der Check-in-Antwort. Netzwerkfehler werden still
  übersprungen.
- **Frontend:** `EinstellungenPage` (neuer Abschnitt „Turnier-Sync" – bewusst dort, nicht im Profil,
  da Geräte-/Instanz-Eigenschaft, analog zu Theme/Dichte/Breite), `ProfilPage` (neuer Abschnitt
  „Verbundene Instanzen" – kontobezogen, Kopplungscode erzeugen/Instanzen widerrufen), neue
  Komponente `TurnierSync.tsx` in `TurnierVerwaltenPage` (Übersicht-Tab, neben `TurnierFreigabe`) –
  zeigt je nach geladenen Daten Download-Anfordern-Dialog (Ziel-Instanz + Stammdaten-Checkbox) UND/
  ODER Upload-Knopf, da dieselbe Codebasis sowohl als Server als auch als lokale Installation läuft.

## Nebenbefunde (nicht Teil dieses Plans, separat vermerkt)

- `turnier-delete.integration.test.ts` schlägt fehl, wenn tatsächlich gegen echte CouchDB
  ausgeführt (`npm run test` ohne `.env` überspringt ihn normalerweise): die DELETE-Route verlangt
  seit längerem `requireAuth`, der Test authentifiziert sich aber nie. Als eigene Hintergrundaufgabe
  vorgeschlagen (`task_26404952`).
- **`SERVE_FRONTEND`-Einzelprozess-Modus** (Windows-Installer, Abschnitt 18.4): direkte Browser-
  Navigation (bzw. Reload) auf einen Seitenpfad, der zufällig mit einem registrierten Backend-
  GET-Route-Muster übereinstimmt (z. B. `/turniere/:id`), liefert die rohe API-Antwort statt der
  SPA-Shell – `rewriteUrl` entfernt nur das `/api`-Präfix von XHR-Aufrufen, eine volle
  Seiten-Navigation auf denselben Pfad ohne `/api`-Präfix kollidiert mit der gleichnamigen
  Backend-Route. Beim Testen dieser Ausbaustufe entdeckt (zwei parallele Instanzen, eine davon im
  `SERVE_FRONTEND`-Modus), nicht Teil dieses Plans – noch nicht behoben.

## Bewusst zurückgestellt

- Stammdaten-Überschreiben lokal←Server (eigener, kleiner Folge-Baustein).
- Automatische Erinnerung bei lange inaktivem Checkout.
- Volle PouchDB↔CouchDB-Synchronisation (Abschnitt 17/23).
- Mehrere Instanzen gleichzeitig an einem Turnier ausgecheckt (bewusst 1:1).

## Verifikation

`npm run build` (workspace `shared` zuerst) / `lint --workspace=frontend` / `test --workspace=backend`
grün. Neue Backend-Tests (`backend/src/routes/turnierSync.test.ts`, gegen echte CouchDB): Kopplung
+ Check-in-Auth (gültig/ungültig/widerrufen), `sammleTurnierExport` mit/ohne Stammdaten,
`sync-import` (neu/409/403 ohne Admin/`ersetzen` mit Admin), Checkout-Status-Übergänge inkl.
409 bei doppeltem aktivem Checkout.

End-to-end gegen **zwei echte, getrennte CouchDB-Datenbanken** verifiziert (temporäre zweite DB
`torball_synctest` + Instanz auf Port 3001 im `SERVE_FRONTEND`-Modus, danach vollständig
aufgeräumt): Kopplungscode erzeugt/eingelöst, Check-in-Timer lief automatisch, Download angefordert
→ binnen eines Check-ins auf der lokalen Instanz angekommen (Mannschaften/Spiele korrekt, Stammdaten
je nach Checkbox), Checkout-Status `angefordert→aktiv`, lokal erfasstes Ergebnis erschien binnen
eines Check-ins auf dem Server, nach „Freigabe aufheben" wurde ein weiterer lokaler Push korrekt
ignoriert (Serverstand blieb unverändert), Upload eines neuen lokalen Turniers zum Server
erfolgreich.
