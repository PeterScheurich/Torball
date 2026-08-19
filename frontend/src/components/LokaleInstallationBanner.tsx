import { useEffect, useState } from "react";
import { getLokaleSyncStatus } from "../api";

/**
 * Aehnlich UmgebungsBanner.tsx, aber fuer den umgekehrten Fall: NICHT eine Nicht-Prod-Instanz
 * markieren, sondern deutlich machen, dass man sich gerade auf einer lokalen Windows-Installation
 * befindet (Turnier-Sync, Abschnitt 21.3/23) - anders als UmgebungsBanner rein zur Laufzeit per
 * API ermittelt (kein VITE_INSTANZ_NAME o.ae. beim Build gesetzt), da dieselbe gebaute Anwendung
 * sowohl als Zentrale Plattform als auch als lokale Installation laeuft (SERVE_FRONTEND-Flag).
 * Nutzer-Feedback (2026-08-19): bei mehreren offenen Browser-Reitern (z.B. waehrend der
 * Turnier-Sync-Kopplung) ist sonst nur an der URL zu erkennen, auf welcher Instanz man gerade ist.
 * Bewusst NICHT in Rot wie UmgebungsBanner-demo (Nutzer-Vorgabe) - das ist hier kein Warnhinweis
 * vor Datenverlust, nur eine Standort-Kennzeichnung, deshalb der ruhigere Fokus-Blauton.
 */
export function LokaleInstallationBanner() {
  const [istLokaleInstallation, setIstLokaleInstallation] = useState(false);

  useEffect(() => {
    getLokaleSyncStatus()
      .then((status) => setIstLokaleInstallation(status.istLokaleInstallation))
      .catch(() => setIstLokaleInstallation(false));
  }, []);

  if (!istLokaleInstallation) return null;

  return <div className="umgebungs-banner umgebungs-banner-lokal">💻 Lokale Installation</div>;
}
