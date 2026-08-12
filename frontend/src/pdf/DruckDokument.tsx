import { QrCode } from "../components/QrCode";
import type { PdfAbschnitt, PdfDokument, PdfFeld, PdfQr, PdfTabelle } from "./dokumente";

/**
 * Rendert ein PdfDokument als semantisches HTML: genau ein <h1> (Dokumenttitel), je Abschnitt ein
 * <h2>, echte <table>-Strukturen (Spalten-/Zeilenkoepfe) und QR-Codes mit lesbarem Ziel-Link.
 * Beim "Als PDF speichern" aus dem Druckdialog exportiert Chrome daraus ein GETAGGTES PDF
 * (Ueberschriften-Struktur + Lesereihenfolge) - das ist der barrierefreie Ausgabeweg.
 */

function FelderTabelle({ felder }: { felder: PdfFeld[] }) {
  return (
    <table className="druck-felder">
      <tbody>
        {felder.map((f, i) => (
          <tr key={i}>
            <th scope="row">{f.label}</th>
            <td>{f.wert}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DatenTabelle({ tabelle, leerHinweis }: { tabelle: PdfTabelle; leerHinweis?: string }) {
  if (tabelle.zeilen.length === 0) return <p>{leerHinweis ?? "Keine Daten vorhanden."}</p>;
  return (
    <div className="tabellen-wrapper">
      <table>
        <thead>
          <tr>
            {tabelle.spalten.map((s, i) => (
              <th key={i} scope="col">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabelle.zeilen.map((zeile, i) => (
            <tr key={i}>
              {zeile.map((zelle, j) => (
                <td key={j}>{zelle}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QrBlock({ qr, dateiname }: { qr: PdfQr; dateiname: string }) {
  return (
    <div className="druck-qr">
      <QrCode text={qr.url} dateiname={dateiname} zeigeDownload={false} />
      <p className="druck-qr-text">
        {qr.beschriftung}:<br />
        <span className="druck-qr-url">{qr.url}</span>
      </p>
    </div>
  );
}

export function DruckDokument({ dokument }: { dokument: PdfDokument }) {
  return (
    <article className="druck-dokument" lang="de">
      <h1>{dokument.titel}</h1>
      {dokument.kopffelder && dokument.kopffelder.length > 0 && <FelderTabelle felder={dokument.kopffelder} />}
      {dokument.qr && <QrBlock qr={dokument.qr} dateiname={dokument.dateiname} />}
      {dokument.abschnitte.map((a: PdfAbschnitt, i) => (
        <section key={i} className={a.seitenumbruchVor ? "druck-abschnitt druck-seitenumbruch" : "druck-abschnitt"}>
          {a.ueberschrift && <h2>{a.ueberschrift}</h2>}
          {a.absaetze?.map((p, j) => (
            <p key={j}>{p}</p>
          ))}
          {a.felder && a.felder.length > 0 && <FelderTabelle felder={a.felder} />}
          {a.tabelle && <DatenTabelle tabelle={a.tabelle} leerHinweis={a.leerHinweis} />}
          {a.qr && <QrBlock qr={a.qr} dateiname={dokument.dateiname} />}
        </section>
      ))}
    </article>
  );
}
