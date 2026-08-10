import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
import { ErgebnisErfassungPage } from "./pages/ErgebnisErfassungPage";
import { OeffentlicheTurnierseitePage } from "./pages/OeffentlicheTurnierseitePage";
import { ProfilPage } from "./pages/ProfilPage";
import { BenutzerverwaltungPage } from "./pages/BenutzerverwaltungPage";
import { StammdatenPage } from "./pages/StammdatenPage";
import { EinstellungenPage } from "./pages/EinstellungenPage";
import { GeschuetzteRoute } from "./components/GeschuetzteRoute";
import { KopfzeilenMenue } from "./components/KopfzeilenMenue";
import { useAuth } from "./auth";

function Kopfzeile() {
  const { benutzer, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
            <KopfzeilenMenue
              label="Stammdaten"
              aktiv={pathname.startsWith("/stammdaten") || pathname.startsWith("/benutzerverwaltung")}
            >
              <Link to="/stammdaten" className="kopfzeile-menue-eintrag" role="menuitem">
                Vereine &amp; Teams
              </Link>
              {darfBenutzerVerwalten && (
                <Link to="/benutzerverwaltung" className="kopfzeile-menue-eintrag" role="menuitem">
                  Benutzerverwaltung
                </Link>
              )}
            </KopfzeilenMenue>
          )}
          <NavLink
            to="/einstellungen"
            className={({ isActive }) => (isActive ? "kopfzeile-link kopfzeile-link-aktiv" : "kopfzeile-link")}
          >
            Einstellungen
          </NavLink>
          {benutzer && (
            <KopfzeilenMenue
              label={<><span aria-hidden="true">👤</span> {benutzer.name}</>}
              ariaLabel={`Benutzermenü für ${benutzer.name}`}
              aktiv={pathname.startsWith("/profil")}
            >
              <Link to="/profil" className="kopfzeile-menue-eintrag" role="menuitem">
                Mein Profil
              </Link>
              <button type="button" className="kopfzeile-menue-eintrag" role="menuitem" onClick={abmelden}>
                Abmelden
              </button>
            </KopfzeilenMenue>
          )}
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
          <Route path="/ergebnis-erfassung/:tokenWert" element={<ErgebnisErfassungPage />} />
          <Route path="/turniere/:id/oeffentlich" element={<OeffentlicheTurnierseitePage />} />
          <Route path="/einstellungen" element={<EinstellungenPage />} />

          <Route element={<GeschuetzteRoute />}>
            <Route path="/" element={<TurnierListePage />} />
            <Route path="/profil" element={<ProfilPage />} />
            <Route path="/benutzerverwaltung" element={<BenutzerverwaltungPage />} />
            <Route path="/stammdaten" element={<StammdatenPage />} />
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
