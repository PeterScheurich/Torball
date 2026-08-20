import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Protokollierungsart, Spiel, Spielmodus, Turnier, TurnierStatus, Turnierregeln } from "@torball/shared";
import {
  getSpiele,
  getSystemkonfiguration,
  getTurnier,
  getTurnierCheckoutStatus,
  turnierAbschliessen,
  turnierRegelnEntsperren,
  turnierWiederOeffnen,
  updateTurnier,
} from "../api";
import { ErgebnisVerwaltung } from "../components/ErgebnisVerwaltung";
import { MannschaftenListe } from "../components/MannschaftenListe";
import { QrCode } from "../components/QrCode";
import { SchiedsrichterVerwaltung } from "../components/SchiedsrichterVerwaltung";
import { SpielplanVerwaltung } from "../components/SpielplanVerwaltung";
import { TurnierFreigabe } from "../components/TurnierFreigabe";
import { TurnierSync } from "../components/TurnierSync";
import { TurnierPruefung } from "../components/TurnierPruefung";
import { TurnierregelnFormular } from "../components/TurnierregelnFormular";
import { TurnierLogo } from "../components/TurnierLogo";
import { bildAlsLogoDataUrl, MAX_LOGO_BYTES } from "../logoBild";
import { formatiereDatum, formatiereUhrzeit } from "../format";
import { useAuth } from "../auth";

type Tab = "uebersicht" | "regeln" | "mannschaften" | "schiedsrichter" | "spielplan" | "ergebnisse";

/** Lesbare Anzeige der Status-Werte (das rohe Feld waere z.B. "entwurf"). */
const STATUS_LABEL: Record<TurnierStatus, string> = {
  entwurf: "Entwurf",
  aktiv: "Aktiv",
  abgeschlossen: "Abgeschlossen",
  archiviert: "Archiviert",
};

const TABS: { id: Tab; label: string }[] = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "regeln", label: "Regeln" },
  { id: "mannschaften", label: "Mannschaften" },
  { id: "schiedsrichter", label: "Schiedsrichter" },
  { id: "spielplan", label: "Spielplan" },
  { id: "ergebnisse", label: "Ergebnisse" },
];

/** Freitextfelder aus Abschnitt 5.1 ("Allgemein"), die bisher nur beim Anlegen (Name)
 * bzw. gar nicht erfasst werden konnten. Eigener Bearbeitungszustand mit Speichern beim
 * Verlassen des Feldes, analog zu Mannschaften/Vereinen/Teams. */
interface AllgemeinBearbeitung {
  name: string;
  spielortName: string;
  spielortAdresse: string;
  spielortGeo: string;
  turnierleitungName: string;
  turnierleitungKontakt: string;
  ansprechpartnerName: string;
  ansprechpartnerKontakt: string;
  zusatzinfo: string;
}

/** Erkennt "Breite, Laenge" (z.B. "50.1109, 8.6821") im Geo-Feld. */
const KOORDINATEN_MUSTER = /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/;

/**
 * Oeffnet einen Kartendienst in einem neuen Tab. Stehen im Geo-Feld bereits Koordinaten
 * (z.B. von einem frueheren Kartenbesuch dort abgelesen und hier eingetragen), springt der
 * Dienst direkt an diese Position - sonst wird mit Spielort-Name/-Adresse gesucht.
 * Bewusst nur ein Link, keine eingebettete Karte: eine fremde Seite kann eine dort markierte
 * Position nicht automatisch an unsere App zurueckmelden - der/die Nutzer:in muss die
 * Koordinaten dort ablesen und selbst ins Geo-Feld eintragen.
 */
function kartenSucheUrl(dienst: "google" | "osm", allgemein: AllgemeinBearbeitung | undefined): string {
  const koordinaten = allgemein?.spielortGeo?.trim().match(KOORDINATEN_MUSTER);
  if (koordinaten) {
    const [, breite, laenge] = koordinaten;
    return dienst === "google"
      ? `https://www.google.com/maps/search/?api=1&query=${breite},${laenge}`
      : `https://www.openstreetmap.org/?mlat=${breite}&mlon=${laenge}#map=18/${breite}/${laenge}`;
  }

  const suchtext = [allgemein?.spielortName, allgemein?.spielortAdresse].filter(Boolean).join(", ");
  if (dienst === "google") {
    return suchtext
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(suchtext)}`
      : "https://www.google.com/maps";
  }
  return suchtext
    ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(suchtext)}`
    : "https://www.openstreetmap.org";
}

type SichtbarkeitsFeld =
  | "oeffentlichTurnierinfos"
  | "oeffentlichAnfahrtDokumente"
  | "oeffentlichSpielplan"
  | "oeffentlichErgebnisse"
  | "oeffentlichRegeln";

const SICHTBARKEITS_FELDER: { feld: SichtbarkeitsFeld; label: string }[] = [
  { feld: "oeffentlichTurnierinfos", label: "Turnierinfos" },
  { feld: "oeffentlichAnfahrtDokumente", label: "Anfahrt & Dokumente" },
  { feld: "oeffentlichSpielplan", label: "Spielplan" },
  { feld: "oeffentlichErgebnisse", label: "Ergebnisse" },
  { feld: "oeffentlichRegeln", label: "Regeln" },
];

function allgemeinAusTurnier(turnier: Turnier): AllgemeinBearbeitung {
  return {
    name: turnier.name,
    spielortName: turnier.spielortName ?? "",
    spielortAdresse: turnier.spielortAdresse ?? "",
    spielortGeo: turnier.spielortGeo ?? "",
    turnierleitungName: turnier.turnierleitungName ?? "",
    turnierleitungKontakt: turnier.turnierleitungKontakt ?? "",
    ansprechpartnerName: turnier.ansprechpartnerName ?? "",
    ansprechpartnerKontakt: turnier.ansprechpartnerKontakt ?? "",
    zusatzinfo: turnier.zusatzinfo ?? "",
  };
}

export function TurnierVerwaltenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const { benutzer } = useAuth();

  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [allgemein, setAllgemein] = useState<AllgemeinBearbeitung | undefined>();
  // Feldnamen-Entwuerfe je feldId, analog zu "allgemein" nur beim ersten Laden uebernommen.
  const [feldNamen, setFeldNamen] = useState<Record<string, string> | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();
  const [linkHinweis, setLinkHinweis] = useState<string | undefined>();
  // Ist das Turnier per Turnier-Sync an eine lokale Installation ausgecheckt, ist es auch hier auf
  // dem Server schreibgeschuetzt (siehe turnierAusgecheckt() im Backend) - fuer die Kennzeichnung
  // im Namen (siehe unten) unabhaengig vom Turnier-Sync-Formular im Uebersicht-Reiter geladen, da
  // der Name auf JEDEM Reiter sichtbar ist.
  const [ausgecheckt, setAusgecheckt] = useState(false);
  const ladeCheckoutStatus = () => {
    getTurnierCheckoutStatus(turnierId)
      .then((status) => setAusgecheckt(status.ausgecheckt))
      .catch(() => setAusgecheckt(false));
  };
  // Nur fuer die Spielzeit-/Spielmodus-/Protokollierung-Sperre unten geladen (eigener, schlanker
  // State statt den vollen Spielplan-State aus SpielplanVerwaltung.tsx hochzuziehen) - dieselbe
  // Bedingung wie spielplanGesperrt dort: irgendein Spiel ist nicht mehr "geplant" oder hat ein
  // abgeschlossenes Ergebnis.
  const [spiele, setSpiele] = useState<Spiel[]>([]);
  const spielplanGesperrt = spiele.some((s) => s.status !== "geplant" || s.ergebnisAbgeschlossen);
  const logoInputRef = useRef<HTMLInputElement>(null);
  // Aktiver Reiter steckt in der URL (?tab=...), nicht nur im lokalen State - sonst
  // springt ein Reload (F5) immer zurueck auf "Uebersicht", egal auf welchem Reiter
  // man gerade war.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const aktiverTab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "uebersicht";
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    uebersicht: null,
    regeln: null,
    mannschaften: null,
    schiedsrichter: null,
    spielplan: null,
    ergebnisse: null,
  });

  useEffect(() => {
    getTurnier(turnierId)
      .then(setTurnier)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden"));
    getSpiele(turnierId)
      .then(setSpiele)
      .catch(() => setSpiele([]));
    ladeCheckoutStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnierId]);

  // Nur beim ersten Laden aus dem Turnier uebernehmen, nicht bei jeder Aktualisierung
  // (z.B. nach Aendern des Spielmodus) - sonst wuerde ein noch ungespeicherter Entwurf
  // in einem der Felder hier ueberschrieben.
  useEffect(() => {
    if (turnier && !allgemein) setAllgemein(allgemeinAusTurnier(turnier));
  }, [turnier, allgemein]);

  useEffect(() => {
    if (turnier && !feldNamen) {
      setFeldNamen(Object.fromEntries(turnier.felder.map((f) => [f.feldId, f.name])));
    }
  }, [turnier, feldNamen]);

  async function allgemeinFeldSpeichern(feld: keyof AllgemeinBearbeitung) {
    if (!allgemein || !turnier) return;
    const wert = allgemein[feld].trim();

    if (feld === "name" && wert === "") {
      setFehler("Turniername darf nicht leer sein");
      setAllgemein((a) => (a ? { ...a, name: turnier.name } : a));
      return;
    }

    const aktuell = ((turnier as unknown as Record<string, string | undefined>)[feld] ?? "").trim();
    if (wert === aktuell) return;

    try {
      const aktualisiert = await updateTurnier(turnierId, { [feld]: feld === "name" ? wert : wert || null });
      setTurnier(aktualisiert);
      setAllgemein((a) => (a ? { ...a, [feld]: wert } : a));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
    }
  }

  /** Speichert den Namen eines einzelnen Spielfelds (onBlur, analog allgemeinFeldSpeichern). */
  async function feldNameSpeichern(feldId: string) {
    if (!feldNamen || !turnier) return;
    const wert = feldNamen[feldId]?.trim() ?? "";
    const aktuell = turnier.felder.find((f) => f.feldId === feldId)?.name ?? "";
    if (wert === "") {
      setFehler("Feldname darf nicht leer sein");
      setFeldNamen((f) => (f ? { ...f, [feldId]: aktuell } : f));
      return;
    }
    if (wert === aktuell) return;

    try {
      const neueFelder = turnier.felder.map((f) => (f.feldId === feldId ? { ...f, name: wert } : f));
      const aktualisiert = await updateTurnier(turnierId, { felder: neueFelder });
      setTurnier(aktualisiert);
      setFeldNamen((f) => (f ? { ...f, [feldId]: wert } : f));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern des Feldnamens");
    }
  }

  async function spielplanModusAendern(modus: Spielmodus) {
    // Warnung, wenn bereits ein Spielplan existiert: eine Modus-Aenderung macht ihn inkonsistent.
    // Bei Abbruch bleibt das (controlled) Auswahlfeld auf dem bisherigen Wert.
    if (
      turnier &&
      turnier.spielplanVersion > 0 &&
      !window.confirm(
        "Für dieses Turnier existiert bereits ein Spielplan. Ein geänderter Spielmodus passt nicht mehr dazu – " +
          "du müsstest den Spielplan anschließend neu erzeugen. Modus trotzdem ändern?",
      )
    ) {
      return;
    }
    try {
      setTurnier(await updateTurnier(turnierId, { spielplanModus: modus }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern des Spielmodus");
    }
  }

  async function protokollierungsartAendern(art: Protokollierungsart) {
    try {
      setTurnier(await updateTurnier(turnierId, { protokollierungsart: art }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Protokollierungsart");
    }
  }

  async function regelnSpeichern(regeln: Turnierregeln) {
    try {
      setTurnier(await updateTurnier(turnierId, regeln));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern der Regeln");
      throw err;
    }
  }

  /**
   * Turnier abschliessen. Vorbedingung: jedes Spiel muss ein erfasstes Ergebnis haben (kein
   * "offenes" Spiel mehr) - sonst wird abgebrochen. Gibt es noch erfasste, aber nicht
   * finalisierte Ergebnisse ("Erfasst"), wird nachgefragt, ob alle auf "Fertig" gesetzt werden
   * sollen (das erledigt der Abschluss serverseitig). Reversibel (siehe wiederOeffnen).
   */
  async function abschliessen() {
    let spiele: Spiel[];
    try {
      spiele = await getSpiele(turnierId);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden der Spiele");
      return;
    }

    const ohneErgebnis = spiele.filter((s) => s.ergebnisA == null || s.ergebnisB == null);
    if (ohneErgebnis.length > 0) {
      setFehler(
        `Turnier kann noch nicht abgeschlossen werden: ${ohneErgebnis.length} Spiel(e) haben noch kein ` +
          "erfasstes Ergebnis. Bitte zuerst im Reiter „Ergebnisse“ alle Ergebnisse erfassen.",
      );
      return;
    }

    // Alle Spiele haben ein Ergebnis; „Erfasst" (Status beendet) sind die noch nicht finalisierten.
    const nichtFinalisiert = spiele.filter((s) => s.status !== "abgeschlossen");
    const frage =
      nichtFinalisiert.length > 0
        ? `Es gibt ${nichtFinalisiert.length} erfasste, aber noch nicht abgeschlossene Ergebnisse. ` +
          'Beim Abschließen werden alle auf „Fertig" gesetzt.\n\n' +
          "Turnier jetzt abschließen? Du kannst es jederzeit wieder öffnen."
        : 'Turnier abschließen? Es erscheint danach in der Übersicht unter „Abgeschlossen". ' +
          "Du kannst es jederzeit wieder öffnen.";
    if (!window.confirm(frage)) return;

    try {
      setTurnier(await turnierAbschliessen(turnierId));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Abschließen");
    }
  }

  /** Regeln eines abgeleiteten Turniers entsperren (Escape-Hatch der Turnierleitung). */
  async function regelnEntsperren() {
    if (
      !window.confirm(
        "Regeln entsperren? Die Regeln wurden aus dem vorherigen Spieltag übernommen und sollten normalerweise " +
          "über beide Spieltage gleich sein. Nur entsperren, wenn eine Abweichung wirklich beabsichtigt ist.",
      )
    ) {
      return;
    }
    try {
      setTurnier(await turnierRegelnEntsperren(turnierId));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Entsperren der Regeln");
    }
  }

  /** Ein abgeschlossenes Turnier wieder oeffnen (zurueck zu "aktiv"). */
  async function wiederOeffnen() {
    try {
      setTurnier(await turnierWiederOeffnen(turnierId));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Wiederöffnen");
    }
  }

  async function sichtbarkeitAendern(feld: SichtbarkeitsFeld, sichtbar: boolean) {
    try {
      setTurnier(await updateTurnier(turnierId, { [feld]: sichtbar }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Freigabe");
    }
  }

  // Logo: gewaehlte Bilddatei clientseitig verkleinern und als Data-URL am Turnier speichern.
  async function logoGewaehlt(event: React.ChangeEvent<HTMLInputElement>) {
    const datei = event.target.files?.[0];
    event.target.value = ""; // erlaubt erneutes Waehlen derselben Datei
    if (!datei) return;
    if (datei.size > MAX_LOGO_BYTES) {
      setFehler("Das Logo darf höchstens 1 MB groß sein.");
      return;
    }
    try {
      const logoDataUrl = await bildAlsLogoDataUrl(datei);
      setTurnier(await updateTurnier(turnierId, { logoDataUrl }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Logo konnte nicht verarbeitet werden");
    }
  }

  // Eigenes Logo entfernen -> Standard-Torball-Logo (null setzt das Feld zurueck).
  async function logoZuruecksetzen() {
    try {
      setTurnier(await updateTurnier(turnierId, { logoDataUrl: null }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Logo konnte nicht zurückgesetzt werden");
    }
  }

  async function oeffentlicherLinkKopieren() {
    try {
      await navigator.clipboard.writeText(oeffentlicheSeiteUrl);
      setLinkHinweis("Link kopiert.");
    } catch {
      setFehler("Link konnte nicht kopiert werden.");
    }
  }

  function tabSetzen(tab: Tab) {
    setSearchParams(
      (bisherig) => {
        const naechste = new URLSearchParams(bisherig);
        naechste.set("tab", tab);
        return naechste;
      },
      { replace: true },
    );
  }

  function tabWechseln(index: number) {
    const naechster = TABS[(index + TABS.length) % TABS.length];
    tabSetzen(naechster.id);
    tabRefs.current[naechster.id]?.focus();
  }

  function aufTastendruck(event: React.KeyboardEvent, aktuellerIndex: number) {
    if (event.key === "ArrowRight") tabWechseln(aktuellerIndex + 1);
    else if (event.key === "ArrowLeft") tabWechseln(aktuellerIndex - 1);
    else if (event.key === "Home") tabWechseln(0);
    else if (event.key === "End") tabWechseln(TABS.length - 1);
  }

  if (!turnier) {
    return fehler ? <p role="alert">{fehler}</p> : <p>Lädt…</p>;
  }

  const oeffentlicheSeiteUrl = `${window.location.origin}/turniere/${turnierId}/oeffentlich`;

  // Abgeschlossenes (oder archiviertes) Turnier: die eigentlichen Turnierdaten (Name, Modus,
  // Protokollierung, Ort/Kontakt, Zusatzinfo, Regeln) sperren - zum Bearbeiten erst wieder oeffnen.
  // Spiegelt turnierGesperrt() im Backend. Bewusst NICHT gesperrt (aendern nichts am Turnier
  // selbst): die Oeffentlich-Freigabe-Checkboxen und das Teilen.
  const istGesperrt = turnier.status === "abgeschlossen" || turnier.status === "archiviert";

  // Ausgechecktes Turnier (per Turnier-Sync an eine lokale Installation): der Server lehnt JEDE
  // Aenderung ab (409) - anders als beim Abschluss auch die oeffentlich*-Freigabe. Deshalb hier ALLE
  // Eingaben deaktivieren, damit man nicht ins Leere tippt (frueher nur der rote Name, Felder blieben
  // bedienbar - vom Nutzer bemaengelt). Einzige Ausnahme: die "Freigabe aufheben"-Aktion in
  // TurnierSync (unten) muss aktiv bleiben. Das Teilen (TurnierFreigabe) laesst der Server auch bei
  // ausgechecktem Turnier zu und bleibt deshalb bewusst bedienbar.
  const eingabeGesperrt = istGesperrt || ausgecheckt;

  return (
    <>
      <p>
        <Link to="/">&larr; Zurück zur Turnierliste</Link>
      </p>
      <h1>
        {ausgecheckt ? (
          <span style={{ color: "var(--danger)" }}>{turnier.name} (gesperrt)</span>
        ) : (
          turnier.name
        )}
      </h1>
      {fehler && <p role="alert">{fehler}</p>}

      {/* Hinweis auf den gesperrten Zustand. Inhalte sind bei abgeschlossenem Turnier
          schreibgeschuetzt; nur die Oeffentlich-Freigabe und das Teilen bleiben moeglich (sie
          aendern nichts am Turnier selbst). Zum Bearbeiten in der Uebersicht "Wieder oeffnen". */}
      {turnier.status === "abgeschlossen" && !ausgecheckt && (
        <p className="turnier-gesperrt-hinweis" role="status">
          Dieses Turnier ist <strong>abgeschlossen</strong> – die Turnierdaten sind gesperrt. Zum Bearbeiten im Reiter
          „Übersicht" auf <strong>„Wieder öffnen"</strong>. Die Öffentlich-Freigabe und das Teilen bleiben möglich.
        </p>
      )}

      {/* Ausgecheckt hat Vorrang vor dem Abschluss-Hinweis: hier ist wirklich ALLES gesperrt. */}
      {ausgecheckt && (
        <p className="turnier-gesperrt-hinweis" role="status">
          Dieses Turnier wird gerade auf einer <strong>lokalen Installation</strong> verwaltet und ist hier deshalb
          vollständig <strong>schreibgeschützt</strong>. Zum Bearbeiten auf dem Server zuerst unten unter
          „Turnier-Sync" die <strong>Freigabe aufheben</strong>.
        </p>
      )}

      <div role="tablist" aria-label="Turnierbereiche">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={aktiverTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={aktiverTab === tab.id ? 0 : -1}
            className={aktiverTab === tab.id ? "tab tab-aktiv" : "tab"}
            onClick={() => tabSetzen(tab.id)}
            onKeyDown={(e) => aufTastendruck(e, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-uebersicht" aria-labelledby="tab-uebersicht" hidden={aktiverTab !== "uebersicht"}>
        <div className="tabellen-wrapper">
          <table className="uebersicht-tabelle">
            <caption className="sr-only">Turnier-Übersicht</caption>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="turnierName">Name</label>
                </th>
                <td>
                  <input
                    id="turnierName"
                    required
                    disabled={eingabeGesperrt}
                    value={allgemein?.name ?? turnier.name}
                    onChange={(e) => setAllgemein((a) => (a ? { ...a, name: e.target.value } : a))}
                    onBlur={() => allgemeinFeldSpeichern("name")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="uebersichtDatum">Datum</label>
                </th>
                <td>
                  <input id="uebersichtDatum" required readOnly value={formatiereDatum(turnier.datum)} />
                </td>
              </tr>
              {turnier.startzeit && (
                <tr>
                  <th scope="row">
                    <label htmlFor="uebersichtStartzeit">Startzeit</label>
                  </th>
                  <td>
                    <input
                      id="uebersichtStartzeit"
                      required
                      readOnly
                      value={formatiereUhrzeit(`${turnier.datum}T${turnier.startzeit}:00`)}
                    />
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row">
                  <label htmlFor="uebersichtStatus">Status</label>
                </th>
                <td>
                  <input id="uebersichtStatus" readOnly className="status-zelle" value={STATUS_LABEL[turnier.status]} />{" "}
                  {turnier.status === "abgeschlossen" ? (
                    <button type="button" onClick={wiederOeffnen} disabled={ausgecheckt}>
                      Wieder öffnen
                    </button>
                  ) : (
                    <button type="button" onClick={abschliessen} disabled={ausgecheckt}>
                      Turnier abschließen
                    </button>
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <span id="uebersichtSpielfelderLabel">Spielfelder</span>
                </th>
                <td>
                  {turnier.felder.length === 0 ? (
                    <input id="uebersichtSpielfelder" readOnly value="keine" aria-labelledby="uebersichtSpielfelderLabel" />
                  ) : (
                    turnier.felder.map((feld, index) => (
                      <span key={feld.feldId} className="spielfeld-name-eingabe">
                        <label className="sr-only" htmlFor={`spielfeldName-${feld.feldId}`}>
                          Name Spielfeld {index + 1}
                        </label>
                        <input
                          id={`spielfeldName-${feld.feldId}`}
                          required
                          disabled={eingabeGesperrt}
                          value={feldNamen?.[feld.feldId] ?? feld.name}
                          onChange={(e) =>
                            setFeldNamen((f) => (f ? { ...f, [feld.feldId]: e.target.value } : f))
                          }
                          onBlur={() => feldNameSpeichern(feld.feldId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      </span>
                    ))
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="spielplanModus">Spielmodus</label>
                </th>
                <td>
                  <select
                    id="spielplanModus"
                    disabled={eingabeGesperrt || spielplanGesperrt}
                    value={turnier.spielplanModus}
                    onChange={(e) => spielplanModusAendern(e.target.value === "doppelt" ? "doppelt" : "einfach")}
                  >
                    <option value="einfach">Jeder gegen Jeden (einfach)</option>
                    <option value="doppelt">Jeder zweimal gegen Jeden (doppelt)</option>
                  </select>
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="protokollierungsart">Protokollierung</label>
                </th>
                <td>
                  <select
                    id="protokollierungsart"
                    disabled={eingabeGesperrt || spielplanGesperrt}
                    value={turnier.protokollierungsart}
                    onChange={(e) =>
                      protokollierungsartAendern(e.target.value === "digital" ? "digital" : "manuell")
                    }
                  >
                    <option value="manuell">Manuell (Papierprotokoll, nur Endergebnisse erfasst)</option>
                    <option value="digital">Digital (Live-Ereignisprotokollierung - noch nicht umgesetzt)</option>
                  </select>
                  {turnier.protokollierungsart === "digital" && (
                    <p>
                      Die digitale Live-Protokollierung ist noch nicht umgesetzt - für Ergebniserfassung aktuell
                      auf „Manuell" umstellen.
                    </p>
                  )}
                  {spielplanGesperrt && !eingabeGesperrt && (
                    <p className="feld-hinweis">
                      Spielmodus und Protokollierung sind gesperrt, sobald der Spielplan läuft – ein Wechsel mitten im
                      Turnier ließe sich fachlich nicht sauber abfangen.
                    </p>
                  )}
                </td>
              </tr>
              {(
                [
                  { feld: "spielortName", label: "Spielort (Name)" },
                  { feld: "spielortAdresse", label: "Spielort (Adresse)" },
                  { feld: "spielortGeo", label: "Spielort (Geo-Referenz, optional)" },
                  { feld: "turnierleitungName", label: "Turnierleitung (Name)" },
                  { feld: "turnierleitungKontakt", label: "Turnierleitung (Kontakt)" },
                  { feld: "ansprechpartnerName", label: "Ansprechpartner (Name)" },
                  { feld: "ansprechpartnerKontakt", label: "Ansprechpartner (Kontakt)" },
                ] as { feld: keyof AllgemeinBearbeitung; label: string }[]
              ).map(({ feld, label }) => (
                <tr key={feld}>
                  <th scope="row">
                    <label htmlFor={feld}>{label}</label>
                  </th>
                  <td>
                    <input
                      id={feld}
                      disabled={eingabeGesperrt}
                      value={allgemein?.[feld] ?? (turnier[feld as keyof Turnier] as string | undefined) ?? ""}
                      onChange={(e) => setAllgemein((a) => (a ? { ...a, [feld]: e.target.value } : a))}
                      onBlur={() => allgemeinFeldSpeichern(feld)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                    {feld === "spielortGeo" && (
                      <>
                        {" "}
                        <a
                          className="button-link"
                          href={kartenSucheUrl("google", allgemein)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Standort in Google Maps suchen - Koordinaten dort ablesen und hier eintragen (kein automatischer Rückweg möglich)"
                        >
                          Google Maps
                        </a>{" "}
                        <a
                          className="button-link"
                          href={kartenSucheUrl("osm", allgemein)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Standort in OpenStreetMap suchen - Koordinaten dort ablesen und hier eintragen (kein automatischer Rückweg möglich)"
                        >
                          OpenStreetMap
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">
                  <label htmlFor="zusatzinfo">Zusatzinformationen</label>
                </th>
                <td>
                  <textarea
                    id="zusatzinfo"
                    rows={3}
                    disabled={eingabeGesperrt}
                    value={allgemein?.zusatzinfo ?? turnier.zusatzinfo ?? ""}
                    onChange={(e) => setAllgemein((a) => (a ? { ...a, zusatzinfo: e.target.value } : a))}
                    onBlur={() => allgemeinFeldSpeichern("zusatzinfo")}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <TurnierPruefung turnier={turnier} />

        {/* Teilen/Turnier-Codes bleiben bei einem ABGESCHLOSSENEN Turnier bedienbar (aendern nichts
            am Turnier selbst), werden aber bei einem AUSGECHECKTEN Turnier mitgesperrt - Nutzer-Vorgabe
            "nur der Freigabe-aufheben-Button (unten in TurnierSync) bleibt aktiv". */}
        <fieldset className="blank-fieldset" disabled={ausgecheckt}>
          <TurnierFreigabe turnier={turnier} onGeaendert={setTurnier} />
        </fieldset>

        {/* Sync setzt eine "Verbundene Instanz" am Benutzerkonto voraus (siehe ProfilPage) - fuer
            eine per Turnierleitung-Code angemeldete Sitzung (kein echtes Benutzerkonto, siehe
            turnierCode.ts) gibt es das nicht, deshalb hier ausgeblendet statt einer Funktion, die
            ohnehin nichts Sinnvolles anzeigen koennte. */}
        {benutzer && <TurnierSync turnierId={turnierId} onCheckoutGeaendert={ladeCheckoutStatus} />}

        <h2>Öffentliche Turnierseite</h2>
        <p>
          Wer diesen Link hat, sieht die unten freigeschalteten Bereiche - ohne Anmeldung. Jeder Bereich ist einzeln
          schaltbar; ohne freigeschalteten Bereich zeigt der Link nur den Turniernamen.
        </p>
        <ul>
          {SICHTBARKEITS_FELDER.map(({ feld, label }) => (
            <li key={feld}>
              <label>
                <input
                  type="checkbox"
                  checked={turnier[feld]}
                  disabled={ausgecheckt}
                  onChange={(e) => sichtbarkeitAendern(feld, e.target.checked)}
                />{" "}
                {label}
              </label>
            </li>
          ))}
        </ul>
        <p>
          <input type="text" readOnly value={oeffentlicheSeiteUrl} onFocus={(e) => e.target.select()} />
          <br />
          <button type="button" onClick={oeffentlicherLinkKopieren}>
            Link kopieren
          </button>{" "}
          <a className="button-link" href={oeffentlicheSeiteUrl} target="_blank" rel="noopener noreferrer">
            Öffnen
          </a>
          {linkHinweis && <> {linkHinweis}</>}
        </p>
        <QrCode text={oeffentlicheSeiteUrl} dateiname={`Turnierseite ${turnier.name}`} />
        <p className="feld-hinweis">
          QR-Code zum Aushängen – wer ihn scannt, kommt direkt auf die öffentliche Turnierseite.
        </p>

        <h2>Ausdrucke (PDF)</h2>
        <p>
          Druckfertige Dokumente – jeweils als barrierefreies PDF (Druckdialog) oder Direkt-Download. Enthalten den
          Link und QR-Code zur öffentlichen Seite.
        </p>
        <p className="druck-links">
          <Link className="button-link" to={`/turniere/${encodeURIComponent(turnierId)}/druck?doc=info`}>
            Turnierinformationen
          </Link>{" "}
          <Link className="button-link" to={`/turniere/${encodeURIComponent(turnierId)}/druck?doc=spielplan`}>
            Spielplan
          </Link>{" "}
          <Link className="button-link" to={`/turniere/${encodeURIComponent(turnierId)}/druck?doc=ergebnisse`}>
            Ergebnisse
          </Link>{" "}
          <Link className="button-link" to={`/turniere/${encodeURIComponent(turnierId)}/druck?doc=schiedsrichter`}>
            Schiedsrichter-Einteilung
          </Link>
        </p>

        <h2>Logo</h2>
        <p>
          Wird in dieser Übersicht und auf der öffentlichen Turnierseite angezeigt. Ohne eigenes Logo erscheint das
          Torball-Standardlogo. Das gewählte Bild (höchstens 1 MB) wird automatisch verkleinert, das Seitenverhältnis
          bleibt dabei erhalten.
        </p>
        <div className="logo-bereich">
          <TurnierLogo logoDataUrl={turnier.logoDataUrl} hoehe={80} />
          <div className="logo-aktionen">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={eingabeGesperrt}
              onChange={logoGewaehlt}
            />
            <button type="button" onClick={() => logoInputRef.current?.click()} disabled={eingabeGesperrt}>
              Logo wählen…
            </button>{" "}
            {turnier.logoDataUrl && (
              <button type="button" onClick={logoZuruecksetzen} disabled={eingabeGesperrt}>
                Standard-Logo verwenden
              </button>
            )}
          </div>
        </div>
      </div>

      <div role="tabpanel" id="panel-regeln" aria-labelledby="tab-regeln" hidden={aktiverTab !== "regeln"}>
        <h2>Regeln für dieses Turnier</h2>
        {turnier.regelnGesperrt && (
          <p className="turnier-gesperrt-hinweis" role="status">
            Diese Regeln wurden aus dem vorherigen Spieltag <strong>übernommen und gesperrt</strong> – beide Spieltage
            sollen gleich gewertet werden.{" "}
            <button type="button" onClick={regelnEntsperren} disabled={ausgecheckt}>
              Regeln entsperren
            </button>
          </p>
        )}
        {/* Bei gesperrten Regeln werden alle Eingaben nativ über das disabled-<fieldset>
            deaktiviert (inkl. Speichern-Knopf des Formulars); zum Ändern erst entsperren. */}
        <fieldset className="blank-fieldset" disabled={!!turnier.regelnGesperrt || eingabeGesperrt}>
          <TurnierregelnFormular
            werte={turnier}
            onSpeichern={regelnSpeichern}
            standardWerte={getSystemkonfiguration}
            hinweis="Diese Regeln gelten nur für dieses Turnier. Die Standardwerte für neue Turniere legst du unter Stammdaten → Standardregeln fest."
            spielzeitGesperrt={spielplanGesperrt}
          />
        </fieldset>
      </div>

      <div
        role="tabpanel"
        id="panel-mannschaften"
        aria-labelledby="tab-mannschaften"
        hidden={aktiverTab !== "mannschaften"}
      >
        {turnier.basisTurnierId && (
          <p className="turnier-gesperrt-hinweis" role="status">
            Die Mannschaften wurden aus dem vorherigen Spieltag <strong>übernommen und sind nicht änderbar</strong>{" "}
            (gleiche Teams über beide Spieltage). Der <strong>Kader</strong> bleibt bearbeitbar.
          </p>
        )}
        <MannschaftenListe
          turnierId={turnierId}
          spielplanVersion={turnier.spielplanVersion}
          maxSehendeSpieler={turnier.maxSehendeSpieler}
          gesperrt={eingabeGesperrt}
        />
      </div>

      <div
        role="tabpanel"
        id="panel-schiedsrichter"
        aria-labelledby="tab-schiedsrichter"
        hidden={aktiverTab !== "schiedsrichter"}
      >
        <SchiedsrichterVerwaltung turnierId={turnierId} gesperrt={eingabeGesperrt} />
      </div>

      <div role="tabpanel" id="panel-spielplan" aria-labelledby="tab-spielplan" hidden={aktiverTab !== "spielplan"}>
        {/* onGeaendert haelt den eigenen spiele-State (fuer spielplanGesperrt) aktuell - sonst
            bliebe die Spielzeit-/Spielmodus-Sperre bis zum naechsten Neuladen der Seite aus,
            obwohl hier gerade ein Spiel gestartet wurde. */}
        <SpielplanVerwaltung
          turnierId={turnierId}
          gesperrt={eingabeGesperrt}
          onTurnierGeaendert={setTurnier}
          onGeaendert={setSpiele}
        />
      </div>

      <div role="tabpanel" id="panel-ergebnisse" aria-labelledby="tab-ergebnisse" hidden={aktiverTab !== "ergebnisse"}>
        {/* ErgebnisVerwaltung sperrt Ergebnisfelder selbst ueber ergebnisAbgeschlossen (Abschluss);
            bei einem ausgecheckten Turnier lehnt der Server aber JEDE Ergebnisaenderung ab, deshalb
            hier zusaetzlich nativ ueber ein disabled-<fieldset> sperren. */}
        <fieldset className="blank-fieldset" disabled={ausgecheckt}>
          {/* onGeaendert wie beim Spielplan: ein hier erfasstes Ergebnis muss die
              Spielzeit-/Spielmodus-Sperre (spielplanGesperrt) sofort ausloesen. */}
          <ErgebnisVerwaltung turnierId={turnierId} onGeaendert={setSpiele} />
        </fieldset>
      </div>
    </>
  );
}
