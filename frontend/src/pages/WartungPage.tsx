import { Link } from "react-router-dom";
import type { WartungStatus } from "@torball/shared";
import { formatiereZeitstempel } from "../format";

/**
 * Wird anstelle der eigentlichen Seite angezeigt, waehrend der Wartungsmodus aktiv ist (siehe
 * App.tsx) - fuer alle ausser angemeldeten Admins. Bewusst mit Anmelde-Link: nur darueber kann
 * sich eine Admin-Person waehrend der Sperre noch einloggen, um sie wieder aufzuheben.
 */
export function WartungPage({ wartung }: { wartung?: WartungStatus }) {
  return (
    <>
      <h1>Wartungsarbeiten</h1>
      <p>Torball-Turniere ist aktuell wegen Wartungsarbeiten nicht verfügbar. Bitte versuche es später erneut.</p>
      {wartung?.angekuendigtBis && (
        <p>Voraussichtlich wieder erreichbar ab {formatiereZeitstempel(wartung.angekuendigtBis)}.</p>
      )}
      <p>
        <Link to="/login">Anmelden</Link>
      </p>
    </>
  );
}
