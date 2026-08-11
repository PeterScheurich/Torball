import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Protokollierungsart, Spielmodus } from "@torball/shared";
import { createTurnier } from "../api";

/**
 * Erster Schritt des Anlege-Assistenten: Grunddaten eines neuen Turniers (Name, Datum,
 * Spielfelder, Modus, Protokollierung, optionale Schiedsrichter-Planung). Nach dem Anlegen
 * geht es weiter zur Regel-Erfassung. Die uebrigen Turnierfelder bekommen serverseitig
 * Standardwerte (siehe turnierDefaults in backend/src/routes/turnier.ts).
 *
 * Das Schiedsrichter-Flag steuert, ob der Assistent 5 statt 4 Schritte hat (optionaler
 * Schiedsrichter-Schritt) - hier wird der Startwert gesetzt; die Schrittzahl berechnet jede
 * Folge-Seite selbst aus dem Turnier-Flag (kein zentraler Wizard-Zustand, siehe CLAUDE.md).
 */
export function TurnierAnlegenPage() {
  const [name, setName] = useState("");
  const [datum, setDatum] = useState("");
  const [startzeit, setStartzeit] = useState("");
  const [anzahlFelder, setAnzahlFelder] = useState<1 | 2>(1);
  const [spielplanModus, setSpielplanModus] = useState<Spielmodus>("einfach");
  const [protokollierungsart, setProtokollierungsart] = useState<Protokollierungsart>("manuell");
  const [schiedsrichterPlanung, setSchiedsrichterPlanung] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const navigate = useNavigate();

  // Baut aus der gewaehlten Feldanzahl die Feld-Objekte ("Feld 1"/"Feld 2"), legt das Turnier
  // an und springt in den naechsten Assistenten-Schritt (Regeln).
  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);

    const felder = Array.from({ length: anzahlFelder }, (_, i) => ({
      feldId: `feld:${i + 1}`,
      name: `Feld ${i + 1}`,
    }));

    try {
      const neu = await createTurnier({
        name,
        datum,
        startzeit: startzeit || undefined,
        felder,
        spielplanModus,
        protokollierungsart,
        schiedsrichterPlanung,
      });
      navigate(`/turniere/${encodeURIComponent(neu._id)}/regeln-erfassen`);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen");
    }
  }

  return (
    <>
      <p>Schritt 1 von {schiedsrichterPlanung ? 5 : 4}: Turnier anlegen</p>
      <h1>Neues Turnier</h1>

      <p className="pflicht-legende">
        <span className="stern">*</span> Pflichtfeld
      </p>

      <form onSubmit={anlegen}>
        <div className="feld">
          <label htmlFor="name">Name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="datum">Datum</label>
          <input id="datum" type="date" required value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="startzeit">Startzeit (optional)</label>
          <input id="startzeit" type="time" value={startzeit} onChange={(e) => setStartzeit(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="anzahlFelder">Anzahl Spielfelder</label>
          <select
            id="anzahlFelder"
            value={anzahlFelder}
            onChange={(e) => setAnzahlFelder(Number(e.target.value) === 2 ? 2 : 1)}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>
        <div className="feld">
          <label htmlFor="spielplanModus">Spielmodus</label>
          <select
            id="spielplanModus"
            value={spielplanModus}
            onChange={(e) => setSpielplanModus(e.target.value === "doppelt" ? "doppelt" : "einfach")}
          >
            <option value="einfach">Jeder gegen Jeden (einfach)</option>
            <option value="doppelt">Jeder zweimal gegen Jeden (doppelt)</option>
          </select>
        </div>
        <div className="feld">
          <label htmlFor="protokollierungsart">Protokollierung</label>
          <select
            id="protokollierungsart"
            value={protokollierungsart}
            onChange={(e) => setProtokollierungsart(e.target.value === "digital" ? "digital" : "manuell")}
          >
            <option value="manuell">Manuell (Papierprotokoll, nur Endergebnisse erfasst)</option>
            <option value="digital">Digital (Live-Ereignisprotokollierung - noch nicht umgesetzt)</option>
          </select>
        </div>
        <div className="feld">
          <label htmlFor="schiedsrichterPlanung">Schiedsrichter</label>
          <label className="schiedsrichter-lizenz">
            <input
              id="schiedsrichterPlanung"
              type="checkbox"
              checked={schiedsrichterPlanung}
              onChange={(e) => setSchiedsrichterPlanung(e.target.checked)}
            />
            Schiedsrichter-Planung nutzen (fügt vor dem Spielplan einen Schritt zum Erfassen der Schiedsrichter hinzu)
          </label>
        </div>

        {fehler && <p role="alert">{fehler}</p>}
        <button type="submit">Weiter zu Regeln</button>
      </form>
    </>
  );
}
