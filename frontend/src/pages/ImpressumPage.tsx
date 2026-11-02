import { BETREIBER } from "../rechtliches";

/** Impressum (Angaben nach § 5 DDG). Alle Angaben stehen in rechtliches.ts. */
export function ImpressumPage() {
  return (
    <>
      <h1>Impressum</h1>

      {BETREIBER.entwurf && (
        <p role="note">
          <strong>Entwurf:</strong> Dieser Text ist noch nicht rechtlich geprüft und gilt erst, wenn er freigegeben ist.
        </p>
      )}

      <h2>Angaben nach § 5 DDG</h2>
      <p>
        {BETREIBER.name}
        {BETREIBER.anschrift.length > 0 ? (
          BETREIBER.anschrift.map((zeile) => (
            <span key={zeile}>
              <br />
              {zeile}
            </span>
          ))
        ) : (
          <>
            <br />
            <strong>[Anschrift fehlt noch – bitte in rechtliches.ts eintragen]</strong>
          </>
        )}
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href={`mailto:${BETREIBER.email}`}>{BETREIBER.email}</a>
        {BETREIBER.telefon && (
          <>
            <br />
            Telefon: {BETREIBER.telefon}
          </>
        )}
      </p>

      <h2>Verantwortlich für Inhalte</h2>
      <p>
        {BETREIBER.name}, Anschrift wie oben. Die Inhalte der einzelnen Turnierseiten stellen die jeweiligen Turnierleitungen
        ein.
      </p>

      <h2>Über diese Anwendung</h2>
      <p>
        Torball-Turniere ist eine kostenlose, nicht kommerzielle Anwendung. Der Quellcode ist frei (Lizenz GNU AGPL 3.0) und liegt
        auf <a href="https://github.com/PeterScheurich/Torball">GitHub</a>.
      </p>
    </>
  );
}
