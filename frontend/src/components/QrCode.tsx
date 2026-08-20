import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  /** Zu kodierender Text (hier: die URL). */
  text: string;
  /** Menschlicher Basis-Dateiname fuer den Download; wird fuer den Dateinamen bereinigt. */
  dateiname: string;
  /** Download-Links (SVG/PNG) anzeigen. Default true. Auf der oeffentlichen Seite bewusst
   *  false: dort soll der Code nur zum Abscannen vom Bildschirm dienen, nicht heruntergeladen
   *  werden (Weitergabe steuert allein die Turnierleitung). */
  zeigeDownload?: boolean;
}

function dateinameBereinigt(name: string): string {
  return name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "qr-code";
}

/**
 * Zeigt einen QR-Code fuer `text` und bietet ihn als PNG zum Download an (z.B. zum Aushaengen
 * in der Halle). Der QR-Code wird lokal im Browser erzeugt - die URL/das Token verlaesst das
 * Geraet nicht (kein externer QR-Dienst). Feste weisse Flaeche mit schwarzen Modulen, damit er
 * unabhaengig vom Farbschema (auch im Dunkelmodus) zuverlaessig scannbar bleibt.
 */
export function QrCode({ text, dateiname, zeigeDownload = true }: Props) {
  const [svg, setSvg] = useState("");
  const [pngUrl, setPngUrl] = useState("");
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    setFehler(false);
    const optionen = { margin: 2, errorCorrectionLevel: "M" as const, color: { dark: "#000000", light: "#ffffff" } };
    Promise.all([
      QRCode.toString(text, { ...optionen, type: "svg" }),
      QRCode.toDataURL(text, { ...optionen, width: 1024 }),
    ])
      .then(([svgText, dataUrl]) => {
        if (abgebrochen) return;
        setSvg(svgText);
        setPngUrl(dataUrl);
      })
      .catch(() => {
        if (!abgebrochen) setFehler(true);
      });
    return () => {
      abgebrochen = true;
    };
  }, [text]);

  // Fehlermeldung in voller Textfarbe + role="alert" (kein gedaempfter .feld-hinweis - eine
  // Fehlermeldung ist keine Nebeninfo, siehe CLAUDE.md).
  if (fehler) return <p role="alert">QR-Code konnte nicht erzeugt werden.</p>;
  if (!svg) return null;

  const basis = dateinameBereinigt(dateiname);
  // SVG als Daten-URL fuer den Download (skalierbar, ideal zum grossen Ausdrucken/Aushaengen).
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <div className="qr-code">
      <div
        className="qr-code-bild"
        role="img"
        aria-label={`QR-Code für ${text}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {zeigeDownload && (
        <div className="qr-code-download">
          Herunterladen:{" "}
          <a className="button-link" href={svgUrl} download={`${basis}.svg`}>
            SVG (skalierbar)
          </a>{" "}
          {pngUrl && (
            <a className="button-link" href={pngUrl} download={`${basis}.png`}>
              PNG
            </a>
          )}
        </div>
      )}
    </div>
  );
}
