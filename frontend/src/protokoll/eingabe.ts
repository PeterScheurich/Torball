import type { Mannschaftsseite } from "@torball/shared";

/**
 * Eingabe-Zustandsmaschine der digitalen Protokollierung (Konzept Abschnitt 8, Bedienmodell aus
 * docs/torball-protokoll-panel-konzept.md): Team-Kontext als Toggle, dann Aktion, dann
 * Ziffer(n), dann OK. Bildschirm-Buttons und Tastatur (bzw. das spaetere HID-Panel, das normale
 * Keycodes sendet) treiben DIESELBE Maschine. Bewusst eine reine Funktion (verarbeiteTaste):
 * die Seite fuehrt die zurueckgegebenen Befehle aus (Events senden), die Maschine kennt weder
 * React noch die API.
 */

/** Aktionen, wie sie auf dem Panel/Bildschirm liegen - die Abbildung auf Event-Typen (inkl.
 *  Tor = W+G-Doppel-Event) macht die Seite beim Buchen (Konzept Abschnitt 3.3). */
export type UiAktion =
  | "tor"
  | "eigentor"
  | "fehlwurf"
  | "kontrolle"
  | "foul"
  | "strafwurf"
  | "auszeit"
  | "techauszeit"
  | "wechsel"
  | "freiwurf";

/** Wie viele Spielernummern eine Aktion braucht (Konzept 3.3/3.4 Punkt 3). */
export const NUMMERN_JE_AKTION: Record<UiAktion, number> = {
  tor: 1,
  eigentor: 0,
  fehlwurf: 1,
  kontrolle: 0,
  foul: 1,
  strafwurf: 0,
  auszeit: 0,
  techauszeit: 0,
  wechsel: 2,
  freiwurf: 1,
};

export interface EingabeZustand {
  team: Mannschaftsseite | null;
  aktion: UiAktion | null;
  /** Bereits abgeschlossene Nummern (bei Wechsel: erst raus, dann rein). */
  nummern: string[];
  /** Gerade getippte, noch nicht mit OK abgeschlossene Nummer (mehrstellig moeglich). */
  aktuelleNummer: string;
}

export const LEERER_ZUSTAND: EingabeZustand = { team: null, aktion: null, nummern: [], aktuelleNummer: "" };

/** Tasten der Maschine - die Zuordnung KeyboardEvent.key -> Taste steht in TASTATUR_BELEGUNG. */
export type Taste =
  | { art: "team"; team: Mannschaftsseite }
  | { art: "aktion"; aktion: UiAktion }
  | { art: "ziffer"; ziffer: string }
  | { art: "ok" }
  | { art: "undo" }
  | { art: "verwerfen" }
  | { art: "uhr" }
  | { art: "halbzeit" };

/** Befehle an die Seite. "buchen" traegt die vollstaendige Aktion; die uebrigen sind direkt. */
export type EingabeBefehl =
  | { typ: "buchen"; team: Mannschaftsseite; aktion: UiAktion; nummern: string[] }
  | { typ: "uhr" }
  | { typ: "halbzeit" }
  | { typ: "undo" }
  | { typ: "eingabeVerworfen" };

export interface EingabeErgebnis {
  zustand: EingabeZustand;
  befehl?: EingabeBefehl;
}

export interface EingabeOptionen {
  /**
   * Turnierregel `einstelligeTrikotnummern`: bei true bucht eine Ziffer den Standard-Wurf
   * SOFORT (ohne OK) - bei mehrstelligen Nummern sammelt sie stattdessen und OK schliesst ab.
   */
  einstelligeNummern: boolean;
}

/**
 * Verarbeitet eine Taste. Regeln (Panel-Konzept "Bedienlogik" + Konzept 3.4/8):
 * - Team-Taste setzt/wechselt den Kontext (Toggle), offene Aktions-Eingabe wird verworfen.
 * - **Ziffer ohne vorher gewaehlte Aktion = Wurf** (der mit Abstand haeufigste Fall,
 *   Nutzer-Vorgabe 21.08.2026, entspricht der urspruenglichen Spez.-Belegung "0-9 = Wurf"):
 *   bei einstelligen Trikotnummern bucht die Ziffer den Wurf direkt - Ablauf also z.B.
 *   `A` `3` -> `B` `5` -> `A` `2`, und rollt der Ball zur werfenden Mannschaft zurueck,
 *   einfach erneut eine Ziffer desselben Teams. Der Team-Kontext bleibt dabei erhalten.
 * - Uhr/Halbzeit buchen SOFORT, verwerfen eine offene Eingabe und setzen den Team-Kontext
 *   zurueck; Undo/OK erhalten den Kontext (mehrere Aktionen desselben Teams hintereinander).
 * - OK schliesst erst die aktuelle Nummer ab; sind alle Nummern der Aktion beisammen, wird
 *   gebucht (bei einstelligen Nummern also z.B. Team -> Tor -> Ziffer -> OK).
 */
export function verarbeiteTaste(
  zustand: EingabeZustand,
  taste: Taste,
  optionen: EingabeOptionen = { einstelligeNummern: true },
): EingabeErgebnis {
  const offen = zustand.aktion !== null || zustand.aktuelleNummer !== "";

  switch (taste.art) {
    case "team":
      return { zustand: { ...LEERER_ZUSTAND, team: taste.team } };
    case "uhr":
    case "halbzeit":
      // Zeitkritische Tasten gewinnen (Konzept 3.4 Punkt 1): offene Eingabe verwerfen, sofort
      // buchen, Team-Kontext zuruecksetzen. Ob eine Eingabe verworfen wurde, sieht die Seite am
      // vorherigen Zustand (offene Aktion) und zeigt dann einen kurzen Hinweis.
      return { zustand: LEERER_ZUSTAND, befehl: { typ: taste.art } };
    case "undo":
      return { zustand: { ...zustand, aktion: null, nummern: [], aktuelleNummer: "" }, befehl: { typ: "undo" } };
    case "verwerfen":
      return {
        zustand: { ...LEERER_ZUSTAND, team: zustand.team },
        befehl: offen ? { typ: "eingabeVerworfen" } : undefined,
      };
    case "aktion": {
      if (!zustand.team) return { zustand }; // ohne Team-Kontext keine Aktion (Panel-Konzept)
      // Aktionen OHNE Spielernummer (Kontrolle, Strafwurf, Auszeit, ...) buchen sofort - ein
      // zusaetzliches OK waere reine Buerokratie (gleiche Linie wie das Sofort-Buchen der
      // Ziffern, Nutzer-Vorgabe 21.08.2026). Der Team-Kontext bleibt erhalten.
      if (NUMMERN_JE_AKTION[taste.aktion] === 0) {
        return {
          zustand: { ...LEERER_ZUSTAND, team: zustand.team },
          befehl: { typ: "buchen", team: zustand.team, aktion: taste.aktion, nummern: [] },
        };
      }
      return { zustand: { ...zustand, aktion: taste.aktion, nummern: [], aktuelleNummer: "" } };
    }
    case "ziffer": {
      if (!zustand.team) return { zustand };
      // Standard-Aktion Wurf: Ziffer ohne vorherige Aktions-Taste (siehe Funktions-Kommentar).
      if (!zustand.aktion) {
        if (optionen.einstelligeNummern) {
          return {
            zustand: { ...LEERER_ZUSTAND, team: zustand.team },
            befehl: { typ: "buchen", team: zustand.team, aktion: "fehlwurf", nummern: [taste.ziffer] },
          };
        }
        return { zustand: { ...zustand, aktion: "fehlwurf", aktuelleNummer: taste.ziffer } };
      }
      if (NUMMERN_JE_AKTION[zustand.aktion] === 0) return { zustand };
      // Einstellige Nummern: jede Ziffer schliesst eine Nummer ab; sind alle Nummern der Aktion
      // beisammen, wird SOFORT gebucht (Nutzer-Vorgabe 21.08.2026: kein Enter noetig - Tor also
      // "G" + Ziffer, Wechsel "E" + Ziffer + Ziffer).
      if (optionen.einstelligeNummern) {
        const nummern = [...zustand.nummern, taste.ziffer];
        if (nummern.length >= NUMMERN_JE_AKTION[zustand.aktion] && zustand.team) {
          return {
            zustand: { ...LEERER_ZUSTAND, team: zustand.team },
            befehl: { typ: "buchen", team: zustand.team, aktion: zustand.aktion, nummern },
          };
        }
        return { zustand: { ...zustand, nummern, aktuelleNummer: "" } };
      }
      return { zustand: { ...zustand, aktuelleNummer: zustand.aktuelleNummer + taste.ziffer } };
    }
    case "ok": {
      if (!zustand.team || !zustand.aktion) return { zustand };
      const benoetigt = NUMMERN_JE_AKTION[zustand.aktion];
      let nummern = zustand.nummern;
      if (zustand.aktuelleNummer !== "") nummern = [...nummern, zustand.aktuelleNummer];
      if (nummern.length < benoetigt) {
        // Noch nicht alle Nummern beisammen (z.B. Wechsel: erst "raus" bestaetigt) - weiter tippen.
        return { zustand: { ...zustand, nummern, aktuelleNummer: "" } };
      }
      return {
        zustand: { ...LEERER_ZUSTAND, team: zustand.team },
        befehl: { typ: "buchen", team: zustand.team, aktion: zustand.aktion, nummern },
      };
    }
  }
}

/**
 * Standard-Tastaturbelegung (Konzept Abschnitt 8) - ein flaches Objekt, damit eine spaetere
 * Konfigurierbarkeit je Turnier (Spez. 24.4) nur noch UI ist. Das HID-Panel sendet spaeter
 * genau diese Tasten. "B" ist als Team-Taste vergeben, deshalb Halbzeit auf "H" (bewusste
 * Abweichung von der aelteren Spez.-Tabelle, dort dokumentiert).
 */
export const TASTATUR_BELEGUNG: Record<string, Taste> = {
  a: { art: "team", team: "A" },
  b: { art: "team", team: "B" },
  g: { art: "aktion", aktion: "tor" },
  x: { art: "aktion", aktion: "fehlwurf" },
  k: { art: "aktion", aktion: "kontrolle" },
  f: { art: "aktion", aktion: "foul" },
  p: { art: "aktion", aktion: "strafwurf" },
  t: { art: "aktion", aktion: "auszeit" },
  m: { art: "aktion", aktion: "techauszeit" },
  e: { art: "aktion", aktion: "wechsel" },
  r: { art: "aktion", aktion: "freiwurf" },
  " ": { art: "uhr" },
  h: { art: "halbzeit" },
  enter: { art: "ok" },
  backspace: { art: "undo" },
  escape: { art: "verwerfen" },
  "0": { art: "ziffer", ziffer: "0" },
  "1": { art: "ziffer", ziffer: "1" },
  "2": { art: "ziffer", ziffer: "2" },
  "3": { art: "ziffer", ziffer: "3" },
  "4": { art: "ziffer", ziffer: "4" },
  "5": { art: "ziffer", ziffer: "5" },
  "6": { art: "ziffer", ziffer: "6" },
  "7": { art: "ziffer", ziffer: "7" },
  "8": { art: "ziffer", ziffer: "8" },
  "9": { art: "ziffer", ziffer: "9" },
};

export const AKTIONS_BESCHRIFTUNG: Record<UiAktion, string> = {
  tor: "Tor",
  eigentor: "Eigentor",
  // Interner Name "fehlwurf" (historisch, Panel-Konzept) - fachlich ist es das W-Event; als
  // Beschriftung schlicht "Wurf", da eine Ziffer ohne Aktions-Taste genau das bucht.
  fehlwurf: "Wurf",
  kontrolle: "Kontrolle",
  foul: "Foul",
  strafwurf: "Strafwurf",
  auszeit: "Auszeit",
  techauszeit: "Techn. Auszeit",
  wechsel: "Wechsel",
  freiwurf: "Freiwurf",
};
