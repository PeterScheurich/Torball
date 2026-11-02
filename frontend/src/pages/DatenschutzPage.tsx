import { Link } from "react-router-dom";
import { BETREIBER } from "../rechtliches";

/**
 * Datenschutzerklaerung der ZENTRALEN Instanz. Beschreibt, was die Anwendung wirklich tut (Stand siehe rechtliches.ts). Bei jeder
 * Aenderung an gespeicherten Daten, Cookies/Browser-Speicher, externen Verbindungen oder Mails diese Seite mitziehen - eine
 * Erklaerung, die nicht mehr stimmt, ist schlimmer als eine knappe. Offene Rechtsfragen stehen auf den Kanban-Karten
 * "Datenschutz: ..." (Rollen Betreiber/Turnierleitung, Gesundheitsdaten, Loeschfristen).
 */
export function DatenschutzPage() {
  return (
    <>
      <h1>Datenschutzerklärung</h1>

      {BETREIBER.entwurf && (
        <p role="note">
          <strong>Entwurf:</strong> Dieser Text ist noch nicht rechtlich geprüft und gilt erst, wenn er freigegeben ist. Stand:{" "}
          {BETREIBER.stand}.
        </p>
      )}

      <h2>Verantwortlicher</h2>
      <p>
        {BETREIBER.name}
        {BETREIBER.anschrift.length > 0 ? (
          BETREIBER.anschrift.map((zeile) => (
            <span key={zeile}>
              <br />
              {zeile}
            </span>
          ))
        ) : (
          <>
            <br />
            <strong>[Anschrift fehlt noch]</strong>
          </>
        )}
        <br />
        E-Mail: <a href={`mailto:${BETREIBER.email}`}>{BETREIBER.email}</a>
      </p>
      <p>
        Diese Erklärung gilt für die zentrale Instanz unter turniere.blindentorball.de. Wer die Anwendung selbst installiert, ist
        für die dort gespeicherten Daten selbst verantwortlich. Die Demo unter turniere-demo.blindentorball.de wird jede Nacht
        zurückgesetzt. Bitte gib dort keine echten personenbezogenen Daten ein.
      </p>

      <h2>Das Wichtigste in Kürze</h2>
      <ul>
        <li>Keine Werbung, kein Tracking, keine Analysewerkzeuge.</li>
        <li>Die Seiten laden keine Schriften, Skripte oder Bilder von fremden Servern.</li>
        <li>Es wird nur ein technisch nötiges Cookie für die Anmeldung gesetzt.</li>
        <li>Eine Verbindung zu einem fremden Dienst (YouTube) entsteht nur, wenn du ein Video ausdrücklich laden lässt.</li>
      </ul>

      <h2>Server-Protokolle</h2>
      <p>
        Bei jedem Aufruf übermittelt dein Browser technische Daten: die IP-Adresse, Datum und Uhrzeit, die aufgerufene Adresse und
        die Browserkennung. Sie werden zur Sicherheit und zur Fehlersuche in Server-Protokollen gespeichert (Rechtsgrundlage:
        berechtigtes Interesse, Art. 6 Abs. 1 Buchst. f DSGVO). Sie werden höchstens {BETREIBER.logAufbewahrungTage} Tage
        aufbewahrt. Der Server steht in Deutschland und wird vom Verantwortlichen selbst betrieben. Die Verbindung läuft über einen
        vorgeschalteten Proxy-Server des Verantwortlichen, auf dem Verbindungsdaten ebenfalls kurz protokolliert werden.
      </p>

      <h2>Benutzerkonto</h2>
      <p>
        Für ein Konto speichern wir Nachname, Vorname (freiwillig), E-Mail-Adresse und die Rolle. Freiwillig kannst du Telefon,
        Anschrift, Verein oder Verband und die Angabe zu einer Schiedsrichter-Lizenz ergänzen. Dazu kommen der Zeitpunkt der letzten
        Anmeldung, das Passwort (nur als nicht umkehrbarer Hash) und, wenn du sie einschaltest, die Angaben für die
        Zwei-Faktor-Anmeldung. Zweck ist die Nutzung der Anwendung (Rechtsgrundlage: Art. 6 Abs. 1 Buchst. b DSGVO). Dein Konto
        bleibt bestehen, bis du seine Löschung verlangst. Schreib dafür an die oben genannte Adresse.
      </p>

      <h2>Anmeldung, Cookie und Browser-Speicher</h2>
      <p>
        Nach der Anmeldung setzt die Anwendung ein Cookie mit dem Namen torball_session. Es ist für die Anmeldung technisch nötig.
        Ohne die Option „Angemeldet bleiben“ löscht der Browser es beim Schließen, mit der Option bleibt es bei Nutzung bis zu zwölf
        Stunden bestehen. Zusätzlich speichert die Anwendung in deinem Browser Einstellungen zur Darstellung, deine letzte Wahl bei
        „Angemeldet bleiben“ und, bei der digitalen Protokollierung, noch nicht gesendete Ereignisse. Diese Daten bleiben in deinem
        Browser und werden nicht an Dritte übertragen. Beides ist für die gewünschte Funktion erforderlich (§ 25 Abs. 2 TDDDG).
      </p>

      <h2>Turnierdaten</h2>
      <p>
        Turnierleitungen erfassen in der Anwendung Mannschaften, Spielerinnen und Spieler (Name, Vorname, Trikotnummer,
        Klassifizierung), Betreuerinnen und Betreuer, Schiedsrichter (Name, Kontaktdaten, Verein, Lizenz), Spielpläne und
        Ergebnisse, bei der digitalen Protokollierung auch Spielereignisse.
      </p>
      <p>
        Die Klassifizierung (B1, B2, B3, sehend, AB) beschreibt die Sehbehinderung und ist damit eine Angabe zur Gesundheit. Sie
        wird nur in der Verwaltung angezeigt und nicht auf öffentlichen Seiten.
      </p>
      <p>
        Die Turnierleitung entscheidet, welche Daten sie erfasst und freigibt. Sie ist dafür verantwortlich, dass sie diese Daten
        verarbeiten darf, etwa weil die betroffenen Personen eingewilligt haben, und dass diese darüber informiert sind. Der
        Betreiber stellt dafür die technische Plattform bereit.
      </p>
      <p>
        Die öffentlichen Turnierseiten zeigen, soweit die Turnierleitung das freigibt, Mannschaften, Spielplan, Ergebnisse und
        Tabellen und auf Wunsch den Namen und Kontakt der Turnierleitung. Namen von Spielerinnen, Spielern und Schiedsrichtern
        zeigen sie nicht.
      </p>

      <h2>E-Mails</h2>
      <p>
        Die Anwendung versendet E-Mails für Einladungen, das Zurücksetzen von Passwörtern und Hinweise zu Änderungen an deinem
        Konto. Dafür werden deine E-Mail-Adresse und dein Name an den Mail-Server des Betreibers
        {BETREIBER.mailVersandAnbieter ? ` (${BETREIBER.mailVersandAnbieter})` : ""} übergeben.
      </p>

      <h2>Video von YouTube</h2>
      <p>
        Auf der Startseite kann ein Einführungsvideo von YouTube erscheinen. Es wird erst geladen, wenn du auf „Video laden“
        klickst (Einwilligung, Art. 6 Abs. 1 Buchst. a DSGVO). Dabei wird deine IP-Adresse an YouTube (Google) übertragen, auch in
        Länder außerhalb der EU. Wir verwenden die erweiterte Datenschutz-Variante (youtube-nocookie.com).
      </p>

      <h2>Weitergabe von Daten</h2>
      <p>
        Wir geben deine Daten nicht an Dritte weiter, außer an technische Dienstleister, die für den Betrieb nötig sind (Server und
        Mail-Versand). Es findet keine Übermittlung in Drittländer statt, außer wenn du das Video ausdrücklich laden lässt.
      </p>

      <h2>Sicherheit</h2>
      <p>
        Die Verbindung zur Anwendung ist verschlüsselt (HTTPS). Passwörter werden nur als Hash gespeichert, du kannst eine
        Zwei-Faktor-Anmeldung einschalten, und der Zugriff auf Daten ist nach Rollen beschränkt.
      </p>

      <h2>Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch und
        Datenübertragbarkeit (Art. 15 bis 21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit widerrufen. Schreib dafür an{" "}
        {BETREIBER.email}. Du kannst dich außerdem bei einer Aufsichtsbehörde beschweren, zuständig ist:{" "}
        {BETREIBER.aufsichtsbehoerde}.
      </p>

      <p>
        Die Anwendung selbst findest du auf der <Link to="/ueberblick">Seite „Auf einen Blick“</Link>, das Impressum unter{" "}
        <Link to="/impressum">Impressum</Link>.
      </p>
    </>
  );
}
