import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { KanbanKarte, KanbanKategorie, KanbanPrioritaet, KanbanSpalte } from "@torball/shared";
import {
  createKanbanKarte,
  deleteKanbanKarte,
  getKanbanBoard,
  kanbanKarteVerschieben,
  kanbanNotizHinzufuegen,
  updateKanbanKarte,
} from "../api";
import { formatiereZeitstempel } from "../format";

const SPALTEN: KanbanSpalte[] = ["offen", "inArbeit", "testen", "erledigt"];
const SPALTEN_LABEL: Record<KanbanSpalte, string> = {
  offen: "Offen",
  inArbeit: "In Arbeit",
  testen: "Testen",
  erledigt: "Erledigt",
};
const KATEGORIEN: KanbanKategorie[] = ["bug", "feature", "wunsch", "aufgabe", "sonstiges"];
const KATEGORIE_LABEL: Record<KanbanKategorie, string> = {
  bug: "Bug",
  feature: "Feature",
  wunsch: "Wunsch",
  aufgabe: "Aufgabe",
  sonstiges: "Sonstiges",
};
const PRIORITAETEN: KanbanPrioritaet[] = ["hoch", "mittel", "niedrig"];
const PRIORITAET_LABEL: Record<KanbanPrioritaet, string> = {
  hoch: "Hoch",
  mittel: "Mittel",
  niedrig: "Niedrig",
};

const LEERES_FORMULAR = {
  titel: "",
  beschreibung: "",
  kategorie: "feature" as KanbanKategorie,
  prioritaet: "mittel" as KanbanPrioritaet,
  spalte: "offen" as KanbanSpalte,
};

/**
 * Entwicklungs-Kanban-Board (nur Admins, nur Entwicklungsinstanz - siehe App.tsx, das den
 * Menuepunkt/die Route nur bei kanbanBoardVerfuegbar() zeigt). Eigenstaendiges Werkzeug zur
 * Organisation der Weiterentwicklung, ohne Bezug zum Torball-Fachmodell.
 */
export function KanbanBoardPage() {
  const [karten, setKarten] = useState<KanbanKarte[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();
  const [geladen, setGeladen] = useState(false);

  const [formular, setFormular] = useState(LEERES_FORMULAR);
  const [bearbeiteId, setBearbeiteId] = useState<string | undefined>();
  const [neueNotiz, setNeueNotiz] = useState("");

  const laden = useCallback(async () => {
    try {
      const board = await getKanbanBoard();
      setKarten(board.karten);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    } finally {
      setGeladen(true);
    }
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  function formularZuruecksetzen() {
    setFormular(LEERES_FORMULAR);
    setBearbeiteId(undefined);
    setNeueNotiz("");
  }

  async function notizHinzufuegen(event: React.FormEvent) {
    event.preventDefault();
    if (!bearbeiteId || !neueNotiz.trim()) return;
    try {
      await kanbanNotizHinzufuegen(bearbeiteId, neueNotiz.trim());
      setNeueNotiz("");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern der Notiz");
    }
  }

  async function absenden(event: React.FormEvent) {
    event.preventDefault();
    const daten = {
      titel: formular.titel.trim(),
      beschreibung: formular.beschreibung.trim() ? formular.beschreibung.trim() : null,
      kategorie: formular.kategorie,
      prioritaet: formular.prioritaet,
      spalte: formular.spalte,
    };
    try {
      if (bearbeiteId) {
        await updateKanbanKarte(bearbeiteId, daten);
      } else {
        await createKanbanKarte(daten);
      }
      formularZuruecksetzen();
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
    }
  }

  function bearbeiten(karte: KanbanKarte) {
    setBearbeiteId(karte._id);
    setFormular({
      titel: karte.titel,
      beschreibung: karte.beschreibung ?? "",
      kategorie: karte.kategorie,
      prioritaet: karte.prioritaet,
      spalte: karte.spalte,
    });
    // An den Anfang scrollen, damit das Formular sichtbar ist.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loeschen(karte: KanbanKarte) {
    if (!window.confirm(`Karte „${karte.titel}" wirklich löschen?`)) return;
    try {
      await deleteKanbanKarte(karte._id);
      if (bearbeiteId === karte._id) formularZuruecksetzen();
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen");
    }
  }

  async function verschieben(karte: KanbanKarte, richtung: "hoch" | "runter") {
    try {
      setKarten(await kanbanKarteVerschieben(karte._id, richtung));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Verschieben");
    }
  }

  async function spalteWechseln(karte: KanbanKarte, ziel: KanbanSpalte) {
    try {
      await updateKanbanKarte(karte._id, {
        titel: karte.titel,
        beschreibung: karte.beschreibung ?? null,
        kategorie: karte.kategorie,
        prioritaet: karte.prioritaet,
        spalte: ziel,
      });
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Verschieben");
    }
  }

  const spaltenKarten = (spalte: KanbanSpalte) => karten.filter((k) => k.spalte === spalte);
  const bearbeiteteKarte = bearbeiteId ? karten.find((k) => k._id === bearbeiteId) : undefined;

  return (
    <>
      <h1>Entwicklungs-Board</h1>
      <p>Kleines Kanban-Board für die Weiterentwicklung (nur für Admins, nur auf dieser Instanz).</p>
      {fehler && <p role="alert">{fehler}</p>}

      <section className="kanban-formular">
        <h2>{bearbeiteId ? "Karte bearbeiten" : "Neue Karte"}</h2>
        <form onSubmit={absenden}>
          <div className="feld">
            <label htmlFor="kanban-titel">Titel</label>
            <input
              id="kanban-titel"
              required
              value={formular.titel}
              onChange={(e) => setFormular((f) => ({ ...f, titel: e.target.value }))}
            />
          </div>
          <div className="feld">
            <label htmlFor="kanban-beschreibung">Beschreibung</label>
            <textarea
              id="kanban-beschreibung"
              rows={3}
              value={formular.beschreibung}
              onChange={(e) => setFormular((f) => ({ ...f, beschreibung: e.target.value }))}
            />
          </div>
          <div className="kanban-formular-zeile">
            <div className="feld">
              <label htmlFor="kanban-kategorie">Kategorie</label>
              <select
                id="kanban-kategorie"
                value={formular.kategorie}
                onChange={(e) => setFormular((f) => ({ ...f, kategorie: e.target.value as KanbanKategorie }))}
              >
                {KATEGORIEN.map((k) => (
                  <option key={k} value={k}>
                    {KATEGORIE_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="feld">
              <label htmlFor="kanban-prioritaet">Priorität</label>
              <select
                id="kanban-prioritaet"
                value={formular.prioritaet}
                onChange={(e) => setFormular((f) => ({ ...f, prioritaet: e.target.value as KanbanPrioritaet }))}
              >
                {PRIORITAETEN.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITAET_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="feld">
              <label htmlFor="kanban-spalte">Spalte</label>
              <select
                id="kanban-spalte"
                value={formular.spalte}
                onChange={(e) => setFormular((f) => ({ ...f, spalte: e.target.value as KanbanSpalte }))}
              >
                {SPALTEN.map((s) => (
                  <option key={s} value={s}>
                    {SPALTEN_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="kanban-formular-aktionen">
            <button type="submit">{bearbeiteId ? "Speichern" : "Karte anlegen"}</button>
            {bearbeiteId && (
              <button type="button" onClick={formularZuruecksetzen}>
                Abbrechen
              </button>
            )}
          </div>
        </form>

        {bearbeiteteKarte && (
          <div className="kanban-notizen">
            <h3>Notizen</h3>
            <p className="feld-hinweis">
              Aktionen, Gedanken, Änderungsvorschläge – werden nicht auf der Karte selbst angezeigt, nur hier beim
              Bearbeiten.
            </p>
            {bearbeiteteKarte.notizen && bearbeiteteKarte.notizen.length > 0 ? (
              <ul className="kanban-notizen-liste">
                {bearbeiteteKarte.notizen.map((notiz, index) => (
                  <li key={index} className="kanban-notiz">
                    <p className="kanban-notiz-text">{notiz.text}</p>
                    <p className="kanban-notiz-meta">
                      {notiz.erstelltVonName ?? "?"} · {formatiereZeitstempel(notiz.erstelltAm)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="kanban-leer">Noch keine Notizen.</p>
            )}
            <form onSubmit={notizHinzufuegen} className="kanban-notiz-formular">
              <div className="feld">
                <label htmlFor="kanban-neue-notiz">Neue Notiz</label>
                <textarea
                  id="kanban-neue-notiz"
                  rows={2}
                  value={neueNotiz}
                  onChange={(e) => setNeueNotiz(e.target.value)}
                />
              </div>
              <button type="submit" disabled={!neueNotiz.trim()}>
                Notiz hinzufügen
              </button>
            </form>
          </div>
        )}
      </section>

      {geladen && (
        <div className="kanban-board">
          {SPALTEN.map((spalte, spaltenIndex) => {
            const inhalt = spaltenKarten(spalte);
            return (
              <section key={spalte} className="kanban-spalte" aria-label={SPALTEN_LABEL[spalte]}>
                <h2 className="kanban-spalte-titel">
                  {SPALTEN_LABEL[spalte]} <span className="kanban-anzahl">{inhalt.length}</span>
                </h2>
                {inhalt.length === 0 && <p className="kanban-leer">Keine Karten.</p>}
                {inhalt.map((karte, index) => (
                  <article key={karte._id} className={`kanban-karte prio-${karte.prioritaet}`}>
                    <div className="kanban-karte-kopf">
                      <span className={`kanban-badge kategorie-${karte.kategorie}`}>
                        {KATEGORIE_LABEL[karte.kategorie]}
                      </span>
                      <span className={`kanban-badge prioritaet-${karte.prioritaet}`}>
                        {PRIORITAET_LABEL[karte.prioritaet]}
                      </span>
                      {karte.kiErstellt && (
                        <span className="kanban-badge" title="Automatisch aus dem Mail-Postfach erstellt, noch nicht geprüft">
                          KI · ungeprüft
                        </span>
                      )}
                      {karte.notizen && karte.notizen.length > 0 && (
                        <span
                          className="kanban-badge"
                          title={`${karte.notizen.length} Notiz(en) – beim Bearbeiten sichtbar`}
                        >
                          <span aria-hidden="true">📝</span> {karte.notizen.length}
                        </span>
                      )}
                    </div>
                    <h3 className="kanban-karte-titel">{karte.titel}</h3>
                    {karte.beschreibung && <p className="kanban-karte-text">{karte.beschreibung}</p>}
                    {karte.mailAbsender && (
                      <p className="kanban-karte-absender">
                        Von: {karte.mailAbsender}
                        {karte.quellMailId && (
                          <>
                            {" · "}
                            <Link to={`/mail-postfach?mail=${karte.quellMailId}`}>Original-Mail ansehen</Link>
                          </>
                        )}
                      </p>
                    )}
                    <p className="kanban-karte-meta">
                      {karte.erstelltVonName ?? "?"}
                      {karte.erstelltVonEmail && (
                        <>
                          {" "}
                          <a href={`mailto:${karte.erstelltVonEmail}`}>&lt;{karte.erstelltVonEmail}&gt;</a>
                        </>
                      )}
                      {" · "}
                      {formatiereZeitstempel(karte.aktualisiertAm)}
                    </p>
                    <div className="kanban-karte-aktionen">
                      <button
                        type="button"
                        aria-label="Nach oben"
                        title="Nach oben"
                        disabled={index === 0}
                        onClick={() => verschieben(karte, "hoch")}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label="Nach unten"
                        title="Nach unten"
                        disabled={index === inhalt.length - 1}
                        onClick={() => verschieben(karte, "runter")}
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        aria-label={`Nach „${SPALTEN_LABEL[SPALTEN[spaltenIndex - 1]] ?? ""}"`}
                        title="Eine Spalte zurück"
                        disabled={spaltenIndex === 0}
                        onClick={() => spalteWechseln(karte, SPALTEN[spaltenIndex - 1])}
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        aria-label={`Nach „${SPALTEN_LABEL[SPALTEN[spaltenIndex + 1]] ?? ""}"`}
                        title="Eine Spalte weiter"
                        disabled={spaltenIndex === SPALTEN.length - 1}
                        onClick={() => spalteWechseln(karte, SPALTEN[spaltenIndex + 1])}
                      >
                        ▶
                      </button>
                      <button type="button" onClick={() => bearbeiten(karte)}>
                        Bearbeiten
                      </button>
                      <button type="button" className="kanban-loeschen" onClick={() => loeschen(karte)}>
                        Löschen
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
