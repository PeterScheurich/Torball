import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  /** Zu kodierender Text (hier: die URL). */
  text: string;
  /** Menschlicher Basis-Dateiname fuer den Download; wird fuer den Dateinamen bereinigt. */
  dateiname: string;
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
export function QrCode({ text, dateiname }: Props) {
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

  if (fehler) return <p className="feld-hinweis">QR-Code konnte nicht erzeugt werden.</p>;
  if (!svg) return null;

  return (
    <div className="qr-code">
      <div
        className="qr-code-bild"
        role="img"
        aria-label={`QR-Code für ${text}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {pngUrl && (
        <div>
          <a className="button-link" href={pngUrl} download={`${dateinameBereinigt(dateiname)}.png`}>
            QR-Code herunterladen (PNG)
          </a>
        </div>
      )}
    </div>
  );
}
