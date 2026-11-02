import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ENTWICKLER } from "../entwicklerKontakt";

/**
 * "Torball-Turniere auf einen Blick" - die kurze Antwort auf "Was muss ich wissen, wenn ich das einsetzen will?" (Auftraggeber
 * 02.11.2026). Bewusst OEFFENTLICH (kein Login), erreichbar von der Startseite. Nuechtern geschrieben: konkrete Aussagen statt
 * Werbesprache, und ausdruecklich auch, was NICHT geht. Beim Aendern von Funktionsumfang, Voraussetzungen oder Betriebsarten diesen
 * Text mitziehen (wie die Hilfe: ein falscher Satz hier ist schlimmer als keiner).
 *
 * Kontakt: Die Adresse steht nicht im ersten Zustand der Seite, sondern erscheint erst auf Knopfdruck - Schutz vor Programmen, die
 * Seiten nach Mailadressen absuchen (gleiche Absicht wie bei der "Ueber"-Seite, die nur angemeldet erreichbar ist). Fuer Tastatur-
 * und Screenreader-Nutzung springt der Fokus nach dem Klick auf den Link.
 */
const DEMO_ADRESSE = "https://turniere-demo.blindentorball.de";
const QUELLCODE_ADRESSE = "https://github.com/PeterScheurich/Torball";

function KontaktAdresse() {
  const [sichtbar, setSichtbar] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (sichtbar) linkRef.current?.focus();
  }, [sichtbar]);

  if (!ENTWICKLER.email) {
    return <p>Fragen und Fehlermeldungen bitte als „Issue“ auf GitHub.</p>;
  }
  if (!sichtbar) {
    return (
      <p>
        <button type="button" className="button-sekundaer" onClick={() => setSichtbar(true)}>
          E-Mail-Adresse anzeigen
        </button>
      </p>
    );
  }
  return (
    <p>
      <a ref={linkRef} href={`mailto:${ENTWICKLER.email}?subject=${encodeURIComponent("Anfrage zu Torball-Turniere")}`}>
        {ENTWICKLER.email}
      </a>
    </p>
  );
}

export function UeberblickPage() {
  return (
    <>
      <h1>Torball-Turniere auf einen Blick</h1>

      <p className="druck-aktionen kein-druck">
        <button type="button" className="button-sekundaer" onClick={() => window.print()}>
          Seite drucken oder als PDF speichern
        </button>
      </p>

      <h2>Was ist Torball-Turniere?</h2>
      <p>
        Eine Web-Anwendung, mit der du Torball-Turniere planst und am Spieltag protokollierst. Torball ist ein Ballsport für
        blinde und sehbehinderte Menschen. Die Anwendung ist dafür entwickelt und lässt sich ohne Maus und mit Screenreader
        bedienen. Sie ist kostenlos und quelloffen.
      </p>
      <p>
        Ein Beispiel: Am Spieltag steht in der Halle ein Laptop. Zwei Helfer an den Feldern tragen die Ergebnisse mit dem Handy
        ein, ohne eigenes Konto. Wer zuschaut, sieht Spielplan und Tabelle live auf dem eigenen Telefon.
      </p>

      <h2>Das geht</h2>
      <ul>
        <li>Ein Turnier mit einem Assistenten anlegen: Grunddaten, Regeln, Mannschaften, Schiedsrichter, Spielplan.</li>
        <li>
          Spielmodi: Jeder gegen jeden, auch mit Hin- und Rückspiel. Zwei Gruppen mit Endrunde (4, 6 oder 8 Mannschaften), Spiel
          um Platz 3 und Platzierungsspiele. Eigene Vorlagen als Kopien.
        </li>
        <li>
          Ein Spielplan-Vorschlag mit Warnungen bei Regelverstößen, zum Beispiel zwei Spiele direkt hintereinander, und die
          Schiedsrichter-Einteilung. Die Anwendung warnt, entscheidet aber nicht für dich.
        </li>
        <li>
          Ergebnisse erfassen in der Anwendung oder über einen Erfassungslink mit QR-Code ohne Anmeldung, zum Beispiel für Helfer.
        </li>
        <li>Tabellen automatisch, auch als Gesamtstand über mehrere Spieltage.</li>
        <li>Eine öffentliche Turnierseite mit QR-Code, bei der du selbst bestimmst, was Gäste sehen.</li>
        <li>Ausdrucke als barrierefreies PDF: Turnierinfos, Spielplan, Ergebnisse, Schiedsrichter.</li>
        <li>National oder international, zum Beispiel Nichtantreten 5:0 nach IBSA-Regel.</li>
        <li>Mehrere Personen mit Rollen: Administration, Turnierleitung, Spielleitung.</li>
      </ul>

      <h2>Das geht noch nicht</h2>
      <ul>
        <li>
          Die digitale Live-Protokollierung, also jeder Wurf und jedes Foul, ist eine Beta. Sie ist noch nicht in einem echten
          Turnier erprobt.
        </li>
        <li>
          Ein eigenständiger Modus für einen einzelnen Rechner ohne Server ist geplant, aber noch nicht gebaut. Heute gibt es dafür
          die lokale Installation.
        </li>
        <li>Nur Deutsch. Weitere Sprachen sind vorgemerkt.</li>
        <li>Dateien am Turnier, etwa Ausschreibung oder Hallenplan, und parallele Turniere mit geteilten Feldern.</li>
      </ul>

      <h2>So kannst du es betreiben</h2>
      <h3>Im Internet</h3>
      <p>
        Das passt, wenn die Halle zuverlässiges Internet hat. Du brauchst einen Browser und ein Konto. Ein Konto bekommst du auf
        Anfrage per E-Mail (Adresse unten). Achte darauf: Fällt das Internet aus, geht in der Halle nichts.
      </p>
      <h3>Lokale Installation</h3>
      <p>
        Das passt, wenn die Halle kein oder unzuverlässiges Internet hat. Du brauchst einen Rechner mit Windows 10 oder 11 oder mit
        Debian oder Ubuntu in der 64-Bit-Fassung, und für Helfer-Geräte einen WLAN-Router. Achte darauf: Die Daten liegen auf diesem
        einen Rechner, mach vor dem Turnier eine Sicherung.
      </p>
      <h3>Eigenständig, ohne Server</h3>
      <p>Geplant, noch nicht verfügbar.</p>
      <h3>Beides kombinieren</h3>
      <p>
        Du planst im Internet, lädst das Turnier auf die lokale Installation und arbeitest vor Ort. Die Ergebnisse laufen zurück,
        sobald wieder eine Verbindung besteht.
      </p>
      <h3>Selbst betreiben</h3>
      <p>
        Der Quellcode ist frei (Lizenz GNU AGPL 3.0). Du kannst die Anwendung auf einem eigenen Server installieren und betreiben
        oder eine eigene Fassung davon pflegen.
      </p>
      <h3>Ausprobieren</h3>
      <p>
        Unter <a href={DEMO_ADRESSE}>{DEMO_ADRESSE.replace("https://", "")}</a> steht eine Demo bereit. Du kannst dort frei testen.
        Sie wird jede Nacht zurückgesetzt, Eingaben bleiben also nicht erhalten.
      </p>

      <h2>Voraussetzungen</h2>
      <ul>
        <li>Zum Benutzen: ein aktueller Browser auf Computer, Tablet oder Handy.</li>
        <li>
          Lokale Installation unter Windows: Windows 10 oder 11, Administratorrechte, etwa 1 GB freier Speicher. Es muss nichts
          vorher installiert werden. Beim Installieren und Aktualisieren ist Internet nötig, dazwischen nicht.
        </li>
        <li>
          Lokale Installation unter Linux: Debian oder Ubuntu, auch Linux Mint, mit Langzeit-Support, 64 Bit, 2 GB Arbeitsspeicher
          und etwa 2 GB Platz.
        </li>
        <li>
          Am Spielort: ein WLAN-Router, ohne Internet reicht. Verwende ein Netz mit Passwortschutz, dessen Passwort nur deine
          Helfer kennen.
        </li>
      </ul>

      <h2>Was kommt auf dich zu?</h2>
      <ul>
        <li>Ein Konto und eine kurze Einarbeitung. Die Hilfe in der Anwendung erklärt jeden Schritt.</li>
        <li>
          Für das erste Turnier je nach Erfahrung ein bis zwei Stunden. Danach geht es mit Vorlagen und „Turnier ableiten“
          schneller.
        </li>
        <li>Vor jedem Turnier auf der lokalen Installation eine Datensicherung: ein Klick, eine Datei.</li>
        <li>Rollen klären: Wer plant, wer protokolliert, wer trägt Ergebnisse ein?</li>
      </ul>

      <h2>Kosten, Lizenz, Datenschutz</h2>
      <ul>
        <li>
          Kostenlos und quelloffen, Lizenz GNU AGPL 3.0. Der Quellcode liegt auf <a href={QUELLCODE_ADRESSE}>GitHub</a>.
        </li>
        <li>Entwickelt von {ENTWICKLER.name} in enger Zusammenarbeit mit einer KI.</li>
        <li>
          Was die zentrale Instanz speichert und warum, steht in der <Link to="/datenschutz">Datenschutzerklärung</Link>, die Angaben
          zum Betreiber im <Link to="/impressum">Impressum</Link>.
        </li>
        <li>
          Die Anwendung speichert Konten mit Name und E-Mail-Adresse und die Turnierdaten. Bei einer lokalen Installation bleiben
          alle Daten auf deinem Rechner, und du bist dort selbst für sie verantwortlich.
        </li>
        <li>
          Die zentrale Instanz unter turniere.blindentorball.de betreibt {ENTWICKLER.name} privat auf einem eigenen Server in
          Deutschland und ist dafür verantwortlich. Ein Wechsel zu einem Hosting-Anbieter in Deutschland oder der EU ist angedacht.
        </li>
      </ul>

      <h2>Fragen, Fehler, Ideen</h2>
      <p>
        Konto anfragen, Fragen stellen oder etwas melden: Die Adresse erscheint auf Knopfdruck (Schutz vor Spam). Technische
        Fehler und Wünsche gern auch auf GitHub als „Issue“.
      </p>
      <KontaktAdresse />

      <p className="kein-druck">
        Mehr zu jedem Thema steht in der <Link to="/hilfe">Hilfe</Link>.
      </p>
    </>
  );
}
