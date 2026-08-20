import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getMe, login as apiLogin, logout as apiLogout, type BenutzerProfil, type LoginErgebnis } from "./api";
import { themeAnwenden } from "./theme";
import { dichteAnwenden } from "./dichte";
import { breiteAnwenden } from "./breite";

/**
 * Wendet die kontogebundenen Standardwerte (Profil-Einstellungen) beim Anmelden bzw.
 * Wiederherstellen der Sitzung auf DIESEM Geraet an. Nutzer-Vorgabe (2026-08-20,
 * Frontend-Review): der Konto-Standard hat immer Recht - er ueberschreibt auch eine
 * frueher getroffene lokale Wahl (vorher galt "lokal gewinnt", wodurch eine spaetere
 * Aenderung des Konto-Standards ein Geraet nie mehr erreichte). Die geraetelokale
 * Einstellung (/einstellungen) bleibt fuer nicht angemeldete Geraete massgeblich und
 * wirkt angemeldet bis zum naechsten Sitzungsstart. Ein NICHT gesetzter Konto-Standard
 * laesst die lokale Wahl unangetastet.
 */
function uebernimmKontoStandards(profil: BenutzerProfil): void {
  if (profil.standardTheme) themeAnwenden(profil.standardTheme);
  if (profil.standardDichte) dichteAnwenden(profil.standardDichte);
  if (profil.standardBreite) breiteAnwenden(profil.standardBreite);
}

interface AuthContextWert {
  benutzer: BenutzerProfil | null;
  laedt: boolean;
  login: (email: string, passwort: string, totpCode?: string) => Promise<LoginErgebnis>;
  logout: () => Promise<void>;
  /** Aktualisiert den im Context gehaltenen Benutzer nach einer Profil-Änderung (z.B. 2FA), ohne neu von /auth/me zu laden. */
  aktualisiereBenutzer: (profil: BenutzerProfil) => void;
}

const AuthContext = createContext<AuthContextWert | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [benutzer, setBenutzer] = useState<BenutzerProfil | null>(null);
  const [laedt, setLaedt] = useState(true);

  useEffect(() => {
    getMe()
      .then((profil) => {
        uebernimmKontoStandards(profil);
        setBenutzer(profil);
      })
      .catch(() => setBenutzer(null))
      .finally(() => setLaedt(false));
  }, []);

  const login = useCallback(async (email: string, passwort: string, totpCode?: string) => {
    const ergebnis = await apiLogin(email, passwort, totpCode);
    if (!("benoetigtTotp" in ergebnis)) {
      uebernimmKontoStandards(ergebnis);
      setBenutzer(ergebnis);
    }
    return ergebnis;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setBenutzer(null);
  }, []);

  const aktualisiereBenutzer = useCallback((profil: BenutzerProfil) => setBenutzer(profil), []);

  return (
    <AuthContext.Provider value={{ benutzer, laedt, login, logout, aktualisiereBenutzer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextWert {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth muss innerhalb von AuthProvider verwendet werden");
  return ctx;
}
