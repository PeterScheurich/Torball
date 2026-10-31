import { useEffect, useState } from "react";
import type { TurniermodusVorlage } from "@torball/shared";
import { baueModusPlan, quelleText, standardModusEinstellungen } from "@torball/shared";
import { getTurniermodi } from "../api";

/**
 * Admin → „Turniermodi“: die Vorlagen, aus denen die Turnierleitung beim Anlegen eines Turniers wählt
 * (Auftraggeber-Konzept 31.10.2026). Stufe 1: ansehen. Die mitgelieferten Vorlagen sind schreibgeschützt;
 * eigene Vorlagen (Editor, Kopieren, Export/Import als Datei) folgen in einer weiteren Ausbaustufe.
 * Vorlagen anzulegen ist Sache der Administration - die Turnierleitung wählt nur aus. Eine lokal
 * angelegte Vorlage wird bewusst NICHT mit der Internet-Instanz synchronisiert; ein Turnier trägt eine
 * Kopie seiner Vorlage und läuft deshalb überall.
 */

/** Beispielzahlen für den Beispielablauf: zwei Gruppen mit 5 und 6 Mannschaften bzw. eine Gruppe mit 8. */
function beispielGroessen(v: TurniermodusVorlage): number[] {
  return v.gruppen === 2 ? [5, 6] : [8];
}

export function TurniermodiPage() {
  const [vorlagen, setVorlagen] = useState<TurniermodusVorlage[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();

  useEffect(() => {
    getTurniermodi()
      .then(setVorlagen)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Die Turniermodi konnten nicht geladen werden."));
  }, []);

  return (
    <>
      <h1>Turniermodi</h1>
      {fehler && <p role="alert">{fehler}</p>}
      <p>
        Ein Turniermodus legt den Ablauf eines Turniers fest – Vorrunde, Gruppen, Endrunde. Die Zahlen (Mannschaften
        je Gruppe, Größe der Endrunde) stellt die Turnierleitung je Turnier selbst ein. Die Vorlagen sind
        schreibgeschützt; eigene Vorlagen anzulegen und zu kopieren folgt in einer späteren Ausbaustufe. Ein Turnier
        trägt eine Kopie seiner Vorlage – eine spätere Änderung einer Vorlage verändert kein laufendes Turnier.
      </p>

      {vorlagen.map((v) => {
        const einstellungen = standardModusEinstellungen(v);
        const groessen = beispielGroessen(v);
        const plan = baueModusPlan(v, einstellungen, groessen);
        return (
          <section key={v.id} aria-labelledby={`modus-${v.id}`}>
            <h2 id={`modus-${v.id}`}>{v.name}</h2>
            <p>{v.beschreibung}</p>
            <dl>
              <dt>Gruppen in der Vorrunde</dt>
              <dd>{v.gruppen === 2 ? "Zwei (A und B), jeder gegen jeden in der Gruppe" : "Eine, jeder gegen jeden"}</dd>
              <dt>Vorrunde</dt>
              <dd>{v.doppeltWaehlbar ? "einfach oder doppelt wählbar" : "einfach"}</dd>
              <dt>Mögliche Endrunden</dt>
              <dd>
                {v.endrundeGroessen.map((g) => (g === 0 ? "keine" : `${g} Mannschaften`)).join(", ")} (Standard:{" "}
                {v.standardEndrunde === 0 ? "keine" : `${v.standardEndrunde} Mannschaften`})
              </dd>
              <dt>Spiel um Platz 3</dt>
              <dd>Standard: {v.platz3Standard ? "ja" : "nein"}</dd>
              <dt>Platzierungsspiele</dt>
              <dd>Standard: {v.platzierungsspieleStandard ? "ja" : "nein"}</dd>
              <dt>Eigenschaften</dt>
              <dd>
                {v.eingebaut ? "mitgeliefert, schreibgeschützt" : "eigene Vorlage"}
                {v.endrundeTeilnehmerGerade && "; die Endrunde hat immer eine gerade Zahl von Mannschaften"}
              </dd>
            </dl>

            {plan.spiele.length > 0 && (
              <details>
                <summary>
                  Beispielablauf mit Standardeinstellungen (
                  {v.gruppen === 2
                    ? `Gruppe A: ${groessen[0]}, Gruppe B: ${groessen[1]} Mannschaften`
                    : `${groessen[0]} Mannschaften`}
                  )
                </summary>
                <ol>
                  {plan.spiele.map((s) => (
                    <li key={s.planId}>
                      <strong>{s.bezeichnung}:</strong> {quelleText(s.quelleA, plan.spiele)} –{" "}
                      {quelleText(s.quelleB, plan.spiele)}
                    </li>
                  ))}
                </ol>
                {plan.hinweise.length > 0 && (
                  <ul>
                    {plan.hinweise.map((h, i) => (
                      <li key={i}>{h.text}</li>
                    ))}
                  </ul>
                )}
              </details>
            )}
          </section>
        );
      })}
    </>
  );
}
