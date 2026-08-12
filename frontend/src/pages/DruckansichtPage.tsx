import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { MannschaftImTurnier, SchiedsrichterImTurnier, Spiel, Turnier } from "@torball/shared";
import { getMannschaften, getSchiedsrichter, getSpiele, getTabelle, getTurnier, type TabellenZeile } from "../api";
import { formatiereDatum, formatiereUhrzeit } from "../format";
import { DruckDokument } from "../pdf/DruckDokument";
import { erzeugeJsPdf } from "../pdf/erzeugeJsPdf";
import {
  baueErgebnisDokument,
  baueInfoDokument,
  baueSchiedsrichterDokument,
  baueSpielplanDokument,
  type Grunddaten,
  type PdfDokument,
  type PdfFeld,
  type SpielZeile,
} from "../pdf/dokumente";

type DokTyp = "info" | "spielplan" | "schiedsrichter" | "ergebnisse";

const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  aktiv: "Aktiv (läuft)",
  abgeschlossen: "Abgeschlossen",
  archiviert: "Archiviert",
};

const KRITERIUM_LABEL: Record<string, string> = {
  punkte: "Punkte",
  tordifferenz: "Tordifferenz",
  tore: "Erzielte Tore",
  direkter_vergleich: "Direkter Vergleich",
  freiwuerfe: "Freiwürfe",
};

function grunddatenAus(turnier: Turnier): Grunddaten {
  return {
    name: turnier.name,
    datum: turnier.datum ? formatiereDatum(turnier.datum) : undefined,
    startzeit: turnier.startzeit ? formatiereUhrzeit(`${turnier.datum}T${turnier.startzeit}:00`) : undefined,
    status: STATUS_LABEL[turnier.status] ?? turnier.status,
    spielortName: turnier.spielortName,
    spielortAdresse: turnier.spielortAdresse,
    turnierleitungName: turnier.turnierleitungName,
    turnierleitungKontakt: turnier.turnierleitungKontakt,
    ansprechpartnerName: turnier.ansprechpartnerName,
    ansprechpartnerKontakt: turnier.ansprechpartnerKontakt,
    zusatzinfo: turnier.zusatzinfo,
  };
}

function regelnFelder(turnier: Turnier): PdfFeld[] {
  return [
    {
      label: "Spielzeit",
      wert: `${turnier.spielzeitMinuten} Min. (${turnier.anzahlHalbzeiten} Halbzeit${turnier.anzahlHalbzeiten === 1 ? "" : "en"}${turnier.seitenwechsel ? ", mit Seitenwechsel" : ""})`,
    },
    { label: "Pause", wert: `${turnier.pauseMinuten} Min.` },
    {
      label: "Wertung",
      wert: `Sieg ${turnier.punkteSieg} · Unentschieden ${turnier.punkteUnentschieden} · Niederlage ${turnier.punkteNiederlage} Punkte`,
    },
    {
      label: "Tabellenwertung",
      wert: turnier.tabellenKriterien.map((k) => KRITERIUM_LABEL[k] ?? k).join(" → "),
    },
    { label: "Nichtantreten (Forfait)", wert: turnier.forfaitErgebnis || "3:0" },
  ];
}

/**
 * Druck-/PDF-Ansicht eines Turniers (intern, angemeldet). `?doc=info|spielplan|schiedsrichter`
 * waehlt das Dokument. Bietet zwei Ausgaben: „Als PDF speichern" (Druckdialog → getaggtes,
 * barrierefreies PDF) und „PDF herunterladen" (jsPDF). Das gerenderte Dokument selbst ist dieselbe
 * getaggte HTML-Struktur, die auch der Druck verwendet.
 */
export function DruckansichtPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const [params] = useSearchParams();
  const dokTyp: DokTyp = (["info", "spielplan", "schiedsrichter", "ergebnisse"] as DokTyp[]).includes(
    params.get("doc") as DokTyp,
  )
    ? (params.get("doc") as DokTyp)
    : "info";

  const [turnier, setTurnier] = useState<Turnier>();
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [spiele, setSpiele] = useState<Spiel[]>([]);
  const [schiedsrichter, setSchiedsrichter] = useState<SchiedsrichterImTurnier[]>([]);
  const [tabelle, setTabelle] = useState<TabellenZeile[]>([]);
  const [fehler, setFehler] = useState<string>();
  const [pdfLaeuft, setPdfLaeuft] = useState(false);

  const laden = useCallback(async () => {
    try {
      const [t, m, s, sr, tab] = await Promise.all([
        getTurnier(turnierId),
        getMannschaften(turnierId),
        getSpiele(turnierId),
        getSchiedsrichter(turnierId),
        getTabelle(turnierId),
      ]);
      setTurnier(t);
      setMannschaften(m);
      setSpiele(s);
      setSchiedsrichter(sr);
      setTabelle(tab);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  const dokument: PdfDokument | undefined = useMemo(() => {
    if (!turnier) return undefined;
    const origin = window.location.origin;
    const oeffentlicheSeiteUrl = `${origin}/turniere/${turnierId}/oeffentlich`;
    const ergebnisSeiteUrl = `${oeffentlicheSeiteUrl}?tab=ergebnisse`;
    const g = grunddatenAus(turnier);
    const mehrereFelder = turnier.felder.length > 1;
    const nameVon = (mId: string) => mannschaften.find((m) => m._id === mId)?.name ?? mId;
    const feldName = (feldId?: string) => turnier.felder.find((f) => f.feldId === feldId)?.name ?? feldId ?? "";
    const nachRunde = (a: Spiel, b: Spiel) => Number(a.runde) - Number(b.runde);
    const alsZeile = (s: Spiel, i: number): SpielZeile => ({
      nr: i + 1,
      zeit: formatiereUhrzeit(s.startzeitGeplant),
      feld: feldName(s.feldId),
      teamA: nameVon(s.mannschaftAId),
      teamB: nameVon(s.mannschaftBId),
    });

    if (dokTyp === "spielplan") {
      const zeilen = [...spiele].sort(nachRunde).map(alsZeile);
      return baueSpielplanDokument(g, zeilen, mehrereFelder, ergebnisSeiteUrl);
    }
    if (dokTyp === "ergebnisse") {
      // Bei einem Wettbewerb (mehrere Spieltage) liefert getTabelle bereits die Summentabelle;
      // die Spiele bleiben bewusst nur die des aktuellen Spieltags.
      const istGesamt = !!turnier.wettbewerbId;
      const tabellePdf = tabelle.map((z) => ({
        mannschaft: nameVon(z.mannschaftId),
        spiele: z.spiele,
        siege: z.siege,
        unentschieden: z.unentschieden,
        niederlagen: z.niederlagen,
        toreFuer: z.toreFuer,
        toreGegen: z.toreGegen,
        tordifferenz: z.tordifferenz,
        punkte: z.punkte,
      }));
      const ergebnisSpiele = [...spiele].sort(nachRunde).map((s, i) => ({
        ...alsZeile(s, i),
        ergebnis: s.ergebnisA != null && s.ergebnisB != null ? `${s.ergebnisA} : ${s.ergebnisB}` : "–",
      }));
      return baueErgebnisDokument(
        g,
        tabellePdf,
        istGesamt ? "Gesamttabelle" : "Tabelle",
        ergebnisSpiele,
        mehrereFelder,
        ergebnisSeiteUrl,
      );
    }
    if (dokTyp === "schiedsrichter") {
      // "Nur Turnierleitung"-Personen pfeifen nicht - sie bekommen kein Einteilungsblatt.
      const pfeifende = schiedsrichter.filter((sr) => !sr.nurTurnierleitung);
      const eintraege = pfeifende
        .map((sr) => ({
          name: sr.vorname ? `${sr.name}, ${sr.vorname}` : sr.name,
          spiele: spiele
            .filter((s) => s.schiedsrichterId === sr._id)
            .sort(nachRunde)
            .map(alsZeile),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return baueSchiedsrichterDokument(g, eintraege, mehrereFelder, ergebnisSeiteUrl);
    }
    return baueInfoDokument(
      g,
      mannschaften.map((m) => ({ name: m.name, bundesland: m.bundesland })),
      regelnFelder(turnier),
      oeffentlicheSeiteUrl,
    );
  }, [turnier, mannschaften, spiele, schiedsrichter, tabelle, dokTyp, turnierId]);

  async function herunterladen() {
    if (!dokument) return;
    setPdfLaeuft(true);
    setFehler(undefined);
    try {
      await erzeugeJsPdf(dokument);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "PDF konnte nicht erzeugt werden");
    } finally {
      setPdfLaeuft(false);
    }
  }

  if (fehler) return <p role="alert">{fehler}</p>;
  if (!dokument) return <p>Lädt…</p>;

  return (
    <>
      <div className="druck-aktionen kein-druck">
        <Link to={`/turniere/${encodeURIComponent(turnierId)}`}>&larr; Zurück zum Turnier</Link>
        <button type="button" onClick={() => window.print()}>
          Als PDF speichern (Drucken)
        </button>
        <button type="button" onClick={herunterladen} disabled={pdfLaeuft}>
          {pdfLaeuft ? "PDF wird erzeugt…" : "PDF herunterladen"}
        </button>
      </div>
      <p className="feld-hinweis kein-druck">
        „Als PDF speichern" (Druckdialog) erzeugt ein barrierefreies, getaggtes PDF. „PDF herunterladen"
        liefert dieselben Inhalte direkt als Datei.
      </p>
      <DruckDokument dokument={dokument} />
    </>
  );
}
