// Bereitet ein hochgeladenes Logo clientseitig auf: verkleinert es auf eine handliche Kantenlaenge
// und gibt eine PNG-Data-URL zurueck. So bleibt das Bild klein genug, um direkt am Turnier-Dokument
// (CouchDB) abgelegt zu werden - ohne separate Dateiablage (die bewusst zurueckgestellt ist).

/** Maximale Kantenlaenge (laengste Seite) des gespeicherten Logos in Pixeln. */
const MAX_KANTE = 256;

function ladeBild(datei: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(datei);
    const bild = new Image();
    bild.onload = () => {
      URL.revokeObjectURL(url);
      resolve(bild);
    };
    bild.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Die Datei ist kein gültiges Bild."));
    };
    bild.src = url;
  });
}

/** Verkleinert `datei` auf max. `maxKante` (Seitenverhaeltnis bleibt) und liefert eine PNG-Data-URL. */
export async function bildAlsLogoDataUrl(datei: File, maxKante = MAX_KANTE): Promise<string> {
  const bild = await ladeBild(datei);
  const groesste = Math.max(bild.width, bild.height) || 1;
  const skala = Math.min(1, maxKante / groesste);
  const breite = Math.max(1, Math.round(bild.width * skala));
  const hoehe = Math.max(1, Math.round(bild.height * skala));

  const canvas = document.createElement("canvas");
  canvas.width = breite;
  canvas.height = hoehe;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden.");
  ctx.drawImage(bild, 0, 0, breite, hoehe);
  return canvas.toDataURL("image/png");
}
