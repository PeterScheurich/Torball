import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { TurnierListePage } from "./pages/TurnierListePage";
import { TurnierAnlegenPage } from "./pages/TurnierAnlegenPage";
import { MannschaftenErfassenPage } from "./pages/MannschaftenErfassenPage";
import { SpielregelnErfassenPage } from "./pages/SpielregelnErfassenPage";
import { SchiedsrichterErfassenPage } from "./pages/SchiedsrichterErfassenPage";
import { SpielplanErstellenPage } from "./pages/SpielplanErstellenPage";
import { TurnierVerwaltenPage } from "./pages/TurnierVerwaltenPage";
import { DruckansichtPage } from "./pages/DruckansichtPage";
import { OeffentlicheDruckansichtPage } from "./pages/OeffentlicheDruckansichtPage";
import { LoginPage } from "./pages/LoginPage";
import { ErsteinrichtungPage } from "./pages/ErsteinrichtungPage";
import { RegistrierenPage } from "./pages/RegistrierenPage";
import { EinladungAnnehmenPage } from "./pages/EinladungAnnehmenPage";
import { PasswortVergessenPage } from "./pages/PasswortVergessenPage";
import { PasswortResetPage } from "./pages/PasswortResetPage";
import { ErgebnisErfassungPage } from "./pages/ErgebnisErfassungPage";
import { TurnierCodeAnmeldenPage } from "./pages/TurnierCodeAnmeldenPage";
import { SpielleitungCodePage } from "./pages/SpielleitungCodePage";
import { OeffentlicheTurnierseitePage } from "./pages/OeffentlicheTurnierseitePage";
import { OeffentlicheStartseitePage } from "./pages/OeffentlicheStartseitePage";
import { ProfilPage } from "./pages/ProfilPage";
import { BenutzerverwaltungPage } from "./pages/BenutzerverwaltungPage";
import { StammdatenPage } from "./pages/StammdatenPage";
import { StandardregelnPage } from "./pages/StandardregelnPage";
import { SystemeinstellungenPage } from "./pages/SystemeinstellungenPage";
import { KanbanBoardPage } from "./pages/KanbanBoardPage";
import { MailPostfachPage } from "./pages/MailPostfachPage";
import { EinstellungenPage } from "./pages/EinstellungenPage";
import { HilfePage } from "./pages/HilfePage";
import { UeberPage } from "./pages/UeberPage";
import { GeschuetzteRoute } from "./components/GeschuetzteRoute";
import { KopfzeilenMenue } from "./components/KopfzeilenMenue";
import { UmgebungsBanner } from "./components/UmgebungsBanner";
import { Fusszeile } from "./components/Fusszeile";
import { useAuth } from "./auth";
import { mailPostfachVerfuegbar } from "./api";

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

  // Mail-Postfach ist nur auf der Entwicklungsinstanz aktiv (MAIL_POSTFACH_AKTIV, siehe
  // backend/src/mail/postfach.ts) - der Menuepunkt wird nur gezeigt, wenn die oeffentliche
  // Verfuegbarkeits-Abfrage das bestaetigt (kein Admin-Login noetig, um das zu pruefen).
  const [mailPostfachDaAktiv, setMailPostfachDaAktiv] = useState(false);
  useEffect(() => {
    mailPostfachVerfuegbar()
      .then((r) => setMailPostfachDaAktiv(r.verfuegbar))
      .catch(() => setMailPostfachDaAktiv(false));
  }, []);

  async function abmelden() {
    await logout();
    navigate("/login");
  }

  // Oeffentliche/externe Seiten (oeffentliche Turnierseite, Ergebnis-Erfassung per Link,
  // Turnier-Code-Anmeldung/-Sitzung) sind fuer nicht angemeldete Besucher gedacht. Dort blenden
  // wir die App-Navigation (inkl. globaler Hilfe) bewusst aus und zeigen die Marke als reinen Text
  // - ein Klick darauf fuehrte sonst ueber "/" in die Anmeldung (GeschuetzteRoute). Angemeldete
  // Nutzer (z.B. Vorschau durch die Turnierleitung) behalten die volle Kopfzeile.
  const oeffentlicheAnsicht =
    /^\/turniere\/[^/]+\/oeffentlich$/.test(pathname) ||
    pathname.startsWith("/ergebnis-erfassung/") ||
    /^\/turniere\/[^/]+\/code(\/|$)/.test(pathname);
  if (oeffentlicheAnsicht && !benutzer) {
    return (
      <header>
        <nav>
          <span className="marke">
            <img className="logo logo-hell" src="/images/torball-logo.svg" alt="" width="32" height="32" />
            <img className="logo logo-dunkel" src="/images/torball-logo-dark.svg" alt="" width="32" height="32" />
            Torball-Turniere
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
        </Link>
        <div className="marke">
          {benutzer && (
            <KopfzeilenMenue
              label="Stammdaten"
              aktiv={pathname.startsWith("/stammdaten") || pathname.startsWith("/benutzerverwaltung")}
            >
              <Link to="/stammdaten" className="kopfzeile-menue-eintrag" role="menuitem">
                Vereine, Teams &amp; Schiedsrichter
              </Link>
              {darfBenutzerVerwalten && (
                <Link to="/benutzerverwaltung" className="kopfzeile-menue-eintrag" role="menuitem">
                  Benutzerverwaltung
                </Link>
              )}
              <Link to="/standardregeln" className="kopfzeile-menue-eintrag" role="menuitem">
                Standardregeln
              </Link>
            </KopfzeilenMenue>
          )}
          {/* Eigenes Admin-Menue fuer Funktionen, die ausschliesslich der Rolle Admin vorbehalten
              sind (anders als "Stammdaten", das auch fuer Manager/Benutzer relevante Eintraege
              enthaelt) - wird fuer alle anderen Rollen komplett nicht gerendert. */}
          {benutzer?.globaleRolle === "admin" && (
            <KopfzeilenMenue
              label="Admin"
              aktiv={
                pathname.startsWith("/systemeinstellungen") ||
                pathname.startsWith("/entwicklungs-board") ||
                pathname.startsWith("/mail-postfach")
              }
            >
              <Link to="/systemeinstellungen" className="kopfzeile-menue-eintrag" role="menuitem">
                Systemeinstellungen
              </Link>
              <Link to="/entwicklungs-board" className="kopfzeile-menue-eintrag" role="menuitem">
                Entwicklungs-Board
              </Link>
              {mailPostfachDaAktiv && (
                <Link to="/mail-postfach" className="kopfzeile-menue-eintrag" role="menuitem">
                  Mail-Postfach
                </Link>
              )}
            </KopfzeilenMenue>
          )}
          <NavLink
            to="/einstellungen"
            className={({ isActive }) =>
              isActive ? "kopfzeile-link kopfzeile-symbol kopfzeile-link-aktiv" : "kopfzeile-link kopfzeile-symbol"
            }
            aria-label="Einstellungen"
          >
            <span aria-hidden="true">⚙</span>
          </NavLink>
          <NavLink
            to="/hilfe"
            className={({ isActive }) =>
              isActive ? "kopfzeile-link kopfzeile-symbol kopfzeile-link-aktiv" : "kopfzeile-link kopfzeile-symbol"
            }
            aria-label="Hilfe"
          >
            <span aria-hidden="true">?</span>
          </NavLink>
          {/* "Über" nur für angemeldete Nutzer - die Entwickler-Kontaktseite ist bewusst
              nicht öffentlich (Scam-/Spam-Schutz, siehe UeberPage). */}
          {benutzer && (
            <NavLink
              to="/ueber"
              className={({ isActive }) =>
                isActive ? "kopfzeile-link kopfzeile-symbol kopfzeile-link-aktiv" : "kopfzeile-link kopfzeile-symbol"
              }
              aria-label="Über"
            >
              <span aria-hidden="true">ℹ</span>
            </NavLink>
          )}
          {benutzer && (
            <KopfzeilenMenue
              label={<span aria-hidden="true">👤</span>}
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

/** Root-Route: fuer angemeldete Benutzer die Verwaltungs-Turnierliste, fuer Gaeste die
 *  oeffentliche Startseite (freigegebene Turniere + Anmelde-Link). */
function StartRoute() {
  const { benutzer, laedt } = useAuth();
  if (laedt) return <p>Lädt…</p>;
  return benutzer ? <TurnierListePage /> : <OeffentlicheStartseitePage />;
}

/** Definiert alle Routen der Anwendung (siehe Modul-Kommentar oben zur Trennung
 *  oeffentlich / anmeldepflichtig). */
function App() {
  return (
    <>
      <UmgebungsBanner />
      <Kopfzeile />
      <main>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/ersteinrichtung" element={<ErsteinrichtungPage />} />
          <Route path="/registrieren" element={<RegistrierenPage />} />
          <Route path="/einladung/:token" element={<EinladungAnnehmenPage />} />
          <Route path="/passwort-vergessen" element={<PasswortVergessenPage />} />
          <Route path="/passwort-reset/:token" element={<PasswortResetPage />} />
          <Route path="/ergebnis-erfassung/:tokenWert" element={<ErgebnisErfassungPage />} />
          <Route path="/turniere/:id/code" element={<TurnierCodeAnmeldenPage />} />
          {/* Turnierleitung-Code: volle Verwaltungsansicht ausserhalb von GeschuetzteRoute - die
              Komponente selbst und die darin eingebundenen Tab-Komponenten haengen nicht an
              useAuth(), nur diese Route-Einbettung entscheidet ueber die Anmeldepflicht. */}
          <Route path="/turniere/:id/code/turnierleitung" element={<TurnierVerwaltenPage />} />
          <Route path="/turniere/:id/code/spielleitung" element={<SpielleitungCodePage />} />
          <Route path="/turniere/:id/oeffentlich" element={<OeffentlicheTurnierseitePage />} />
          <Route path="/turniere/:id/oeffentlich/druck" element={<OeffentlicheDruckansichtPage />} />
          <Route path="/einstellungen" element={<EinstellungenPage />} />
          <Route path="/hilfe" element={<HilfePage />} />
          {/* Root ist oeffentlich: Gaeste sehen die Startseite, Angemeldete die Verwaltungsliste. */}
          <Route path="/" element={<StartRoute />} />

          <Route element={<GeschuetzteRoute />}>
            <Route path="/profil" element={<ProfilPage />} />
            <Route path="/ueber" element={<UeberPage />} />
            <Route path="/benutzerverwaltung" element={<BenutzerverwaltungPage />} />
            <Route path="/stammdaten" element={<StammdatenPage />} />
            <Route path="/standardregeln" element={<StandardregelnPage />} />
            <Route path="/systemeinstellungen" element={<SystemeinstellungenPage />} />
            <Route path="/entwicklungs-board" element={<KanbanBoardPage />} />
            <Route path="/mail-postfach" element={<MailPostfachPage />} />
            <Route path="/turniere/neu" element={<TurnierAnlegenPage />} />
            <Route path="/turniere/:id/regeln-erfassen" element={<SpielregelnErfassenPage />} />
            <Route path="/turniere/:id/mannschaften-erfassen" element={<MannschaftenErfassenPage />} />
            <Route path="/turniere/:id/schiedsrichter-erfassen" element={<SchiedsrichterErfassenPage />} />
            <Route path="/turniere/:id/spielplan-erstellen" element={<SpielplanErstellenPage />} />
            <Route path="/turniere/:id/druck" element={<DruckansichtPage />} />
            <Route path="/turniere/:id" element={<TurnierVerwaltenPage />} />
          </Route>
        </Routes>
      </main>
      <Fusszeile />
    </>
  );
}

export default App;
