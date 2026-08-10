import { useState } from "react";
import type { Verein } from "@torball/shared";
import { VereineVerwaltung } from "../components/VereineVerwaltung";
import { TeamsVerwaltung } from "../components/TeamsVerwaltung";

/** Zentrale Stammdatenverwaltung (Gesamtspezifikation Abschnitt 15) - unabhaengig von
 * einzelnen Turnieren, wiederverwendbar ueber Turniere hinweg. */
export function StammdatenPage() {
  const [vereine, setVereine] = useState<Verein[]>([]);

  return (
    <>
      <h1>Stammdaten: Vereine und Teams</h1>
      <p>
        Hier gepflegte Vereine und Teams stehen turnierübergreifend zur Verfügung. Beim Anlegen einer
        Turnier-Mannschaft werden diese Daten kopiert, nicht live verknüpft - eine spätere Änderung hier wirkt sich
        nicht auf bereits laufende oder abgeschlossene Turniere aus.
      </p>
      <VereineVerwaltung onGeaendert={setVereine} />
      <TeamsVerwaltung vereine={vereine} />
    </>
  );
}
