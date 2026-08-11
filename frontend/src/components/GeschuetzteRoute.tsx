import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

/**
 * Wrapper-Route fuer Bereiche, die eine Anmeldung verlangen (siehe Routen-Definition in
 * App.tsx). Rendert die verschachtelten Routen (<Outlet/>) nur fuer angemeldete Benutzer;
 * waehrend der initiale Auth-Status noch laedt, wird ein Platzhalter gezeigt (nicht sofort
 * auf /login umgeleitet, sonst wuerde ein Reload angemeldete Nutzer kurz ausloggen).
 */
export function GeschuetzteRoute() {
  const { benutzer, laedt } = useAuth();
  if (laedt) return <p>Lädt…</p>;
  if (!benutzer) return <Navigate to="/login" replace />;
  return <Outlet />;
}
