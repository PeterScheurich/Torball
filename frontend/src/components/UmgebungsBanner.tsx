/**
 * Zeigt einen unuebersehbaren Hinweis, wenn die App NICHT die Produktivinstanz ist - verhindert,
 * dass man versehentlich Demo-/Entwicklungsdaten fuer echte haelt (oder umgekehrt dort etwas
 * pflegt, das beim naechsten Reset weg ist). Rein build-zeit-gesteuert, kein Laufzeit-API-Aufruf:
 * - import.meta.env.DEV kommt direkt von Vite (true bei "npm run dev:frontend").
 * - VITE_INSTANZ_NAME wird von deploy/deploy-instanz.sh vor dem Produktions-Build geschrieben
 *   (der Instanzname, z.B. "demo", den das Skript ohnehin schon als Parameter bekommt).
 * Auf der Produktivinstanz (VITE_INSTANZ_NAME=prod) und beim Windows-Ein-Klick-Installer (kein
 * VITE_INSTANZ_NAME gesetzt) erscheint bewusst kein Banner.
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
        ⚠ Demo-Umgebung – Eingaben werden regelmäßig gelöscht, nicht für echte Turniere verwenden
      </div>
    );
  }

  return null;
}
