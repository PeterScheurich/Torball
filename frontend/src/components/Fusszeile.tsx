import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { APP_VERSION } from "../version";
import { ENTWICKLER } from "../entwicklerKontakt";

/** Globale Fusszeile (auf jeder Seite sichtbar, analog zur Kopfzeile): zeigt den angemeldeten
 *  Benutzer (Vorname + Name, sofern vorhanden), zwei Kontakt-Wege und die App-Version. Der
 *  Benutzername stand frueher im Kopfzeilen-Menue (dort blieb nur noch das 👤-Symbol), die
 *  Version frueher als farbiges Badge neben der Marke. "Feedback" ist ein freier Mail-Entwurf
 *  (Lob/Anregungen/allgemeine Rueckmeldung, gleiche Adresse wie die "Über & Kontakt"-Seite,
 *  siehe entwicklerKontakt.ts) - Betreff traegt die aktuelle Version, damit Rueckmeldungen ohne
 *  Rueckfrage zuordenbar sind. "Fehler melden" fuehrt stattdessen auf ein strukturiertes
 *  Formular (FehlerMeldenPage), das aus denselben Angaben ebenfalls nur einen Mail-Entwurf an
 *  dieselbe Adresse zusammenbaut - kein zusaetzlicher Versandweg, nur klarere Struktur fuer die
 *  Person, die meldet - dazu die aktuelle Seite (per Link-`state`, nicht als URL-Query, damit sie
 *  nicht im Browser-Verlauf landet) als "von wo aufgerufen"-Kontext. Nur bei Anmeldung sichtbar:
 *  die Fusszeile rendert auch auf oeffentlichen
 *  Seiten (Login, oeffentliche Turnierseite) ohne GeschuetzteRoute - die E-Mail soll dort aus
 *  Scam-/Spam-Schutz nicht fuer jeden Besucher/Crawler abgreifbar sein (gleiche Regel wie auf
 *  der "Über"-Seite). */
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
  const standort = useLocation();
  const betreff = encodeURIComponent(`Feedback zu Torball-Turniere (${APP_VERSION})`);
  const text = encodeURIComponent(MAIL_VORLAGE);
  // Aktuelle Seite im Moment des Klicks - fuer FehlerMeldenPage als "von wo aufgerufen"
  // (Abschnitt/Tab-Query wie ?tab=regeln bewusst mit, Pfad allein waere sonst mehrdeutig).
  const herkunft = `${standort.pathname}${standort.search}${standort.hash}`;

  return (
    <footer className="fusszeile">
      <span>{benutzer && (benutzer.vorname ? `${benutzer.vorname} ${benutzer.name}` : benutzer.name)}</span>
      {benutzer && ENTWICKLER.email && (
        <>
          <a href={`mailto:${ENTWICKLER.email}?subject=${betreff}&body=${text}`}>Feedback</a>
          <Link to="/fehler-melden" state={{ herkunft }}>
            Fehler melden
          </Link>
        </>
      )}
      <span className="marke-version">{APP_VERSION}</span>
    </footer>
  );
}
