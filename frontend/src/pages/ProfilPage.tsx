import { useState } from "react";
import type { GlobaleRolle } from "@torball/shared";
import {
  eigenesProfilAktualisieren,
  totpBestaetigen,
  totpDeaktivieren,
  totpEinrichten,
  type TotpEinrichtung,
} from "../api";
import { useAuth } from "../auth";

const ROLLEN_LABEL: Record<GlobaleRolle, string> = {
  admin: "Admin",
  manager: "Manager",
  benutzer: "Benutzer",
};

export function ProfilPage() {
  const { benutzer, aktualisiereBenutzer } = useAuth();
  const [email, setEmail] = useState(benutzer?.email ?? "");
  const [einrichtung, setEinrichtung] = useState<TotpEinrichtung | undefined>();
  const [code, setCode] = useState("");
  const [deaktivierenPasswort, setDeaktivierenPasswort] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const [hinweis, setHinweis] = useState<string | undefined>();

  if (!benutzer) return null;

  async function emailSpeichern(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    setHinweis(undefined);
    try {
      const aktualisiert = await eigenesProfilAktualisieren({ email });
      aktualisiereBenutzer(aktualisiert);
      setHinweis("E-Mail-Adresse wurde geändert.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der E-Mail-Adresse");
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
              <th scope="row">Name</th>
              <td>{benutzer.name}</td>
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
                  <button type="submit" disabled={email === benutzer.email}>
                    Speichern
                  </button>
                </form>
              </td>
            </tr>
            <tr>
              <th scope="row">Rolle</th>
              <td>{ROLLEN_LABEL[benutzer.globaleRolle]}</td>
            </tr>
          </tbody>
        </table>
      </div>

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
