import { useState } from "react";
import type { Dichte, GlobaleRolle, Theme } from "@torball/shared";
import {
  eigenesPasswortAendern,
  eigenesProfilAktualisieren,
  totpBestaetigen,
  totpDeaktivieren,
  totpEinrichten,
  type TotpEinrichtung,
} from "../api";
import { useAuth } from "../auth";
import { PasswortRegeln } from "../PasswortRegeln";
import { themeAnwenden } from "../theme";
import { dichteAnwenden } from "../dichte";

const ROLLEN_LABEL: Record<GlobaleRolle, string> = {
  admin: "Admin",
  manager: "Manager",
  benutzer: "Benutzer",
};

const THEME_LABEL: Record<Theme, string> = {
  system: "Systemeinstellung folgen",
  light: "Hell",
  dark: "Dunkel",
};

const DICHTE_LABEL: Record<Dichte, string> = {
  standard: "Standard",
  schmal: "Schmal",
};

export function ProfilPage() {
  const { benutzer, aktualisiereBenutzer } = useAuth();
  const [email, setEmail] = useState(benutzer?.email ?? "");
  const [emailPasswort, setEmailPasswort] = useState("");
  const [aktuellesPasswort, setAktuellesPasswort] = useState("");
  const [neuesPasswort, setNeuesPasswort] = useState("");
  const [neuesPasswortWiederholung, setNeuesPasswortWiederholung] = useState("");
  const [einrichtung, setEinrichtung] = useState<TotpEinrichtung | undefined>();
  const [code, setCode] = useState("");
  const [deaktivierenPasswort, setDeaktivierenPasswort] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const [hinweis, setHinweis] = useState<string | undefined>();

  if (!benutzer) return null;

  /** Speichert sofort bei Auswahl (wie die uebrigen Auswahlfelder in der App) und wendet
   * die Wahl gleich auch auf diesem Geraet an - eine bewusste Aktion "das soll jetzt
   * mein Standard sein" darf nicht erst auf ein anderes Geraet warten, um sichtbar zu werden. */
  async function voreinstellungAendern(feld: "standardTheme" | "standardDichte", wert: string) {
    setFehler(undefined);
    setHinweis(undefined);
    try {
      const aktualisiert = await eigenesProfilAktualisieren({ [feld]: wert });
      aktualisiereBenutzer(aktualisiert);
      if (feld === "standardTheme") themeAnwenden(wert as Theme);
      else dichteAnwenden(wert as Dichte);
      setHinweis("Voreinstellung gespeichert.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern der Voreinstellung");
    }
  }

  async function emailSpeichern(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    setHinweis(undefined);
    try {
      const aktualisiert = await eigenesProfilAktualisieren({ email, aktuellesPasswort: emailPasswort });
      aktualisiereBenutzer(aktualisiert);
      setEmailPasswort("");
      setHinweis("E-Mail-Adresse wurde geändert.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der E-Mail-Adresse");
    }
  }

  async function passwortAendern(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    setHinweis(undefined);
    if (neuesPasswort !== neuesPasswortWiederholung) {
      setFehler("Die beiden neuen Passwörter stimmen nicht überein.");
      return;
    }
    try {
      await eigenesPasswortAendern(aktuellesPasswort, neuesPasswort);
      setAktuellesPasswort("");
      setNeuesPasswort("");
      setNeuesPasswortWiederholung("");
      setHinweis("Passwort wurde geändert. Andere angemeldete Sitzungen wurden beendet.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern des Passworts");
    }
  }

  async function einrichtungStarten() {
    setFehler(undefined);
    try {
      setEinrichtung(await totpEinrichten());
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Einrichten von 2FA");
    }
  }

  async function bestaetigen(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    try {
      const aktualisiert = await totpBestaetigen(code);
      aktualisiereBenutzer(aktualisiert);
      setEinrichtung(undefined);
      setCode("");
      setHinweis("Zwei-Faktor-Authentifizierung ist jetzt aktiv.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Bestätigungscode ungültig");
    }
  }

  async function deaktivieren(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    try {
      const aktualisiert = await totpDeaktivieren(deaktivierenPasswort);
      aktualisiereBenutzer(aktualisiert);
      setDeaktivierenPasswort("");
      setHinweis("Zwei-Faktor-Authentifizierung wurde deaktiviert.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Passwort ist falsch");
    }
  }

  return (
    <>
      <h1>Mein Profil</h1>

      {fehler && <p role="alert">{fehler}</p>}
      {hinweis && <p>{hinweis}</p>}

      <div className="tabellen-wrapper">
        <table>
          <caption className="sr-only">Eigene Profildaten</caption>
          <tbody>
            <tr>
              <th scope="row">
                <label htmlFor="profilName">Name</label>
              </th>
              <td>
                <input id="profilName" readOnly value={benutzer.name} />
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="email">E-Mail</label>
              </th>
              <td>
                <form onSubmit={emailSpeichern} className="inline-form">
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <label className="sr-only" htmlFor="emailPasswort">
                    Aktuelles Passwort zur Bestätigung der E-Mail-Änderung
                  </label>
                  <input
                    id="emailPasswort"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Aktuelles Passwort"
                    required
                    value={emailPasswort}
                    onChange={(e) => setEmailPasswort(e.target.value)}
                  />
                  <button type="submit" disabled={email === benutzer.email}>
                    Speichern
                  </button>
                </form>
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="neuesPasswort">Passwort</label>
              </th>
              <td>
                <form onSubmit={passwortAendern} className="inline-form">
                  <label className="sr-only" htmlFor="aktuellesPasswort">
                    Aktuelles Passwort
                  </label>
                  <input
                    id="aktuellesPasswort"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Aktuelles Passwort"
                    required
                    value={aktuellesPasswort}
                    onChange={(e) => setAktuellesPasswort(e.target.value)}
                  />
                  <input
                    id="neuesPasswort"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Neues Passwort"
                    required
                    value={neuesPasswort}
                    onChange={(e) => setNeuesPasswort(e.target.value)}
                  />
                  <label className="sr-only" htmlFor="neuesPasswortWiederholung">
                    Neues Passwort wiederholen
                  </label>
                  <input
                    id="neuesPasswortWiederholung"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Neues Passwort wiederholen"
                    required
                    value={neuesPasswortWiederholung}
                    onChange={(e) => setNeuesPasswortWiederholung(e.target.value)}
                  />
                  <button type="submit">Ändern</button>
                </form>
                {neuesPasswort && <PasswortRegeln passwort={neuesPasswort} />}
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="profilRolle">Rolle</label>
              </th>
              <td>
                <input id="profilRolle" readOnly value={ROLLEN_LABEL[benutzer.globaleRolle]} />
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="standardTheme">Standard-Farbschema</label>
              </th>
              <td>
                <select
                  id="standardTheme"
                  value={benutzer.standardTheme ?? "system"}
                  onChange={(e) => voreinstellungAendern("standardTheme", e.target.value)}
                >
                  {(Object.keys(THEME_LABEL) as Theme[]).map((wert) => (
                    <option key={wert} value={wert}>
                      {THEME_LABEL[wert]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="standardDichte">Standard-Zeilenabstand</label>
              </th>
              <td>
                <select
                  id="standardDichte"
                  value={benutzer.standardDichte ?? "standard"}
                  onChange={(e) => voreinstellungAendern("standardDichte", e.target.value)}
                >
                  {(Object.keys(DICHTE_LABEL) as Dichte[]).map((wert) => (
                    <option key={wert} value={wert}>
                      {DICHTE_LABEL[wert]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Farbschema und Zeilenabstand gelten dann auch beim nächsten Login auf einem anderen Gerät, sofern dort noch
        keine eigene Wahl in <a href="/einstellungen">den Einstellungen</a> getroffen wurde.
      </p>
      <p>Für ein neues Passwort: mindestens 8 Zeichen, davon 1 Großbuchstabe, 1 Zahl, 1 Sonderzeichen.</p>

      <h2>Zwei-Faktor-Authentifizierung (2FA)</h2>
      {benutzer.zweiFaAktiv ? (
        <>
          <p>2FA ist aktiv.</p>
          <form onSubmit={deaktivieren}>
            <div className="feld">
              <label htmlFor="deaktivierenPasswort">Passwort zur Bestätigung</label>
              <input
                id="deaktivierenPasswort"
                type="password"
                autoComplete="current-password"
                required
                value={deaktivierenPasswort}
                onChange={(e) => setDeaktivierenPasswort(e.target.value)}
              />
            </div>
            <button type="submit">2FA deaktivieren</button>
          </form>
        </>
      ) : einrichtung ? (
        <>
          <p>Scanne den QR-Code mit einer Authenticator-App oder gib den Schlüssel manuell ein:</p>
          <img src={einrichtung.qrCodeDataUri} alt="QR-Code zur 2FA-Einrichtung" width="200" height="200" />
          <p>
            Schlüssel zur manuellen Eingabe: <code>{einrichtung.secret}</code>
          </p>
          <form onSubmit={bestaetigen}>
            <div className="feld">
              <label htmlFor="code">Bestätigungscode aus der App</label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button type="submit">Bestätigen und aktivieren</button>
          </form>
        </>
      ) : (
        <>
          <p>2FA ist nicht aktiv.</p>
          <button type="button" onClick={einrichtungStarten}>
            2FA einrichten
          </button>
        </>
      )}
    </>
  );
}
