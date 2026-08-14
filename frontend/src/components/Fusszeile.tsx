import { useAuth } from "../auth";
import { APP_VERSION } from "../version";
import { ENTWICKLER } from "../entwicklerKontakt";

/** Globale Fusszeile (auf jeder Seite sichtbar, analog zur Kopfzeile): zeigt den angemeldeten
 *  Benutzer (Vorname + Name, sofern vorhanden), einen Kontakt-Link fuers Feedback und die
 *  App-Version. Der Benutzername stand frueher im Kopfzeilen-Menue (dort blieb nur noch das
 *  👤-Symbol), die Version frueher als farbiges Badge neben der Marke. Der Kontakt-Link nutzt
 *  dieselbe Adresse wie die "Über & Kontakt"-Seite (siehe entwicklerKontakt.ts) - Betreff traegt
 *  die aktuelle Version, damit Rueckmeldungen ohne Rueckfrage zuordenbar sind. Nur bei Anmeldung
 *  sichtbar: die Fusszeile rendert auch auf oeffentlichen Seiten (Login, oeffentliche
 *  Turnierseite) ohne GeschuetzteRoute - die E-Mail soll dort aus Scam-/Spam-Schutz nicht fuer
 *  jeden Besucher/Crawler abgreifbar sein (gleiche Regel wie auf der "Über"-Seite). */
export function Fusszeile() {
  const { benutzer } = useAuth();
  const betreff = encodeURIComponent(`Feedback zu Torball-Turniere (${APP_VERSION})`);

  return (
    <footer className="fusszeile">
      <span>{benutzer && (benutzer.vorname ? `${benutzer.vorname} ${benutzer.name}` : benutzer.name)}</span>
      {benutzer && ENTWICKLER.email && (
        <a href={`mailto:${ENTWICKLER.email}?subject=${betreff}`}>Kontakt für Feedback &amp; Fehler</a>
      )}
      <span className="marke-version">{APP_VERSION}</span>
    </footer>
  );
}
