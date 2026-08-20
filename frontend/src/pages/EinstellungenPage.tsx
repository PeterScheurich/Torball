import { useCallback, useEffect, useState } from "react";
import { ThemeUmschalter } from "../components/ThemeUmschalter";
import { DichteUmschalter } from "../components/DichteUmschalter";
import { BreiteUmschalter } from "../components/BreiteUmschalter";
import { useAuth } from "../auth";
import { getLokaleSyncStatus, trenneVonServer, verbindeMitServer, type LokaleSyncStatus } from "../api";
import { formatiereZeitstempel } from "../format";

/**
 * Turnier-Sync (Grundlage, Abschnitt 21.3/23): Kopplung DIESER Installation mit einem Zentralen-
 * Plattform-Server - rein geraetelokal (kein Konto auf dieser Instanz noetig), deshalb auf der
 * ebenfalls geraetelokalen EinstellungenPage statt im Profil. Der Kopplungscode selbst wird auf
 * dem SERVER unter "Mein Profil" -> "Verbundene Instanzen" erzeugt (siehe ProfilPage.tsx).
 */
function ServerVerbindung() {
  const [status, setStatus] = useState<LokaleSyncStatus | undefined>();
  const [serverUrl, setServerUrl] = useState("");
  const [kopplungscode, setKopplungscode] = useState("");
  const [bezeichnung, setBezeichnung] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(() => {
    getLokaleSyncStatus()
      .then(setStatus)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Fehler beim Laden des Sync-Status"));
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  async function verbinden(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    setLaedt(true);
    try {
      await verbindeMitServer(serverUrl.trim(), kopplungscode.trim(), bezeichnung.trim() || undefined);
      setKopplungscode("");
      laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Verbindung fehlgeschlagen");
    } finally {
      setLaedt(false);
    }
  }

  async function trennen() {
    if (!window.confirm("Verbindung zu diesem Server auf diesem Gerät trennen? Laufende Turnier-Synchronisation stoppt sofort.")) {
      return;
    }
    try {
      await trenneVonServer();
      laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Trennen fehlgeschlagen");
    }
  }

  if (!status) return null;
  // Ohne SERVE_FRONTEND (siehe backend/src/index.ts) ist diese Instanz keine lokale Installation
  // - eine Kopplung "als lokale Installation" ergibt dann keinen Sinn und wuerde nur verwirren
  // (auf jeder Dev-/Prod-/Demo-Instanz waere das Formular sonst gleichermassen sichtbar).
  if (!status.istLokaleInstallation) return null;

  if (status.verbunden) {
    return (
      <>
        <h2>Turnier-Sync (Lokale Installation)</h2>
        <p>
          Verbunden mit <strong>{status.serverUrl}</strong>
          {status.gekoppeltAm && <> (seit {formatiereZeitstempel(status.gekoppeltAm)})</>}.
        </p>
        <p className="feld-hinweis">
          Turniere, die von diesem Server hierher heruntergeladen werden, synchronisieren sich automatisch im
          Hintergrund, solange eine Verbindung besteht.
        </p>
        <button type="button" onClick={trennen}>
          Verbindung trennen
        </button>
      </>
    );
  }

  return (
    <>
      <h2>Turnier-Sync (Lokale Installation)</h2>
      <p>
        Verbinde dieses Gerät mit einem Zentralen-Plattform-Server, um Turniere von dort herunterzuladen und
        Ergebnisse automatisch zurückzusynchronisieren - auch bei unzuverlässigem Internet vor Ort. Den
        Kopplungscode erzeugst du auf dem Server unter „Mein Profil" (<span aria-hidden="true">👤</span>) → „Verbundene
        Instanzen".
      </p>
      {fehler && <p role="alert">{fehler}</p>}
      <form onSubmit={verbinden}>
        <div className="feld">
          <label htmlFor="syncServerUrl">Server-Adresse</label>
          <input
            id="syncServerUrl"
            required
            placeholder="https://turniere.beispiel.de"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="syncKopplungscode">Kopplungscode</label>
          <input
            id="syncKopplungscode"
            required
            value={kopplungscode}
            onChange={(e) => setKopplungscode(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="syncBezeichnung">Bezeichnung (optional)</label>
          <input
            id="syncBezeichnung"
            placeholder="z. B. Laptop Halle 3"
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
          />
        </div>
        <button type="submit" disabled={laedt}>
          Verbinden
        </button>
      </form>
    </>
  );
}

/** Rein geraetelokale Anzeige-Einstellungen (localStorage) - bewusst NICHT an ein
 * Benutzerkonto gebunden: fuer den geplanten Offline/LAN-Betrieb (Gesamtspezifikation
 * Abschnitt 21.3) gibt es keine angemeldeten Benutzer, die Seite muss also auch ohne
 * Login funktionieren (siehe Route in App.tsx, ausserhalb von GeschuetzteRoute).
 * Angemeldete Benutzer haben zusaetzlich einen kontogebundenen Standardwert in ihrem
 * Profil - der hat immer Recht (Nutzer-Vorgabe 2026-08-20): beim naechsten Sitzungsstart
 * ueberschreibt er die Wahl auf diesem Geraet wieder (uebernimmKontoStandards in auth.tsx).
 * Diese Seite hier wirkt also dauerhaft nur fuer nicht angemeldete Geraete bzw. Konten
 * ohne gesetzten Standard und aendert nie den hinterlegten Konto-Standard selbst. */
export function EinstellungenPage() {
  const { benutzer } = useAuth();

  return (
    <>
      <h1>Einstellungen</h1>
      <p>Diese Einstellungen gelten nur für dieses Gerät bzw. diesen Browser.</p>
      {benutzer && (
        <p>
          Angemeldet als „{benutzer.name}": deine kontogebundenen Standardwerte legst du stattdessen in{" "}
          <a href="/profil">deinem Profil</a> fest - die gelten dann auf allen Geräten und werden bei jeder
          Anmeldung neu angewendet. Was du hier änderst, gilt nur auf diesem Gerät und nur bis zur nächsten
          Anmeldung.
        </p>
      )}

      <h2>Farbschema</h2>
      <ThemeUmschalter />

      <h2>Zeilenabstand</h2>
      <p>Wirkt sich auf die Zeilenhöhe von Tabellen und die Höhe von Eingabefeldern in der ganzen Anwendung aus.</p>
      <DichteUmschalter />

      <h2>Breite</h2>
      <p>„Breit" nutzt mehr Bildschirmbreite (z. B. auf Widescreen-Monitoren); „Standard" hält eine schmalere, gut lesbare Spalte.</p>
      <BreiteUmschalter />

      <ServerVerbindung />
    </>
  );
}
