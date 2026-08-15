import { useCallback, useEffect, useRef, useState } from "react";
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

interface KartenFormular {
  titel: string;
  beschreibung: string;
  kategorie: KanbanKategorie;
  prioritaet: KanbanPrioritaet;
  spalte: KanbanSpalte;
}

const LEERES_FORMULAR: KartenFormular = {
  titel: "",
  beschreibung: "",
  kategorie: "feature",
  prioritaet: "mittel",
  spalte: "offen",
};

/** Die fuenf Eingabefelder, die sowohl das "Neue Karte"- als auch das Bearbeiten-Formular (im
 *  Detail-Dialog) brauchen - eigene Komponente statt Kopie, da beide Formulare exakt dieselben
 *  Felder in derselben Anordnung verwenden. */
function KartenFelder({
  formular,
  setFormular,
  idPrefix,
}: {
  formular: KartenFormular;
  setFormular: (updater: (f: KartenFormular) => KartenFormular) => void;
  idPrefix: string;
}) {
  return (
    <>
      <div className="feld">
        <label htmlFor={`${idPrefix}-titel`}>Titel</label>
        <input
          id={`${idPrefix}-titel`}
          required
          value={formular.titel}
          onChange={(e) => setFormular((f) => ({ ...f, titel: e.target.value }))}
        />
      </div>
      <div className="feld">
        <label htmlFor={`${idPrefix}-beschreibung`}>Beschreibung</label>
        <textarea
          id={`${idPrefix}-beschreibung`}
          rows={3}
          value={formular.beschreibung}
          onChange={(e) => setFormular((f) => ({ ...f, beschreibung: e.target.value }))}
        />
      </div>
      <div className="kanban-formular-zeile">
        <div className="feld">
          <label htmlFor={`${idPrefix}-kategorie`}>Kategorie</label>
          <select
            id={`${idPrefix}-kategorie`}
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
          <label htmlFor={`${idPrefix}-prioritaet`}>Priorität</label>
          <select
            id={`${idPrefix}-prioritaet`}
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
          <label htmlFor={`${idPrefix}-spalte`}>Spalte</label>
          <select
            id={`${idPrefix}-spalte`}
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
    </>
  );
}

/**
 * Entwicklungs-Kanban-Board (nur Admins, nur Entwicklungsinstanz - siehe App.tsx, das den
 * Menuepunkt/die Route nur bei kanbanBoardVerfuegbar() zeigt). Eigenstaendiges Werkzeug zur
 * Organisation der Weiterentwicklung, ohne Bezug zum Torball-Fachmodell.
 *
 * Die Karten auf dem Board zeigen bewusst nur Titel + Badges (Kategorie/Prioritaet/KI/Notizen) -
 * Beschreibung, Absender, Bearbeiten-Formular und Notizen sitzen im Detail-Dialog (natives
 * <dialog>, per Klick auf den Titel), sonst nahm jede Karte zu viel Platz auf dem Board ein
 * (Nutzer-Vorgabe, live aufgefallen).
 */
export function KanbanBoardPage() {
  const [karten, setKarten] = useState<KanbanKarte[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();
  const [geladen, setGeladen] = useState(false);

  const [formular, setFormular] = useState<KartenFormular>(LEERES_FORMULAR);

  const [detailKarteId, setDetailKarteId] = useState<string | undefined>();
  const [detailFormular, setDetailFormular] = useState<KartenFormular>(LEERES_FORMULAR);
  const [neueNotiz, setNeueNotiz] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  // Das native <dialog> uebernimmt Fokus-Falle + Ruecksprung des Fokus beim Schliessen selbst -
  // hier nur showModal()/close() an den React-State (detailKarteId) koppeln.
  useEffect(() => {
    if (detailKarteId) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [detailKarteId]);

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
      await createKanbanKarte(daten);
      setFormular(LEERES_FORMULAR);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
    }
  }

  function detailsOeffnen(karte: KanbanKarte) {
    setDetailKarteId(karte._id);
    setDetailFormular({
      titel: karte.titel,
      beschreibung: karte.beschreibung ?? "",
      kategorie: karte.kategorie,
      prioritaet: karte.prioritaet,
      spalte: karte.spalte,
    });
    setNeueNotiz("");
  }

  // Wird auch vom nativen Esc-Tastendruck/Backdrop-Klick des <dialog> ausgeloest (onClose) - dort
  // haette sich der Dialog bereits selbst geschlossen, hier nur noch den React-State nachziehen.
  function detailsSchliessen() {
    setDetailKarteId(undefined);
  }

  async function detailsSpeichern(event: React.FormEvent) {
    event.preventDefault();
    if (!detailKarteId) return;
    const daten = {
      titel: detailFormular.titel.trim(),
      beschreibung: detailFormular.beschreibung.trim() ? detailFormular.beschreibung.trim() : null,
      kategorie: detailFormular.kategorie,
      prioritaet: detailFormular.prioritaet,
      spalte: detailFormular.spalte,
    };
    try {
      await updateKanbanKarte(detailKarteId, daten);
      await laden();
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
    }
  }

  async function notizHinzufuegen(event: React.FormEvent) {
    event.preventDefault();
    if (!detailKarteId || !neueNotiz.trim()) return;
    try {
      await kanbanNotizHinzufuegen(detailKarteId, neueNotiz.trim());
      setNeueNotiz("");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern der Notiz");
    }
  }

  async function loeschen(karte: KanbanKarte) {
    if (!window.confirm(`Karte „${karte.titel}" wirklich löschen?`)) return;
    try {
      await deleteKanbanKarte(karte._id);
      if (detailKarteId === karte._id) detailsSchliessen();
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
  const detailKarte = detailKarteId ? karten.find((k) => k._id === detailKarteId) : undefined;

  return (
    <>
      <h1>Entwicklungs-Board</h1>
      <p>Kleines Kanban-Board für die Weiterentwicklung (nur für Admins, nur auf dieser Instanz).</p>
      {fehler && <p role="alert">{fehler}</p>}

      <section className="kanban-formular">
        <h2>Neue Karte</h2>
        <form onSubmit={absenden}>
          <KartenFelder formular={formular} setFormular={setFormular} idPrefix="kanban" />
          <div className="kanban-formular-aktionen">
            <button type="submit">Karte anlegen</button>
          </div>
        </form>
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
                          title={`${karte.notizen.length} Notiz(en) – im Detail sichtbar`}
                        >
                          <span aria-hidden="true">📝</span> {karte.notizen.length}
                        </span>
                      )}
                    </div>
                    <h3 className="kanban-karte-titel">
                      <button type="button" className="kanban-karte-titel-knopf" onClick={() => detailsOeffnen(karte)}>
                        {karte.titel}
                      </button>
                    </h3>
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
                      <button
                        type="button"
                        className="button-loeschen"
                        aria-label="Löschen"
                        title="Löschen"
                        onClick={() => loeschen(karte)}
                      >
                        ✕
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="kanban-detail-dialog"
        aria-labelledby="kanban-detail-titel"
        onClose={detailsSchliessen}
      >
        {detailKarte && (
          <>
            <div className="kanban-detail-kopf">
              <h2 id="kanban-detail-titel">{detailKarte.titel}</h2>
              <button
                type="button"
                className="symbol-button"
                aria-label="Schließen"
                title="Schließen"
                onClick={() => dialogRef.current?.close()}
              >
                ✕
              </button>
            </div>
            <div className="kanban-karte-kopf">
              <span className={`kanban-badge kategorie-${detailKarte.kategorie}`}>
                {KATEGORIE_LABEL[detailKarte.kategorie]}
              </span>
              <span className={`kanban-badge prioritaet-${detailKarte.prioritaet}`}>
                {PRIORITAET_LABEL[detailKarte.prioritaet]}
              </span>
              {detailKarte.kiErstellt && (
                <span className="kanban-badge" title="Automatisch aus dem Mail-Postfach erstellt, noch nicht geprüft">
                  KI · ungeprüft
                </span>
              )}
            </div>
            {detailKarte.mailAbsender && (
              <p className="kanban-karte-absender">
                Von: {detailKarte.mailAbsender}
                {detailKarte.quellMailId && (
                  <>
                    {" · "}
                    <Link to={`/mail-postfach?mail=${detailKarte.quellMailId}`}>Original-Mail ansehen</Link>
                  </>
                )}
              </p>
            )}
            <p className="kanban-karte-meta">
              {detailKarte.erstelltVonName ?? "?"}
              {detailKarte.erstelltVonEmail && (
                <>
                  {" "}
                  <a href={`mailto:${detailKarte.erstelltVonEmail}`}>&lt;{detailKarte.erstelltVonEmail}&gt;</a>
                </>
              )}
              {" · "}
              {formatiereZeitstempel(detailKarte.aktualisiertAm)}
            </p>

            <form onSubmit={detailsSpeichern}>
              <KartenFelder formular={detailFormular} setFormular={setDetailFormular} idPrefix="kanban-detail" />
              <div className="kanban-formular-aktionen">
                <button type="submit">Speichern</button>
                <button type="button" className="button-loeschen" onClick={() => loeschen(detailKarte)}>
                  Karte löschen
                </button>
              </div>
            </form>

            <div className="kanban-notizen">
              <h3>Notizen</h3>
              <p className="feld-hinweis">Aktionen, Gedanken, Änderungsvorschläge – nur hier im Detail sichtbar.</p>
              {detailKarte.notizen && detailKarte.notizen.length > 0 ? (
                <ul className="kanban-notizen-liste">
                  {detailKarte.notizen.map((notiz, index) => (
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
                  <label htmlFor="kanban-detail-neue-notiz">Neue Notiz</label>
                  <textarea
                    id="kanban-detail-neue-notiz"
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
          </>
        )}
      </dialog>
    </>
  );
}
