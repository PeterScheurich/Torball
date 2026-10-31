import { useCallback, useEffect, useState } from "react";
import type { Turnier, TurnierRolle } from "@torball/shared";
import {
  getLokaleSyncStatus,
  getTurnierBerechtigungen,
  getTurnierCodes,
  sucheBenutzerFuerFreigabe,
  turnierBerechtigungEntziehen,
  turnierBerechtigungVergeben,
  turnierCodesSetzen,
  updateTurnier,
  type LokaleSyncStatus,
  type TurnierBerechtigungMitName,
  type TurnierCodesStatus,
} from "../api";

const ROLLEN_LABEL: Record<TurnierRolle, string> = {
  turnierleitung: "Turnierleitung (bearbeiten)",
  spielleitung: "Spielleitung (bearbeiten)",
  lesen: "Nur lesen",
};

type AlleBenutzerZugriff = "kein" | "lesen" | "schreiben";

const ALLE_BENUTZER_LABEL: Record<AlleBenutzerZugriff, string> = {
  kein: "Kein pauschaler Zugriff",
  lesen: "Alle angemeldeten Benutzer dürfen lesen",
  schreiben: "Alle angemeldeten Benutzer dürfen lesen und bearbeiten",
};

/**
 * Freigabe eines Turniers fuer weitere angemeldete Benutzer (Abschnitt 21.2). Nutzt die
 * bestehenden TurnierBerechtigung-Routen fuer einzelne Personen, plus einen pauschalen Schalter
 * (turnier.zugriffFuerAlleBenutzer) fuer ALLE angemeldeten Benutzer auf einmal - z.B. fuer eine
 * Demo-Instanz, auf der beliebige (auch erst spaeter selbst-registrierte) Tester ein Turnier
 * nutzen koennen sollen, ohne einzeln freigeschaltet zu werden. Der Ersteller/Admin hat ohnehin
 * Vollzugriff und muss sich hier nicht selbst eintragen. Eine Person wird ueber ihre GENAUE
 * E-Mail-Adresse gefunden, nicht aus einer Liste gewaehlt (Datenschutz-Hinweis eines Testers,
 * 2026-10-06): Die fruehere Auswahl zeigte Namen UND Adressen aller Konten und kam aus einem
 * Endpunkt, der jeder Manager-Rolle das volle Profil aller Benutzer liefert.
 */
export function TurnierFreigabe({
  turnier,
  onGeaendert,
}: {
  turnier: Turnier;
  onGeaendert: (turnier: Turnier) => void;
}) {
  const turnierId = turnier._id;
  const [berechtigungen, setBerechtigungen] = useState<TurnierBerechtigungMitName[]>([]);
  const [suchEmail, setSuchEmail] = useState("");
  const [gefunden, setGefunden] = useState<{ benutzerId: string; name: string } | undefined>();
  const [suchFehler, setSuchFehler] = useState<string | undefined>();
  const [rolle, setRolle] = useState<TurnierRolle>("turnierleitung");
  const [fehler, setFehler] = useState<string | undefined>();

  const [codesStatus, setCodesStatus] = useState<TurnierCodesStatus | undefined>();
  const [turnierleitungCodeEingabe, setTurnierleitungCodeEingabe] = useState("");
  const [spielleitungCodeEingabe, setSpielleitungCodeEingabe] = useState("");
  const [protokollantCodeEingabe, setProtokollantCodeEingabe] = useState("");
  const [codesFehler, setCodesFehler] = useState<string | undefined>();
  const [codesHinweis, setCodesHinweis] = useState<string | undefined>();
  // Nur fuer den Netzwerk-Hinweis bei den Turnier-Codes relevant (lokale Windows-Installation):
  // andere Geraete erreichen die App nicht unter "localhost", und mit HOST=127.0.0.1 gar nicht.
  const [syncStatus, setSyncStatus] = useState<LokaleSyncStatus | undefined>();
  useEffect(() => {
    getLokaleSyncStatus()
      .then(setSyncStatus)
      .catch(() => setSyncStatus(undefined));
  }, []);

  const laden = useCallback(async () => {
    try {
      setBerechtigungen(await getTurnierBerechtigungen(turnierId));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Laden der Freigaben");
    }
  }, [turnierId]);

  const codesLaden = useCallback(async () => {
    try {
      setCodesStatus(await getTurnierCodes(turnierId));
    } catch (err) {
      setCodesFehler(err instanceof Error ? err.message : "Fehler beim Laden der Codes");
    }
  }, [turnierId]);

  useEffect(() => {
    laden();
    codesLaden();
  }, [laden, codesLaden]);

  async function codeSetzen(
    feld: "turnierleitungCode" | "spielleitungCode" | "protokollantCode",
    wert: string | null,
  ) {
    setCodesFehler(undefined);
    setCodesHinweis(undefined);
    try {
      setCodesStatus(await turnierCodesSetzen(turnierId, { [feld]: wert }));
      if (feld === "turnierleitungCode") setTurnierleitungCodeEingabe("");
      else if (feld === "spielleitungCode") setSpielleitungCodeEingabe("");
      else setProtokollantCodeEingabe("");
      setCodesHinweis(wert ? "Code gespeichert." : "Code gelöscht.");
    } catch (err) {
      setCodesFehler(err instanceof Error ? err.message : "Fehler beim Speichern des Codes");
    }
  }

  async function suchen(event: React.FormEvent) {
    event.preventDefault();
    setGefunden(undefined);
    setSuchFehler(undefined);
    try {
      setGefunden(await sucheBenutzerFuerFreigabe(turnierId, suchEmail.trim()));
    } catch (err) {
      setSuchFehler(err instanceof Error ? err.message : "Fehler bei der Suche");
    }
  }

  async function vergeben(event: React.FormEvent) {
    event.preventDefault();
    if (!gefunden) return;
    setFehler(undefined);
    try {
      await turnierBerechtigungVergeben(turnierId, gefunden.benutzerId, rolle);
      setGefunden(undefined);
      setSuchEmail("");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Vergeben der Freigabe");
    }
  }

  async function entziehen(b: TurnierBerechtigungMitName) {
    setFehler(undefined);
    try {
      await turnierBerechtigungEntziehen(b._id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Entziehen der Freigabe");
    }
  }

  async function alleBenutzerZugriffAendern(wert: AlleBenutzerZugriff) {
    setFehler(undefined);
    try {
      onGeaendert(
        await updateTurnier(turnierId, { zugriffFuerAlleBenutzer: wert === "kein" ? null : wert }),
      );
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Ändern der pauschalen Freigabe");
    }
  }

  return (
    <section>
      <h2>Freigabe für andere Benutzer</h2>
      {/* Bewusst volle Textfarbe (kein .feld-hinweis): Einleitungssatz, der gelesen werden soll (siehe CLAUDE.md). */}
      <p>
        Gib dieses Turnier für weitere angemeldete Benutzer frei. Ersteller und Administratoren haben ohnehin vollen
        Zugriff und müssen hier nicht eingetragen werden.
      </p>

      {fehler && <p role="alert">{fehler}</p>}

      <div className="feld">
        <label htmlFor="freigabe-alle-benutzer">Pauschaler Zugriff für alle angemeldeten Benutzer</label>
        <select
          id="freigabe-alle-benutzer"
          value={turnier.zugriffFuerAlleBenutzer ?? "kein"}
          onChange={(e) => alleBenutzerZugriffAendern(e.target.value as AlleBenutzerZugriff)}
        >
          {(Object.keys(ALLE_BENUTZER_LABEL) as AlleBenutzerZugriff[]).map((wert) => (
            <option key={wert} value={wert}>
              {ALLE_BENUTZER_LABEL[wert]}
            </option>
          ))}
        </select>
        <p className="feld-hinweis">
          Gilt zusätzlich zu den unten einzeln vergebenen Freigaben - sinnvoll, wenn wirklich jede angemeldete Person
          Zugriff haben soll (z. B. auf einer Demo-Instanz), nicht nur ausgewählte Benutzer.
        </p>
      </div>

      <h3>Einzelne Freigaben</h3>

      {berechtigungen.length === 0 ? (
        <p className="platzhalter-zeile">Noch keine Freigaben vergeben.</p>
      ) : (
        <div className="tabellen-wrapper">
          <table>
            <caption className="sr-only">Vergebene Freigaben</caption>
            <thead>
              <tr>
                <th scope="col">Benutzer</th>
                <th scope="col">Zugriff</th>
                <th scope="col">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {berechtigungen.map((b) => (
                <tr key={b._id}>
                  <td>{b.benutzerName ?? b.benutzerId}</td>
                  <td>{ROLLEN_LABEL[b.rolle]}</td>
                  <td>
                    <button type="button" onClick={() => entziehen(b)}>
                      Entziehen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Person freigeben</h3>
      {/* Volle Textfarbe: erklaert, WARUM es keine Auswahlliste gibt (siehe CLAUDE.md, Kontrast-Regel). */}
      <p>
        Gib die E-Mail-Adresse der Person ein, mit der sie bei Torball-Turniere angemeldet ist. Eine Liste aller
        Benutzer gibt es aus Datenschutzgründen nicht.
      </p>
      <form onSubmit={suchen} className="schiedsrichter-formular">
        <div className="feld">
          <label htmlFor="freigabe-email">E-Mail-Adresse der Person</label>
          <input
            id="freigabe-email"
            type="email"
            autoComplete="off"
            required
            value={suchEmail}
            onChange={(e) => {
              setSuchEmail(e.target.value);
              setGefunden(undefined);
              setSuchFehler(undefined);
            }}
          />
        </div>
        <button type="submit">Person suchen</button>
      </form>
      {suchFehler && <p role="alert">{suchFehler}</p>}
      {/* Ergebnis in einer Live-Region, die schon VOR dem Treffer im DOM steht (siehe CLAUDE.md). */}
      <div role="status">{gefunden && <p>Gefunden: {gefunden.name}</p>}</div>
      {gefunden && (
        <form onSubmit={vergeben} className="schiedsrichter-formular">
          <div className="feld">
            <label htmlFor="freigabe-rolle">Zugriff für {gefunden.name}</label>
            <select id="freigabe-rolle" value={rolle} onChange={(e) => setRolle(e.target.value as TurnierRolle)}>
              {(Object.keys(ROLLEN_LABEL) as TurnierRolle[]).map((r) => (
                <option key={r} value={r}>
                  {ROLLEN_LABEL[r]}
                </option>
              ))}
            </select>
            <p className="feld-hinweis">
              Die Rolle „Protokollant“ gibt es nur über die Codes weiter unten, nicht als Freigabe für ein Konto.
            </p>
          </div>
          <button type="submit">Freigeben</button>
        </form>
      )}

      <h3>Codes für Lokales Netzwerk</h3>
      {/* Bewusst volle Textfarbe (kein .feld-hinweis): Einleitungssatz, der gelesen werden soll (siehe CLAUDE.md). */}
      <p>
        Alternativer Zugriff ohne eigenes Konto für Geräte im selben Netzwerk wie der Turnier-Server (Betriebsmodus
        „Lokales Netzwerk"). Wer den Code kennt, meldet sich unter{" "}
        <code>{`${window.location.origin}/turniere/${turnierId}/code`}</code> an.
      </p>

      {/* Lokale Windows-Installation: ohne aktivierten Netzwerkzugriff (HOST=127.0.0.1, der
          Installer-Default bei verneinter Netzwerk-Frage) koennen sich andere Geraete GAR NICHT
          verbinden - der Betriebsmodus "Lokales Netzwerk" liefe sonst an einer unsichtbaren
          Huerde ins Leere (Nutzer-Fund 2026-08-21). */}
      {syncStatus?.istLokaleInstallation && syncStatus.lanErreichbar === false && (
        <p role="alert">
          ⚠ Andere Geräte können sich mit dieser Installation derzeit <strong>nicht</strong> verbinden: Beim
          Installieren wurde der Zugriff aus dem lokalen Netzwerk nicht aktiviert. Zum Aktivieren{" "}
          <code>Setup.cmd</code> im Projektordner erneut ausführen und die Frage zum Netzwerkzugriff mit „Ja"
          beantworten.
        </p>
      )}
      {/* Links/QR-Codes uebernehmen die Adresse aus der Browserzeile - eine unter "localhost"
          geoeffnete Sitzung erzeugt fuer andere Geraete unbrauchbare Links. */}
      {syncStatus?.istLokaleInstallation &&
        syncStatus.lanErreichbar &&
        ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
        (syncStatus.netzwerkAdressen?.length ?? 0) > 0 && (
          <p>
            Für andere Geräte im Netzwerk gilt statt „localhost" die Netzwerk-Adresse dieses Rechners:{" "}
            {syncStatus.netzwerkAdressen!.map((adresse, i) => (
              <span key={adresse}>
                {i > 0 && " oder "}
                <code>{`http://${adresse}${window.location.port ? `:${window.location.port}` : ""}/turniere/${turnierId}/code`}</code>
              </span>
            ))}
            . Wichtig: Links und QR-Codes übernehmen die Adresse aus der Browserzeile – zum Weitergeben die App am
            besten selbst über diese Netzwerk-Adresse öffnen.
          </p>
        )}

      {codesFehler && <p role="alert">{codesFehler}</p>}
      {codesHinweis && <p>{codesHinweis}</p>}

      <div className="tabellen-wrapper">
        <table>
          <caption className="sr-only">Turnier-Codes</caption>
          <thead>
            <tr>
              <th scope="col">Rolle</th>
              <th scope="col">Status</th>
              <th scope="col">Neuer Code</th>
              <th scope="col">Aktion</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Turnierleitung (Vollzugriff)</th>
              <td>{codesStatus?.turnierleitungCodeAktiv ? "Aktiv" : "Nicht gesetzt"}</td>
              <td>
                <label className="sr-only" htmlFor="code-turnierleitung">
                  Neuer Turnierleitung-Code
                </label>
                <input
                  id="code-turnierleitung"
                  autoComplete="off"
                  value={turnierleitungCodeEingabe}
                  onChange={(e) => setTurnierleitungCodeEingabe(e.target.value)}
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => codeSetzen("turnierleitungCode", turnierleitungCodeEingabe.trim())}
                  disabled={!turnierleitungCodeEingabe.trim()}
                >
                  Speichern
                </button>{" "}
                {codesStatus?.turnierleitungCodeAktiv && (
                  <button type="button" className="button-loeschen" onClick={() => codeSetzen("turnierleitungCode", null)}>
                    Löschen
                  </button>
                )}
              </td>
            </tr>
            <tr>
              <th scope="row">Spielleitung (Spielplan &amp; Ergebnisse)</th>
              <td>{codesStatus?.spielleitungCodeAktiv ? "Aktiv" : "Nicht gesetzt"}</td>
              <td>
                <label className="sr-only" htmlFor="code-spielleitung">
                  Neuer Spielleitung-Code
                </label>
                <input
                  id="code-spielleitung"
                  autoComplete="off"
                  value={spielleitungCodeEingabe}
                  onChange={(e) => setSpielleitungCodeEingabe(e.target.value)}
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => codeSetzen("spielleitungCode", spielleitungCodeEingabe.trim())}
                  disabled={!spielleitungCodeEingabe.trim()}
                >
                  Speichern
                </button>{" "}
                {codesStatus?.spielleitungCodeAktiv && (
                  <button type="button" className="button-loeschen" onClick={() => codeSetzen("spielleitungCode", null)}>
                    Löschen
                  </button>
                )}
              </td>
            </tr>
            {/* Protokollant-Code nur bei digitaler Protokollierung anzeigen - bei "manuell"
                waere er nutzlos (Konzept Abschnitt 6). */}
            {turnier.protokollierungsart === "digital" && (
              <tr>
                <th scope="row">Protokollant (nur Live-Protokoll)</th>
                <td>{codesStatus?.protokollantCodeAktiv ? "Aktiv" : "Nicht gesetzt"}</td>
                <td>
                  <label className="sr-only" htmlFor="code-protokollant">
                    Neuer Protokollant-Code
                  </label>
                  <input
                    id="code-protokollant"
                    autoComplete="off"
                    value={protokollantCodeEingabe}
                    onChange={(e) => setProtokollantCodeEingabe(e.target.value)}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => codeSetzen("protokollantCode", protokollantCodeEingabe.trim())}
                    disabled={!protokollantCodeEingabe.trim()}
                  >
                    Speichern
                  </button>{" "}
                  {codesStatus?.protokollantCodeAktiv && (
                    <button type="button" className="button-loeschen" onClick={() => codeSetzen("protokollantCode", null)}>
                      Löschen
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
