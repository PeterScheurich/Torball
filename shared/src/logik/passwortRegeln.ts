// Passwortregeln - EINMAL gepflegt, von Backend (Durchsetzung) und Frontend (Anzeige der Anforderungen
// beim Tippen) gemeinsam benutzt. Vorher standen sie doppelt in backend/src/auth/passwort.ts und
// frontend/src/passwortAnforderungen.ts; bei einer Aenderung der Regeln musste man beide anfassen -
// vergisst man eine Seite, zeigt die Oberflaeche etwas anderes an, als der Server dann ablehnt.
// Hashing (bcrypt) bleibt im Backend: dieses Modul ist reine Logik ohne Abhaengigkeiten.

export const PASSWORT_MINDESTLAENGE = 12;

/**
 * Sehr haeufige Zeichenfolgen. Bewusst kurz: Das ist keine Leak-Datenbank, sondern der Ersatz
 * fuer die weggefallenen Zeichenklassen-Regeln - sie soll genau das abfangen, wovor die alten
 * Regeln schuetzen sollten (ein langes, aber triviales Passwort wie "passwortpasswort").
 * Geprueft wird als Teilzeichenkette und ohne Ruecksicht auf Gross-/Kleinschreibung. Genau
 * deshalb stehen hier NUR echte Klassiker: Ein erster Entwurf enthielt auch "sommer", "winter"
 * und "torball" - damit waere "Sommer-Fest-Muenchen-2026" abgelehnt worden, ein voellig
 * brauchbares Passwort. Eine Sperre, die gute Passphrasen verhindert, richtet mehr Schaden an
 * als sie nuetzt (die Tests halten diesen Fall fest).
 */
export const HAEUFIGE_FOLGEN = [
  "passwort",
  "password",
  "geheim",
  "qwertz",
  "qwerty",
  "asdfgh",
  "123456",
  "letmein",
  "willkommen",
  "welcome",
  "admin",
];

/** Woerter aus Name und E-Mail, die nicht im Passwort vorkommen sollten (ab 4 Zeichen). */
function eigeneBestandteile(kontext: { name?: string; email?: string }): string[] {
  const roh = [kontext.name ?? "", (kontext.email ?? "").split("@")[0]].join(" ");
  return roh
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/)
    .filter((teil) => teil.length >= 4);
}

/**
 * Prueft ein neues Passwort. Seit 2026-08-30 zaehlt die LAENGE, nicht mehr die Zusammensetzung
 * (Nutzer-Entscheidung nach einer Rueckmeldung aus dem Test): Die frueheren Pflichten (je ein
 * Grossbuchstabe, eine Zahl, ein Sonderzeichen) erzeugten vorhersehbare Passwoerter wie
 * "Sommer26!", ohne die Sicherheit nennenswert zu erhoehen - so sieht es auch das BSI und die
 * NIST-Empfehlung SP 800-63B. Fuer diese Anwendung kommt ein zweiter Grund dazu, der schwerer
 * wiegt: Sonderzeichen sind mit einem Screenreader muehsam einzugeben und zu kontrollieren,
 * waehrend eine Passphrase aus Woertern leicht zu tippen, zu diktieren und zu pruefen ist.
 *
 * `kontext` ist optional, sollte aber ueberall mitgegeben werden, wo Name oder E-Mail bekannt
 * sind - sonst entfaellt die Pruefung auf den eigenen Namen stillschweigend.
 */
export function passwortRegelVerstoss(
  passwort: string,
  kontext: { name?: string; email?: string } = {},
): string | undefined {
  if (passwort.length < PASSWORT_MINDESTLAENGE) {
    return `Das Passwort muss mindestens ${PASSWORT_MINDESTLAENGE} Zeichen lang sein.`;
  }
  const klein = passwort.toLowerCase();
  if (HAEUFIGE_FOLGEN.some((folge) => klein.includes(folge))) {
    return "Das Passwort enthält eine sehr häufige Zeichenfolge. Bitte wähle etwas Eigenes - mehrere Wörter hintereinander sind eine gute Wahl.";
  }
  if (eigeneBestandteile(kontext).some((teil) => klein.includes(teil))) {
    return "Das Passwort darf nicht deinen Namen oder deine E-Mail-Adresse enthalten.";
  }
  return undefined;
}
