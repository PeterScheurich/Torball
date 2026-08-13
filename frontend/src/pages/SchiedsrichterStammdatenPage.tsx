import { useEffect, useState } from "react";
import type { Verein } from "@torball/shared";
import { getVereine } from "../api";
import { SchiedsrichterStammdatenVerwaltung } from "../components/SchiedsrichterStammdatenVerwaltung";
import { useAuth } from "../auth";

/** Eigenstaendige Stammdaten-Seite fuer Schiedsrichter-Vorlagen (turnieruebergreifend, analog
 * StammdatenPage fuer Vereine/Teams, aber bewusst als eigener Menuepunkt statt als Unterabschnitt
 * dort - keine zwingende fachliche Abhaengigkeit zu Vereinen/Teams). Laedt die Vereinsliste selbst
 * (fuer die Verein-Auswahl je Schiedsrichter), da VereineVerwaltung hier nicht eingebunden ist. */
export function SchiedsrichterStammdatenPage() {
  const [vereine, setVereine] = useState<Verein[]>([]);
  const { benutzer } = useAuth();
  const darfBearbeiten = benutzer?.globaleRolle === "admin" || benutzer?.globaleRolle === "manager";

  // Fehler beim Laden bewusst still: das Formular funktioniert auch ohne Verein-Auswahl (neutrale
  // Schiedsrichter sind zulaessig), analog ProfilPage.
  useEffect(() => {
    getVereine()
      .then(setVereine)
      .catch(() => setVereine([]));
  }, []);

  return (
    <>
      <h1>Stammdaten: Schiedsrichter</h1>
      <p>
        Hier gepflegte Schiedsrichter stehen turnierübergreifend zur Verfügung. Beim Anlegen eines
        Turnier-Schiedsrichters werden diese Daten kopiert, nicht live verknüpft - eine spätere Änderung hier
        wirkt sich nicht auf bereits laufende oder abgeschlossene Turniere aus.
      </p>
      {!darfBearbeiten && <p>Du kannst diese Stammdaten einsehen; bearbeiten können nur Admin/Manager.</p>}
      <SchiedsrichterStammdatenVerwaltung vereine={vereine} darfBearbeiten={darfBearbeiten} />
    </>
  );
}
