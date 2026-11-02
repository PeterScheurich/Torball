import { useEffect, useState } from "react";
import { getSystemUpdate, type SystemUpdate } from "../api";
import { useAuth } from "../auth";

/**
 * Hinweis fuer Administratoren einer lokalen Installation (aus dem Windows-Paket): Es gibt eine neuere
 * Version. Die Anwendung aktualisiert sich nicht selbst - der Hinweis sagt, wo man es mit einem Doppelklick
 * tut. Ohne Paket (Server, Entwicklung) oder ohne neuere Version bleibt er unsichtbar; ein Fehler beim
 * Nachsehen (z. B. kein Internet am Spielort) wird bewusst nicht angezeigt - das ist kein Grund zur Sorge.
 */
export function UpdateHinweis() {
  const { benutzer } = useAuth();
  const [update, setUpdate] = useState<SystemUpdate>();
  const istAdmin = benutzer?.globaleRolle === "admin";

  useEffect(() => {
    if (!istAdmin) return;
    let abgebrochen = false;
    getSystemUpdate()
      .then((antwort) => {
        if (!abgebrochen) setUpdate(antwort);
      })
      .catch(() => {
        /* Nachsehen nicht moeglich - kein Hinweis */
      });
    return () => {
      abgebrochen = true;
    };
  }, [istAdmin]);

  if (!update?.verfuegbar) return null;
  return (
    <div className="umgebungs-banner umgebungs-banner-lokal" role="status">
      ⬆ Neue Version {update.verfuegbar.version} verfügbar (installiert: {update.installiert}). Zum Aktualisieren im
      Startmenü unter „Torball-Turniere“ den Eintrag „Torball-Turniere aktualisieren“ öffnen – die Turnierdaten bleiben
      erhalten.
      {update.verfuegbar.seite && (
        <>
          {" "}
          <a href={update.verfuegbar.seite} target="_blank" rel="noreferrer">
            Was ist neu?
          </a>
        </>
      )}
    </div>
  );
}
