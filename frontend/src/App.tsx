import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { TurnierListePage } from "./pages/TurnierListePage";
import { TurnierAnlegenPage } from "./pages/TurnierAnlegenPage";
import { MannschaftenErfassenPage } from "./pages/MannschaftenErfassenPage";
import { SpielregelnErfassenPage } from "./pages/SpielregelnErfassenPage";
import { SchiedsrichterErfassenPage } from "./pages/SchiedsrichterErfassenPage";
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
import { StandardregelnPage } from "./pages/StandardregelnPage";
import { KanbanBoardPage } from "./pages/KanbanBoardPage";
import { EinstellungenPage } from "./pages/EinstellungenPage";
import { HilfePage } from "./pages/HilfePage";
import { UeberPage } from "./pages/UeberPage";
import { GeschuetzteRoute } from "./components/GeschuetzteRoute";
import { KopfzeilenMenue } from "./components/KopfzeilenMenue";
import { useAuth } from "./auth";
import { APP_VERSION } from "./version";

// Wurzelkomponente: globale Kopfzeile (Navigation) plus das komplette Routing der App.
// Oeffentliche Routen (Login, Einladung, Passwort-Reset, Ergebnis-Erfassung per Link,
// oeffentliche Turnierseite, Einstellungen, Hilfe) liegen ausserhalb von GeschuetzteRoute;
// alles Uebrige verlangt eine Anmeldung.

/** Globale Kopfzeile mit Navigation. Menuepunkte richten sich nach Rolle/Anmeldestatus;
 *  auf oeffentlichen/externen Seiten wird eine minimale Variante ohne Nav gezeigt. */
function Kopfzeile() {
  const { benutzer, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const darfBenutzerVerwalten = benutzer?.globaleRolle === "admin" || benutzer?.globaleRolle === "manager";

  async function abmelden() {
    await logout();
    navigate("/login");
  }

  // Oeffentliche/externe Seiten (oeffentliche Turnierseite, Ergebnis-Erfassung per Link) sind fuer
  // nicht angemeldete Besucher gedacht. Dort blenden wir die App-Navigation (inkl. globaler Hilfe)
  // bewusst aus und zeigen die Marke als reinen Text - ein Klick darauf fuehrte sonst ueber "/" in
  // die Anmeldung (GeschuetzteRoute). Angemeldete Nutzer (z.B. Vorschau durch die Turnierleitung)
  // behalten die volle Kopfzeile.
  const oeffentlicheAnsicht =
    /^\/turniere\/[^/]+\/oeffentlich$/.test(pathname) || pathname.startsWith("/ergebnis-erfassung/");
  if (oeffentlicheAnsicht && !benutzer) {
    return (
      <header>
        <nav>
          <span className="marke">
            <img className="logo logo-hell" src="/images/torball-logo.svg" alt="" width="32" height="32" />
            <img className="logo logo-dunkel" src="/images/torball-logo-dark.svg" alt="" width="32" height="32" />
            Torball-Turniere
            <span className="marke-version">{APP_VERSION}</span>
          </span>
        </nav>
      </header>
    );
  }

  return (
    <header>
      <nav>
        <Link to="/" className="marke">
          <img className="logo logo-hell" src="/images/torball-logo.svg" alt="" width="32" height="32" />
          <img className="logo logo-dunkel" src="/images/torball-logo-dark.svg" alt="" width="32" height="32" />
          Torball-Turniere
          <span className="marke-version">{APP_VERSION}</span>
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
              {benutzer?.globaleRolle === "admin" && (
                <Link to="/standardregeln" className="kopfzeile-menue-eintrag" role="menuitem">
                  Standardregeln
                </Link>
              )}
              {benutzer?.globaleRolle === "admin" && (
                <Link to="/entwicklungs-board" className="kopfzeile-menue-eintrag" role="menuitem">
                  Entwicklungs-Board
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
          <NavLink
            to="/hilfe"
            className={({ isActive }) => (isActive ? "kopfzeile-link kopfzeile-link-aktiv" : "kopfzeile-link")}
          >
            Hilfe
          </NavLink>
          {/* "Über" nur für angemeldete Nutzer - die Entwickler-Kontaktseite ist bewusst
              nicht öffentlich (Scam-/Spam-Schutz, siehe UeberPage). */}
          {benutzer && (
            <NavLink
              to="/ueber"
              className={({ isActive }) => (isActive ? "kopfzeile-link kopfzeile-link-aktiv" : "kopfzeile-link")}
            >
              Über
            </NavLink>
          )}
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

/** Definiert alle Routen der Anwendung (siehe Modul-Kommentar oben zur Trennung
 *  oeffentlich / anmeldepflichtig). */
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
          <Route path="/hilfe" element={<HilfePage />} />

          <Route element={<GeschuetzteRoute />}>
            <Route path="/" element={<TurnierListePage />} />
            <Route path="/profil" element={<ProfilPage />} />
            <Route path="/ueber" element={<UeberPage />} />
            <Route path="/benutzerverwaltung" element={<BenutzerverwaltungPage />} />
            <Route path="/stammdaten" element={<StammdatenPage />} />
            <Route path="/standardregeln" element={<StandardregelnPage />} />
            <Route path="/entwicklungs-board" element={<KanbanBoardPage />} />
            <Route path="/turniere/neu" element={<TurnierAnlegenPage />} />
            <Route path="/turniere/:id/regeln-erfassen" element={<SpielregelnErfassenPage />} />
            <Route path="/turniere/:id/mannschaften-erfassen" element={<MannschaftenErfassenPage />} />
            <Route path="/turniere/:id/schiedsrichter-erfassen" element={<SchiedsrichterErfassenPage />} />
            <Route path="/turniere/:id/spielplan-erstellen" element={<SpielplanErstellenPage />} />
            <Route path="/turniere/:id" element={<TurnierVerwaltenPage />} />
          </Route>
        </Routes>
      </main>
    </>
  );
}

export default App;
