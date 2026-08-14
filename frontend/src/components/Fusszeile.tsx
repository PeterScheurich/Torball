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
// Vorausgefuellter Mail-Text: gibt Testenden ohne Rueckfrage vor, welche Angaben bei einer
// Fehlermeldung helfen (Nutzer-Vorgabe) - oben Platz fuer den eigentlichen Text, die Fragen
// darunter nur als Orientierung, gelten erkennbar nicht fuer reines Lob/Anregungen.
const MAIL_VORLAGE = `Kurz zu meinem Anliegen:


---
Bei einer Fehlermeldung helfen zusätzlich folgende Angaben:
- Bei welcher Aufgabe ist der Fehler aufgetreten?
- Wie hat sich der Fehler gezeigt?
- Ist er schon öfter aufgetreten?
- Mit welcher Version wird gearbeitet (Server-Instanz oder lokale Installation)?
- Screenshot(s) beigefügt?`;

export function Fusszeile() {
  const { benutzer } = useAuth();
  const betreff = encodeURIComponent(`Feedback zu Torball-Turniere (${APP_VERSION})`);
  const text = encodeURIComponent(MAIL_VORLAGE);

  return (
    <footer className="fusszeile">
      <span>{benutzer && (benutzer.vorname ? `${benutzer.vorname} ${benutzer.name}` : benutzer.name)}</span>
      {benutzer && ENTWICKLER.email && (
        <a href={`mailto:${ENTWICKLER.email}?subject=${betreff}&body=${text}`}>Kontakt für Feedback &amp; Fehler</a>
      )}
      <span className="marke-version">{APP_VERSION}</span>
    </footer>
  );
}
