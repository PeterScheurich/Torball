interface Props {
  /** Data-URL des Turnier-Logos; fehlt es (undefined/null), wird das Standard-Torball-Logo gezeigt. */
  logoDataUrl?: string | null;
  /** Maximale Anzeigehoehe in Pixeln. */
  hoehe?: number;
}

/**
 * Zeigt das Turnier-Logo: entweder das per Turnier hinterlegte (Data-URL) oder - als Fallback - das
 * Standard-Torball-Logo. Das Standard-Logo ist theme-abhaengig (helle/dunkle Variante, gleiche
 * .logo-hell/.logo-dunkel-Umschaltung wie in der Kopfzeile). Rein dekorativ (alt=""), da der
 * Turniername stets daneben steht.
 */
export function TurnierLogo({ logoDataUrl, hoehe = 64 }: Props) {
  if (logoDataUrl) {
    return <img className="turnier-logo" src={logoDataUrl} alt="" style={{ maxHeight: hoehe }} />;
  }
  return (
    <>
      <img className="turnier-logo logo-hell" src="/images/torball-logo.svg" alt="" style={{ maxHeight: hoehe }} />
      <img className="turnier-logo logo-dunkel" src="/images/torball-logo-dark.svg" alt="" style={{ maxHeight: hoehe }} />
    </>
  );
}
