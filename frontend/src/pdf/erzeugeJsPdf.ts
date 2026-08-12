import QRCode from "qrcode";
import type { PdfDokument, PdfFeld, PdfQr, PdfTabelle } from "./dokumente";

// jsPDF-Direktdownload eines PdfDokuments. jspdf + jspdf-autotable werden bewusst DYNAMISCH
// importiert (eigener Chunk, kein Ballast im Haupt-Bundle - erst beim ersten Erzeugen geladen).
//
// Barrierefreiheit (Best-Effort, jsPDF kann keine echten Struktur-Tags/PDF-UA):
//  - echter, auswaehlbarer Text in logischer Lesereihenfolge (kein Bild-Scan),
//  - Dokumenttitel als Metadatum + Dokumentsprache "de",
//  - QR-Ziel zusaetzlich als lesbarer Link-Text (nichts steckt nur im Bild),
//  - klare Schriftgroessen-Hierarchie (Titel > Abschnitt > Text).
// Der wirklich getaggte Weg ist die HTML-Druckansicht (DruckDokument.tsx) + "Als PDF speichern".

const RAND = 40; // pt
const TITEL_GROESSE = 18;
const H2_GROESSE = 13;
const TEXT_GROESSE = 10.5;

export async function erzeugeJsPdf(dokument: PdfDokument): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setProperties({ title: dokument.titel });
  // Dokumentsprache setzen (Screenreader-Aussprache). setLanguage ist in den Typen nicht immer
  // deklariert, existiert aber zur Laufzeit.
  (doc as unknown as { setLanguage?: (l: string) => void }).setLanguage?.("de");

  const seiteBreite = doc.internal.pageSize.getWidth();
  const seiteHoehe = doc.internal.pageSize.getHeight();
  const inhaltBreite = seiteBreite - 2 * RAND;
  let y = RAND;

  function platzPruefen(hoehe: number): void {
    if (y + hoehe > seiteHoehe - RAND) {
      doc.addPage();
      y = RAND;
    }
  }

  function schreibe(text: string, groesse: number, stil: "normal" | "bold"): void {
    doc.setFont("helvetica", stil);
    doc.setFontSize(groesse);
    const zeilenHoehe = groesse * 1.35;
    for (const zeile of doc.splitTextToSize(text, inhaltBreite) as string[]) {
      platzPruefen(zeilenHoehe);
      doc.text(zeile, RAND, y + groesse);
      y += zeilenHoehe;
    }
  }

  function felderSchreiben(felder: PdfFeld[]): void {
    for (const f of felder) schreibe(`${f.label}: ${f.wert}`, TEXT_GROESSE, "normal");
  }

  async function qrSchreiben(qr: PdfQr): Promise<void> {
    const bildGroesse = 110;
    platzPruefen(bildGroesse + 8);
    const dataUrl = await QRCode.toDataURL(qr.url, { margin: 1, width: 300 });
    doc.addImage(dataUrl, "PNG", RAND, y, bildGroesse, bildGroesse);
    y += bildGroesse + 6;
    // Ziel als lesbarer Text unter dem Code (nicht nur im Bild).
    schreibe(`${qr.beschriftung}: ${qr.url}`, TEXT_GROESSE, "normal");
    y += 4;
  }

  function tabelleSchreiben(tabelle: PdfTabelle, leerHinweis?: string): void {
    if (tabelle.zeilen.length === 0) {
      schreibe(leerHinweis ?? "Keine Daten vorhanden.", TEXT_GROESSE, "normal");
      return;
    }
    // Spielplan: die ersten beiden Spalten (Nr., Zeit) schmal halten, der Rest geht an die
    // Mannschaftsspalten.
    const columnStyles = tabelle.schmaleFuehrungsspalten
      ? { 0: { cellWidth: 26 }, 1: { cellWidth: 48 } }
      : undefined;
    autoTable(doc, {
      startY: y + 4,
      head: [tabelle.spalten],
      body: tabelle.zeilen,
      margin: { left: RAND, right: RAND },
      styles: { fontSize: TEXT_GROESSE, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [55, 55, 55], textColor: 255 },
      columnStyles,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  }

  // Titel (H1) + Kopffelder + Dokument-QR
  schreibe(dokument.titel, TITEL_GROESSE, "bold");
  y += 4;
  if (dokument.kopffelder && dokument.kopffelder.length > 0) {
    felderSchreiben(dokument.kopffelder);
    y += 4;
  }
  if (dokument.qr) await qrSchreiben(dokument.qr);

  for (const abschnitt of dokument.abschnitte) {
    if (abschnitt.seitenumbruchVor) {
      doc.addPage();
      y = RAND;
    } else {
      y += 8;
    }
    // Seitenkopf (z.B. Turniername) oben auf jeder Schiedsrichter-Seite wiederholen.
    if (abschnitt.seitenkopf) schreibe(abschnitt.seitenkopf, TEXT_GROESSE, "bold");
    if (abschnitt.ueberschrift) {
      platzPruefen(H2_GROESSE * 1.6);
      schreibe(abschnitt.ueberschrift, H2_GROESSE, "bold");
      y += 2;
    }
    for (const absatz of abschnitt.absaetze ?? []) schreibe(absatz, TEXT_GROESSE, "normal");
    if (abschnitt.felder && abschnitt.felder.length > 0) felderSchreiben(abschnitt.felder);
    if (abschnitt.tabelle) tabelleSchreiben(abschnitt.tabelle, abschnitt.leerHinweis);
    if (abschnitt.qr) await qrSchreiben(abschnitt.qr);
  }

  doc.save(`${dokument.dateiname}.pdf`);
}
