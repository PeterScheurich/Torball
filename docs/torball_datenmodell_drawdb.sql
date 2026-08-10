-- =====================================================================
-- Torball-Turniersoftware -- Physisches Datenmodell (PDM) fuer DrawDB
-- =====================================================================
-- Hinweis: Das Produktivsystem nutzt CouchDB (zentral) / PouchDB (lokal),
-- also eine dokumentenbasierte Datenhaltung ohne physisch erzwungene
-- referenzielle Integritaet. Dieses SQL-DDL-Skript dient ausschliesslich
-- dazu, Entitaeten, Primaer-/Fremdschluessel und die FACHLICH GEWOLLTE
-- referenzielle Integritaet (RI) in DrawDB (https://drawdb.app) zu
-- visualisieren und zu diskutieren. Die ON DELETE / ON UPDATE-Regeln
-- unten sind daher als Spezifikation fuer die Anwendungslogik zu lesen,
-- nicht als Aussage ueber die tatsaechliche DB-Technologie.
--
-- Aufbau:
--   1. CREATE TABLE je Entitaet mit explizitem, benanntem PRIMARY KEY
--   2. Ein Block ALTER TABLE ... ADD CONSTRAINT je Fremdschluessel,
--      jeweils mit Begruendung der gewaehlten RI-Regel als Kommentar
--
-- Import in DrawDB: Menue "File" -> "Import" -> "From SQL", Dialekt
-- PostgreSQL waehlen, diese Datei auswaehlen.
--
-- Stand: 10.08.2026, Basis: Gesamtspezifikation v1.1
-- =====================================================================


-- =====================================================================
-- TEIL 1: TABELLEN MIT PRIMAERSCHLUESSELN
-- =====================================================================

CREATE TABLE systemkonfiguration (
    konfig_id               VARCHAR(36) NOT NULL,
    version                 INTEGER NOT NULL,
    ist_aktuell              BOOLEAN NOT NULL DEFAULT false,
    gueltig_ab               TIMESTAMP NOT NULL,
    punkte_sieg              INTEGER NOT NULL DEFAULT 2,
    punkte_unentschieden     INTEGER NOT NULL DEFAULT 1,
    forfait_ergebnis         VARCHAR(10) DEFAULT '3:0',
    passwort_mindestlaenge   INTEGER NOT NULL DEFAULT 8,
    geaendert_von            VARCHAR(36),
    geaendert_am             TIMESTAMP,
    aenderungskommentar      TEXT,
    CONSTRAINT pk_systemkonfiguration PRIMARY KEY (konfig_id)
);

CREATE TABLE benutzer (
    benutzer_id              VARCHAR(36) NOT NULL,
    email                    VARCHAR(255) NOT NULL UNIQUE,
    passwort_hash            VARCHAR(255),
    name                     VARCHAR(255) NOT NULL,
    telefon                  VARCHAR(50),
    globale_rolle            VARCHAR(20) NOT NULL DEFAULT 'benutzer',
    sprache                  VARCHAR(5) NOT NULL DEFAULT 'de',
    zwei_fa_aktiv            BOOLEAN NOT NULL DEFAULT false,
    zwei_fa_secret           VARCHAR(255),
    gesperrt                 BOOLEAN NOT NULL DEFAULT false,
    letzte_anmeldung         TIMESTAMP,
    erstellt_von             VARCHAR(36),
    erstellt_am              TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT pk_benutzer PRIMARY KEY (benutzer_id)
);

CREATE TABLE verein (
    verein_id                VARCHAR(36) NOT NULL,
    name                     VARCHAR(255) NOT NULL,
    logo                     VARCHAR(500),
    bundesland               VARCHAR(100),
    ansprechpartner_name     VARCHAR(255),
    ansprechpartner_telefon  VARCHAR(50),
    ansprechpartner_email    VARCHAR(255),
    CONSTRAINT pk_verein PRIMARY KEY (verein_id)
);

CREATE TABLE team (
    team_id                  VARCHAR(36) NOT NULL,
    verein_id                VARCHAR(36) NOT NULL,
    name                     VARCHAR(100) NOT NULL,
    logo_override            VARCHAR(500),
    CONSTRAINT pk_team PRIMARY KEY (team_id)
);

CREATE TABLE wettbewerb (
    wettbewerb_id            VARCHAR(36) NOT NULL,
    name                     VARCHAR(255) NOT NULL,
    saison                   VARCHAR(20),
    anzahl_spieltage         INTEGER,
    modus                    VARCHAR(100),
    erstellt_von             VARCHAR(36),
    erstellt_am              TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT pk_wettbewerb PRIMARY KEY (wettbewerb_id)
);

CREATE TABLE turnier (
    turnier_id                     VARCHAR(36) NOT NULL,
    wettbewerb_id                  VARCHAR(36),
    name                           VARCHAR(255) NOT NULL,
    datum                          DATE NOT NULL,
    startzeit                      TIME,
    status                         VARCHAR(20) NOT NULL DEFAULT 'entwurf',

    spielort_name                  VARCHAR(255),
    spielort_adresse               VARCHAR(500),
    spielort_geo                   VARCHAR(255),

    protokollierungsart            VARCHAR(10) NOT NULL DEFAULT 'digital',

    modus                          VARCHAR(100),
    spielzeit_minuten              INTEGER NOT NULL DEFAULT 5,
    anzahl_halbzeiten              INTEGER NOT NULL DEFAULT 2,
    pause_minuten                  INTEGER NOT NULL DEFAULT 2,
    seitenwechsel                  BOOLEAN NOT NULL DEFAULT true,
    timeouts_je_halbzeit           INTEGER NOT NULL DEFAULT 1,
    timeout_dauer_sekunden         INTEGER NOT NULL DEFAULT 30,
    auswechslungen_je_halbzeit     INTEGER NOT NULL DEFAULT 3,
    tordifferenz_abbruch           BOOLEAN NOT NULL DEFAULT true,
    tordifferenz_limit             INTEGER NOT NULL DEFAULT 10,
    verlaengerung_aktiv            BOOLEAN NOT NULL DEFAULT true,
    silbernes_tor                  BOOLEAN NOT NULL DEFAULT true,
    max_sehende_spieler             INTEGER NOT NULL DEFAULT 1,
    einstellige_trikotnummern      BOOLEAN NOT NULL DEFAULT true,

    punkte_sieg                    INTEGER NOT NULL DEFAULT 2,
    punkte_unentschieden           INTEGER NOT NULL DEFAULT 1,
    punkte_niederlage              INTEGER NOT NULL DEFAULT 0,
    tabellenkriterien              VARCHAR(255) DEFAULT 'punkte,tordifferenz,tore,direkter_vergleich,freiwuerfe',

    spielernamen_oeffentlich       BOOLEAN NOT NULL DEFAULT false,

    spielplan_freigegeben          BOOLEAN NOT NULL DEFAULT false,
    spielplan_version              INTEGER NOT NULL DEFAULT 0,
    spielplan_geaendert_am         TIMESTAMP,

    oeffentlich_turnierinfos       BOOLEAN NOT NULL DEFAULT false,
    oeffentlich_anfahrt_dokumente  BOOLEAN NOT NULL DEFAULT false,
    oeffentlich_spielplan          BOOLEAN NOT NULL DEFAULT false,
    oeffentlich_ergebnisse         BOOLEAN NOT NULL DEFAULT false,

    -- Rein informativ, KEIN FK: Systemkonfiguration ist versioniert,
    -- der kopierte Wertesatz lebt unabhaengig weiter (siehe Abschnitt 20.2
    -- der Gesamtspezifikation). Eine harte Referenz wuerde dem Prinzip
    -- "Kopie statt Referenz" widersprechen.
    erstellt_mit_konfig_version    INTEGER,

    turnierleitung_name            VARCHAR(255),
    turnierleitung_kontakt         VARCHAR(255),
    ansprechpartner_name           VARCHAR(255),
    ansprechpartner_kontakt        VARCHAR(255),
    zusatzinfo                     TEXT,

    erstellt_von                   VARCHAR(36),
    erstellt_am                    TIMESTAMP NOT NULL DEFAULT now(),
    geaendert_von                  VARCHAR(36),
    geaendert_am                   TIMESTAMP,
    CONSTRAINT pk_turnier PRIMARY KEY (turnier_id)
);

CREATE TABLE spielfeld (
    feld_id                  VARCHAR(36) NOT NULL,
    turnier_id               VARCHAR(36) NOT NULL,
    name                     VARCHAR(100) NOT NULL,
    CONSTRAINT pk_spielfeld PRIMARY KEY (feld_id)
);

CREATE TABLE turnierpause (
    pause_id                 VARCHAR(36) NOT NULL,
    turnier_id                VARCHAR(36) NOT NULL,
    startzeit_geplant        TIMESTAMP,
    dauer_minuten             INTEGER NOT NULL,
    gilt_fuer                VARCHAR(20) NOT NULL DEFAULT 'alle',
    typ                      VARCHAR(30) NOT NULL DEFAULT 'mittagspause',
    CONSTRAINT pk_turnierpause PRIMARY KEY (pause_id)
);

CREATE TABLE mannschaft_turnier (
    mannschaft_id             VARCHAR(36) NOT NULL,
    turnier_id                VARCHAR(36) NOT NULL,
    team_id                   VARCHAR(36),
    verein_id                 VARCHAR(36),
    name                      VARCHAR(255) NOT NULL,
    logo                      VARCHAR(500),
    bundesland                VARCHAR(100),
    ansprechpartner_name      VARCHAR(255),
    ansprechpartner_telefon   VARCHAR(50),
    ansprechpartner_email     VARCHAR(255),
    importiert_aus_turnier_id VARCHAR(36),
    CONSTRAINT pk_mannschaft_turnier PRIMARY KEY (mannschaft_id)
);

CREATE TABLE spieler (
    spieler_id                VARCHAR(36) NOT NULL,
    mannschaft_id             VARCHAR(36) NOT NULL,
    name                      VARCHAR(255) NOT NULL,
    vorname                   VARCHAR(255),
    trikotnummer              VARCHAR(2) NOT NULL,
    klassifizierung           VARCHAR(10) NOT NULL DEFAULT 'sehend',
    status                    VARCHAR(20) NOT NULL DEFAULT 'aktiv',
    importiert_aus_turnier_id VARCHAR(36),
    CONSTRAINT pk_spieler PRIMARY KEY (spieler_id)
);

CREATE TABLE schiedsrichter_turnier (
    schiedsrichter_id         VARCHAR(36) NOT NULL,
    turnier_id                VARCHAR(36) NOT NULL,
    name                      VARCHAR(255) NOT NULL,
    vorname                   VARCHAR(255),
    telefon                   VARCHAR(50),
    email                     VARCHAR(255),
    lizenz_vorhanden          BOOLEAN NOT NULL DEFAULT false,
    mannschaft_id             VARCHAR(36),
    ist_turnierleitung        BOOLEAN NOT NULL DEFAULT false,
    importiert_aus_turnier_id VARCHAR(36),
    CONSTRAINT pk_schiedsrichter_turnier PRIMARY KEY (schiedsrichter_id)
);

CREATE TABLE spiel (
    spiel_id                   VARCHAR(36) NOT NULL,
    turnier_id                 VARCHAR(36) NOT NULL,
    runde                      VARCHAR(50),
    feld_id                    VARCHAR(36),
    startzeit_geplant          TIMESTAMP,
    startzeit_voraussichtlich  TIMESTAMP,
    startzeit_tatsaechlich     TIMESTAMP,
    endzeit_tatsaechlich       TIMESTAMP,
    mannschaft_a_id            VARCHAR(36) NOT NULL,
    mannschaft_b_id            VARCHAR(36) NOT NULL,
    schiedsrichter_id          VARCHAR(36),
    status                     VARCHAR(20) NOT NULL DEFAULT 'geplant',
    ergebnis_a                 INTEGER,
    ergebnis_b                 INTEGER,
    ist_forfait                BOOLEAN NOT NULL DEFAULT false,
    ergebnis_abgeschlossen     BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT pk_spiel PRIMARY KEY (spiel_id)
);

CREATE TABLE spielprotokoll (
    protokoll_id               VARCHAR(36) NOT NULL,
    spiel_id                   VARCHAR(36) NOT NULL UNIQUE,
    status                     VARCHAR(20) NOT NULL DEFAULT 'offen',
    erstellt_von                VARCHAR(36),
    protokollant_name           VARCHAR(255),
    protokollant_bestaetigt_am  TIMESTAMP,
    CONSTRAINT pk_spielprotokoll PRIMARY KEY (protokoll_id)
);

-- Gueltige event_typ-Werte (siehe Gesamtspezifikation Abschnitt 22.2):
-- GO, STOP, B, VB, End, Fin, W, K, G, F, P, PA, T, TT, E, FW,
-- HANDOVER (Protokollantenwechsel), PROT (Protest)
CREATE TABLE event (
    event_id                 VARCHAR(36) NOT NULL,
    protokoll_id              VARCHAR(36) NOT NULL,
    zeitstempel               TIMESTAMP NOT NULL,
    spielzeit                 INTEGER,
    halbzeit                  VARCHAR(5),
    event_typ                 VARCHAR(10) NOT NULL,
    mannschaft                VARCHAR(1),
    spieler_id                VARCHAR(36),
    spieler_raus_id           VARCHAR(36),
    ist_eigentor               BOOLEAN NOT NULL DEFAULT false,
    ist_korrektur              BOOLEAN NOT NULL DEFAULT false,
    korrigiert_event_id       VARCHAR(36),
    zusatz                    JSONB,
    erstellt_von               VARCHAR(36),
    CONSTRAINT pk_event PRIMARY KEY (event_id)
);

CREATE TABLE dokument_anhang (
    anhang_id                VARCHAR(36) NOT NULL,
    turnier_id                VARCHAR(36) NOT NULL,
    titel                     VARCHAR(255) NOT NULL,
    beschreibung              TEXT,
    datei                     VARCHAR(500) NOT NULL,
    erstellt_von               VARCHAR(36),
    erstellt_am                TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT pk_dokument_anhang PRIMARY KEY (anhang_id)
);

CREATE TABLE ergebnis_token (
    token_id                  VARCHAR(36) NOT NULL,
    turnier_id                 VARCHAR(36) NOT NULL,
    token_wert                 VARCHAR(64) NOT NULL UNIQUE,
    erstellt_von                VARCHAR(36),
    erstellt_am                 TIMESTAMP NOT NULL DEFAULT now(),
    widerrufen                  BOOLEAN NOT NULL DEFAULT false,
    widerrufen_am                TIMESTAMP,
    CONSTRAINT pk_ergebnis_token PRIMARY KEY (token_id)
);

CREATE TABLE ergebnis_aenderung (
    aenderung_id              VARCHAR(36) NOT NULL,
    spiel_id                   VARCHAR(36) NOT NULL,
    erfasser_name               VARCHAR(255) NOT NULL,
    geraet_kennung               VARCHAR(64),
    alter_wert_a                INTEGER,
    alter_wert_b                INTEGER,
    neuer_wert_a                INTEGER NOT NULL,
    neuer_wert_b                INTEGER NOT NULL,
    zeitstempel                  TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT pk_ergebnis_aenderung PRIMARY KEY (aenderung_id)
);

CREATE TABLE turnier_berechtigung (
    berechtigung_id           VARCHAR(36) NOT NULL,
    turnier_id                 VARCHAR(36) NOT NULL,
    benutzer_id                 VARCHAR(36) NOT NULL,
    rolle                       VARCHAR(20) NOT NULL,
    vergeben_von                 VARCHAR(36),
    vergeben_am                  TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT pk_turnier_berechtigung PRIMARY KEY (berechtigung_id)
);

CREATE TABLE audit_log (
    log_id                     VARCHAR(36) NOT NULL,
    turnier_id                  VARCHAR(36),
    benutzer_id                  VARCHAR(36),
    aktion                       VARCHAR(100) NOT NULL,
    details                      JSONB,
    zeitstempel                  TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT pk_audit_log PRIMARY KEY (log_id)
);


-- =====================================================================
-- TEIL 2: FREMDSCHLUESSEL UND REFERENZIELLE INTEGRITAET (RI)
-- =====================================================================
-- Jede Regel ist so gewaehlt, wie es fachlich sinnvoll waere, WENN eine
-- Datenbank sie durchsetzen wuerde. In CouchDB/PouchDB muss die
-- Anwendung diese Regeln selbst umsetzen (z.B. beim Loeschen pruefen
-- oder abhaengige Dokumente mit-loeschen/entkoppeln).
-- =====================================================================

-- --- Selbstreferenzen und generische "wer hat es erstellt/geaendert"-FKs ---
-- Diese FKs verweisen auf handelnde Benutzer, nicht auf fachlich
-- abhaengige Daten. Wird ein Benutzer geloescht, soll die Historie
-- (Konfiguration, Turnier, Protokoll, Event, ...) NICHT verschwinden --
-- nur der Verweis auf die handelnde Person wird entfernt (SET NULL).

ALTER TABLE benutzer
    ADD CONSTRAINT fk_benutzer_erstellt_von
    FOREIGN KEY (erstellt_von) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE systemkonfiguration
    ADD CONSTRAINT fk_systemkonfiguration_geaendert_von
    FOREIGN KEY (geaendert_von) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Stammdaten: Verein / Team ---
-- Verein und Team sind Stammdaten, die von vielen Turnieren referenziert
-- werden koennen (mittelbar ueber Mannschaft-im-Turnier). Ein Verein mit
-- vorhandenen Teams darf nicht versehentlich geloescht werden --
-- RESTRICT erzwingt, dass zuerst die Teams entfernt/umgehaengt werden.

ALTER TABLE team
    ADD CONSTRAINT fk_team_verein
    FOREIGN KEY (verein_id) REFERENCES verein(verein_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- --- Wettbewerb / Turnier ---
-- Ein Turnier (Spieltag) ist auch ohne Wettbewerb sinnvoll (Freizeit-
-- turniere haben meist keinen Wettbewerb). Wird der Wettbewerb geloescht,
-- bleiben die einzelnen Turniere als eigenstaendige Datensaetze bestehen
-- und werden nur entkoppelt (SET NULL) -- kein Kaskaden-Loeschen.

ALTER TABLE wettbewerb
    ADD CONSTRAINT fk_wettbewerb_erstellt_von
    FOREIGN KEY (erstellt_von) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE turnier
    ADD CONSTRAINT fk_turnier_wettbewerb
    FOREIGN KEY (wettbewerb_id) REFERENCES wettbewerb(wettbewerb_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE turnier
    ADD CONSTRAINT fk_turnier_erstellt_von
    FOREIGN KEY (erstellt_von) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE turnier
    ADD CONSTRAINT fk_turnier_geaendert_von
    FOREIGN KEY (geaendert_von) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Turnier-Unterobjekte (Spielfeld, Turnierpause, Dokument-Anhang,
--     Ergebnis-Token, Turnier-Berechtigung) ---
-- Diese Entitaeten haben KEINE eigenstaendige Existenz ausserhalb ihres
-- Turniers (siehe Hierarchie in Abschnitt 20.1 der Gesamtspezifikation).
-- Wird das Turnier geloescht, werden sie folgerichtig mitgeloescht
-- (CASCADE) -- das entspricht dem dokumentenorientierten "ein Turnier
-- ist ein zusammengehoeriges Paket", das auch in CouchDB so umgesetzt
-- werden sollte (z.B. per Bulk-Delete aller zugehoerigen Dokumente).

ALTER TABLE spielfeld
    ADD CONSTRAINT fk_spielfeld_turnier
    FOREIGN KEY (turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE turnierpause
    ADD CONSTRAINT fk_turnierpause_turnier
    FOREIGN KEY (turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE dokument_anhang
    ADD CONSTRAINT fk_dokument_anhang_turnier
    FOREIGN KEY (turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE dokument_anhang
    ADD CONSTRAINT fk_dokument_anhang_erstellt_von
    FOREIGN KEY (erstellt_von) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE ergebnis_token
    ADD CONSTRAINT fk_ergebnis_token_turnier
    FOREIGN KEY (turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE ergebnis_token
    ADD CONSTRAINT fk_ergebnis_token_erstellt_von
    FOREIGN KEY (erstellt_von) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE turnier_berechtigung
    ADD CONSTRAINT fk_turnier_berechtigung_turnier
    FOREIGN KEY (turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Eine Berechtigung ohne Benutzer ist sinnlos -- wird der Benutzer
-- geloescht, wird auch die Berechtigung entfernt (CASCADE), anders als
-- bei den reinen "wer hat's gemacht"-Feldern oben.
ALTER TABLE turnier_berechtigung
    ADD CONSTRAINT fk_turnier_berechtigung_benutzer
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(benutzer_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE turnier_berechtigung
    ADD CONSTRAINT fk_turnier_berechtigung_vergeben_von
    FOREIGN KEY (vergeben_von) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Mannschaft-im-Turnier ---
-- Pflichtbeziehung zum Turnier: CASCADE (siehe oben).
-- team_id / verein_id sind laut Spezifikation (Abschnitt 15/20.7) reine
-- HERKUNFTSREFERENZEN -- alle Anzeigedaten sind bereits kopiert. Wird
-- das Stammdaten-Team/-Verein geloescht, bleibt die Mannschaft im
-- Turnier unveraendert bestehen, verliert nur den Herkunftsverweis
-- (SET NULL). importiert_aus_turnier_id ist rein informativ (Vorlage
-- fuer die Uebernahme) -- ebenfalls SET NULL statt CASCADE, damit ein
-- geloeschtes Alt-Turnier nicht nachtraeglich ein neueres Turnier zerstoert.

ALTER TABLE mannschaft_turnier
    ADD CONSTRAINT fk_mannschaft_turnier_turnier
    FOREIGN KEY (turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE mannschaft_turnier
    ADD CONSTRAINT fk_mannschaft_turnier_team
    FOREIGN KEY (team_id) REFERENCES team(team_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE mannschaft_turnier
    ADD CONSTRAINT fk_mannschaft_turnier_verein
    FOREIGN KEY (verein_id) REFERENCES verein(verein_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE mannschaft_turnier
    ADD CONSTRAINT fk_mannschaft_turnier_importquelle
    FOREIGN KEY (importiert_aus_turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Spieler ---
-- Ein Spieler existiert nicht ohne seine Turnier-Mannschaft (CASCADE).
-- Die Import-Herkunft ist wie oben rein informativ (SET NULL).

ALTER TABLE spieler
    ADD CONSTRAINT fk_spieler_mannschaft
    FOREIGN KEY (mannschaft_id) REFERENCES mannschaft_turnier(mannschaft_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE spieler
    ADD CONSTRAINT fk_spieler_importquelle
    FOREIGN KEY (importiert_aus_turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Schiedsrichter-im-Turnier ---

ALTER TABLE schiedsrichter_turnier
    ADD CONSTRAINT fk_schiedsrichter_turnier_turnier
    FOREIGN KEY (turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE schiedsrichter_turnier
    ADD CONSTRAINT fk_schiedsrichter_turnier_mannschaft
    FOREIGN KEY (mannschaft_id) REFERENCES mannschaft_turnier(mannschaft_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE schiedsrichter_turnier
    ADD CONSTRAINT fk_schiedsrichter_turnier_importquelle
    FOREIGN KEY (importiert_aus_turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Spiel ---
-- Gehoert eindeutig zu genau einem Turnier: CASCADE.
-- feld_id: RESTRICT -- ein Spielfeld mit terminierten Spielen darf nicht
-- geloescht werden, ohne die Spiele vorher umzuplanen (Terminintegritaet).
-- mannschaft_a_id/_b_id: RESTRICT -- eine Mannschaft mit gespielten oder
-- geplanten Spielen darf nicht hart geloescht werden; das Ausscheiden
-- einer Mannschaft laeuft laut Abschnitt 9.2 ueber Annullierung der
-- Ergebnisse, nicht ueber Loeschen des Mannschafts-Datensatzes.
-- schiedsrichter_id: SET NULL -- ein Schiedsrichter kann ohne
-- Datenverlust am Spiel entfernt/neu zugewiesen werden.

ALTER TABLE spiel
    ADD CONSTRAINT fk_spiel_turnier
    FOREIGN KEY (turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE spiel
    ADD CONSTRAINT fk_spiel_feld
    FOREIGN KEY (feld_id) REFERENCES spielfeld(feld_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE spiel
    ADD CONSTRAINT fk_spiel_mannschaft_a
    FOREIGN KEY (mannschaft_a_id) REFERENCES mannschaft_turnier(mannschaft_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE spiel
    ADD CONSTRAINT fk_spiel_mannschaft_b
    FOREIGN KEY (mannschaft_b_id) REFERENCES mannschaft_turnier(mannschaft_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE spiel
    ADD CONSTRAINT fk_spiel_schiedsrichter
    FOREIGN KEY (schiedsrichter_id) REFERENCES schiedsrichter_turnier(schiedsrichter_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Spielprotokoll (nur bei protokollierungsart = digital) ---
-- 1:1 zum Spiel, existiert nicht eigenstaendig: CASCADE.

ALTER TABLE spielprotokoll
    ADD CONSTRAINT fk_spielprotokoll_spiel
    FOREIGN KEY (spiel_id) REFERENCES spiel(spiel_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE spielprotokoll
    ADD CONSTRAINT fk_spielprotokoll_erstellt_von
    FOREIGN KEY (erstellt_von) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Event (Event-Sourcing-Kern) ---
-- protokoll_id: CASCADE -- Events gehoeren untrennbar zu ihrem Protokoll.
-- spieler_id/spieler_raus_id: RESTRICT -- ein Spieler, der bereits in
-- Events erwaehnt ist, darf nicht geloescht werden (wuerde die
-- Spielhistorie verstuemmeln); stattdessen "status = gesperrt" nutzen.
-- korrigiert_event_id: RESTRICT -- ein Event, auf das eine Korrektur
-- verweist, darf im Sinne des Event-Sourcing-Prinzips (Abschnitt 7.1/22.1)
-- ohnehin nie geloescht werden; RESTRICT erzwingt das zusaetzlich.
-- erstellt_von: SET NULL -- reine "wer hat's erfasst"-Information.

ALTER TABLE event
    ADD CONSTRAINT fk_event_protokoll
    FOREIGN KEY (protokoll_id) REFERENCES spielprotokoll(protokoll_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE event
    ADD CONSTRAINT fk_event_spieler
    FOREIGN KEY (spieler_id) REFERENCES spieler(spieler_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE event
    ADD CONSTRAINT fk_event_spieler_raus
    FOREIGN KEY (spieler_raus_id) REFERENCES spieler(spieler_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE event
    ADD CONSTRAINT fk_event_korrigiert_event
    FOREIGN KEY (korrigiert_event_id) REFERENCES event(event_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE event
    ADD CONSTRAINT fk_event_erstellt_von
    FOREIGN KEY (erstellt_von) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Ergebnis-Aenderung (nur bei protokollierungsart = manuell) ---
-- Gehoert untrennbar zum Spiel: CASCADE.

ALTER TABLE ergebnis_aenderung
    ADD CONSTRAINT fk_ergebnis_aenderung_spiel
    FOREIGN KEY (spiel_id) REFERENCES spiel(spiel_id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- --- Audit-Log ---
-- Der Audit-Log muss die geloeschte Entitaet UEBERLEBEN (Grundzweck
-- eines Audit-Logs) -- daher SET NULL statt CASCADE bei beiden FKs,
-- obwohl turnier_id sonst ueberall CASCADE bekommt.

ALTER TABLE audit_log
    ADD CONSTRAINT fk_audit_log_turnier
    FOREIGN KEY (turnier_id) REFERENCES turnier(turnier_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE audit_log
    ADD CONSTRAINT fk_audit_log_benutzer
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(benutzer_id)
    ON DELETE SET NULL ON UPDATE CASCADE;
