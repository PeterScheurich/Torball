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
import { ProtokollantCodePage } from "./pages/ProtokollantCodePage";
import { ProtokollPage } from "./pages/ProtokollPage";
import { OeffentlicheTurnierseitePage } from "./pages/OeffentlicheTurnierseitePage";
import { OeffentlicheStartseitePage } from "./pages/OeffentlicheStartseitePage";
import { ProfilPage } from "./pages/ProfilPage";
import { BenutzerverwaltungPage } from "./pages/BenutzerverwaltungPage";
import { StammdatenPage } from "./pages/StammdatenPage";
import { SchiedsrichterStammdatenPage } from "./pages/SchiedsrichterStammdatenPage";
import { StandardregelnPage } from "./pages/StandardregelnPage";
import { SystemeinstellungenPage } from "./pages/SystemeinstellungenPage";
import { WartungVerwaltenPage } from "./pages/WartungVerwaltenPage";
import { WartungPage } from "./pages/WartungPage";
import { KanbanBoardPage } from "./pages/KanbanBoardPage";
import { MailPostfachPage } from "./pages/MailPostfachPage";
import { EinstellungenPage } from "./pages/EinstellungenPage";
import { HilfePage } from "./pages/HilfePage";
import { UeberPage } from "./pages/UeberPage";
import { FehlerMeldenPage } from "./pages/FehlerMeldenPage";
import { GeschuetzteRoute } from "./components/GeschuetzteRoute";
import { KopfzeilenMenue } from "./components/KopfzeilenMenue";
import { UmgebungsBanner } from "./components/UmgebungsBanner";
import { LokaleInstallationBanner } from "./components/LokaleInstallationBanner";
import { Fusszeile } from "./components/Fusszeile";
import { useAuth } from "./auth";
import { getWartungStatus, kanbanBoardVerfuegbar, mailPostfachVerfuegbar } from "./api";
import type { WartungStatus } from "@torball/shared";
import { formatiereZeitstempel } from "./format";

/** Ab wie vielen Minuten vor dem angekuendigten Beginn angemeldete Personen den
 *  Kurzfrist-Hinweis sehen (Nutzer-Vorgabe: 15 Minuten). */
const WARTUNG_KURZFRIST_MINUTEN = 15;

/** Pfade, die auch bei aktiver Wartungssperre normal erreichbar bleiben muessen - sonst koennte
 *  sich eine Admin-Person waehrend der Sperre nicht mehr anmelden, um sie aufzuheben. Analog zur
 *  Backend-Ausnahmeliste in backend/src/wartung.ts. */
function wartungAusgenommenerPfad(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/passwort-vergessen" ||
    pathname === "/ersteinrichtung" ||
    pathname.startsWith("/passwort-reset/")
  );
}

function istInZukunft(iso: string | undefined): boolean {
  return Boolean(iso) && new Date(iso!).getTime() > Date.now();
}

/** Persistenter Kopfzeilen-Hinweis fuer angemeldete Personen ab WARTUNG_KURZFRIST_MINUTEN vor dem
 *  angekuendigten Beginn - unabhaengig von der eigentlichen Sperre (die schaltet die Turnierleitung
 *  separat und manuell scharf, siehe WartungVerwaltenPage). */
function WartungKurzfristHinweis({ wartung }: { wartung?: WartungStatus }) {
  const { benutzer } = useAuth();
  if (!benutzer || !wartung?.angekuendigtAb) return null;
  const minutenBis = (new Date(wartung.angekuendigtAb).getTime() - Date.now()) / 60_000;
  if (minutenBis <= 0 || minutenBis > WARTUNG_KURZFRIST_MINUTEN) return null;
  return (
    <div className="wartungs-banner" role="alert">
      ⚠ In Kürze beginnt eine Wartung (ab {formatiereZeitstempel(wartung.angekuendigtAb)}) – bitte schließe deine
      Arbeit vorher ab, um Datenverlust zu vermeiden.
    </div>
  );
}

/** Warnhinweis auf der Startseite, solange ein angekuendigtes Zeitfenster in der Zukunft liegt -
 *  fuer jede Person sichtbar, auch nicht angemeldete Besucher. */
function WartungAnkuendigung({ wartung }: { wartung?: WartungStatus }) {
  if (!istInZukunft(wartung?.angekuendigtAb)) return null;
  return (
    <p className="wartungs-ankuendigung" role="alert">
      ⚠ Geplante Wartung{" "}
      {wartung!.angekuendigtBis
        ? `von ${formatiereZeitstempel(wartung!.angekuendigtAb!)} bis ${formatiereZeitstempel(wartung!.angekuendigtBis)}`
        : `ab ${formatiereZeitstempel(wartung!.angekuendigtAb!)}`}
      . Das System steht in diesem Zeitraum voraussichtlich nicht zur Verfügung.
    </p>
  );
}

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

  // Entwicklungs-Kanban-Board: gleiches Muster, nur auf der Entwicklungsinstanz aktiv
  // (KANBAN_BOARD_AKTIV, siehe backend/src/routes/kanban.ts).
  const [kanbanBoardDaAktiv, setKanbanBoardDaAktiv] = useState(false);
  useEffect(() => {
    kanbanBoardVerfuegbar()
      .then((r) => setKanbanBoardDaAktiv(r.verfuegbar))
      .catch(() => setKanbanBoardDaAktiv(false));
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
              aktiv={
                pathname.startsWith("/stammdaten") ||
                pathname.startsWith("/schiedsrichter-stammdaten") ||
                pathname.startsWith("/benutzerverwaltung")
              }
            >
              <Link to="/stammdaten" className="kopfzeile-menue-eintrag" role="menuitem">
                Vereine &amp; Teams
              </Link>
              <Link to="/schiedsrichter-stammdaten" className="kopfzeile-menue-eintrag" role="menuitem">
                Schiedsrichter
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
                pathname.startsWith("/wartung") ||
                pathname.startsWith("/entwicklungs-board") ||
                pathname.startsWith("/mail-postfach")
              }
            >
              <Link to="/systemeinstellungen" className="kopfzeile-menue-eintrag" role="menuitem">
                Systemeinstellungen
              </Link>
              <Link to="/wartung" className="kopfzeile-menue-eintrag" role="menuitem">
                Wartungsmodus
              </Link>
              {kanbanBoardDaAktiv && (
                <Link to="/entwicklungs-board" className="kopfzeile-menue-eintrag" role="menuitem">
                  Entwicklungs-Board
                </Link>
              )}
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
 *  oeffentliche Startseite (freigegebene Turniere + Anmelde-Link). Zeigt vorab den
 *  Wartungs-Warnhinweis, falls ein Zeitfenster angekuendigt ist. */
function StartRoute({ wartung }: { wartung?: WartungStatus }) {
  const { benutzer, laedt } = useAuth();
  if (laedt) return <p>Lädt…</p>;
  return (
    <>
      <WartungAnkuendigung wartung={wartung} />
      {benutzer ? <TurnierListePage /> : <OeffentlicheStartseitePage />}
    </>
  );
}

/** Definiert alle Routen der Anwendung (siehe Modul-Kommentar oben zur Trennung
 *  oeffentlich / anmeldepflichtig). */
function App() {
  const { benutzer } = useAuth();
  const { pathname } = useLocation();

  // Wartungsstatus per Polling (analog anderen "Live-Aktualisierung"-Stellen im Projekt, siehe
  // CLAUDE.md) - reagiert so auch fuer bereits offene Tabs, wenn eine Admin-Person die Sperre
  // ein-/ausschaltet, ohne dass alle Betroffenen die Seite neu laden muessten.
  const [wartung, setWartung] = useState<WartungStatus | undefined>();
  useEffect(() => {
    let abgebrochen = false;
    async function pruefen() {
      try {
        const status = await getWartungStatus();
        if (!abgebrochen) setWartung(status);
      } catch {
        // Best effort - z.B. Backend kurz nicht erreichbar; letzter bekannter Stand bleibt stehen.
      }
    }
    pruefen();
    const intervall = setInterval(() => {
      if (document.visibilityState === "visible") pruefen();
    }, 30_000);
    document.addEventListener("visibilitychange", pruefen);
    return () => {
      abgebrochen = true;
      clearInterval(intervall);
      document.removeEventListener("visibilitychange", pruefen);
    };
  }, []);

  const istAdmin = benutzer?.globaleRolle === "admin";
  // Waehrend aktiver Sperre sehen alle ausser angemeldeten Admins nur die Wartungsseite - mit
  // Ausnahme der Pfade, die fuer eine Anmeldung erreichbar bleiben muessen (siehe oben). Das
  // Backend blockiert unabhaengig davon dieselben Anfragen zusaetzlich serverseitig (siehe
  // backend/src/wartung.ts) - diese Frontend-Sperre ist die Oberflaechen-Haelfte davon.
  const gesperrt = Boolean(wartung?.aktiv) && !istAdmin && !wartungAusgenommenerPfad(pathname);

  return (
    <>
      <UmgebungsBanner />
      <LokaleInstallationBanner />
      {wartung?.aktiv && istAdmin && (
        <div className="wartungs-banner" role="alert">
          ⚠ Wartungsmodus ist aktiv – andere Personen sehen aktuell nur die Wartungsseite.
        </div>
      )}
      <WartungKurzfristHinweis wartung={wartung} />
      <Kopfzeile />
      <main>
        {gesperrt ? (
          <WartungPage wartung={wartung} />
        ) : (
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
            <Route path="/turniere/:id/code/protokollant" element={<ProtokollantCodePage />} />
            {/* Live-Protokollierung ebenfalls ausserhalb von GeschuetzteRoute: erreichbar fuer
                Benutzer- UND Turnier-Code-Sessions (insbesondere den Protokollant-Code) - die
                Zugriffskontrolle liegt rein serverseitig (darfProtokollieren). */}
            <Route path="/turniere/:turnierId/spiele/:spielId/protokoll" element={<ProtokollPage />} />
            <Route path="/turniere/:id/oeffentlich" element={<OeffentlicheTurnierseitePage />} />
            <Route path="/turniere/:id/oeffentlich/druck" element={<OeffentlicheDruckansichtPage />} />
            <Route path="/einstellungen" element={<EinstellungenPage />} />
            <Route path="/hilfe" element={<HilfePage />} />
            {/* Root ist oeffentlich: Gaeste sehen die Startseite, Angemeldete die Verwaltungsliste. */}
            <Route path="/" element={<StartRoute wartung={wartung} />} />

            <Route element={<GeschuetzteRoute />}>
              <Route path="/profil" element={<ProfilPage />} />
              <Route path="/ueber" element={<UeberPage />} />
              <Route path="/fehler-melden" element={<FehlerMeldenPage />} />
              <Route path="/benutzerverwaltung" element={<BenutzerverwaltungPage />} />
              <Route path="/stammdaten" element={<StammdatenPage />} />
              <Route path="/schiedsrichter-stammdaten" element={<SchiedsrichterStammdatenPage />} />
              <Route path="/standardregeln" element={<StandardregelnPage />} />
              <Route path="/systemeinstellungen" element={<SystemeinstellungenPage />} />
              <Route path="/wartung" element={<WartungVerwaltenPage />} />
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
        )}
      </main>
      <Fusszeile />
    </>
  );
}

export default App;
