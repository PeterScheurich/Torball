import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getMe, login as apiLogin, logout as apiLogout, type BenutzerProfil, type LoginErgebnis } from "./api";

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
      .then(setBenutzer)
      .catch(() => setBenutzer(null))
      .finally(() => setLaedt(false));
  }, []);

  const login = useCallback(async (email: string, passwort: string, totpCode?: string) => {
    const ergebnis = await apiLogin(email, passwort, totpCode);
    if (!("benoetigtTotp" in ergebnis)) {
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
