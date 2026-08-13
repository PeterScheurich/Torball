import { useState } from "react";
import type { Verein } from "@torball/shared";
import { VereineVerwaltung } from "../components/VereineVerwaltung";
import { TeamsVerwaltung } from "../components/TeamsVerwaltung";
import { SchiedsrichterStammdatenVerwaltung } from "../components/SchiedsrichterStammdatenVerwaltung";
import { useAuth } from "../auth";

/** Zentrale Stammdatenverwaltung (Gesamtspezifikation Abschnitt 15/29) - unabhaengig von
 * einzelnen Turnieren, wiederverwendbar ueber Turniere hinweg. Lesen ist fuer jede angemeldete
 * Person moeglich (z.B. fuer die Auswahl bei der Mannschafts-/Schiedsrichter-Erfassung im
 * Turnier); Bearbeiten ist auf Admin/Manager beschraenkt (siehe verein.ts/team.ts/
 * schiedsrichterStammdaten.ts) - fuer alle anderen Rollen sind die Formulare ueber ein
 * disabled-<fieldset> in den Unterkomponenten gesperrt. */
export function StammdatenPage() {
  const [vereine, setVereine] = useState<Verein[]>([]);
  const { benutzer } = useAuth();
  const darfBearbeiten = benutzer?.globaleRolle === "admin" || benutzer?.globaleRolle === "manager";

  return (
    <>
      <h1>Stammdaten: Vereine, Teams und Schiedsrichter</h1>
      <p>
        Hier gepflegte Vereine, Teams und Schiedsrichter stehen turnierübergreifend zur Verfügung. Beim Anlegen
        einer Turnier-Mannschaft bzw. eines Turnier-Schiedsrichters werden diese Daten kopiert, nicht live
        verknüpft - eine spätere Änderung hier wirkt sich nicht auf bereits laufende oder abgeschlossene Turniere
        aus.
      </p>
      {!darfBearbeiten && <p>Du kannst diese Stammdaten einsehen; bearbeiten können nur Admin/Manager.</p>}
      <VereineVerwaltung onGeaendert={setVereine} darfBearbeiten={darfBearbeiten} />
      <TeamsVerwaltung vereine={vereine} darfBearbeiten={darfBearbeiten} />
      <SchiedsrichterStammdatenVerwaltung vereine={vereine} darfBearbeiten={darfBearbeiten} />
    </>
  );
}
