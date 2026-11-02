import { useState } from "react";
import { kontoHinweisText, ungeleseneKontoHinweise } from "@torball/shared";
import { kontoHinweiseGelesen } from "../api";
import { useAuth } from "../auth";
import { formatiereZeitstempel } from "../format";

/**
 * Zweiter Benachrichtigungsweg neben der Mail (Auftraggeber, 02.11.2026): Aenderungen am eigenen Konto,
 * die man nicht selbst in dieser Sitzung vorgenommen hat (Passwort-Reset, Rollen-/2FA-Aenderung durch
 * eine andere Person, Passwort ueber einen Link gesetzt), erscheinen beim naechsten Aufruf oben auf der
 * Seite, bis man sie bestaetigt. Funktioniert auch auf einer lokalen Installation ohne Mailversand.
 *
 * Bewusst KEIN role="alert": die Meldung steht schon beim Laden der Seite da und wird beim normalen
 * Durchlesen der Seite gefunden; ein Alert wuerde jede Seite mit einer Unterbrechung beginnen.
 */
export function KontoHinweise() {
  const { benutzer, aktualisiereBenutzer } = useAuth();
  const [fehler, setFehler] = useState<string>();
  const ungelesen = ungeleseneKontoHinweise(benutzer?.kontoHinweise);
  if (!benutzer || ungelesen.length === 0) return null;

  async function bestaetigen() {
    setFehler(undefined);
    try {
      aktualisiereBenutzer(await kontoHinweiseGelesen());
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Das Bestätigen hat nicht geklappt.");
    }
  }

  return (
    <section className="warnkasten" aria-labelledby="konto-hinweise-titel">
      <h2 id="konto-hinweise-titel" style={{ marginTop: 0 }}>
        {ungelesen.length === 1 ? "Änderung an deinem Konto" : "Änderungen an deinem Konto"}
      </h2>
      <ul>
        {ungelesen.map((h) => (
          <li key={h.id}>
            <strong>{formatiereZeitstempel(h.zeitpunkt)}:</strong> {kontoHinweisText(h)}
          </li>
        ))}
      </ul>
      <p>
        Warst du das nicht, ändere bitte sofort dein Passwort (Profil) und sag der Turnierleitung oder einer
        Administratorin bzw. einem Administrator Bescheid.
      </p>
      {fehler && <p role="alert">{fehler}</p>}
      <button type="button" onClick={bestaetigen}>
        Verstanden
      </button>
    </section>
  );
}
