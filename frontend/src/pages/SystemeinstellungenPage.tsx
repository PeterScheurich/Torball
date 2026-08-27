import { useCallback, useEffect, useState } from "react";
import type { SelbstregistrierungsRolle } from "@torball/shared";
import {
  getSystemeinstellungen,
  testeSmtpVerbindung,
  updateSystemeinstellungen,
  type MailTestErgebnis,
} from "../api";
import { VIDEO_SLOTS } from "../videoSlots";

/**
 * Systemweite App-Einstellungen (nur Admin) - Selbstregistrierung sowie E-Mail-Versand (SMTP) fuer
 * Einladungen/Passwort-Reset, gedacht als Erweiterungspunkt fuer kuenftige globale Schalter (siehe
 * shared Systemeinstellungen-Typ). Bewusst getrennt von den Standardregeln (Turnierregeln): andere
 * Art von Einstellung (unversioniert, wirkt sofort), keine Kopplung an neu angelegte Turniere.
 */
export function SystemeinstellungenPage() {
  const [selbstregistrierungErlaubt, setSelbstregistrierungErlaubt] = useState(false);
  const [selbstregistrierungStandardRolle, setSelbstregistrierungStandardRolle] =
    useState<SelbstregistrierungsRolle>("benutzer");

  const [mailversandAktiv, setMailversandAktiv] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPasswort, setSmtpPasswort] = useState("");
  const [smtpAbsender, setSmtpAbsender] = useState("");
  const [benachrichtigungEmpfaenger, setBenachrichtigungEmpfaenger] = useState("");
  // Schluessel -> URL, vorbelegt mit allen bekannten Slots (siehe videoSlots.ts) - so zeigt das
  // Formular auch fuer einen Slot ohne bisher gespeicherte URL bereits eine (leere) Zeile.
  const [videos, setVideos] = useState<Record<string, string>>(
    Object.fromEntries(VIDEO_SLOTS.map((slot) => [slot.schluessel, ""])),
  );
  const [smtpPasswortGesetzt, setSmtpPasswortGesetzt] = useState(false);
  const [smtpTestLaeuft, setSmtpTestLaeuft] = useState(false);
  const [smtpTestErgebnis, setSmtpTestErgebnis] = useState<MailTestErgebnis | undefined>();

  const [geladen, setGeladen] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [gespeichertHinweis, setGespeichertHinweis] = useState(false);

  const laden = useCallback(async () => {
    try {
      const einstellungen = await getSystemeinstellungen();
      setSelbstregistrierungErlaubt(einstellungen.selbstregistrierungErlaubt);
      setSelbstregistrierungStandardRolle(einstellungen.selbstregistrierungStandardRolle);
      setMailversandAktiv(einstellungen.mailversandAktiv);
      setSmtpHost(einstellungen.smtpHost ?? "");
      setSmtpPort(einstellungen.smtpPort ? String(einstellungen.smtpPort) : "");
      setSmtpUser(einstellungen.smtpUser ?? "");
      setSmtpPasswort("");
      setSmtpAbsender(einstellungen.smtpAbsender ?? "");
      setBenachrichtigungEmpfaenger(einstellungen.benachrichtigungEmpfaenger ?? "");
      setSmtpPasswortGesetzt(einstellungen.smtpPasswortGesetzt);
      setVideos((bisherig) => ({
        ...bisherig,
        ...Object.fromEntries(einstellungen.videos.map((v) => [v.schluessel, v.url])),
      }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    } finally {
      setGeladen(true);
    }
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  /** Baut aus dem Formular-State (Schluessel -> URL) wieder das Array fuers PUT - Zeilen mit
   *  leerer URL werden weggelassen (kein Sinn, einen leeren Eintrag zu speichern). */
  function videosAlsArray() {
    return VIDEO_SLOTS.filter((slot) => videos[slot.schluessel]?.trim()).map((slot) => ({
      schluessel: slot.schluessel,
      url: videos[slot.schluessel].trim(),
    }));
  }

  // smtpHost/User/Absender zeigt das Formular immer im Klartext - ein geleertes Feld bedeutet hier
  // also "löschen" (null). smtpPasswort wird nie angezeigt - ein leeres Feld bedeutet "unverändert
  // lassen" (Feld fehlt im Request); explizites Löschen läuft über den eigenen "entfernen"-Knopf.
  async function speichern(event: React.FormEvent) {
    event.preventDefault();
    setSendet(true);
    setGespeichertHinweis(false);
    try {
      const ergebnis = await updateSystemeinstellungen({
        selbstregistrierungErlaubt,
        selbstregistrierungStandardRolle,
        mailversandAktiv,
        smtpHost: smtpHost.trim() || null,
        smtpPort: smtpPort.trim() ? Number(smtpPort) : null,
        smtpUser: smtpUser.trim() || null,
        smtpPasswort: smtpPasswort.trim() || undefined,
        smtpAbsender: smtpAbsender.trim() || null,
        benachrichtigungEmpfaenger: benachrichtigungEmpfaenger.trim() || null,
        videos: videosAlsArray(),
      });
      setSmtpPasswortGesetzt(ergebnis.smtpPasswortGesetzt);
      setSmtpPasswort("");
      setFehler(undefined);
      setGespeichertHinweis(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
    } finally {
      setSendet(false);
    }
  }

  async function smtpPasswortEntfernen() {
    if (!window.confirm("Wirklich das gespeicherte SMTP-Passwort entfernen? Der Wert lässt sich danach nicht wiederherstellen.")) {
      return;
    }
    try {
      const ergebnis = await updateSystemeinstellungen({
        selbstregistrierungErlaubt,
        selbstregistrierungStandardRolle,
        mailversandAktiv,
        smtpHost: smtpHost.trim() || null,
        smtpUser: smtpUser.trim() || null,
        smtpAbsender: smtpAbsender.trim() || null,
        smtpPasswort: null,
        videos: videosAlsArray(),
      });
      setSmtpPasswortGesetzt(ergebnis.smtpPasswortGesetzt);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Entfernen");
    }
  }

  // Schickt die aktuell im Formular stehenden Werte; ein leeres Passwort-Feld laesst das Backend
  // auf den bereits gespeicherten Wert zurueckfallen (so laesst sich auch ohne erneute Eingabe
  // testen, ob ein zuvor gespeicherter Wert noch funktioniert).
  async function smtpVerbindungTesten() {
    setSmtpTestLaeuft(true);
    setSmtpTestErgebnis(undefined);
    try {
      setSmtpTestErgebnis(
        await testeSmtpVerbindung({
          host: smtpHost.trim() || undefined,
          port: smtpPort.trim() ? Number(smtpPort) : undefined,
          user: smtpUser.trim() || undefined,
          passwort: smtpPasswort.trim() || undefined,
        }),
      );
    } catch (err) {
      setSmtpTestErgebnis({ ok: false, fehler: err instanceof Error ? err.message : "Test fehlgeschlagen" });
    } finally {
      setSmtpTestLaeuft(false);
    }
  }

  return (
    <>
      <h1>Systemeinstellungen</h1>
      <p>Systemweite Einstellungen der Anwendung (nicht turnierbezogen).</p>

      {fehler && <p role="alert">{fehler}</p>}

      {geladen && (
        <form onSubmit={speichern} className="regeln-formular">
          <h2>Selbstregistrierung</h2>
          <p>
            Erlaubt es Besuchern, sich unter <code>/registrieren</code> ohne Einladung selbst einen Account
            anzulegen - z. B. praktisch für eine Demo-Instanz. Neue Accounts erhalten automatisch die unten
            gewählte Rolle.
          </p>
          <div className="feld">
            <label htmlFor="selbstregistrierungErlaubt">
              <input
                id="selbstregistrierungErlaubt"
                type="checkbox"
                checked={selbstregistrierungErlaubt}
                onChange={(e) => setSelbstregistrierungErlaubt(e.target.checked)}
              />{" "}
              Selbstregistrierung erlauben
            </label>
          </div>
          <div className="feld">
            <label htmlFor="selbstregistrierungStandardRolle">Rolle für selbst registrierte Accounts</label>
            <select
              id="selbstregistrierungStandardRolle"
              value={selbstregistrierungStandardRolle}
              disabled={!selbstregistrierungErlaubt}
              onChange={(e) => setSelbstregistrierungStandardRolle(e.target.value as SelbstregistrierungsRolle)}
            >
              <option value="benutzer">Benutzer</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <p>
            Aus Sicherheitsgründen ist „Admin" hier bewusst nicht wählbar - eine Selbstregistrierung darf nie
            automatisch Admin-Rechte vergeben.
          </p>

          <h2>E-Mail-Versand (SMTP)</h2>
          <p>
            Für Einladungen und Passwort-Reset. Ohne aktivierten und vollständig eingerichteten Versand
            erscheint der jeweilige Link stattdessen im Server-Log bzw. direkt in der Antwort der
            auslösenden Person.
          </p>
          <div className="feld">
            <label htmlFor="mailversandAktiv">
              <input
                id="mailversandAktiv"
                type="checkbox"
                checked={mailversandAktiv}
                onChange={(e) => setMailversandAktiv(e.target.checked)}
              />{" "}
              E-Mail-Versand aktivieren
            </label>
            <p className="feld-hinweis">
              Lässt sich unabhängig von den Zugangsdaten unten umschalten - so lässt sich die Verbindung erst
              testen, bevor Einladungs-/Passwort-Reset-Mails tatsächlich live verschickt werden.
            </p>
          </div>
          <div className="tabellen-wrapper">
            <table className="uebersicht-tabelle regeln-tabelle">
              <caption className="sr-only">SMTP-Zugang</caption>
              <tbody>
                <tr>
                  <th scope="row">
                    <label htmlFor="smtp-host">Host</label>
                  </th>
                  <td>
                    <input id="smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="smtp-port">Port</label>
                  </th>
                  <td>
                    <input
                      id="smtp-port"
                      type="number"
                      placeholder="587"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="smtp-user">Benutzer</label>
                  </th>
                  <td>
                    <input id="smtp-user" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="smtp-passwort">Passwort</label>
                  </th>
                  <td>
                    <input
                      id="smtp-passwort"
                      type="password"
                      autoComplete="new-password"
                      value={smtpPasswort}
                      onChange={(e) => setSmtpPasswort(e.target.value)}
                    />
                    <p className="feld-hinweis">
                      {smtpPasswortGesetzt ? "Hinterlegt – leer lassen, um es zu behalten." : "Noch nicht hinterlegt."}
                    </p>
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="smtp-absender">Absender</label>
                  </th>
                  <td>
                    <input
                      id="smtp-absender"
                      placeholder='"Torball-Turniere" &lt;noreply@beispiel.de&gt;'
                      value={smtpAbsender}
                      onChange={(e) => setSmtpAbsender(e.target.value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="kanban-sync-aktionen">
            <button type="button" onClick={smtpVerbindungTesten} disabled={smtpTestLaeuft}>
              {smtpTestLaeuft ? "Verbindung wird getestet…" : "Verbindung testen"}
            </button>
            {smtpPasswortGesetzt && (
              <button type="button" className="button-loeschen" onClick={smtpPasswortEntfernen}>
                Passwort entfernen
              </button>
            )}
          </div>
          {smtpTestErgebnis && (
            <p role="status">{smtpTestErgebnis.ok ? "✓ Verbindung erfolgreich." : `✗ ${smtpTestErgebnis.fehler}`}</p>
          )}

          <div className="feld">
            <label htmlFor="benachrichtigungEmpfaenger">Benachrichtigung bei neuer Registrierung/Einladung-Annahme</label>
            <input
              id="benachrichtigungEmpfaenger"
              type="email"
              value={benachrichtigungEmpfaenger}
              onChange={(e) => setBenachrichtigungEmpfaenger(e.target.value)}
            />
            <p className="feld-hinweis">
              Optional. Geht an diese Adresse, sobald sich jemand selbst registriert oder eine Einladung annimmt -
              nur wenn der E-Mail-Versand oben aktiviert und vollständig eingerichtet ist.
            </p>
          </div>

          <h2>Video-URLs</h2>
          <p>
            YouTube-Links für an fest definierten Stellen der App eingebettete Videos. Leer lassen, wenn an der
            jeweiligen Stelle kein Video angezeigt werden soll.
          </p>
          {/* Bewusst ohne .regeln-tabelle (max-width: 30em) - das war fuer kurze SMTP-Werte
              gedacht, eine YouTube-URL braucht deutlich mehr Platz im Eingabefeld. */}
          <div className="tabellen-wrapper">
            <table className="uebersicht-tabelle">
              <caption className="sr-only">Video-URLs</caption>
              <tbody>
                {VIDEO_SLOTS.map((slot) => (
                  <tr key={slot.schluessel}>
                    <th scope="row">
                      <label htmlFor={`video-${slot.schluessel}`}>{slot.label}</label>
                    </th>
                    <td>
                      <input
                        id={`video-${slot.schluessel}`}
                        type="url"
                        placeholder="https://youtu.be/…"
                        value={videos[slot.schluessel] ?? ""}
                        onChange={(e) => setVideos((bisherig) => ({ ...bisherig, [slot.schluessel]: e.target.value }))}
                      />
                      <p className="feld-hinweis">{slot.beschreibung}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {gespeichertHinweis && <p>Gespeichert.</p>}
          <button type="submit" disabled={sendet}>
            Speichern
          </button>
        </form>
      )}

      {/* Sicherung: bewusst AUSSERHALB des Formulars oben - sie hat mit den Einstellungen
          nichts zu tun und soll nicht versehentlich mit "Speichern" verknuepft wirken.
          Bewusst ein normaler Link statt eines Knopfes mit fetch(): der Browser laedt die
          Datei damit selbst herunter, ohne sie vorher komplett in den Speicher zu holen. */}
      <h2>Sicherung</h2>
      <p>
        Lädt den <strong>gesamten</strong> Datenbestand als eine Datei herunter: alle Turniere, Mannschaften,
        Spiele, Protokolle, Stammdaten, Benutzerkonten und Einstellungen. Gedacht als Sicherheitsnetz vor einem
        Turnier – bewahre die Datei außerhalb dieses Rechners auf, zum Beispiel auf einem USB-Stick.
      </p>
      <p className="warnkasten">
        Die Datei enthält auch Zugangsdaten (Passwort-Hashes, Zwei-Faktor-Geheimnisse, E-Mail-Zugang). Sie gehört
        an einen sicheren Ort und nicht in eine Cloud-Freigabe oder einen E-Mail-Anhang.
      </p>
      <p>
        <a className="button-link" href="/api/sicherung">
          Sicherung herunterladen
        </a>
      </p>
      <p className="feld-hinweis">
        Zurückspielen lässt sich eine Sicherung bewusst nur über die Konsole – sie überschreibt im Zweifel einen
        laufenden Turnierbestand und soll deshalb ein bewusster Schritt bleiben:{" "}
        <code>npm run torball -- sicherung:einspielen --datei="…"</code>
      </p>
    </>
  );
}
