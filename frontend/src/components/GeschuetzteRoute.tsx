import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

export function GeschuetzteRoute() {
  const { benutzer, laedt } = useAuth();
  if (laedt) return <p>Lädt…</p>;
  if (!benutzer) return <Navigate to="/login" replace />;
  return <Outlet />;
}
