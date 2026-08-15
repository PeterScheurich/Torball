/**
 * Zeigt einen unuebersehbaren Hinweis, wenn die App NICHT die Produktivinstanz ist - verhindert,
 * dass man versehentlich Demo-/Entwicklungsdaten fuer echte haelt (oder umgekehrt dort etwas
 * pflegt, das beim naechsten Reset weg ist). Rein build-zeit-gesteuert, kein Laufzeit-API-Aufruf:
 * - import.meta.env.DEV kommt direkt von Vite (true bei "npm run dev:frontend").
 * - VITE_INSTANZ_NAME wird von deploy/deploy-instanz.sh vor dem Produktions-Build geschrieben
 *   (der Instanzname, z.B. "demo"/"test", den das Skript ohnehin schon als Parameter bekommt).
 * Auf der Produktivinstanz (VITE_INSTANZ_NAME=prod) und beim Windows-Ein-Klick-Installer (kein
 * VITE_INSTANZ_NAME gesetzt) erscheint bewusst kein Banner.
 *
 * Text bewusst "zurueckgesetzt" statt "geloescht" (Stand 2026-08-13): der naechtliche Reset ist
 * kein App-seitiges Loeschen mehr, sondern ein CouchDB-Snapshot-Restore auf einen festen
 * Ausgangszustand (siehe backend/src/demo/snapshot.ts) - nur der eigene Admin-Account bleibt davon
 * unberuehrt, alle Turnier-/Vereins-/Team-Inhalte UND alle anderen Benutzer-Konten (auch
 * selbst-registrierte) werden dabei zurueckgesetzt.
 *
 * Diese konkrete Aussage gilt aber NUR fuer die Instanz "demo" (dafuer per
 * deploy/demo-snapshot-einrichten.sh explizit eingerichtet) - jede andere Nicht-Prod-Instanz
 * (z.B. ein manueller Test-Deploy "test") bekommt bewusst einen generischen Hinweis ohne die
 * Reset-Behauptung (Stand 2026-08-16, live aufgefallen: "test" zeigte vorher woertlich den
 * Demo-Text an, obwohl dort gar kein automatischer Reset laeuft).
 */
export function UmgebungsBanner() {
  if (import.meta.env.DEV) {
    return (
      <div className="umgebungs-banner umgebungs-banner-dev">
        Entwicklungsumgebung
      </div>
    );
  }

  if (import.meta.env.VITE_INSTANZ_NAME === "demo") {
    return (
      <div className="umgebungs-banner umgebungs-banner-demo">
        ⚠ Demo-Umgebung – Inhalte und Benutzer-Konten werden regelmäßig auf einen festen
        Ausgangszustand zurückgesetzt, nicht für echte Turniere verwenden
      </div>
    );
  }

  // Jede andere Nicht-Prod-Instanz (z.B. ein manueller Test-Deploy mit einem beliebigen Namen) -
  // bewusst OHNE die obige Aussage zum automatischen Reset, die nur fuer "demo" tatsaechlich
  // zutrifft (der naechtliche Snapshot-Reset wird gezielt per deploy/demo-snapshot-einrichten.sh
  // nur dafuer eingerichtet). Live aufgefallen: eine Instanz namens "test" zeigte bisher woertlich
  // den Demo-Text inkl. der falschen Reset-Behauptung an.
  if (import.meta.env.VITE_INSTANZ_NAME && import.meta.env.VITE_INSTANZ_NAME !== "prod") {
    return (
      <div className="umgebungs-banner umgebungs-banner-demo">
        ⚠ Nicht-Produktivumgebung ({import.meta.env.VITE_INSTANZ_NAME}) – nicht für echte Turniere verwenden
      </div>
    );
  }

  return null;
}
