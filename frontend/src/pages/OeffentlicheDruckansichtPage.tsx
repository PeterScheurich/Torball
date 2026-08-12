import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getOeffentlicheTurnierseite, type OeffentlicheTurnierseite, type OeffentlichesSpiel } from "../api";
import { formatiereDatum, formatiereUhrzeit } from "../format";
import { DruckDokument } from "../pdf/DruckDokument";
import { erzeugeJsPdf } from "../pdf/erzeugeJsPdf";
import {
  baueErgebnisDokument,
  baueInfoDokument,
  baueSpielplanDokument,
  type Grunddaten,
  type PdfDokument,
  type PdfFeld,
  type SpielZeile,
} from "../pdf/dokumente";

type DokTyp = "info" | "spielplan" | "ergebnisse";

const KRITERIUM_LABEL: Record<string, string> = {
  punkte: "Punkte",
  tordifferenz: "Tordifferenz",
  tore: "Erzielte Tore",
  direkter_vergleich: "Direkter Vergleich",
  freiwuerfe: "Freiwürfe",
};

function grunddatenAus(daten: OeffentlicheTurnierseite): Grunddaten {
  const info = daten.turnierinfos;
  const anfahrt = daten.anfahrt;
  return {
    name: daten.name,
    datum: info?.datum ? formatiereDatum(info.datum) : undefined,
    startzeit: info?.startzeit ? formatiereUhrzeit(`${info.datum}T${info.startzeit}:00`) : undefined,
    status: info?.status,
    spielortName: anfahrt?.spielortName,
    spielortAdresse: anfahrt?.spielortAdresse,
    turnierleitungName: info?.turnierleitungName,
    turnierleitungKontakt: info?.turnierleitungKontakt,
    ansprechpartnerName: info?.ansprechpartnerName,
    ansprechpartnerKontakt: info?.ansprechpartnerKontakt,
    zusatzinfo: info?.zusatzinfo,
  };
}

function regelnFelder(daten: OeffentlicheTurnierseite): PdfFeld[] | undefined {
  const r = daten.regeln;
  if (!r) return undefined;
  return [
    {
      label: "Spielzeit",
      wert: `${r.spielzeitMinuten} Min. (${r.anzahlHalbzeiten} Halbzeit${r.anzahlHalbzeiten === 1 ? "" : "en"}${r.seitenwechsel ? ", mit Seitenwechsel" : ""})`,
    },
    { label: "Pause", wert: `${r.pauseMinuten} Min.` },
    {
      label: "Wertung",
      wert: `Sieg ${r.punkteSieg} · Unentschieden ${r.punkteUnentschieden} · Niederlage ${r.punkteNiederlage} Punkte`,
    },
    { label: "Tabellenwertung", wert: r.tabellenKriterien.map((k) => KRITERIUM_LABEL[k] ?? k).join(" → ") },
    { label: "Nichtantreten (Forfait)", wert: r.forfaitErgebnis || "3:0" },
  ];
}

/**
 * Oeffentliche Druck-/PDF-Ansicht (kein Login) - `?doc=info|spielplan`. Baut die Dokumente aus den
 * oeffentlich freigegebenen Daten (Felder nicht freigegebener Sektionen fehlen entsprechend). Wie
 * intern: „Als PDF speichern" (getaggt) und „PDF herunterladen" (jsPDF).
 */
export function OeffentlicheDruckansichtPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const [params] = useSearchParams();
  const dokTyp: DokTyp = (["info", "spielplan", "ergebnisse"] as DokTyp[]).includes(params.get("doc") as DokTyp)
    ? (params.get("doc") as DokTyp)
    : "info";

  const [daten, setDaten] = useState<OeffentlicheTurnierseite>();
  const [fehler, setFehler] = useState<string>();
  const [pdfLaeuft, setPdfLaeuft] = useState(false);

  const laden = useCallback(() => {
    getOeffentlicheTurnierseite(turnierId)
      .then(setDaten)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden"));
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  const dokument: PdfDokument | undefined = useMemo(() => {
    if (!daten) return undefined;
    const origin = window.location.origin;
    const oeffentlicheSeiteUrl = `${origin}/turniere/${turnierId}/oeffentlich`;
    const ergebnisSeiteUrl = `${oeffentlicheSeiteUrl}?tab=ergebnisse`;
    const g = grunddatenAus(daten);

    const mehrereFelder = daten.felder.length > 1;
    const nameVon = (mId: string) => daten.mannschaften.find((m) => m._id === mId)?.name ?? mId;
    const feldName = (feldId?: string) => daten.felder.find((f) => f.feldId === feldId)?.name ?? feldId ?? "";

    if (dokTyp === "ergebnisse") {
      // Bei einem Wettbewerb die Summentabelle, sonst die Turniertabelle; Spiele nur dieser Spieltag.
      const istGesamt = !!daten.wettbewerb;
      const tabelleQuelle = daten.wettbewerb ? daten.wettbewerb.gesamttabelle : daten.ergebnisse?.tabelle ?? [];
      const tabellePdf = tabelleQuelle.map((z) => ({
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
      const ergebnisSpiele = [...(daten.ergebnisse?.spiele ?? [])]
        .sort((a, b) => Number(a.runde) - Number(b.runde))
        .map((s, i) => ({
          nr: i + 1,
          zeit: formatiereUhrzeit(s.startzeitGeplant),
          feld: feldName(s.feldId),
          teamA: nameVon(s.mannschaftAId),
          teamB: nameVon(s.mannschaftBId),
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

    if (dokTyp === "spielplan") {
      const zeilen: SpielZeile[] = [...(daten.spielplan?.spiele ?? [])]
        .sort((a: OeffentlichesSpiel, b: OeffentlichesSpiel) => Number(a.runde) - Number(b.runde))
        .map((s, i) => ({
          nr: i + 1,
          zeit: formatiereUhrzeit(s.startzeitGeplant),
          feld: feldName(s.feldId),
          teamA: nameVon(s.mannschaftAId),
          teamB: nameVon(s.mannschaftBId),
        }));
      return baueSpielplanDokument(g, zeilen, mehrereFelder, ergebnisSeiteUrl);
    }

    return baueInfoDokument(
      g,
      daten.mannschaften.map((m) => ({ name: m.name, bundesland: m.bundesland })),
      regelnFelder(daten),
      oeffentlicheSeiteUrl,
    );
  }, [daten, dokTyp, turnierId]);

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
        <Link to={`/turniere/${encodeURIComponent(turnierId)}/oeffentlich`}>&larr; Zurück zur Turnierseite</Link>
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
