import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HILFE_THEMEN, type HilfeBlock } from "../hilfe/inhalte";
import { useAuth } from "../auth";
// Rohtext der Gesamtspezifikation: per Vite `?raw` zur BUILD-Zeit als String eingebettet.
// Dadurch entspricht die in der App angezeigte Fassung bei jedem Deployment automatisch dem
// aktuellen Stand von docs/torball_gesamtspezifikation.md - es gibt keine zweite, zu
// pflegende Kopie. Der Import liegt bewusst ausserhalb von frontend/src; das ist erlaubt,
// weil Vite die Monorepo-Wurzel (mit docs/) freigibt.
import spezifikationMarkdown from "../../../docs/torball_gesamtspezifikation.md?raw";

/** Rendert einen einzelnen Antwort-Baustein (Absatz, Aufzaehlung, Hinweis oder Vertiefung). */
function Block({ block }: { block: HilfeBlock }) {
  if (typeof block === "string") {
    return <p>{block}</p>;
  }
  if ("liste" in block) {
    return (
      <ul>
        {block.liste.map((eintrag, i) => (
          <li key={i}>{eintrag}</li>
        ))}
      </ul>
    );
  }
  if ("vertiefung" in block) {
    return (
      <details className="hilfe-vertiefung">
        <summary>{block.vertiefung.titel ?? "Mehr Infos"}</summary>
        <div className="hilfe-vertiefung-inhalt">
          {block.vertiefung.text.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </div>
      </details>
    );
  }
  return <p className="hilfe-hinweis">{block.hinweis}</p>;
}

/**
 * In-App-Hilfe (/hilfe). Die Inhalte stehen datengetrennt in hilfe/inhalte.ts -
 * diese Komponente kuemmert sich nur um die Darstellung. Aufklappbare Abschnitte
 * nutzen natives <details>/<summary>: von Haus aus tastaturbedienbar und fuer
 * Screenreader zugaenglich (zentral fuer die Zielgruppe dieser Anwendung), ohne
 * eigenes JavaScript oder ARIA-Nachbau.
 *
 * Bewusst ausserhalb von GeschuetzteRoute (siehe App.tsx): die Hilfe soll auch
 * ohne Login erreichbar sein - u.a. fuer Personen, die nur einen Erfassungslink
 * oder die oeffentliche Seite nutzen.
 */
export function HilfePage() {
  const { benutzer } = useAuth();
  // Die Gesamtspezifikation ist fuer Administratoren UND Manager sichtbar (beide betreuen
  // Turniere/Anwendung), nicht fuer normale Benutzer oder nicht angemeldete Besucher.
  const darfSpezSehen = benutzer?.globaleRolle === "admin" || benutzer?.globaleRolle === "manager";

  return (
    <>
      <h1>Hilfe</h1>
      <p>
        Kurz erklärt, wie die einzelnen Bereiche der Anwendung zusammenspielen. Klappe einen Abschnitt auf, um mehr zu
        erfahren.
      </p>

      <nav aria-label="Themenübersicht" className="hilfe-inhalt">
        <ul>
          {HILFE_THEMEN.map((thema) => (
            <li key={thema.id}>
              <a href={`#${thema.id}`}>{thema.titel}</a>
            </li>
          ))}
          {darfSpezSehen && (
            <li>
              <a href="#spezifikation">Gesamtspezifikation (Admin/Manager)</a>
            </li>
          )}
        </ul>
      </nav>

      {HILFE_THEMEN.map((thema) => (
        <section key={thema.id} id={thema.id} className="hilfe-thema" aria-labelledby={`${thema.id}-titel`}>
          <h2 id={`${thema.id}-titel`}>{thema.titel}</h2>
          <p className="hilfe-kurz">{thema.kurz}</p>

          {thema.abschnitte.map((abschnitt, i) => (
            <details key={i} className="hilfe-abschnitt">
              <summary>{abschnitt.frage}</summary>
              <div className="hilfe-abschnitt-inhalt">
                {abschnitt.text.map((block, j) => (
                  <Block key={j} block={block} />
                ))}
                {abschnitt.bild && (
                  <figure className="hilfe-bild">
                    <img src={abschnitt.bild} alt={abschnitt.bildAlt} loading="lazy" />
                    {abschnitt.bildUnterschrift && <figcaption>{abschnitt.bildUnterschrift}</figcaption>}
                  </figure>
                )}
              </div>
            </details>
          ))}
        </section>
      ))}

      {/* Gesamtspezifikation - bewusst nur fuer Administratoren und Manager. Die verbindliche
          fachliche/technische Referenz gehoert nicht in die allgemeine Endnutzer-Hilfe, ist fuer
          die Betreuung von Turnieren/Anwendung aber praktisch direkt griffbereit. */}
      {darfSpezSehen && (
        <section id="spezifikation" className="hilfe-thema" aria-labelledby="spezifikation-titel">
          <h2 id="spezifikation-titel">Gesamtspezifikation (nur für Administratoren und Manager)</h2>
          <p className="hilfe-kurz">
            Die verbindliche fachliche und technische Spezifikation der Anwendung. Diese Fassung entspricht immer dem
            zuletzt ausgelieferten (deployten) Stand.
          </p>
          <details className="hilfe-abschnitt">
            <summary>Gesamtspezifikation anzeigen</summary>
            <div className="hilfe-abschnitt-inhalt">
              <div className="hilfe-spezifikation">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Tabellen in den horizontal scrollbaren Wrapper legen, damit breite
                    // Tabellen auf schmalen Schirmen die Seite nicht sprengen (siehe .tabellen-wrapper).
                    table: ({ node: _node, ...props }) => (
                      <div className="tabellen-wrapper">
                        <table {...props} />
                      </div>
                    ),
                  }}
                >
                  {spezifikationMarkdown}
                </ReactMarkdown>
              </div>
            </div>
          </details>
        </section>
      )}
    </>
  );
}
