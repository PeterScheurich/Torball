import { useCallback, useEffect, useState } from "react";
import type { HinweisStufe, ModusEinstellungen, Spielmodus, TurniermodusVorlage } from "@torball/shared";
import {
  getModusPlan,
  getTurniermodi,
  istModusAnsicht,
  setzeTurniermodus,
  type ModusAnsicht,
  type ModusAntwort,
} from "../api";
import { TurniermodusSelect } from "./TurniermodusSelect";

/**
 * Auswahl des Turniermodus in der Turnier-Übersicht (Auftraggeber-Konzept 31.10.2026): die Vorlage legt
 * die Struktur fest (Gruppen, Endrunde), Endrundengröße und die Haken für Platz 3 und Platzierungsspiele
 * stellt die Turnierleitung je Turnier ein. Die Teams je Gruppe ergeben sich aus der Zuordnung im Reiter
 * „Mannschaften“. Rückmeldungen (Hinweis, Warnung, offene Stelle) blockieren nichts.
 */

const STUFE_TEXT: Record<HinweisStufe, string> = {
  hinweis: "Hinweis",
  warnung: "Warnung",
  offen: "Offene Stelle",
};

function endrundeText(groesse: number, gruppen: 1 | 2): string {
  switch (groesse) {
    case 0:
      return gruppen === 2 ? "Keine Endrunde" : "Keine Endrunde (die Tabelle entscheidet)";
    case 2:
      return "Nur Finale (2 Mannschaften)";
    case 4:
      return "Halbfinale und Finale (4 Mannschaften)";
    case 6:
      return gruppen === 2
        ? "Viertelfinale, Halbfinale, Finale (6 Mannschaften – die Gruppensieger sind im Halbfinale gesetzt)"
        : "Viertelfinale, Halbfinale, Finale (6 Mannschaften – Platz 1 und 2 sind im Halbfinale gesetzt)";
    case 8:
      return "Viertelfinale, Halbfinale, Finale (8 Mannschaften)";
    default:
      return `${groesse} Mannschaften`;
  }
}

interface Props {
  turnierId: string;
  /** Turnier abgeschlossen oder ausgecheckt - alles gesperrt. */
  gesperrt: boolean;
  /** Es gibt schon Spiele der Vorrunde (ein Wechsel der Gruppenzahl passt dann nicht mehr dazu). */
  spielplanVorhanden: boolean;
  spielplanBegonnen: boolean;
  onGespeichert: (text: string) => void;
  onFehler: (text: string | undefined) => void;
  /** Nach jedem erfolgreichen Speichern (die Seite laedt dann das Turnier neu, z. B. fuer die Gruppen-Spalte). */
  onModusGeaendert?: () => void;
  /** Aktueller Spielmodus (einfach/doppelt) - er gehoert zur selben Auswahl wie die Vorlage. */
  spielmodus: Spielmodus;
  /** Aendert den Spielmodus am Turnier; liefert false, wenn die Aenderung abgebrochen wurde. */
  onSpielmodusAendern: (modus: Spielmodus) => Promise<boolean>;
  /** Wird hochgezaehlt, wenn sich etwas ausserhalb geaendert hat (z. B. die Gruppenzuordnung) - laedt neu. */
  aktualisierung?: number;
}

export function TurniermodusAuswahl({
  turnierId,
  gesperrt,
  spielplanVorhanden,
  spielplanBegonnen,
  onGespeichert,
  onFehler,
  onModusGeaendert,
  spielmodus,
  onSpielmodusAendern,
  aktualisierung = 0,
}: Props) {
  const [vorlagen, setVorlagen] = useState<TurniermodusVorlage[]>([]);
  const [antwort, setAntwort] = useState<ModusAntwort | undefined>();

  const laden = useCallback(async () => {
    try {
      const [v, a] = await Promise.all([getTurniermodi(), getModusPlan(turnierId)]);
      setVorlagen(v);
      setAntwort(a);
    } catch (err) {
      onFehler(err instanceof Error ? err.message : "Der Turniermodus konnte nicht geladen werden.");
    }
  }, [turnierId, onFehler]);

  useEffect(() => {
    void laden();
  }, [laden, aktualisierung]);

  if (!antwort || vorlagen.length === 0) return <p>Turniermodus wird geladen …</p>;

  const ansicht: ModusAnsicht | undefined = istModusAnsicht(antwort) ? antwort : undefined;
  const vorlage = ansicht?.vorlage ?? vorlagen.find((v) => v.id === "jeder-gegen-jeden") ?? vorlagen[0];
  const einstellungen: ModusEinstellungen = ansicht?.einstellungen ?? {
    endrundeGroesse: vorlage.standardEndrunde,
    platz3: vorlage.platz3Standard,
    platzierungsspiele: vorlage.platzierungsspieleStandard,
  };
  const endrundeErzeugt = ansicht?.plan.some((p) => p.spielId) ?? false;
  const gesperrtGrund = gesperrt || endrundeErzeugt;

  async function speichern(
    vorlageId: string,
    neu?: ModusEinstellungen,
    meldung = "Turniermodus gespeichert.",
  ): Promise<boolean> {
    onFehler(undefined);
    try {
      setAntwort(await setzeTurniermodus(turnierId, vorlageId, neu));
      onGespeichert(meldung);
      onModusGeaendert?.();
      return true;
    } catch (err) {
      onFehler(err instanceof Error ? err.message : "Der Turniermodus konnte nicht gespeichert werden.");
      void laden();
      return false;
    }
  }

  /** Eine Auswahl, zwei Werte: die Vorlage (Gruppen/Endrunde) und der Spielmodus der Vorrunde. */
  async function modusWaehlen(vorlageId: string, neuerSpielmodus: Spielmodus) {
    if (vorlageId !== vorlage.id) {
      if (!(await vorlageWechseln(vorlageId))) return;
    }
    if (neuerSpielmodus !== spielmodus) await onSpielmodusAendern(neuerSpielmodus);
  }

  async function vorlageWechseln(id: string): Promise<boolean> {
    const ziel = vorlagen.find((v) => v.id === id);
    if (!ziel || id === vorlage.id) return false;
    if (
      spielplanVorhanden &&
      ziel.gruppen !== vorlage.gruppen &&
      !window.confirm(
        "Für dieses Turnier existiert bereits ein Spielplan. Eine andere Zahl von Gruppen passt nicht mehr dazu – " +
          "der Spielplan muss danach neu erzeugt werden. Trotzdem wechseln?",
      )
    ) {
      return false;
    }
    return speichern(id, undefined, `Turniermodus „${ziel.name}“ gewählt.`);
  }

  const gruppenText =
    ansicht && vorlage.gruppen === 2
      ? `Gruppe A: ${ansicht.gruppenGroessen[0] ?? 0} Mannschaften, Gruppe B: ${ansicht.gruppenGroessen[1] ?? 0} Mannschaften.`
      : undefined;

  return (
    <>
      <TurniermodusSelect
        id="turniermodus"
        vorlagen={vorlagen}
        vorlageId={vorlage.id}
        spielmodus={spielmodus}
        disabled={gesperrtGrund || spielplanBegonnen}
        onChange={(v, m) => void modusWaehlen(v, m)}
      />

      {vorlage.endrundeGroessen.length > 1 && (
        <p>
          <label htmlFor="endrundeGroesse">Endrunde </label>
          <select
            id="endrundeGroesse"
            disabled={gesperrtGrund}
            value={einstellungen.endrundeGroesse}
            onChange={(e) =>
              void speichern(vorlage.id, { ...einstellungen, endrundeGroesse: Number(e.target.value) }, "Endrunde gespeichert.")
            }
          >
            {vorlage.endrundeGroessen.map((g) => (
              <option key={g} value={g}>
                {endrundeText(g, vorlage.gruppen)}
              </option>
            ))}
          </select>
        </p>
      )}
      {(vorlage.endrundeGroessen.length > 1 || vorlage.gruppen === 2) && (
        <>
          {einstellungen.endrundeGroesse >= 4 && (
            <label>
              <input
                type="checkbox"
                disabled={gesperrtGrund}
                checked={einstellungen.platz3}
                onChange={(e) =>
                  void speichern(vorlage.id, { ...einstellungen, platz3: e.target.checked }, "Spiel um Platz 3 gespeichert.")
                }
              />{" "}
              Spiel um Platz 3
            </label>
          )}{" "}
          {(vorlage.gruppen === 2 || einstellungen.endrundeGroesse > 0) && (
            <label>
              <input
                type="checkbox"
                disabled={gesperrtGrund}
                checked={einstellungen.platzierungsspiele}
                onChange={(e) =>
                  void speichern(
                    vorlage.id,
                    { ...einstellungen, platzierungsspiele: e.target.checked },
                    "Platzierungsspiele gespeichert.",
                  )
                }
              />{" "}
              Platzierungsspiele für alle übrigen Mannschaften
            </label>
          )}
        </>
      )}

      {gruppenText && <p>{gruppenText} Die Zuordnung geschieht im Reiter „Mannschaften“.</p>}
      {endrundeErzeugt && (
        <p>Spiele der Endrunde wurden bereits erzeugt – Modus, Gruppen und Endrunde lassen sich nicht mehr ändern.</p>
      )}
      {spielplanBegonnen && !endrundeErzeugt && (
        <p>
          Der Turniermodus lässt sich nicht mehr wechseln, sobald Spiele begonnen haben. Endrunde, Platz 3 und
          Platzierungsspiele bleiben bis zum Erzeugen der Endrunde änderbar.
        </p>
      )}
      {ansicht && ansicht.hinweise.length > 0 && (
        <ul>
          {ansicht.hinweise.map((h, i) => (
            <li key={i}>
              <strong>{STUFE_TEXT[h.stufe]}:</strong> {h.text}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
