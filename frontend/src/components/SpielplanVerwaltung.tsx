import { useCallback, useEffect, useState } from "react";
import type { MannschaftImTurnier, SchiedsrichterImTurnier, Spiel, Turnier } from "@torball/shared";
import {
  erzeugeSpielplan,
  getMannschaften,
  getSchiedsrichter,
  getSpiele,
  getSpielplanVorschlag,
  getTurnier,
  getTurnierProtokolle,
  reihenfolgeAendern,
  schiedsrichterZuordnen,
  spielAnpassen,
  spielStartzeitAendern,
  type SpielplanVorschlagEintrag,
} from "../api";
import { formatiereUhrzeit } from "../format";
import { TabListe } from "./TabListe";
import { schiedsrichterKonflikt } from "../schiedsrichterKonflikt";
import { spielplanBasisAenderungen } from "../spielplanBasisDiff";
import { berechneStartzeit, spieldauerMinuten } from "../zeitplanung";
import { SpeicherHinweis, useSpeicherHinweis } from "./SpeicherHinweis";

const BACK_TO_BACK_HINWEIS = "Direktes Folgespiel (Back-to-Back) konnte nicht vermieden werden";
const DOPPELBELEGUNG_HINWEIS = "Eine Mannschaft dieses Spiels ist in derselben Runde mehrfach eingeplant";
const UEBERSCHNEIDUNG_HINWEIS = "Neue Startzeit überschneidet sich mit dem vorherigen Spiel auf diesem Feld.";
const MAX_VERLAUF = 10;

/** Kurzform fuer die "Hinweis"-Spalte (Spielplan/Vorschlag) - voller Text steht als
 * title-Tooltip zur Verfuegung (Maus drueber), damit die Tabelle nicht unnoetig breit wird. */
const HINWEIS_KURZ: Record<string, string> = {
  [BACK_TO_BACK_HINWEIS]: "Back-to-Back",
  [DOPPELBELEGUNG_HINWEIS]: "Doppelbelegung",
};

function hinweisKurz(hinweis: string | undefined): string {
  if (!hinweis) return "";
  return HINWEIS_KURZ[hinweis] ?? hinweis;
}

function verschobeneListe<T>(liste: T[], vonIndex: number, nachIndex: number): T[] {
  const kopie = [...liste];
  const [element] = kopie.splice(vonIndex, 1);
  kopie.splice(nachIndex, 0, element);
  return kopie;
}

/** HH:mm im lokalen Zeitanteil des ISO-Zeitstempels - passend zum Wert eines <input type="time">. */
function zeitEingabeWert(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function mitNeuerUhrzeit(iso: string, hhmm: string): string {
  const [stunden, minuten] = hhmm.split(":").map(Number);
  const datum = new Date(iso);
  datum.setHours(stunden, minuten, 0, 0);
  return datum.toISOString();
}

interface WarnbarerEintrag {
  mannschaftAId: string;
  mannschaftBId: string;
  slot: number;
}

/**
 * Prueft direkte Folgespiele ueber die echte Zeit-Slot-Nachbarschaft (nicht die
 * Listenposition!): bei mehreren Feldern koennen zwei Spiele denselben Slot teilen
 * (= gleichzeitig auf verschiedenen Feldern), eine reine "voriger Listeneintrag"-
 * Pruefung wuerde dann teils die falschen Nachbarn vergleichen. Zusaetzlich wird eine
 * Doppelbelegung erkannt (Mannschaft zweimal im selben Slot - harte Regel, ueber die
 * manuelle Runden-Aenderung trotzdem herstellbar); sie hat als schwererer Verstoss
 * Vorrang vor dem Back-to-Back-Hinweis.
 */
function slotWarnungen<T extends WarnbarerEintrag>(eintraege: T[]): (string | undefined)[] {
  const anzahlProSlot = new Map<number, Map<string, number>>();
  for (const e of eintraege) {
    const anzahl = anzahlProSlot.get(e.slot) ?? new Map<string, number>();
    for (const team of [e.mannschaftAId, e.mannschaftBId]) {
      anzahl.set(team, (anzahl.get(team) ?? 0) + 1);
    }
    anzahlProSlot.set(e.slot, anzahl);
  }
  return eintraege.map((e) => {
    const imSlot = anzahlProSlot.get(e.slot);
    if ([e.mannschaftAId, e.mannschaftBId].some((team) => (imSlot?.get(team) ?? 0) > 1)) {
      return DOPPELBELEGUNG_HINWEIS;
    }
    const vorSlot = anzahlProSlot.get(e.slot - 1);
    const betroffen = vorSlot?.has(e.mannschaftAId) || vorSlot?.has(e.mannschaftBId);
    return betroffen ? BACK_TO_BACK_HINWEIS : undefined;
  });
}

/** Findet den naechsten/vorigen Eintrag auf demselben Feld (ueberspringt Eintraege anderer Felder). */
function nachbarImFeldIndex<T extends { feldId?: string }>(
  sortiert: T[],
  aktuellerIndex: number,
  feldId: string,
  richtung: -1 | 1,
): number | null {
  for (let i = aktuellerIndex + richtung; i >= 0 && i < sortiert.length; i += richtung) {
    if (sortiert[i].feldId === feldId) return i;
  }
  return null;
}

type FeldZeile<T> = { eintrag: T } | { platzhalter: true };

/**
 * Ergaenzt die Spiele eines Feldes um Platzhalter-Zeilen fuer Slots, in denen NICHT
 * dieses, sondern nur ein anderes Feld spielt - sonst sieht es in der Feld-Tab-Ansicht
 * so aus, als wuerde eine Mannschaft mehrfach ohne Pause hintereinander spielen, obwohl
 * dazwischen tatsaechlich ein Spiel auf dem anderen Feld liegt (und damit echte Pause).
 *
 * Je Slot koennen MEHRERE Spiele desselben Feldes vorkommen (nur ueber die manuelle
 * Runden-Aenderung herstellbar, dann als "Doppelbelegung" markiert) - alle anzeigen,
 * nicht nur das letzte: sonst waere genau das Spiel unsichtbar, das die Warnung ausloest.
 */
function mitFeldPlatzhaltern<T>(
  alle: T[],
  feldId: string,
  feldVon: (e: T) => string | undefined,
  schluesselVon: (e: T) => number,
): FeldZeile<T>[] {
  const alleSchluessel = [...new Set(alle.map(schluesselVon))].sort((a, b) => a - b);
  const aufFeld = new Map<number, T[]>();
  for (const e of alle) {
    if (feldVon(e) !== feldId) continue;
    const liste = aufFeld.get(schluesselVon(e)) ?? [];
    liste.push(e);
    aufFeld.set(schluesselVon(e), liste);
  }
  return alleSchluessel.flatMap((schluessel): FeldZeile<T>[] => {
    const eintraege = aufFeld.get(schluessel) ?? [];
    return eintraege.length > 0
      ? eintraege.map((eintrag) => ({ eintrag }))
      : [{ platzhalter: true as const }];
  });
}

interface SpielSnapshot {
  id: string;
  runde?: string;
  feldId?: string;
  startzeitGeplant?: string;
}

interface Props {
  turnierId: string;
  /** Wird nach jedem Laden/Aendern mit der aktuellen Spieleliste aufgerufen. */
  onGeaendert?: (spiele: Spiel[]) => void;
  /** Wird nach jedem Laden mit dem aktuellen Turnier aufgerufen - wichtig fuer Eltern-Seiten mit
   *  eigenem, separat geladenem Turnier-State (z.B. die Uebersicht in TurnierVerwaltenPage): eine
   *  manuelle Startzeit-Aenderung von Spiel 1 hier schreibt turnier.startzeit serverseitig mit
   *  (siehe backend/src/routes/spiel.ts), ohne diesen Callback wuerde die Uebersicht das erst nach
   *  einem Neuladen der Seite mitbekommen. */
  onTurnierGeaendert?: (turnier: Turnier) => void;
  /** Turnier abgeschlossen ODER per Turnier-Sync ausgecheckt: Bearbeitung sperren. Der Spiel-
   *  Status allein reicht dafuer NICHT: bei einem lediglich ausgecheckten Turnier sind die Spiele
   *  weiterhin "geplant", die Zeit-/Reihenfolge-Steuerung muss deshalb zusaetzlich ueber diese
   *  Prop deaktiviert werden (live aufgefallen 2026-08-20: Startzeiten blieben als einzige Felder
   *  bedienbar, der Server lehnte zwar mit 409 ab, aber die Sperre wirkte inkonsequent). Gilt
   *  ebenso fuer Vorschlag/Erzeugen/Rueckgaengig und die Schiedsrichter-Einteilung. */
  gesperrt?: boolean;
}

export function SpielplanVerwaltung({ turnierId, onGeaendert, onTurnierGeaendert, gesperrt = false }: Props) {
  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [spiele, setSpiele] = useState<Spiel[]>([]);
  const [schiedsrichter, setSchiedsrichter] = useState<SchiedsrichterImTurnier[]>([]);
  const [vorschlag, setVorschlag] = useState<SpielplanVorschlagEintrag[] | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();
  const { hinweis: speicherHinweis, melde: meldeGespeichert } = useSpeicherHinweis();
  const [ziehIndex, setZiehIndex] = useState<number | null>(null);
  const [ziehZielIndex, setZiehZielIndex] = useState<number | null>(null);
  const [aktuellesFeld, setAktuellesFeld] = useState<string | undefined>();
  const [verlauf, setVerlauf] = useState<SpielSnapshot[][]>([]);
  // Digitale Protokollierung: SOBALD irgendein Spielprotokoll existiert, gilt das Turnier als
  // begonnen (wie in TurnierVerwaltenPage) - ein Protokoll wird schon beim Eingeben des
  // Protokollant-Namens angelegt, das Spiel bleibt bis zum ersten GO aber "geplant". Ohne
  // diesen Zusatz-Check blieben "Neuer Vorschlag"/"Spielplan erzeugen" in dem Fenster bedienbar.
  const [hatProtokolle, setHatProtokolle] = useState(false);
  // Zwei getrennte Sichten auf den gespeicherten Spielplan, damit keine ueberladen wirkt:
  // "plan" = reiner Spielplan (Reihenfolge/Zeiten/Status), "einteilung" = abgespeckte
  // Schiedsrichter-Einteilung (ohne Status/Hinweis/Reihenfolge).
  const [spielplanSicht, setSpielplanSicht] = useState<"plan" | "einteilung">("plan");

  const laden = useCallback(async () => {
    try {
      const [t, m, s, sr, protokolle] = await Promise.all([
        getTurnier(turnierId),
        getMannschaften(turnierId),
        getSpiele(turnierId),
        getSchiedsrichter(turnierId),
        // Best effort: ein Fehler hier darf die Spielplan-Ansicht nicht blockieren -
        // die Sperre greift dann serverseitig (409 beim Erzeugen).
        getTurnierProtokolle(turnierId).catch(() => []),
      ]);
      setTurnier(t);
      setMannschaften(m);
      setSpiele(s);
      setSchiedsrichter(sr);
      setHatProtokolle(protokolle.length > 0);
      onGeaendert?.(s);
      onTurnierGeaendert?.(t);
      setFehler(undefined);
      setAktuellesFeld((bisherig) => bisherig ?? t.felder[0]?.feldId);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  const nameVon = (mannschaftId: string) => mannschaften.find((m) => m._id === mannschaftId)?.name ?? mannschaftId;
  const schiedsrichterNach = (id: string | undefined) => schiedsrichter.find((sr) => sr._id === id);
  const schiedsrichterLabel = (sr: SchiedsrichterImTurnier) => (sr.vorname ? `${sr.vorname} ${sr.name}` : sr.name);

  /** Erzeugt (bewusst per Klick, nicht automatisch) einen Schiedsrichter-Vorschlag ueber alle
   * Spiele und speichert ihn; danach je Spiel manuell anpassbar. */
  async function schiedsrichterVorschlagen() {
    try {
      const aktualisiert = await schiedsrichterZuordnen(turnierId);
      setSpiele(aktualisiert);
      onGeaendert?.(aktualisiert);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Zuordnen der Schiedsrichter");
    }
  }

  async function schiedsrichterFuerSpielAendern(spielId: string, schiedsrichterId: string | null) {
    try {
      await spielAnpassen(spielId, { schiedsrichterId });
      await laden();
      setFehler(undefined);
      meldeGespeichert("Schiedsrichter-Einteilung gespeichert.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern des Schiedsrichters");
    }
  }

  const mehrereFelder = (turnier?.felder.length ?? 0) > 1;
  const wiederholungen: 1 | 2 = turnier?.spielplanModus === "doppelt" ? 2 : 1;

  const spieleSortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));
  const spielWarnungen = slotWarnungen(spieleSortiert.map((s) => ({ ...s, slot: Number(s.runde) })));
  // Sobald irgendein Spiel bereits laeuft/ein Ergebnis hat ODER irgendein Spielprotokoll
  // existiert, darf kein neuer Spielplan (auch kein Vorschlag) mehr erzeugt werden - sonst
  // wuerden bereits erfasste Ergebnisse bzw. Protokolle beim Uebernehmen verworfen/verwaist.
  // Muss zu den Backend-Checks in spielplan.ts passen.
  const ergebnisseVorhanden = spiele.some((s) => s.status !== "geplant" || s.ergebnisAbgeschlossen);
  const spielplanGesperrt = ergebnisseVorhanden || hatProtokolle;
  const sperrGrund = ergebnisseVorhanden
    ? "Es sind bereits Ergebnisse erfasst"
    : "Es gibt bereits begonnene Spielprotokolle";

  const vorschlagSortiert = vorschlag ? [...vorschlag].sort((a, b) => a.slot - b.slot) : undefined;

  const angezeigteSpiele: FeldZeile<Spiel>[] = mehrereFelder
    ? aktuellesFeld
      ? mitFeldPlatzhaltern(spieleSortiert, aktuellesFeld, (s) => s.feldId, (s) => Number(s.runde))
      : []
    : spieleSortiert.map((s) => ({ eintrag: s }));
  const angezeigterVorschlag: FeldZeile<SpielplanVorschlagEintrag>[] | undefined = vorschlagSortiert
    ? mehrereFelder
      ? aktuellesFeld
        ? mitFeldPlatzhaltern(vorschlagSortiert, aktuellesFeld, (e) => e.feldId, (e) => e.slot)
        : []
      : vorschlagSortiert.map((e) => ({ eintrag: e }))
    : undefined;

  function snapshotJetzt(): SpielSnapshot[] {
    return spiele.map((s) => ({ id: s._id, runde: s.runde, feldId: s.feldId, startzeitGeplant: s.startzeitGeplant }));
  }

  function verlaufSichern() {
    setVerlauf((bisherig) => [...bisherig.slice(-(MAX_VERLAUF - 1)), snapshotJetzt()]);
  }

  function verlaufVerwerfen() {
    setVerlauf((bisherig) => bisherig.slice(0, -1));
  }

  async function rueckgaengig() {
    const letzter = verlauf.at(-1);
    if (!letzter) return;
    const aktuelleNachId = new Map(spiele.map((s) => [s._id, s]));
    const zuWiederherstellen = letzter.filter((snap) => {
      const aktuell = aktuelleNachId.get(snap.id);
      return (
        aktuell &&
        (aktuell.runde !== snap.runde ||
          aktuell.feldId !== snap.feldId ||
          aktuell.startzeitGeplant !== snap.startzeitGeplant)
      );
    });
    try {
      await Promise.all(
        zuWiederherstellen.map((snap) =>
          spielAnpassen(snap.id, { runde: snap.runde, feldId: snap.feldId, startzeitGeplant: snap.startzeitGeplant }),
        ),
      );
      setVerlauf((bisherig) => bisherig.slice(0, -1));
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Rückgängig machen");
    }
  }


  async function anNeuePositionVerschieben(vonVollIndex: number, richtung: -1 | 1) {
    if (!aktuellesFeld) return;

    if (!mehrereFelder) {
      const nachIndex = vonVollIndex + richtung;
      if (nachIndex < 0 || nachIndex >= spieleSortiert.length) return;
      const neueReihenfolge = verschobeneListe(spieleSortiert, vonVollIndex, nachIndex).map((s) => s._id);
      verlaufSichern();
      try {
        await reihenfolgeAendern(turnierId, neueReihenfolge);
        await laden();
      } catch (err) {
        verlaufVerwerfen();
        setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Reihenfolge");
      }
      return;
    }

    // Bei mehreren Feldern: nur runde+Startzeit der beiden Spiele auf DEMSELBEN Feld gezielt
    // vertauschen (nicht reihenfolgeAendern - das wuerde ALLE Spiele fortlaufend neu
    // durchnummerieren und damit die Feld-Parallelitaet der uebrigen Spiele zerstoeren).
    const nachbarIndex = nachbarImFeldIndex(spieleSortiert, vonVollIndex, aktuellesFeld, richtung);
    if (nachbarIndex === null) return;
    const a = spieleSortiert[vonVollIndex];
    const b = spieleSortiert[nachbarIndex];
    verlaufSichern();
    try {
      await Promise.all([
        spielAnpassen(a._id, { runde: b.runde, startzeitGeplant: b.startzeitGeplant }),
        spielAnpassen(b._id, { runde: a.runde, startzeitGeplant: a.startzeitGeplant }),
      ]);
      await laden();
    } catch (err) {
      verlaufVerwerfen();
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Reihenfolge");
    }
  }

  async function startzeitPersistiertAendern(spiel: Spiel, hhmm: string) {
    if (!spiel.startzeitGeplant) return;
    verlaufSichern();
    try {
      await spielStartzeitAendern(spiel._id, mitNeuerUhrzeit(spiel.startzeitGeplant, hhmm));
      await laden();
      meldeGespeichert("Startzeit gespeichert.");
    } catch (err) {
      verlaufVerwerfen();
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Startzeit");
    }
  }

  /**
   * Verschiebt einen Eintrag im noch ungespeicherten Vorschlag. Rein clientseitig,
   * kein Server-Rundlauf: bei einem Feld wird die Position (und damit slot/Startzeit)
   * komplett neu vergeben; bei mehreren Feldern werden nur die Slots der beiden
   * betroffenen Spiele auf demselben Feld vertauscht, der Rest bleibt unberuehrt.
   * Warnungen werden in jedem Fall fuer die neue Nachbarschaft neu berechnet.
   */
  function vorschlagVerschieben(vonVollIndex: number, richtung: -1 | 1) {
    if (!turnier || !vorschlagSortiert || !aktuellesFeld) return;

    if (!mehrereFelder) {
      const nachIndex = vonVollIndex + richtung;
      if (nachIndex < 0 || nachIndex >= vorschlagSortiert.length) return;
      const neu = verschobeneListe(vorschlagSortiert, vonVollIndex, nachIndex).map((eintrag, index) => ({
        ...eintrag,
        slot: index,
        startzeitGeplant: berechneStartzeit(turnier, index),
      }));
      const warnungen = slotWarnungen(neu);
      setVorschlag(neu.map((e, i) => ({ ...e, warnung: warnungen[i] })));
      return;
    }

    const nachbarIndex = nachbarImFeldIndex(vorschlagSortiert, vonVollIndex, aktuellesFeld, richtung);
    if (nachbarIndex === null) return;
    const neu = vorschlagSortiert.map((e, i) => {
      if (i === vonVollIndex) return { ...e, slot: vorschlagSortiert[nachbarIndex].slot };
      if (i === nachbarIndex) return { ...e, slot: vorschlagSortiert[vonVollIndex].slot };
      return e;
    });
    const warnungen = slotWarnungen(neu);
    setVorschlag(
      neu.map((e, i) => ({ ...e, startzeitGeplant: berechneStartzeit(turnier, e.slot), warnung: warnungen[i] })),
    );
  }

  /** Verschiebt einen Eintrag im Vorschlag auf eine manuell gewaehlte Uhrzeit; alle nachfolgenden ruecken um dasselbe Delta mit. */
  function vorschlagZeitAendern(vollIndex: number, hhmm: string) {
    if (!turnier || !vorschlagSortiert) return;
    const eintrag = vorschlagSortiert[vollIndex];
    if (!eintrag.startzeitGeplant) return;
    const neueZeit = mitNeuerUhrzeit(eintrag.startzeitGeplant, hhmm);

    // Der Kaskaden-Verschub weiter unten haelt den Abstand zu SPAETEREN Spielen auf
    // demselben Feld ein (die wandern um dasselbe Delta mit). Nur ein Zurueckdatieren
    // vor das Ende des vorherigen, nicht mitverschobenen Spiels auf demselben Feld ist
    // unzulaessig - das darf nicht kommentarlos zu einer Ueberschneidung fuehren.
    const vorherigenIndex = nachbarImFeldIndex(vorschlagSortiert, vollIndex, eintrag.feldId, -1);
    const vorheriges = vorherigenIndex !== null ? vorschlagSortiert[vorherigenIndex] : undefined;
    if (vorheriges?.startzeitGeplant) {
      const vorherigesEnde = new Date(vorheriges.startzeitGeplant).getTime() + spieldauerMinuten(turnier) * 60_000;
      if (new Date(neueZeit).getTime() < vorherigesEnde) {
        setFehler(UEBERSCHNEIDUNG_HINWEIS);
        return;
      }
    }

    setFehler(undefined);
    const deltaMs = new Date(neueZeit).getTime() - new Date(eintrag.startzeitGeplant).getTime();
    const aktualisiert = vorschlagSortiert.map((e, i) => {
      if (i < vollIndex || !e.startzeitGeplant) return e;
      return { ...e, startzeitGeplant: new Date(new Date(e.startzeitGeplant).getTime() + deltaMs).toISOString() };
    });
    setVorschlag(aktualisiert);
  }

  async function neuerVorschlag() {
    try {
      // Das Turnier bewusst frisch mitladen: der lokale turnier-State wird sonst nur beim Mounten
      // der Komponente geholt (laden() haengt nur an turnierId). Nach einer zwischenzeitlichen
      // Regelaenderung auf einem anderen Reiter - etwa "Pause zwischen Spielen" - liefe er sonst
      // veraltet in die LOKALE Zeitberechnung beim anschliessenden manuellen Umsortieren des
      // Vorschlags (berechneStartzeit/spieldauerMinuten weiter unten). Die Vorschlagszeiten selbst
      // kommen frisch vom Backend und waren nie betroffen; es geht allein um die Folge-Umsortierung.
      const [ergebnis, frischesTurnier] = await Promise.all([
        getSpielplanVorschlag(turnierId, wiederholungen),
        getTurnier(turnierId),
      ]);
      setTurnier(frischesTurnier);
      setVorschlag(ergebnis.spiele);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Berechnen des Vorschlags");
    }
  }

  async function spielplanErzeugen() {
    try {
      const eintraege = vorschlagSortiert?.map(({ mannschaftAId, mannschaftBId, feldId, slot, warnung }) => ({
        mannschaftAId,
        mannschaftBId,
        feldId,
        slot,
        warnung,
      }));
      await erzeugeSpielplan(turnierId, wiederholungen, eintraege);
      setVorschlag(undefined);
      setVerlauf([]);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Erzeugen des Spielplans");
    }
  }

  if (!turnier) {
    return fehler ? <p role="alert">{fehler}</p> : <p>Lädt…</p>;
  }

  const basisAenderungen = spielplanBasisAenderungen(turnier, mannschaften);

  return (
    <div>
      {fehler && <p role="alert">{fehler}</p>}
      <SpeicherHinweis hinweis={speicherHinweis} />

      {basisAenderungen.length > 0 && (
        <div className="konfig-aenderung-hinweis" role="alert">
          <strong>⚠ Basiskonfiguration seit der Spielplan-Erzeugung geändert.</strong> Der gespeicherte Spielplan
          (Version {turnier.spielplanVersion}) passt eventuell nicht mehr. Geändert wurde:
          <ul>
            {basisAenderungen.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          Erzeuge den Spielplan neu, um ihn an die geänderte Konfiguration anzupassen.
        </div>
      )}

      {spielplanGesperrt && (
        <p>
          {sperrGrund} - der Spielplan kann daher nicht neu erzeugt werden.
        </p>
      )}
      <button
        type="button"
        onClick={neuerVorschlag}
        disabled={mannschaften.length < 2 || spielplanGesperrt || gesperrt}
        title={spielplanGesperrt ? `${sperrGrund} - kein neuer Vorschlag möglich.` : undefined}
      >
        Neuer Vorschlag
      </button>

      {/* Direkt (kein Wrapper-Funktionskomponent im Komponentenrumpf): eine innen definierte
          Komponente bekaeme bei jedem Render eine neue Identitaet und wuerde remounten -
          der per Pfeiltaste gesetzte Fokus ginge dabei verloren (im Browser beobachtet). */}
      {turnier.felder.length > 1 && (
        <TabListe
          ariaLabel="Spielfeld auswählen"
          className="feld-tabs"
          tabs={turnier.felder.map((f) => ({ id: f.feldId, label: f.name }))}
          aktiv={aktuellesFeld ?? turnier.felder[0].feldId}
          onWechsel={setAktuellesFeld}
        />
      )}

      {/* Ergebnisbereich steht bewusst immer an derselben Stelle unterhalb der Steuerung:
          Vorschau, falls gerade berechnet, sonst der zuletzt gespeicherte Spielplan - nie beides
          gleichzeitig und nie "oberhalb" der gerade benutzten Bedienelemente. */}
      {vorschlagSortiert && angezeigterVorschlag ? (
        <>
          <h3>Vorschau (noch nicht gespeichert)</h3>
          {spiele.length > 0 && (
            <p>
              Es existiert bereits ein gespeicherter Spielplan (Version {turnier.spielplanVersion}). Er bleibt
              unverändert, bis du „Spielplan erzeugen" klickst.
            </p>
          )}
          <div className="tabellen-wrapper">
            <table className="spielplan-tabelle">
              <caption className="sr-only">
                Berechneter Spielplan-Vorschlag, Reihenfolge und Startzeit per Ziehpunkt, Pfeiltasten bzw. Zeitfeld
                änderbar
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="reihenfolge-zelle">
                    <span className="sr-only">Reihenfolge</span>
                  </th>
                  <th scope="col" className="spalte-spiel">Nr.</th>
                  <th scope="col" className="spalte-startzeit">Startzeit</th>
                  <th scope="col">Mannschaft A</th>
                  <th scope="col">Mannschaft B</th>
                  <th scope="col" className="spalte-hinweis">Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const echteAnzahl = angezeigterVorschlag.filter((z) => !("platzhalter" in z)).length;
                  let anzeigeZaehler = 0;
                  return angezeigterVorschlag.map((zeile, zeilenIndex) => {
                    if ("platzhalter" in zeile) {
                      return (
                        <tr key={`platzhalter-${zeilenIndex}`} className="platzhalter-zeile">
                          <td className="reihenfolge-zelle">–</td>
                          <td colSpan={5}>Spielpause (anderes Feld spielt)</td>
                        </tr>
                      );
                    }
                    const eintrag = zeile.eintrag;
                    const anzeigeIndex = anzeigeZaehler++;
                    const vollIndex = vorschlagSortiert.indexOf(eintrag);
                    return (
                      <tr
                        key={vollIndex}
                        className={ziehZielIndex === vollIndex ? "zieh-ziel" : undefined}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setZiehZielIndex(vollIndex);
                        }}
                        onDrop={() => {
                          if (ziehIndex !== null) {
                            const richtung = ziehIndex < vollIndex ? 1 : -1;
                            vorschlagVerschieben(ziehIndex, richtung);
                          }
                          setZiehIndex(null);
                          setZiehZielIndex(null);
                        }}
                      >
                        <td className="reihenfolge-zelle">
                          <span
                            className="ziehpunkt"
                            draggable
                            onDragStart={() => setZiehIndex(vollIndex)}
                            onDragEnd={() => {
                              setZiehIndex(null);
                              setZiehZielIndex(null);
                            }}
                            aria-hidden="true"
                            title="Zum Verschieben ziehen"
                          >
                            ⠿
                          </span>
                          <button
                            type="button"
                            className="symbol-button"
                            onClick={() => vorschlagVerschieben(vollIndex, -1)}
                            disabled={anzeigeIndex === 0}
                            aria-label={`Spiel ${anzeigeIndex + 1} nach vorne verschieben`}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="symbol-button"
                            onClick={() => vorschlagVerschieben(vollIndex, 1)}
                            disabled={anzeigeIndex === echteAnzahl - 1}
                            aria-label={`Spiel ${anzeigeIndex + 1} nach hinten verschieben`}
                          >
                            ▼
                          </button>
                        </td>
                        <td>{anzeigeIndex + 1}</td>
                        <td>
                          <label className="sr-only" htmlFor={`vorschau-zeit-${vollIndex}`}>
                            Startzeit von Spiel {anzeigeIndex + 1}
                          </label>
                          {eintrag.startzeitGeplant ? (
                            <input
                              id={`vorschau-zeit-${vollIndex}`}
                              type="time"
                              // onBlur statt onChange: das native Zeitfeld hat schon nach der
                              // Stunden-Eingabe (mit der noch unveraenderten alten Minute) einen
                              // vollstaendigen Wert - onChange wuerde also mitten in der Eingabe
                              // feuern und mit der spaeteren Neu-Renderung die laufende Eingabe
                              // unterbrechen (Bug-Meldung 2026-08-14).
                              defaultValue={zeitEingabeWert(eintrag.startzeitGeplant)}
                              key={eintrag.startzeitGeplant}
                              onBlur={(e) => {
                                const hhmm = e.target.value;
                                if (hhmm && hhmm !== zeitEingabeWert(eintrag.startzeitGeplant)) {
                                  vorschlagZeitAendern(vollIndex, hhmm);
                                }
                              }}
                            />
                          ) : (
                            "–"
                          )}
                        </td>
                        <td>{nameVon(eintrag.mannschaftAId)}</td>
                        <td>{nameVon(eintrag.mannschaftBId)}</td>
                        <td title={eintrag.warnung}>{hinweisKurz(eintrag.warnung)}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
          {/* gesperrt/spielplanGesperrt koennen auch bei offenem Vorschlag noch true WERDEN (z.B.
              "Für lokale Nutzung herunterladen" in TurnierSync setzt ausgecheckt sofort; ein
              zwischenzeitlich gestartetes Spielprotokoll faellt beim naechsten laden() auf) -
              deshalb auch hier sperren. */}
          <button type="button" onClick={spielplanErzeugen} disabled={gesperrt || spielplanGesperrt}>
            {spiele.length > 0 ? "Spielplan neu erzeugen" : "Spielplan erzeugen"}
          </button>{" "}
          <button type="button" onClick={() => setVorschlag(undefined)}>
            Vorschlag verwerfen
          </button>
        </>
      ) : spiele.length > 0 ? (
        <>
          <p>Spielplan ist bereits erzeugt (Version {turnier.spielplanVersion}).</p>

          <TabListe
            ariaLabel="Spielplan-Sicht"
            className="feld-tabs"
            tabs={[
              { id: "plan", label: "Spielplan" },
              { id: "einteilung", label: "Schiedsrichter-Einteilung" },
            ]}
            aktiv={spielplanSicht}
            onWechsel={(id) => setSpielplanSicht(id as "plan" | "einteilung")}
          />

          {spielplanSicht === "plan" ? (
            <>
              <button type="button" onClick={rueckgaengig} disabled={verlauf.length === 0 || gesperrt}>
                Rückgängig{verlauf.length > 0 ? ` (${verlauf.length})` : ""}
              </button>
              <div className="tabellen-wrapper">
                <table className="spielplan-tabelle">
                  <caption className="sr-only">
                    Erzeugter Spielplan, Reihenfolge und Startzeit per Ziehpunkt, Pfeiltasten bzw. Zeitfeld änderbar
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="reihenfolge-zelle">
                        <span className="sr-only">Reihenfolge</span>
                      </th>
                      <th scope="col" className="spalte-spiel">Nr.</th>
                      <th scope="col" className="spalte-startzeit">Startzeit</th>
                      <th scope="col">Mannschaft A</th>
                      <th scope="col">Mannschaft B</th>
                      <th scope="col" className="spalte-status">Status</th>
                      <th scope="col" className="spalte-hinweis">Hinweis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const echteAnzahl = angezeigteSpiele.filter((z) => !("platzhalter" in z)).length;
                      let anzeigeZaehler = 0;
                      return angezeigteSpiele.map((zeile, zeilenIndex) => {
                        if ("platzhalter" in zeile) {
                          return (
                            <tr key={`platzhalter-${zeilenIndex}`} className="platzhalter-zeile">
                              <td className="reihenfolge-zelle">–</td>
                              <td colSpan={6}>Spielpause (anderes Feld spielt)</td>
                            </tr>
                          );
                        }
                        const s = zeile.eintrag;
                        const anzeigeIndex = anzeigeZaehler++;
                        const vollIndex = spieleSortiert.indexOf(s);
                        return (
                          <tr
                            key={s._id}
                            className={ziehZielIndex === vollIndex ? "zieh-ziel" : undefined}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setZiehZielIndex(vollIndex);
                            }}
                            onDrop={() => {
                              if (ziehIndex !== null) {
                                const richtung = ziehIndex < vollIndex ? 1 : -1;
                                anNeuePositionVerschieben(ziehIndex, richtung);
                              }
                              setZiehIndex(null);
                              setZiehZielIndex(null);
                            }}
                          >
                            <td className="reihenfolge-zelle">
                              <span
                                className="ziehpunkt"
                                draggable={s.status === "geplant" && !gesperrt}
                                onDragStart={() => setZiehIndex(vollIndex)}
                                onDragEnd={() => {
                                  setZiehIndex(null);
                                  setZiehZielIndex(null);
                                }}
                                aria-hidden="true"
                                title="Zum Verschieben ziehen"
                              >
                                ⠿
                              </span>
                              <button
                                type="button"
                                className="symbol-button"
                                onClick={() => anNeuePositionVerschieben(vollIndex, -1)}
                                disabled={anzeigeIndex === 0 || s.status !== "geplant" || gesperrt}
                                aria-label={`Spiel ${anzeigeIndex + 1} nach vorne verschieben`}
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                className="symbol-button"
                                onClick={() => anNeuePositionVerschieben(vollIndex, 1)}
                                disabled={anzeigeIndex === echteAnzahl - 1 || s.status !== "geplant" || gesperrt}
                                aria-label={`Spiel ${anzeigeIndex + 1} nach hinten verschieben`}
                              >
                                ▼
                              </button>
                            </td>
                            <td>{anzeigeIndex + 1}</td>
                            <td>
                              <label className="sr-only" htmlFor={`spiel-zeit-${s._id}`}>
                                Startzeit von Spiel {anzeigeIndex + 1}
                              </label>
                              {s.startzeitGeplant ? (
                                <input
                                  id={`spiel-zeit-${s._id}`}
                                  type="time"
                                  // onBlur statt onChange, siehe Kommentar bei der Vorschlag-Tabelle
                                  // oben - hier zusaetzlich wichtig, weil onChange sonst bei jeder
                                  // Teil-Eingabe einen Server-Rundlauf (inkl. Kaskaden-Verschub der
                                  // nachfolgenden Spiele) ausloesen wuerde.
                                  defaultValue={zeitEingabeWert(s.startzeitGeplant)}
                                  key={s.startzeitGeplant}
                                  disabled={s.status !== "geplant" || gesperrt}
                                  onBlur={(e) => {
                                    const hhmm = e.target.value;
                                    if (hhmm && hhmm !== zeitEingabeWert(s.startzeitGeplant)) {
                                      startzeitPersistiertAendern(s, hhmm);
                                    }
                                  }}
                                />
                              ) : (
                                formatiereUhrzeit(s.startzeitGeplant)
                              )}
                            </td>
                            <td>{nameVon(s.mannschaftAId)}</td>
                            <td>{nameVon(s.mannschaftBId)}</td>
                            <td className="status-zelle">{s.status}</td>
                            <td title={spielWarnungen[vollIndex]}>{hinweisKurz(spielWarnungen[vollIndex])}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={schiedsrichterVorschlagen}
                disabled={schiedsrichter.length === 0 || gesperrt}
                title={
                  schiedsrichter.length === 0
                    ? "Erst im Tab Schiedsrichter Personen anlegen."
                    : "Ordnet allen Spielen einen Schiedsrichter-Vorschlag zu (überschreibt bestehende Zuordnungen). Danach je Spiel manuell änderbar."
                }
              >
                Schiedsrichter automatisch zuordnen
              </button>
              <div className="tabellen-wrapper">
                <table className="spielplan-tabelle">
                  <caption className="sr-only">Schiedsrichter-Einteilung je Spiel</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="spalte-spiel">Nr.</th>
                      <th scope="col" className="spalte-startzeit">Startzeit</th>
                      <th scope="col">Mannschaft A</th>
                      <th scope="col">Mannschaft B</th>
                      <th scope="col" className="spalte-schiedsrichter">Schiedsrichter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let anzeigeZaehler = 0;
                      return angezeigteSpiele.map((zeile, zeilenIndex) => {
                        if ("platzhalter" in zeile) {
                          return (
                            <tr key={`platzhalter-${zeilenIndex}`} className="platzhalter-zeile">
                              <td colSpan={5}>Spielpause (anderes Feld spielt)</td>
                            </tr>
                          );
                        }
                        const s = zeile.eintrag;
                        const anzeigeIndex = anzeigeZaehler++;
                        const konflikt = schiedsrichterKonflikt(
                          s,
                          schiedsrichterNach(s.schiedsrichterId)?.vereinId,
                          spiele,
                          mannschaften,
                        );
                        return (
                          <tr key={s._id}>
                            <td>{anzeigeIndex + 1}</td>
                            <td>{formatiereUhrzeit(s.startzeitGeplant)}</td>
                            <td>{nameVon(s.mannschaftAId)}</td>
                            <td>{nameVon(s.mannschaftBId)}</td>
                            <td>
                              <label className="sr-only" htmlFor={`spiel-sr-${s._id}`}>
                                Schiedsrichter für Spiel {anzeigeIndex + 1}
                              </label>
                              <select
                                id={`spiel-sr-${s._id}`}
                                className="spiel-schiri-select"
                                disabled={gesperrt}
                                value={s.schiedsrichterId ?? ""}
                                onChange={(e) => schiedsrichterFuerSpielAendern(s._id, e.target.value || null)}
                              >
                                <option value="">— keiner —</option>
                                {schiedsrichter.map((sr) => (
                                  <option key={sr._id} value={sr._id}>
                                    {schiedsrichterLabel(sr)}
                                  </option>
                                ))}
                              </select>
                              {konflikt.eigeneMannschaft && (
                                <div className="schiri-warnung" title="Schiedsrichter pfeift die eigene Mannschaft">
                                  ⚠ eigene Mannschaft
                                </div>
                              )}
                              {konflikt.gleichzeitig && (
                                <div className="schiri-hinweis" title="Eine Mannschaft des Schiedsrichters spielt gleichzeitig">
                                  ⚠ spielt gleichzeitig
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : (
        <p>Noch kein Spielplan erzeugt.</p>
      )}
    </div>
  );
}
