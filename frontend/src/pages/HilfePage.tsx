import { HILFE_THEMEN, type HilfeBlock } from "../hilfe/inhalte";

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
    </>
  );
}
