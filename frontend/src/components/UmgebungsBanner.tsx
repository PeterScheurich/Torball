/**
 * Zeigt einen unuebersehbaren Hinweis, wenn die App NICHT die Produktivinstanz ist - verhindert,
 * dass man versehentlich Demo-/Entwicklungsdaten fuer echte haelt (oder umgekehrt dort etwas
 * pflegt, das beim naechsten Reset weg ist). Rein build-zeit-gesteuert, kein Laufzeit-API-Aufruf:
 * - import.meta.env.DEV kommt direkt von Vite (true bei "npm run dev:frontend").
 * - VITE_INSTANZ_NAME wird von deploy/deploy-instanz.sh vor dem Produktions-Build geschrieben
 *   (der Instanzname, z.B. "demo", den das Skript ohnehin schon als Parameter bekommt).
 * Auf der Produktivinstanz (VITE_INSTANZ_NAME=prod) und beim Windows-Ein-Klick-Installer (kein
 * VITE_INSTANZ_NAME gesetzt) erscheint bewusst kein Banner.
 *
 * Text bewusst "zurueckgesetzt" statt "geloescht" (Stand 2026-08-13): der naechtliche Reset ist
 * kein App-seitiges Loeschen mehr, sondern ein CouchDB-Snapshot-Restore auf einen festen
 * Ausgangszustand (siehe backend/src/demo/snapshot.ts) - nur der eigene Admin-Account bleibt davon
 * unberuehrt, alle Turnier-/Vereins-/Team-Inhalte UND alle anderen Benutzer-Konten (auch
 * selbst-registrierte) werden dabei zurueckgesetzt.
 */
export function UmgebungsBanner() {
  if (import.meta.env.DEV) {
    return (
      <div className="umgebungs-banner umgebungs-banner-dev">
        Entwicklungsumgebung
      </div>
    );
  }

  if (import.meta.env.VITE_INSTANZ_NAME && import.meta.env.VITE_INSTANZ_NAME !== "prod") {
    return (
      <div className="umgebungs-banner umgebungs-banner-demo">
        ⚠ Demo-Umgebung – Inhalte und Benutzer-Konten werden regelmäßig auf einen festen
        Ausgangszustand zurückgesetzt, nicht für echte Turniere verwenden
      </div>
    );
  }

  return null;
}
