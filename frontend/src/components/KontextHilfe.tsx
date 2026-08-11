import type { ReactNode } from "react";

interface Props {
  /** Beschriftung des Aufklapp-Knopfs. */
  titel?: string;
  children: ReactNode;
}

/**
 * Kontextbezogene Hilfe fuer eine einzelne Seite - bewusst getrennt von der globalen
 * Hilfe (/hilfe). Auf oeffentlichen/externen Seiten (oeffentliche Turnierseite,
 * Ergebnis-Erfassung per Link) soll nur diese seitenbezogene Hilfe erscheinen, nicht der
 * volle Hilfe-Bereich. Natives <details>/<summary>: tastaturbedienbar und screenreader-
 * tauglich ohne eigenes JavaScript.
 */
export function KontextHilfe({ titel = "Hilfe zu dieser Seite", children }: Props) {
  return (
    <details className="kontext-hilfe">
      <summary>
        <span aria-hidden="true">❓</span> {titel}
      </summary>
      <div className="kontext-hilfe-inhalt">{children}</div>
    </details>
  );
}
