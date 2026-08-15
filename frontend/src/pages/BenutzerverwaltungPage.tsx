import { useCallback, useEffect, useState } from "react";
import type { GlobaleRolle } from "@torball/shared";
import {
  benutzerAktualisieren,
  benutzerEinladen,
  benutzerEinladungErneutSenden,
  benutzerPasswortResetAusloesen,
  benutzerZweiFaDeaktivieren,
  getBenutzerListe,
  type BenutzerProfil,
} from "../api";
import { useAuth } from "../auth";

/** Anzeige-Labels der globalen Rollen. */
const ROLLEN_LABEL: Record<GlobaleRolle, string> = {
  admin: "Admin",
  manager: "Manager",
  benutzer: "Benutzer",
};

/**
 * Benutzerverwaltung (nur Admin/Manager, siehe Routen-Gate in App.tsx): bestehende Benutzer
 * auflisten, Rolle aendern, sperren/entsperren, fremde 2FA deaktivieren, und neue Benutzer per
 * E-Mail einladen. Ein Admin darf alle Rollen vergeben, ein Manager nur "manager"/"benutzer"
 * (kein Hochstufen zum Admin). Benutzer werden nie geloescht, nur gesperrt (Spez. 25.3).
 */
export function BenutzerverwaltungPage() {
  const { benutzer: angemeldeter } = useAuth();
  const [liste, setListe] = useState<BenutzerProfil[]>([]);
  const [name, setName] = useState("");
  const [vorname, setVorname] = useState("");
  const [email, setEmail] = useState("");
  const [rolle, setRolle] = useState<GlobaleRolle>("benutzer");
  const [einladungslink, setEinladungslink] = useState<string | undefined>();
  const [einladungPerMail, setEinladungPerMail] = useState(false);
  const [resetHinweis, setResetHinweis] = useState<{ email: string; link?: string } | undefined>();
  const [einladungErneutHinweis, setEinladungErneutHinweis] = useState<{ email: string; link?: string } | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();

  const laden = useCallback(async () => {
    try {
      setListe(await getBenutzerListe());
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  // Welche Rollen der/die Angemeldete vergeben darf: nur ein Admin darf "admin" vergeben.
  const vergebbareRollen: GlobaleRolle[] =
    angemeldeter?.globaleRolle === "admin" ? ["admin", "manager", "benutzer"] : ["manager", "benutzer"];

  // Laedt eine Einladung ein. Ist SMTP konfiguriert, verschickt der Server die Einladungsmail
  // (kein Token in der Antwort) -> Hinweis "per E-Mail verschickt". Ohne Mail-Versand liefert
  // der Server den Token zurueck, aus dem hier ein manuell weiterzugebender Link gebaut wird.
  async function einladen(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    setEinladungslink(undefined);
    setEinladungPerMail(false);
    try {
      const { einladungsToken } = await benutzerEinladen({
        name,
        vorname: vorname.trim() || undefined,
        email,
        globaleRolle: rolle,
      });
      if (einladungsToken) {
        setEinladungslink(`${window.location.origin}/einladung/${einladungsToken}`);
      } else {
        setEinladungPerMail(true);
      }
      setName("");
      setVorname("");
      setEmail("");
      setRolle("benutzer");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Einladen");
    }
  }

  // Aendert die globale Rolle eines Benutzers (Eigen-Account und - fuer Manager - Admins sind
  // im UI gesperrt, damit sich niemand selbst hoch-/herunterstuft; der Server prueft zusaetzlich).
  async function rolleAendern(id: string, neueRolle: GlobaleRolle) {
    try {
      await benutzerAktualisieren(id, { globaleRolle: neueRolle });
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Rolle");
    }
  }

  // Sperrt bzw. entsperrt einen Benutzer (das eigene Konto ist im UI ausgenommen). Sperren ist
  // laut Spezifikation der Ersatz fuer ein Loeschen - der Datensatz bleibt fuer die Nachvollziehbarkeit.
  async function sperrenUmschalten(b: BenutzerProfil) {
    try {
      await benutzerAktualisieren(b._id, { gesperrt: !b.gesperrt });
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Sperrung");
    }
  }

  // Loest fuer eine andere Person einen Passwort-Reset aus - Ergaenzung zum Self-Service-Link,
  // v.a. fuer eine lokale Installation ohne Internet (dort kommt der Link direkt zurueck statt per
  // Mail). Hebt bei der Zielperson nur eine automatische Fehlversuche-Sperre auf, nie eine
  // manuelle Admin-Sperre.
  async function passwortResetAusloesen(b: BenutzerProfil) {
    setFehler(undefined);
    setResetHinweis(undefined);
    try {
      const { email, resetToken } = await benutzerPasswortResetAusloesen(b._id);
      setResetHinweis({
        email,
        link: resetToken ? `${window.location.origin}/passwort-reset/${resetToken}` : undefined,
      });
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Auslösen des Passwort-Resets");
    }
  }

  // Verschickt die Einladung fuer einen noch nicht aktivierten Account erneut - z.B. wenn die
  // urspruengliche Mail nie ankam (etwa weil SMTP zum Zeitpunkt der Einladung noch fehlte).
  async function einladungErneutSenden(b: BenutzerProfil) {
    setFehler(undefined);
    setEinladungErneutHinweis(undefined);
    try {
      const { email, einladungsToken } = await benutzerEinladungErneutSenden(b._id);
      setEinladungErneutHinweis({
        email,
        link: einladungsToken ? `${window.location.origin}/einladung/${einladungsToken}` : undefined,
      });
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim erneuten Senden der Einladung");
    }
  }

  // Admin-Notfallhilfe: deaktiviert die 2FA eines anderen Benutzers, der den Zugang zu seiner
  // Authenticator-App verloren hat (das eigene Konto ist ausgenommen). Danach Anmeldung nur mit
  // Passwort, 2FA im Profil neu einrichtbar.
  async function zweiFaDeaktivieren(b: BenutzerProfil) {
    if (
      !window.confirm(
        `Zwei-Faktor-Anmeldung für „${b.name}“ wirklich deaktivieren? ` +
          `Nutze das nur, wenn die Person den Zugang zu ihrer Authenticator-App verloren hat. ` +
          `Sie meldet sich danach nur mit Passwort an und kann 2FA im Profil neu einrichten.`,
      )
    ) {
      return;
    }
    try {
      await benutzerZweiFaDeaktivieren(b._id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Deaktivieren der 2FA");
    }
  }

  return (
    <>
      <h1>Benutzerverwaltung</h1>
      {fehler && <p role="alert">{fehler}</p>}

      <h2>Bestehende Benutzer</h2>
      <div className="tabellen-wrapper">
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">E-Mail</th>
              <th scope="col">Rolle</th>
              <th scope="col">Status</th>
              <th scope="col">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((b) => (
              <tr key={b._id}>
                <td>{b.vorname ? `${b.vorname} ${b.name}` : b.name}</td>
                <td className="benutzer-email">{b.email}</td>
                <td>
                  <label className="sr-only" htmlFor={`rolle-${b._id}`}>
                    Rolle von {b.name}
                  </label>
                  <select
                    id={`rolle-${b._id}`}
                    value={b.globaleRolle}
                    disabled={b._id === angemeldeter?._id || (angemeldeter?.globaleRolle !== "admin" && b.globaleRolle === "admin")}
                    onChange={(e) => rolleAendern(b._id, e.target.value as GlobaleRolle)}
                  >
                    {(angemeldeter?.globaleRolle === "admin"
                      ? (["admin", "manager", "benutzer"] as GlobaleRolle[])
                      : (["manager", "benutzer"] as GlobaleRolle[])
                    ).map((r) => (
                      <option key={r} value={r}>
                        {ROLLEN_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {b.gesperrt
                    ? b.gesperrtGrund === "fehlversuche"
                      ? "Gesperrt (zu viele Fehlversuche)"
                      : "Gesperrt"
                    : !b.hatPasswort
                      ? "Einladung offen"
                      : "Aktiv"}
                </td>
                <td className="benutzer-aktionen">
                  <button
                    type="button"
                    onClick={() => sperrenUmschalten(b)}
                    disabled={b._id === angemeldeter?._id}
                  >
                    {b.gesperrt ? "Entsperren" : "Sperren"}
                  </button>
                  {b._id !== angemeldeter?._id && (
                    <button type="button" onClick={() => passwortResetAusloesen(b)} title="Passwort-Reset auslösen">
                      PW-Reset
                    </button>
                  )}
                  {!b.hatPasswort && (
                    <button
                      type="button"
                      className="symbol-button"
                      onClick={() => einladungErneutSenden(b)}
                      aria-label={`Einladung erneut senden an ${b.name}`}
                      title="Einladung erneut senden"
                    >
                      ✉
                    </button>
                  )}
                  {angemeldeter?.globaleRolle === "admin" && b.zweiFaAktiv && b._id !== angemeldeter?._id && (
                    <button type="button" onClick={() => zweiFaDeaktivieren(b)}>
                      2FA deaktivieren
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Neuen Benutzer einladen</h2>
      <form onSubmit={einladen} className="stammdaten-formular">
        <div className="tabellen-wrapper">
          <table className="uebersicht-tabelle">
            <caption className="sr-only">Neuen Benutzer einladen</caption>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="name">Name</label>
                </th>
                <td>
                  <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="vorname">Vorname</label>
                </th>
                <td>
                  <input id="vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="email">E-Mail</label>
                </th>
                <td>
                  <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="rolle">Rolle</label>
                </th>
                <td>
                  <select id="rolle" value={rolle} onChange={(e) => setRolle(e.target.value as GlobaleRolle)}>
                    {vergebbareRollen.map((r) => (
                      <option key={r} value={r}>
                        {ROLLEN_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="submit">Einladen</button>
      </form>

      {einladungPerMail && <p>Einladung wurde per E-Mail verschickt.</p>}
      {einladungslink && (
        <p>
          Kein E-Mail-Versand konfiguriert - Einladungslink bitte manuell weitergeben:
          <br />
          <input type="text" readOnly value={einladungslink} onFocus={(e) => e.target.select()} />
        </p>
      )}

      {resetHinweis &&
        (resetHinweis.link ? (
          <p>
            Passwort-Reset für {resetHinweis.email} ausgelöst. Kein E-Mail-Versand konfiguriert (oder gerade nicht
            erreichbar, z. B. auf einer lokalen Installation ohne Internet) - Link bitte manuell weitergeben:
            <br />
            <input type="text" readOnly value={resetHinweis.link} onFocus={(e) => e.target.select()} />
          </p>
        ) : (
          <p>Passwort-Reset für {resetHinweis.email} ausgelöst und per E-Mail verschickt.</p>
        ))}

      {einladungErneutHinweis &&
        (einladungErneutHinweis.link ? (
          <p>
            Einladung für {einladungErneutHinweis.email} erneuert. Kein E-Mail-Versand konfiguriert (oder gerade
            nicht erreichbar) - Link bitte manuell weitergeben:
            <br />
            <input type="text" readOnly value={einladungErneutHinweis.link} onFocus={(e) => e.target.select()} />
          </p>
        ) : (
          <p>Einladung für {einladungErneutHinweis.email} erneuert und per E-Mail verschickt.</p>
        ))}
    </>
  );
}
