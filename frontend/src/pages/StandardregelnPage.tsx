import { useCallback, useEffect, useState } from "react";
import type { Systemkonfiguration, Turnierregeln } from "@torball/shared";
import { getSystemkonfiguration, updateSystemkonfiguration } from "../api";
import { TurnierregelnFormular } from "../components/TurnierregelnFormular";
import { useAuth } from "../auth";

/**
 * Zentrale Standardregeln (Systemkonfiguration). Diese Werte werden beim Anlegen eines neuen
 * Turniers kopiert; bestehende Turniere bleiben unberührt (jedes trägt seine eigene Kopie). Jede
 * Änderung legt serverseitig eine neue Version an (Historie bleibt erhalten). Lesen ist für jede
 * angemeldete Person möglich; Ändern ist auf Admin beschränkt (Backend erzwingt es, das Formular
 * ist für alle anderen zusätzlich über ein disabled-<fieldset> gesperrt).
 */
export function StandardregelnPage() {
  const [konfig, setKonfig] = useState<Systemkonfiguration | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();
  const { benutzer } = useAuth();
  const darfBearbeiten = benutzer?.globaleRolle === "admin";

  const laden = useCallback(async () => {
    try {
      setKonfig(await getSystemkonfiguration());
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  async function speichern(regeln: Turnierregeln) {
    try {
      setKonfig(await updateSystemkonfiguration({ ...regeln }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
      throw err;
    }
  }

  return (
    <>
      <h1>Standardregeln für neue Turniere</h1>
      <p>
        Diese Werte werden beim Anlegen eines neuen Turniers übernommen. Bestehende Turniere bleiben unverändert – jedes
        Turnier trägt seine eigene Kopie und lässt sich einzeln im Reiter „Regeln" anpassen.
      </p>
      {!darfBearbeiten && <p>Du kannst die Standardregeln einsehen; ändern kann nur ein Admin.</p>}
      {fehler && <p role="alert">{fehler}</p>}
      {konfig ? (
        <fieldset className="blank-fieldset" disabled={!darfBearbeiten}>
          <TurnierregelnFormular
            werte={konfig}
            onSpeichern={speichern}
            hinweis={`Aktuelle Version: ${konfig.version}. Jede Änderung legt eine neue Version an; bestehende Turniere bleiben davon unberührt.`}
          />
        </fieldset>
      ) : (
        !fehler && <p>Lädt…</p>
      )}
    </>
  );
}
