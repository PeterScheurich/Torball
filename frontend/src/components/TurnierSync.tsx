import { useCallback, useEffect, useState } from "react";
import {
  getLokaleSyncStatus,
  getTurnierCheckoutStatus,
  getVerbundeneInstanzen,
  turnierCheckoutFreigeben,
  turnierDownloadAnfordern,
  turnierSyncUpload,
  type LokaleSyncStatus,
  type TurnierCheckoutStatus,
  type VerbundeneInstanzProfil,
} from "../api";

/**
 * Turnier-Sync (Grundlage, Abschnitt 21.3/23): Download server-initiiert (an eine verbundene
 * lokale Instanz, siehe ProfilPage "Verbundene Instanzen"), Upload client-initiiert (diese
 * Installation zum gekoppelten Server, siehe EinstellungenPage "Turnier-Sync"). Beide Wege koennen
 * auf derselben Seite auftauchen, weil dieselbe Codebasis sowohl als Server als auch als lokale
 * Installation laeuft - welcher Abschnitt sichtbar ist, ergibt sich aus den geladenen Daten.
 */
export function TurnierSync({
  turnierId,
  onCheckoutGeaendert,
}: {
  turnierId: string;
  /** Wird nach einer erfolgreichen Aenderung des Checkout-Status aufgerufen (Download angefordert/
   *  Freigabe aufgehoben) - so kann die einbettende Seite z.B. eine Kennzeichnung im Titel sofort
   *  aktualisieren, ohne selbst denselben Status doppelt zu pollen. */
  onCheckoutGeaendert?: () => void;
}) {
  const [checkoutStatus, setCheckoutStatus] = useState<TurnierCheckoutStatus | undefined>();
  const [instanzen, setInstanzen] = useState<VerbundeneInstanzProfil[]>([]);
  const [lokaleSyncStatus, setLokaleSyncStatus] = useState<LokaleSyncStatus | undefined>();
  const [zielInstanzId, setZielInstanzId] = useState("");
  const [stammdatenMitnehmen, setStammdatenMitnehmen] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [hinweis, setHinweis] = useState<string | undefined>();

  const checkoutLaden = useCallback(() => {
    getTurnierCheckoutStatus(turnierId)
      .then(setCheckoutStatus)
      .catch(() => setCheckoutStatus({ ausgecheckt: false }));
  }, [turnierId]);

  useEffect(() => {
    checkoutLaden();
    getVerbundeneInstanzen()
      .then(setInstanzen)
      .catch(() => setInstanzen([]));
    getLokaleSyncStatus()
      .then(setLokaleSyncStatus)
      .catch(() => setLokaleSyncStatus({ verbunden: false, istLokaleInstallation: false }));
  }, [checkoutLaden]);

  async function downloadAnfordern(event: React.FormEvent) {
    event.preventDefault();
    if (!zielInstanzId) return;
    setFehler(undefined);
    setHinweis(undefined);
    try {
      await turnierDownloadAnfordern(turnierId, zielInstanzId, stammdatenMitnehmen);
      setHinweis("Download angefordert – erscheint dort in Kürze automatisch.");
      checkoutLaden();
      onCheckoutGeaendert?.();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anfordern des Downloads");
    }
  }

  async function freigabeAufheben() {
    if (
      !window.confirm(
        "Ab jetzt gilt ausschließlich der aktuelle Serverstand als gültig. Ein eventuell noch vorhandenes " +
          "lokales Gerät kann seine Änderungen danach nicht mehr automatisch übertragen – falls dort doch noch " +
          "wichtige Ergebnisse liegen, müssen die manuell nachgetragen werden.\n\nFreigabe wirklich aufheben?",
      )
    ) {
      return;
    }
    setFehler(undefined);
    try {
      await turnierCheckoutFreigeben(turnierId);
      checkoutLaden();
      onCheckoutGeaendert?.();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Aufheben der Freigabe");
    }
  }

  async function hochladen() {
    setFehler(undefined);
    setHinweis(undefined);
    try {
      const ergebnis = await turnierSyncUpload(turnierId);
      setHinweis(ergebnis.warnung ?? "Turnier wurde zum Server hochgeladen.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Hochladen");
    }
  }

  return (
    <section>
      <h2>Turnier-Sync (Lokale Installation)</h2>
      {/* Bewusst volle Textfarbe (kein .feld-hinweis): Einleitungssatz, der gelesen werden soll (siehe CLAUDE.md). */}
      <p>
        Betriebsmodus „Lokales Netzwerk": ein Turnier an eine verbundene lokale Installation
        senden oder von dort zum Server hochladen – auch bei unzuverlässigem Internet vor Ort.
      </p>

      {fehler && <p role="alert">{fehler}</p>}
      {hinweis && <p>{hinweis}</p>}

      {checkoutStatus?.ausgecheckt ? (
        <p role="status">
          Wird gerade lokal verwaltet
          {checkoutStatus.bezeichnung && <> (Instanz „{checkoutStatus.bezeichnung}")</>}
          {checkoutStatus.status === "angefordert" && " – Download noch nicht abgeholt"}.{" "}
          <button type="button" onClick={freigabeAufheben}>
            Freigabe aufheben
          </button>
        </p>
      ) : instanzen.length > 0 ? (
        <form onSubmit={downloadAnfordern} className="schiedsrichter-formular">
          <div className="feld">
            <label htmlFor="syncZielInstanz">Verbundene Instanz</label>
            <select id="syncZielInstanz" value={zielInstanzId} onChange={(e) => setZielInstanzId(e.target.value)} required>
              <option value="">– bitte wählen –</option>
              {instanzen.map((instanz) => (
                <option key={instanz._id} value={instanz.instanzId}>
                  {instanz.bezeichnung || instanz.instanzId}
                </option>
              ))}
            </select>
          </div>
          <label className="feld-checkbox">
            <input
              type="checkbox"
              checked={stammdatenMitnehmen}
              onChange={(e) => setStammdatenMitnehmen(e.target.checked)}
            />{" "}
            Stammdaten (Vereine/Teams) mitnehmen
          </label>
          <button type="submit" disabled={!zielInstanzId}>
            Für lokale Nutzung herunterladen
          </button>
        </form>
      ) : (
        <p className="feld-hinweis">
          Keine verbundene Instanz. Unter <a href="/profil">„Mein Profil"</a> lässt sich eine bereits eingerichtete
          lokale Installation per Kopplungscode verbinden. Noch keine lokale Installation vorhanden? In der{" "}
          <a href="/hilfe#lokale-installation">Hilfe</a> steht Schritt für Schritt, wie du eine einrichtest.
        </p>
      )}

      {lokaleSyncStatus?.verbunden && (
        <>
          <h3>Zum Server hochladen</h3>
          <p className="feld-hinweis">Diese Installation ist mit {lokaleSyncStatus.serverUrl} verbunden.</p>
          <button type="button" onClick={hochladen}>
            Zum Server hochladen
          </button>
        </>
      )}
    </section>
  );
}
