import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";
import {
  erzeugeErgebnisToken,
  getErgebnisToken,
  getLokaleSyncStatus,
  getMannschaften,
  getSpiele,
  getTabelle,
  getTurnier,
  spielAbschliessen,
  spielErgebnisSetzen,
  turnierSpieleAbschliessen,
  widerrufeErgebnisToken,
  type LokaleSyncStatus,
  type TabellenZeile,
} from "../api";
import { useErgebnisEingaben } from "../useErgebnisEingaben";
import { QrCode } from "./QrCode";

interface Props {
  turnierId: string;
  /** Wird nach jedem Laden/Aendern mit der aktuellen Spieleliste aufgerufen - wichtig fuer
   *  Eltern-Seiten, die daraus eigene Sperren ableiten (spielplanGesperrt in
   *  TurnierVerwaltenPage): sobald hier ein Ergebnis erfasst/abgeschlossen wird, muss die
   *  Spielzeit-/Spielmodus-Sperre dort sofort greifen, nicht erst nach einem Neuladen. */
  onGeaendert?: (spiele: Spiel[]) => void;
}

/** Intervall fuers automatische Aktualisieren (damit zeitgleich per Token-Link erfasste Ergebnisse erscheinen). */
const AKTUALISIER_INTERVALL_MS = 10_000;

/**
 * Ergebnis-Tab eines Turniers (interne Verwaltung): Endergebnisse je Spiel erfassen (speichert
 * automatisch beim Verlassen des Feldes), Spiele/Runden/Turnier abschliessen, die Tabelle
 * ansehen sowie den Erfassungslink (Token + QR-Code) fuer die login-freie externe Erfassung
 * erzeugen/widerrufen. Aktualisiert sich per Polling, damit parallel per Link erfasste
 * Ergebnisse erscheinen (Sync-Logik in useErgebnisEingaben.ts).
 */
export function ErgebnisVerwaltung({ turnierId, onGeaendert }: Props) {
  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [spiele, setSpiele] = useState<Spiel[]>([]);
  const [tabelle, setTabelle] = useState<TabellenZeile[]>([]);
  const [tokenWert, setTokenWert] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | undefined>();
  const [linkHinweis, setLinkHinweis] = useState<string | undefined>();
  const [geradeGespeichert, setGeradeGespeichert] = useState<string | null>(null);
  const { eingaben, setFeld, konflikte, uebernehmeServer } = useErgebnisEingaben(spiele);
  // Nur fuer den Netzwerk-Hinweis beim Erfassungslink relevant (lokale Windows-Installation):
  // Link und QR-Code uebernehmen die Adresse aus der Browserzeile - eine "localhost"-Sitzung
  // erzeugt fuer Helfer-Geraete unbrauchbare Links (gleiches Muster wie TurnierFreigabe.tsx).
  const [syncStatus, setSyncStatus] = useState<LokaleSyncStatus | undefined>();
  useEffect(() => {
    getLokaleSyncStatus()
      .then(setSyncStatus)
      .catch(() => setSyncStatus(undefined));
  }, []);

  function markiereGespeichert(spielId: string) {
    setGeradeGespeichert(spielId);
    window.setTimeout(() => setGeradeGespeichert((cur) => (cur === spielId ? null : cur)), 2500);
  }

  const laden = useCallback(async () => {
    try {
      const [t, m, s, tab, token] = await Promise.all([
        getTurnier(turnierId),
        getMannschaften(turnierId),
        getSpiele(turnierId),
        getTabelle(turnierId),
        getErgebnisToken(turnierId),
      ]);
      setTurnier(t);
      setMannschaften(m);
      setSpiele(s);
      setTabelle(tab);
      setTokenWert(token.tokenWert);
      onGeaendert?.(s);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnierId]);

  /** Leichtgewichtiges Aktualisieren fuers Polling: nur die Daten, die sich mit Ergebnissen aendern. */
  const aktualisieren = useCallback(async () => {
    try {
      const [s, tab] = await Promise.all([getSpiele(turnierId), getTabelle(turnierId)]);
      setSpiele(s);
      setTabelle(tab);
      onGeaendert?.(s);
    } catch {
      /* stiller Poll-Fehler - keine Seiten-Fehlermeldung, der naechste Versuch folgt automatisch */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  // Automatisch aktualisieren, damit zeitgleich per Token-Link erfasste Ergebnisse hier erscheinen.
  // Nur bei sichtbarer Seite (der Tab-Panel bleibt gemountet), plus sofort beim Zurueckkehren.
  useEffect(() => {
    const intervall = setInterval(() => {
      if (document.visibilityState === "visible") aktualisieren();
    }, AKTUALISIER_INTERVALL_MS);
    const beiRueckkehr = () => {
      if (document.visibilityState === "visible") aktualisieren();
    };
    window.addEventListener("focus", beiRueckkehr);
    document.addEventListener("visibilitychange", beiRueckkehr);
    return () => {
      clearInterval(intervall);
      window.removeEventListener("focus", beiRueckkehr);
      document.removeEventListener("visibilitychange", beiRueckkehr);
    };
  }, [aktualisieren]);

  const nameVon = (mannschaftId: string) => mannschaften.find((m) => m._id === mannschaftId)?.name ?? mannschaftId;
  const spieleSortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));

  async function ergebnisSpeichern(spiel: Spiel, istForfait = false) {
    const eingabe = eingaben[spiel._id];
    const ergebnisA = Number(eingabe?.a);
    const ergebnisB = Number(eingabe?.b);
    if (!Number.isFinite(ergebnisA) || !Number.isFinite(ergebnisB) || ergebnisA < 0 || ergebnisB < 0) {
      setFehler("Bitte gültige Ergebnisse (0 oder größer) für beide Mannschaften eingeben.");
      return;
    }
    try {
      await spielErgebnisSetzen(spiel._id, { ergebnisA, ergebnisB, istForfait });
      markiereGespeichert(spiel._id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern des Ergebnisses");
    }
  }

  /**
   * Automatisches Speichern beim Verlassen eines Tore-Feldes (onBlur), sobald beide Werte gültig
   * ausgefüllt und gegenüber dem Server verändert sind - der frühere Speichern-Knopf entfällt.
   * Bei einem offenen Konflikt wird bewusst NICHT gespeichert; dann entscheidet der Nutzer über
   * die beiden Konflikt-Knöpfe (übernehmen / überschreiben).
   */
  function beiVerlassen(spiel: Spiel) {
    if (spiel.ergebnisAbgeschlossen || konflikte.has(spiel._id)) return;
    const eingabe = eingaben[spiel._id];
    if (!eingabe || eingabe.a === "" || eingabe.b === "") return;
    const a = Number(eingabe.a);
    const b = Number(eingabe.b);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return;
    const unveraendert = (spiel.ergebnisA?.toString() ?? "") === eingabe.a && (spiel.ergebnisB?.toString() ?? "") === eingabe.b;
    if (unveraendert) return;
    ergebnisSpeichern(spiel);
  }

  /** Forfait-Wertung „Sieger:Verlierer" aus den Turnierregeln lesen (Fallback 3:0). */
  function forfaitWerte(): { sieger: number; verlierer: number } {
    const [s, v] = (turnier?.forfaitErgebnis ?? "3:0").split(":").map(Number);
    if (!Number.isFinite(s) || !Number.isFinite(v)) return { sieger: 3, verlierer: 0 };
    return { sieger: s, verlierer: v };
  }

  function nichtAngetreten(spiel: Spiel, forfaitSeite: "a" | "b") {
    const { sieger, verlierer } = forfaitWerte();
    // Die nicht angetretene Seite ist der Verlierer, die andere der Sieger.
    const ergebnisA = forfaitSeite === "a" ? verlierer : sieger;
    const ergebnisB = forfaitSeite === "a" ? sieger : verlierer;
    setFeld(spiel._id, "a", String(ergebnisA));
    setFeld(spiel._id, "b", String(ergebnisB));
    // Direkt mit den gesetzten Forfait-Werten speichern, nicht erst auf einen weiteren Klick warten.
    spielErgebnisSetzen(spiel._id, { ergebnisA, ergebnisB, istForfait: true })
      .then(() => {
        markiereGespeichert(spiel._id);
        return laden();
      })
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern"));
  }

  async function abschliessenEinzeln(spiel: Spiel) {
    try {
      await spielAbschliessen(spiel._id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Abschließen");
    }
  }

  async function abschliessenAlle() {
    try {
      await turnierSpieleAbschliessen(turnierId);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Abschließen");
    }
  }

  async function linkErzeugen() {
    try {
      const ergebnis = await erzeugeErgebnisToken(turnierId);
      setTokenWert(ergebnis.tokenWert);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Erzeugen des Links");
    }
  }

  async function linkWiderrufen() {
    try {
      await widerrufeErgebnisToken(turnierId);
      setTokenWert(null);
      setLinkHinweis(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Widerrufen des Links");
    }
  }

  async function linkKopieren(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setLinkHinweis("Link kopiert.");
    } catch {
      setFehler("Link konnte nicht kopiert werden.");
    }
  }

  if (!turnier) {
    return fehler ? <p role="alert">{fehler}</p> : <p>Lädt…</p>;
  }

  // Link + QR-Code uebernehmen normalerweise die Adresse aus der Browserzeile - auf einer lokalen
  // Installation, die (wie ueblich) ueber "localhost" geoeffnet wurde, waere beides fuer
  // Helfer-Geraete wertlos (live erlebt, 2026-08-21). Gibt es GENAU EINE Netzwerk-Adresse, werden
  // Link und QR deshalb direkt mit ihr gebaut; bei mehreren Adressen (mehrdeutig, z.B. virtuelle
  // Netzwerkkarten) bleibt die Browser-Adresse und ein Hinweis listet die Alternativen auf.
  const aufLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const lanAdressen =
    syncStatus?.istLokaleInstallation && syncStatus.lanErreichbar ? (syncStatus.netzwerkAdressen ?? []) : [];
  const portTeil = window.location.port ? `:${window.location.port}` : "";
  const linkBasis =
    aufLocalhost && lanAdressen.length === 1 ? `http://${lanAdressen[0]}${portTeil}` : window.location.origin;
  const erfassungsLink = tokenWert ? `${linkBasis}/ergebnis-erfassung/${tokenWert}` : undefined;
  // Abgeschlossenes Turnier: Ergebnis-Aktionen sperren. Die einzelnen Ergebnisfelder sind ohnehin
  // ueber ergebnisAbgeschlossen deaktiviert; zusaetzlich das "Alle abschliessen" sinnlos und der
  // externe Erfassungslink wird beim Abschliessen serverseitig widerrufen (hier nicht mehr anbieten).
  const istGesperrt = turnier.status === "abgeschlossen" || turnier.status === "archiviert";
  // Digitale Protokollierung: Ergebnisse entstehen aus dem Live-Protokoll je Spiel, nicht aus
  // direkter Eingabe - die Eingabefelder/n.a.-Knoepfe/der externe Erfassungslink entfallen hier,
  // stattdessen fuehrt je Spiel ein Link ins Protokoll (Konzept Abschnitt 5).
  const digital = turnier.protokollierungsart === "digital";

  return (
    <div>
      {fehler && <p role="alert">{fehler}</p>}

      {digital && (
        <p>
          Dieses Turnier verwendet die <strong>digitale Protokollierung</strong>: Ergebnisse entstehen aus dem
          Live-Protokoll des jeweiligen Spiels (Spalte „Aktionen") und werden hier automatisch angezeigt.
        </p>
      )}

      <h2>Ergebnisse</h2>
      {spiele.length === 0 ? (
        <p>Noch kein Spielplan erzeugt.</p>
      ) : (
        <>
          <div className="tabellen-wrapper">
            <table>
              <caption className="sr-only">Ergebniserfassung je Spiel</caption>
              <thead>
                <tr>
                  <th scope="col">Spiel</th>
                  <th scope="col">Mannschaft A</th>
                  <th scope="col">Ergebnis</th>
                  <th scope="col">Mannschaft B</th>
                  <th scope="col">Status</th>
                  <th scope="col">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {spieleSortiert.map((spiel, index) => {
                  const eingabe = eingaben[spiel._id] ?? { a: "", b: "" };
                  return (
                    <tr key={spiel._id}>
                      <td>{index + 1}</td>
                      <td>{nameVon(spiel.mannschaftAId)}</td>
                      <td>
                        {digital ? (
                          <strong>
                            {spiel.ergebnisA ?? "–"} : {spiel.ergebnisB ?? "–"}
                          </strong>
                        ) : (
                          <>
                        {/* "n. a." fuer Mannschaft A bewusst VOR dem Feld: sonst laege der Button beim
                            Tabben zwischen den beiden Tore-Feldern und muesste uebersprungen werden.
                            So flankieren beide "n. a."-Knoepfe das Eingabepaar (A : B) und Tab springt
                            von Feld A direkt auf Feld B. */}
                        {!spiel.ergebnisAbgeschlossen && (
                          <button
                            type="button"
                            className="na-button na-vor"
                            onClick={() => nichtAngetreten(spiel, "a")}
                            title={`${nameVon(spiel.mannschaftAId)} nicht angetreten`}
                          >
                            n. a.
                          </button>
                        )}
                        <label className="sr-only" htmlFor={`ergebnisA-${spiel._id}`}>
                          Tore {nameVon(spiel.mannschaftAId)}
                        </label>
                        <input
                          id={`ergebnisA-${spiel._id}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="ergebnis-eingabe"
                          disabled={spiel.ergebnisAbgeschlossen}
                          value={eingabe.a}
                          onChange={(e) => setFeld(spiel._id, "a", e.target.value)}
                          onBlur={() => beiVerlassen(spiel)}
                        />
                        {" : "}
                        <label className="sr-only" htmlFor={`ergebnisB-${spiel._id}`}>
                          Tore {nameVon(spiel.mannschaftBId)}
                        </label>
                        <input
                          id={`ergebnisB-${spiel._id}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="ergebnis-eingabe"
                          disabled={spiel.ergebnisAbgeschlossen}
                          value={eingabe.b}
                          onChange={(e) => setFeld(spiel._id, "b", e.target.value)}
                          onBlur={() => beiVerlassen(spiel)}
                        />
                        {!spiel.ergebnisAbgeschlossen && (
                          <button
                            type="button"
                            className="na-button"
                            onClick={() => nichtAngetreten(spiel, "b")}
                            title={`${nameVon(spiel.mannschaftBId)} nicht angetreten`}
                          >
                            n. a.
                          </button>
                        )}
                        {konflikte.has(spiel._id) && (
                          <>
                            <div className="schiri-warnung" role="alert">
                              ⚠ Zwischenzeitlich wurde anderweitig {spiel.ergebnisA ?? "–"} : {spiel.ergebnisB ?? "–"}{" "}
                              gespeichert.
                            </div>
                            <div className="konflikt-aktionen">
                              <button type="button" onClick={() => uebernehmeServer(spiel._id)}>
                                Vorhandenes übernehmen
                              </button>
                              <button type="button" onClick={() => ergebnisSpeichern(spiel)}>
                                Mit meinem Wert überschreiben
                              </button>
                            </div>
                          </>
                        )}
                        {geradeGespeichert === spiel._id && (
                          <div className="gespeichert-hinweis" role="status">
                            ✓ gespeichert
                          </div>
                        )}
                          </>
                        )}
                      </td>
                      <td>{nameVon(spiel.mannschaftBId)}</td>
                      <td>
                        {spiel.ergebnisAbgeschlossen
                          ? "Fertig"
                          : spiel.ergebnisA != null
                            ? "Erfasst"
                            : "Offen"}
                      </td>
                      <td>
                        {digital ? (
                          <Link className="button-link" to={`/turniere/${turnierId}/spiele/${spiel._id}/protokoll`}>
                            Protokoll
                          </Link>
                        ) : (
                          !spiel.ergebnisAbgeschlossen && (
                            <button
                              type="button"
                              className="symbol-button"
                              onClick={() => abschliessenEinzeln(spiel)}
                              disabled={spiel.ergebnisA == null}
                              aria-label="Abschließen"
                              title="Abschließen"
                            >
                              ✓
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!digital && (
            <button type="button" onClick={abschliessenAlle} disabled={istGesperrt}>
              Alle erfassten Ergebnisse abschließen
            </button>
          )}
        </>
      )}

      <h2>Tabelle</h2>
      {tabelle.length === 0 ? (
        <p>Noch keine Ergebnisse erfasst.</p>
      ) : (
        <div className="tabellen-wrapper">
          <table>
            <caption className="sr-only">Turniertabelle</caption>
            <thead>
              <tr>
                <th scope="col">Platz</th>
                <th scope="col">Mannschaft</th>
                <th scope="col">Sp</th>
                <th scope="col">S</th>
                <th scope="col">U</th>
                <th scope="col">N</th>
                <th scope="col">Tore</th>
                <th scope="col">Diff</th>
                <th scope="col">Punkte</th>
              </tr>
            </thead>
            <tbody>
              {tabelle.map((zeile, index) => (
                <tr key={zeile.mannschaftId}>
                  <td>{index + 1}</td>
                  <td>{nameVon(zeile.mannschaftId)}</td>
                  <td>{zeile.spiele}</td>
                  <td>{zeile.siege}</td>
                  <td>{zeile.unentschieden}</td>
                  <td>{zeile.niederlagen}</td>
                  <td>
                    {zeile.toreFuer}:{zeile.toreGegen}
                  </td>
                  <td>{zeile.tordifferenz}</td>
                  <td>{zeile.punkte}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!digital && <h2>Ergebniserfassung ohne Anmeldung</h2>}
      {digital ? null : istGesperrt ? (
        <p>
          Das Turnier ist abgeschlossen – der externe Erfassungslink ist deaktiviert. Zum Erzeugen eines neuen Links
          das Turnier zuerst wieder öffnen.
        </p>
      ) : (
        <>
          <p>
            Wer diesen Link hat, kann Endergebnisse dieses Turniers eintragen - ohne eigenen Account. Sinnvoll, um die
            Ergebniserfassung an die Spielleitung vor Ort weiterzugeben.
          </p>
          {/* Netzwerk-Hinweise fuer die lokale Windows-Installation (gleiches Muster wie bei den
              Turnier-Codes in TurnierFreigabe.tsx). */}
          {syncStatus?.istLokaleInstallation && syncStatus.lanErreichbar === false && (
            <p role="alert">
              ⚠ Andere Geräte können sich mit dieser Installation derzeit <strong>nicht</strong> verbinden - der Link
              würde nur auf diesem Rechner funktionieren. Zum Aktivieren des Netzwerkzugriffs <code>Setup.cmd</code> im
              Projektordner erneut ausführen und die Frage zum Netzwerkzugriff mit „Ja" beantworten.
            </p>
          )}
          {aufLocalhost && lanAdressen.length === 1 && (
            <p>
              Link und QR-Code verwenden die Netzwerk-Adresse dieses Rechners (<code>{lanAdressen[0]}</code>), damit
              sie auch auf anderen Geräten im selben Netzwerk funktionieren.
            </p>
          )}
          {aufLocalhost && lanAdressen.length > 1 && (
            <p>
              Dieser Rechner hat mehrere Netzwerk-Adressen - Link und QR-Code verwenden deshalb „localhost" und
              funktionieren nur hier. Für andere Geräte die App selbst über eine der Netzwerk-Adressen öffnen (
              {lanAdressen.map((adresse, i) => (
                <span key={adresse}>
                  {i > 0 && " oder "}
                  <code>{`http://${adresse}${portTeil}`}</code>
                </span>
              ))}
              ) und den Link/QR-Code von dort weitergeben.
            </p>
          )}
          {erfassungsLink ? (
            <p>
              <input type="text" readOnly value={erfassungsLink} onFocus={(e) => e.target.select()} />
              <br />
              <button type="button" onClick={() => linkKopieren(erfassungsLink)}>
                Link kopieren
              </button>{" "}
              <button type="button" onClick={linkWiderrufen}>
                Link widerrufen
              </button>
              {linkHinweis && <> {linkHinweis}</>}
            </p>
          ) : null}
          {erfassungsLink && <QrCode text={erfassungsLink} dateiname={`Ergebniserfassung ${turnier.name}`} />}
          {!erfassungsLink && (
            <button type="button" onClick={linkErzeugen}>
              Link erzeugen
            </button>
          )}
        </>
      )}
    </div>
  );
}
