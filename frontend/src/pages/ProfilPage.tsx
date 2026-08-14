import { useCallback, useEffect, useState } from "react";
import type { Breite, Dichte, GlobaleRolle, Theme, Verein } from "@torball/shared";
import {
  eigenesPasswortAendern,
  eigenesProfilAktualisieren,
  erzeugeInstanzKopplungscode,
  getVereine,
  getVerbundeneInstanzen,
  instanzWiderrufen,
  totpBestaetigen,
  totpDeaktivieren,
  totpEinrichten,
  type TotpEinrichtung,
  type VerbundeneInstanzProfil,
} from "../api";
import { formatiereZeitstempel } from "../format";
import { useAuth } from "../auth";
import { PasswortRegeln } from "../PasswortRegeln";
import { SymbolVerweis } from "../components/SymbolVerweis";
import { themeAnwenden } from "../theme";
import { dichteAnwenden } from "../dichte";
import { breiteAnwenden } from "../breite";

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

const BREITE_LABEL: Record<Breite, string> = {
  standard: "Standard",
  breit: "Breit",
};

/**
 * "Mein Profil": E-Mail und Passwort aendern, 2FA einrichten/deaktivieren sowie die
 * kontogebundenen Standardwerte fuer Farbschema/Zeilenabstand pflegen. Sicherheitsrelevante
 * Aenderungen (E-Mail, Passwort, 2FA-Deaktivierung) verlangen das aktuelle Passwort zur
 * Bestaetigung. Rolle/Name sind hier nur lesbar (Rolle aendert nur die Benutzerverwaltung).
 */
export function ProfilPage() {
  const { benutzer, aktualisiereBenutzer } = useAuth();
  const [email, setEmail] = useState(benutzer?.email ?? "");
  const [emailPasswort, setEmailPasswort] = useState("");
  // Kontakt-/Stammdaten (nicht sicherheitsrelevant, ohne Passwort speicherbar).
  const [stammdaten, setStammdaten] = useState({
    name: benutzer?.name ?? "",
    vorname: benutzer?.vorname ?? "",
    telefon: benutzer?.telefon ?? "",
    lizenzVorhanden: benutzer?.lizenzVorhanden ?? false,
    vereinVerband: benutzer?.vereinVerband ?? "",
    adresse: benutzer?.adresse ?? "",
  });
  const [aktuellesPasswort, setAktuellesPasswort] = useState("");
  const [neuesPasswort, setNeuesPasswort] = useState("");
  const [neuesPasswortWiederholung, setNeuesPasswortWiederholung] = useState("");
  const [einrichtung, setEinrichtung] = useState<TotpEinrichtung | undefined>();
  const [code, setCode] = useState("");
  const [deaktivierenPasswort, setDeaktivierenPasswort] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const [hinweis, setHinweis] = useState<string | undefined>();
  // Vereine aus den Stammdaten als Auswahlvorschlaege fuers Verein/Verband-Feld (freie Eingabe
  // bleibt moeglich - datalist). Fehler beim Laden bewusst still: das Feld funktioniert auch ohne.
  const [vereine, setVereine] = useState<Verein[]>([]);
  useEffect(() => {
    getVereine()
      .then(setVereine)
      .catch(() => setVereine([]));
  }, []);

  // Turnier-Sync (Abschnitt 21.3/23): mit diesem Konto gekoppelte lokale Installationen.
  const [instanzen, setInstanzen] = useState<VerbundeneInstanzProfil[]>([]);
  const [neuerKopplungscode, setNeuerKopplungscode] = useState<string | undefined>();
  const instanzenLaden = useCallback(() => {
    getVerbundeneInstanzen()
      .then(setInstanzen)
      .catch(() => setInstanzen([]));
  }, []);
  useEffect(() => {
    instanzenLaden();
  }, [instanzenLaden]);

  async function kopplungscodeErzeugen() {
    setFehler(undefined);
    try {
      const { kopplungscode } = await erzeugeInstanzKopplungscode();
      setNeuerKopplungscode(kopplungscode);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Erzeugen des Kopplungscodes");
    }
  }

  async function kopplungscodeKopieren() {
    if (!neuerKopplungscode) return;
    try {
      await navigator.clipboard.writeText(neuerKopplungscode);
      setHinweis("Kopplungscode kopiert.");
    } catch {
      setFehler("Kopplungscode konnte nicht kopiert werden.");
    }
  }

  async function instanzEntfernen(id: string) {
    if (!window.confirm("Diese Instanz widerrufen? Sie kann sich danach nicht mehr verbinden oder synchronisieren.")) {
      return;
    }
    try {
      await instanzWiderrufen(id);
      instanzenLaden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Widerrufen der Instanz");
    }
  }

  if (!benutzer) return null;

  /** Speichert sofort bei Auswahl (wie die uebrigen Auswahlfelder in der App) und wendet
   * die Wahl gleich auch auf diesem Geraet an - eine bewusste Aktion "das soll jetzt
   * mein Standard sein" darf nicht erst auf ein anderes Geraet warten, um sichtbar zu werden. */
  async function voreinstellungAendern(feld: "standardTheme" | "standardDichte" | "standardBreite", wert: string) {
    setFehler(undefined);
    setHinweis(undefined);
    try {
      const aktualisiert = await eigenesProfilAktualisieren({ [feld]: wert });
      aktualisiereBenutzer(aktualisiert);
      if (feld === "standardTheme") themeAnwenden(wert as Theme);
      else if (feld === "standardDichte") dichteAnwenden(wert as Dichte);
      else breiteAnwenden(wert as Breite);
      setHinweis("Voreinstellung gespeichert.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern der Voreinstellung");
    }
  }

  // Speichert die Kontakt-/Stammdaten (Name, Vorname, Telefon, Lizenz, Verein/Verband, Adresse).
  // Nicht sicherheitsrelevant -> kein Passwort noetig. Diese Daten lassen sich beim Turnier in die
  // Schiedsrichter-/Turnierleitungs-Erfassung uebernehmen.
  async function stammdatenSpeichern(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    setHinweis(undefined);
    try {
      const aktualisiert = await eigenesProfilAktualisieren({
        name: stammdaten.name,
        vorname: stammdaten.vorname,
        telefon: stammdaten.telefon,
        lizenzVorhanden: stammdaten.lizenzVorhanden,
        vereinVerband: stammdaten.vereinVerband,
        adresse: stammdaten.adresse,
      });
      aktualisiereBenutzer(aktualisiert);
      setHinweis("Stammdaten gespeichert.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern der Stammdaten");
    }
  }

  // Aendert die eigene E-Mail-Adresse (mit aktuellem Passwort bestaetigt).
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

  // Aendert das eigene Passwort (alt + neu). Serverseitig werden dabei alle ANDEREN Sitzungen
  // beendet, die aktuelle bleibt bestehen.
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

  // 2FA-Einrichtung starten: holt Secret + QR-Code vom Server. Aktiv wird 2FA erst nach
  // erfolgreicher Bestaetigung eines App-Codes (siehe bestaetigen()).
  async function einrichtungStarten() {
    setFehler(undefined);
    try {
      setEinrichtung(await totpEinrichten());
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Einrichten von 2FA");
    }
  }

  // Bestaetigt die 2FA-Einrichtung mit einem Code aus der Authenticator-App und aktiviert sie.
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

  // Deaktiviert die eigene 2FA (mit aktuellem Passwort bestaetigt).
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
                <form onSubmit={passwortAendern} className="inline-form passwort-aendern-form">
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
                  <div className="passwort-neu-spalte">
                    <input
                      id="neuesPasswort"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Neues Passwort"
                      required
                      value={neuesPasswort}
                      onChange={(e) => setNeuesPasswort(e.target.value)}
                    />
                    {neuesPasswort && <PasswortRegeln passwort={neuesPasswort} />}
                  </div>
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
            <tr>
              <th scope="row">
                <label htmlFor="standardBreite">Standard-Breite</label>
              </th>
              <td>
                <select
                  id="standardBreite"
                  value={benutzer.standardBreite ?? "standard"}
                  onChange={(e) => voreinstellungAendern("standardBreite", e.target.value)}
                >
                  {(Object.keys(BREITE_LABEL) as Breite[]).map((wert) => (
                    <option key={wert} value={wert}>
                      {BREITE_LABEL[wert]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Farbschema, Zeilenabstand und Breite gelten dann auch beim nächsten Login auf einem anderen Gerät, sofern dort
        noch keine eigene Wahl unter <SymbolVerweis art="einstellungen" /> getroffen wurde.
      </p>
      <p>Für ein neues Passwort: mindestens 8 Zeichen, davon 1 Großbuchstabe, 1 Zahl, 1 Sonderzeichen.</p>

      <h2>Kontakt- und Stammdaten</h2>
      <p>
        Diese Angaben lassen sich beim Anlegen bzw. in der Schiedsrichter-Verwaltung eines Turniers als
        Turnierleitung/Schiedsrichter übernehmen – einmal pflegen, mehrfach nutzen.
      </p>
      <form onSubmit={stammdatenSpeichern} className="stammdaten-formular">
        <div className="tabellen-wrapper">
          <table className="uebersicht-tabelle">
            <caption className="sr-only">Kontakt- und Stammdaten</caption>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="stammName">Name</label>
                </th>
                <td>
                  <input
                    id="stammName"
                    required
                    value={stammdaten.name}
                    onChange={(e) => setStammdaten((s) => ({ ...s, name: e.target.value }))}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="stammVorname">Vorname</label>
                </th>
                <td>
                  <input
                    id="stammVorname"
                    value={stammdaten.vorname}
                    onChange={(e) => setStammdaten((s) => ({ ...s, vorname: e.target.value }))}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="stammTelefon">Telefon</label>
                </th>
                <td>
                  <input
                    id="stammTelefon"
                    type="tel"
                    value={stammdaten.telefon}
                    onChange={(e) => setStammdaten((s) => ({ ...s, telefon: e.target.value }))}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="stammLizenzVorhanden">Schiedsrichter-Lizenz vorhanden</label>
                </th>
                <td>
                  <input
                    id="stammLizenzVorhanden"
                    type="checkbox"
                    checked={stammdaten.lizenzVorhanden}
                    onChange={(e) => setStammdaten((s) => ({ ...s, lizenzVorhanden: e.target.checked }))}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row" style={{ verticalAlign: "top" }}>
                  <label htmlFor="stammVereinVerband">Verein/Verband</label>
                </th>
                <td>
                  <input
                    id="stammVereinVerband"
                    list="profil-vereine-liste"
                    value={stammdaten.vereinVerband}
                    onChange={(e) => setStammdaten((s) => ({ ...s, vereinVerband: e.target.value }))}
                  />
                  <datalist id="profil-vereine-liste">
                    {[...new Set(vereine.map((v) => v.name))].sort((a, b) => a.localeCompare(b)).map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <p className="feld-hinweis">Aus den Vereins-Stammdaten wählbar oder frei eingeben.</p>
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="stammAdresse">Adresse</label>
                </th>
                <td>
                  <textarea
                    id="stammAdresse"
                    rows={2}
                    value={stammdaten.adresse}
                    onChange={(e) => setStammdaten((s) => ({ ...s, adresse: e.target.value }))}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="submit">Stammdaten speichern</button>
      </form>

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

      <h2>Verbundene Instanzen</h2>
      <p>
        Lokale Installationen (Betriebsmodus „Lokales Netzwerk", Abschnitt 21.3), die per Kopplungscode dauerhaft mit
        diesem Konto verbunden sind. Turniere lassen sich dorthin herunterladen und synchronisieren automatisch
        zurück, solange eine Verbindung besteht.
      </p>

      {neuerKopplungscode && (
        <p role="status">
          Kopplungscode (15 Minuten gültig, nur jetzt sichtbar): <code>{neuerKopplungscode}</code>{" "}
          <button type="button" onClick={kopplungscodeKopieren}>
            Schlüssel kopieren
          </button>{" "}
          – auf der lokalen Installation unter „Einstellungen" (<span aria-hidden="true">⚙</span>) eingeben.
        </p>
      )}

      {instanzen.length === 0 ? (
        <p className="platzhalter-zeile">Noch keine Instanz verbunden.</p>
      ) : (
        <div className="tabellen-wrapper">
          <table>
            <caption className="sr-only">Verbundene Instanzen</caption>
            <thead>
              <tr>
                <th scope="col">Bezeichnung</th>
                <th scope="col">Verbunden seit</th>
                <th scope="col">Zuletzt gesehen</th>
                <th scope="col">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {instanzen.map((instanz) => (
                <tr key={instanz._id}>
                  <td>{instanz.bezeichnung || "– ohne Bezeichnung –"}</td>
                  <td>{formatiereZeitstempel(instanz.erstelltAm)}</td>
                  <td>{instanz.letzterKontaktAm ? formatiereZeitstempel(instanz.letzterKontaktAm) : "noch nie"}</td>
                  <td>
                    <button type="button" onClick={() => instanzEntfernen(instanz._id)}>
                      Widerrufen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" onClick={kopplungscodeErzeugen}>
        Neue Instanz koppeln
      </button>
    </>
  );
}
