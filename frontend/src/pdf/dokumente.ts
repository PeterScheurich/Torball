// Gemeinsames, quellen-agnostisches Dokument-Modell fuer die Ausdrucke (PDFs). Aus demselben Modell
// werden BEIDE Ausgaben gespeist: die getaggte HTML-Druckansicht (DruckDokument.tsx, Chrome-"Als PDF
// speichern" liefert echte Struktur-Tags) und der jsPDF-Direktdownload (erzeugeJsPdf.ts). Die Builder
// bekommen bewusst nur einfache, bereits anzeige-fertig formatierte Werte (Datum/Uhrzeit formatiert
// der Aufrufer), damit sie sowohl intern (volle Turnierdaten) als auch oeffentlich (nur freigegebene
// Daten) nutzbar sind.

export interface PdfFeld {
  label: string;
  wert: string;
}

export interface PdfTabelle {
  spalten: string[];
  zeilen: string[][];
  /** Die ersten beiden Spalten (Nr., Zeit) schmal halten (Spielplan) - sie brauchen wenig Platz,
   *  der Rest geht an die Mannschaftsspalten. */
  schmaleFuehrungsspalten?: boolean;
}

export interface PdfQr {
  /** Ziel-URL (wird als QR kodiert UND zusaetzlich als lesbarer Text ausgegeben - nichts steckt nur im Bild). */
  url: string;
  beschriftung: string;
}

/** Ein Abschnitt mit eigener Ueberschrift (H2). Fuer die Schiedsrichter-Blaetter startet jeder
 *  Abschnitt eine neue Seite (seitenumbruchVor) und traegt seinen eigenen QR-Code. */
export interface PdfAbschnitt {
  /** Wiederholte Dokument-Ueberschrift oben auf Folgeseiten (Schiedsrichter-Blaetter): auf Seite 1
   *  steht sie als Titel/H1, ab Seite 2 als dieser Kopf. */
  seitenkopf?: string;
  ueberschrift?: string;
  absaetze?: string[];
  felder?: PdfFeld[];
  tabelle?: PdfTabelle;
  qr?: PdfQr;
  seitenumbruchVor?: boolean;
  /** Ersatztext, wenn `tabelle` leer ist (z.B. "Noch keine Spiele zugeteilt."). */
  leerHinweis?: string;
}

export interface PdfDokument {
  /** Basis-Dateiname (ohne Endung) fuer den Download. */
  dateiname: string;
  /** Dokumenttitel: H1 der Druckansicht und Titel-Metadatum des PDF. */
  titel: string;
  /** Label/Wert-Zeilen direkt unter dem Titel (z.B. Datum, Startzeit, Ort). */
  kopffelder?: PdfFeld[];
  /** Dokumentweiter QR-Code (Info/Spielplan). Schiedsrichter-Blaetter nutzen stattdessen pro Abschnitt. */
  qr?: PdfQr;
  abschnitte: PdfAbschnitt[];
}

export interface Grunddaten {
  name: string;
  datum?: string;
  startzeit?: string;
  status?: string;
  spielortName?: string;
  spielortAdresse?: string;
  turnierleitungName?: string;
  turnierleitungKontakt?: string;
  ansprechpartnerName?: string;
  ansprechpartnerKontakt?: string;
  zusatzinfo?: string;
}

export interface SpielZeile {
  /** Spielnummer im GESAMTEN Spielplan (nicht der Index einer Teilmenge) - wichtig fuers
   *  Schiedsrichter-Blatt: dessen gefilterte Spiele muessen dieselben Nummern tragen wie
   *  der ausgehaengte Spielplan, sonst stimmt der Querverweis nicht. */
  nr: number;
  zeit?: string;
  feld?: string;
  teamA: string;
  teamB: string;
}

/** Spielzeile mit Ergebnis (Ergebnis-Dokument). */
export interface ErgebnisSpielZeile extends SpielZeile {
  /** Anzeigetext, z.B. „3 : 1" oder „–" (noch offen). */
  ergebnis: string;
}

/** Eine Tabellenzeile (Platzierung) fuers Ergebnis-Dokument. */
export interface TabellenPdfZeile {
  mannschaft: string;
  spiele: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  toreFuer: number;
  toreGegen: number;
  tordifferenz: number;
  punkte: number;
}

function dateinameTeil(name: string): string {
  return name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "turnier";
}

/** Nur Felder mit Wert aufnehmen (leere optionale Angaben weglassen). */
function felder(paare: [string, string | undefined][]): PdfFeld[] {
  return paare.filter(([, wert]) => wert && wert.trim() !== "").map(([label, wert]) => ({ label, wert: wert! }));
}

/** Grunddaten-Kopffelder in der ausfuehrlichen (Info) bzw. knappen (Spielplan) Variante. */
function grunddatenFelder(g: Grunddaten, ausfuehrlich: boolean): PdfFeld[] {
  const paare: [string, string | undefined][] = [
    ["Datum", g.datum],
    ["Startzeit", g.startzeit],
  ];
  if (ausfuehrlich) paare.push(["Status", g.status]);
  const ort = [g.spielortName, g.spielortAdresse].filter(Boolean).join(", ");
  paare.push(["Spielort", ort || undefined]);
  paare.push([
    "Turnierleitung",
    [g.turnierleitungName, ausfuehrlich ? g.turnierleitungKontakt : undefined].filter(Boolean).join(" – ") || undefined,
  ]);
  if (ausfuehrlich) {
    paare.push([
      "Ansprechpartner",
      [g.ansprechpartnerName, g.ansprechpartnerKontakt].filter(Boolean).join(" – ") || undefined,
    ]);
  }
  return felder(paare);
}

function spielSpalten(mehrereFelder: boolean): string[] {
  return mehrereFelder ? ["#", "Zeit", "Feld", "Mannschaft A", "Mannschaft B"] : ["#", "Zeit", "Mannschaft A", "Mannschaft B"];
}

function spielZeilen(spiele: SpielZeile[], mehrereFelder: boolean): string[][] {
  return spiele.map((s) =>
    mehrereFelder
      ? [String(s.nr), s.zeit ?? "", s.feld ?? "", s.teamA, s.teamB]
      : [String(s.nr), s.zeit ?? "", s.teamA, s.teamB],
  );
}

/**
 * Dokument 1: Turnierinformationen (intern, zum Verschicken). Enthaelt alle bekannten Grunddaten,
 * die Mannschaften, optionale Regeln/Zusatzinfo und den Link + QR-Code zur oeffentlichen Turnierseite.
 */
export function baueInfoDokument(
  g: Grunddaten,
  mannschaften: { name: string; bundesland?: string }[],
  regeln: PdfFeld[] | undefined,
  oeffentlicheSeiteUrl: string,
): PdfDokument {
  const abschnitte: PdfAbschnitt[] = [
    {
      ueberschrift: "Mannschaften",
      tabelle: { spalten: ["#", "Mannschaft", "Bundesland"], zeilen: mannschaften.map((m, i) => [String(i + 1), m.name, m.bundesland ?? ""]) },
      leerHinweis: "Noch keine Mannschaften gemeldet.",
    },
  ];
  if (regeln && regeln.length > 0) abschnitte.push({ ueberschrift: "Turnierregeln", felder: regeln });
  if (g.zusatzinfo && g.zusatzinfo.trim() !== "") abschnitte.push({ ueberschrift: "Weitere Informationen", absaetze: [g.zusatzinfo] });

  return {
    dateiname: `turnierinfo-${dateinameTeil(g.name)}`,
    titel: `Turnierinformationen – ${g.name}`,
    kopffelder: grunddatenFelder(g, true),
    qr: { url: oeffentlicheSeiteUrl, beschriftung: "Öffentliche Turnierseite" },
    abschnitte,
  };
}

/**
 * Dokument 2: Spielplan (Aushang / Aushaendigung an die Mannschaften). Grundlegende Turnierdaten,
 * die Spielpaarungen und Link + QR-Code zur oeffentlichen Ergebnisseite.
 */
export function baueSpielplanDokument(
  g: Grunddaten,
  spiele: SpielZeile[],
  mehrereFelder: boolean,
  ergebnisSeiteUrl: string,
): PdfDokument {
  return {
    dateiname: `spielplan-${dateinameTeil(g.name)}`,
    titel: `Spielplan – ${g.name}`,
    kopffelder: grunddatenFelder(g, false),
    qr: { url: ergebnisSeiteUrl, beschriftung: "Ergebnisse online (öffentliche Seite)" },
    abschnitte: [
      {
        ueberschrift: "Spielplan",
        tabelle: {
          spalten: spielSpalten(mehrereFelder),
          zeilen: spielZeilen(spiele, mehrereFelder),
          schmaleFuehrungsspalten: true,
        },
        leerHinweis: "Noch kein Spielplan veröffentlicht.",
      },
    ],
  };
}

/**
 * Dokument 3: Schiedsrichter-Einteilung, ein gemeinsames PDF mit einer Seite je Schiedsrichter
 * (wann/auf welchem Feld pfeifen). Jede Seite traegt den Turnierkontext und den QR-Code zur
 * oeffentlichen Ergebnisseite, damit sie einzeln ausgehaendigt werden kann.
 */
export function baueSchiedsrichterDokument(
  g: Grunddaten,
  schiedsrichter: { name: string; spiele: SpielZeile[] }[],
  mehrereFelder: boolean,
  ergebnisSeiteUrl: string,
): PdfDokument {
  const titel = `Schiedsrichter-Einteilung – ${g.name}`;
  const kontext = [g.name, g.datum].filter(Boolean).join(" · ");
  const abschnitte: PdfAbschnitt[] = schiedsrichter.map((sr, index) => ({
    // Ueberschrift ("Schiedsrichter-Einteilung – <Turnier>") ab Seite 2 als Kopf wiederholen;
    // auf Seite 1 steht sie bereits als Titel (H1). Der Turnierkontext folgt darunter je Seite.
    seitenkopf: index > 0 ? titel : undefined,
    ueberschrift: sr.name,
    seitenumbruchVor: index > 0,
    absaetze: kontext ? [`Turnier: ${kontext}`] : undefined,
    tabelle: { spalten: spielSpalten(mehrereFelder), zeilen: spielZeilen(sr.spiele, mehrereFelder) },
    leerHinweis: "Für diese Person sind aktuell keine Spiele eingeteilt.",
    qr: { url: ergebnisSeiteUrl, beschriftung: "Ergebnisse online (öffentliche Seite)" },
  }));

  return {
    dateiname: `schiedsrichter-einteilung-${dateinameTeil(g.name)}`,
    titel,
    abschnitte:
      abschnitte.length > 0
        ? abschnitte
        : [{ ueberschrift: "Schiedsrichter", absaetze: ["Es sind noch keine Schiedsrichter erfasst."] }],
  };
}

/**
 * Dokument 4: Ergebnisse eines Spieltags. Zeigt die (Gesamt-)Tabelle und die Spiele MIT Ergebnis –
 * bewusst nur die des aktuellen Spieltags, die Tabelle aber als Gesamtstand (bei Wettbewerben über
 * beide Spieltage summiert, sonst die Turniertabelle). Link + QR zur öffentlichen Ergebnisseite.
 */
export function baueErgebnisDokument(
  g: Grunddaten,
  tabelle: TabellenPdfZeile[],
  tabelleTitel: string,
  spiele: ErgebnisSpielZeile[],
  mehrereFelder: boolean,
  ergebnisSeiteUrl: string,
): PdfDokument {
  const ergebnisSpalten = mehrereFelder
    ? ["#", "Zeit", "Feld", "Mannschaft A", "Ergebnis", "Mannschaft B"]
    : ["#", "Zeit", "Mannschaft A", "Ergebnis", "Mannschaft B"];
  const ergebnisZeilen = spiele.map((s) =>
    mehrereFelder
      ? [String(s.nr), s.zeit ?? "", s.feld ?? "", s.teamA, s.ergebnis, s.teamB]
      : [String(s.nr), s.zeit ?? "", s.teamA, s.ergebnis, s.teamB],
  );

  return {
    dateiname: `ergebnisse-${dateinameTeil(g.name)}`,
    titel: `Ergebnisse – ${g.name}`,
    kopffelder: grunddatenFelder(g, false),
    qr: { url: ergebnisSeiteUrl, beschriftung: "Ergebnisse online (öffentliche Seite)" },
    abschnitte: [
      {
        ueberschrift: tabelleTitel,
        tabelle: {
          spalten: ["Platz", "Mannschaft", "Sp", "S", "U", "N", "Tore", "Diff", "Punkte"],
          zeilen: tabelle.map((z, i) => [
            String(i + 1),
            z.mannschaft,
            String(z.spiele),
            String(z.siege),
            String(z.unentschieden),
            String(z.niederlagen),
            `${z.toreFuer}:${z.toreGegen}`,
            String(z.tordifferenz),
            String(z.punkte),
          ]),
        },
        leerHinweis: "Noch keine Ergebnisse erfasst.",
      },
      {
        ueberschrift: "Ergebnisse (dieser Spieltag)",
        tabelle: { spalten: ergebnisSpalten, zeilen: ergebnisZeilen, schmaleFuehrungsspalten: true },
        leerHinweis: "Noch keine Spiele mit Ergebnis.",
      },
    ],
  };
}
