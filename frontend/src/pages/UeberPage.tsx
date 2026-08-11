import { APP_VERSION } from "../version";

/**
 * "Über & Kontakt" – kurze Info zur Idee/Entstehung der Anwendung und Kontaktdaten des
 * Entwicklers. Bewusst NUR für angemeldete Nutzer (Route liegt hinter GeschuetzteRoute, der
 * Menülink erscheint nur bei Anmeldung) – die E-Mail soll vorerst nicht öffentlich abgreifbar
 * sein (Scam-/Spam-Schutz). Eine spätere öffentliche Variante mit verschleierter E-Mail ist
 * möglich, aber bewusst zurückgestellt.
 */

// Kontaktdaten des Entwicklers – vom Betreiber auszufüllen (bewusst nicht von der KI vorbelegt,
// damit klar ist, welche Adresse hier steht). `email` leer lassen blendet den Mail-Link aus.
const ENTWICKLER = {
  name: "«Name der Entwicklerin / des Entwicklers»", // TODO: vom Betreiber bestätigen
  email: "software@blindentorball.de",
};

export function UeberPage() {
  return (
    <>
      <h1>Über &amp; Kontakt</h1>

      <h2>Die Idee</h2>
      <p>
        Torball-Turniere hilft dabei, Torball-Turniere am Computer zu planen und während der Veranstaltung zu
        protokollieren – von der Turnieranlage über Mannschaften, Spielplan und Schiedsrichter-Einteilung bis zur
        Ergebniserfassung und einer öffentlichen Turnierseite zum Mitverfolgen.
      </p>
      <p>
        Entstanden ist die Anwendung aus dem Wunsch, den organisatorischen Aufwand rund um Torball-Turniere zu
        verringern und die Abläufe für alle Beteiligten – Turnierleitung, Schiedsrichter, Helfer und Zuschauer –
        zugänglicher zu machen, mit besonderem Augenmerk auf Barrierefreiheit.
      </p>

      <h2>Der Entwicklungsweg (mit KI)</h2>
      <p>
        Die Anwendung wird von {ENTWICKLER.name} in enger Zusammenarbeit mit einer KI (Claude von Anthropic)
        entwickelt: Konzept, Umsetzung, Dokumentation und Qualitätssicherung entstehen iterativ im Dialog. Die
        fachlichen Entscheidungen trifft dabei der Mensch – die KI unterstützt beim Programmieren, Erklären und
        Prüfen.
      </p>

      <h2>Kontakt</h2>
      <dl className="ueber-kontakt">
        <dt>Entwicklung</dt>
        <dd>{ENTWICKLER.name}</dd>
        <dt>E-Mail</dt>
        <dd>
          {ENTWICKLER.email ? (
            <a href={`mailto:${ENTWICKLER.email}`}>{ENTWICKLER.email}</a>
          ) : (
            <span className="feld-hinweis">(wird noch ergänzt)</span>
          )}
        </dd>
      </dl>

      <p className="feld-hinweis">Version {APP_VERSION}</p>
    </>
  );
}
