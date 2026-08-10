import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { TurnierListePage } from "./pages/TurnierListePage";
import { TurnierAnlegenPage } from "./pages/TurnierAnlegenPage";
import { MannschaftenErfassenPage } from "./pages/MannschaftenErfassenPage";
import { SpielplanErstellenPage } from "./pages/SpielplanErstellenPage";
import { TurnierVerwaltenPage } from "./pages/TurnierVerwaltenPage";
import { LoginPage } from "./pages/LoginPage";
import { ErsteinrichtungPage } from "./pages/ErsteinrichtungPage";
import { EinladungAnnehmenPage } from "./pages/EinladungAnnehmenPage";
import { PasswortVergessenPage } from "./pages/PasswortVergessenPage";
import { PasswortResetPage } from "./pages/PasswortResetPage";
import { ProfilPage } from "./pages/ProfilPage";
import { BenutzerverwaltungPage } from "./pages/BenutzerverwaltungPage";
import { GeschuetzteRoute } from "./components/GeschuetzteRoute";
import { ThemeUmschalter } from "./components/ThemeUmschalter";
import { useAuth } from "./auth";

function Kopfzeile() {
  const { benutzer, logout } = useAuth();
  const navigate = useNavigate();
  const darfBenutzerVerwalten = benutzer?.globaleRolle === "admin" || benutzer?.globaleRolle === "manager";

  async function abmelden() {
    await logout();
    navigate("/login");
  }

  return (
    <header>
      <nav>
        <Link to="/" className="marke">
          <img className="logo logo-hell" src="/images/torball-logo.svg" alt="" width="32" height="32" />
          <img className="logo logo-dunkel" src="/images/torball-logo-dark.svg" alt="" width="32" height="32" />
          Torball-Turniere
        </Link>
        <div className="marke">
          {benutzer && (
            <>
              {darfBenutzerVerwalten && (
                <NavLink
                  to="/benutzerverwaltung"
                  className={({ isActive }) => (isActive ? "kopfzeile-link kopfzeile-link-aktiv" : "kopfzeile-link")}
                >
                  Benutzerverwaltung
                </NavLink>
              )}
              <NavLink
                to="/profil"
                className={({ isActive }) => (isActive ? "kopfzeile-link kopfzeile-link-aktiv" : "kopfzeile-link")}
              >
                {benutzer.name}
              </NavLink>
              <button type="button" className="symbol-button" onClick={abmelden} aria-label="Abmelden" title="Abmelden">
                🚪
              </button>
            </>
          )}
          <ThemeUmschalter />
        </div>
      </nav>
    </header>
  );
}

function App() {
  return (
    <>
      <Kopfzeile />
      <main>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/ersteinrichtung" element={<ErsteinrichtungPage />} />
          <Route path="/einladung/:token" element={<EinladungAnnehmenPage />} />
          <Route path="/passwort-vergessen" element={<PasswortVergessenPage />} />
          <Route path="/passwort-reset/:token" element={<PasswortResetPage />} />

          <Route element={<GeschuetzteRoute />}>
            <Route path="/" element={<TurnierListePage />} />
            <Route path="/profil" element={<ProfilPage />} />
            <Route path="/benutzerverwaltung" element={<BenutzerverwaltungPage />} />
            <Route path="/turniere/neu" element={<TurnierAnlegenPage />} />
            <Route path="/turniere/:id/mannschaften-erfassen" element={<MannschaftenErfassenPage />} />
            <Route path="/turniere/:id/spielplan-erstellen" element={<SpielplanErstellenPage />} />
            <Route path="/turniere/:id" element={<TurnierVerwaltenPage />} />
          </Route>
        </Routes>
      </main>
    </>
  );
}

export default App;
