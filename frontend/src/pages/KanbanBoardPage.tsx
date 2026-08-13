import { useCallback, useEffect, useRef, useState } from "react";
import type { KanbanKarte, KanbanKategorie, KanbanPrioritaet, KanbanSpalte } from "@torball/shared";
import {
  createKanbanKarte,
  deleteKanbanKarte,
  getKanbanBoard,
  kanbanImportAnwenden,
  kanbanImportVorschau,
  kanbanKarteVerschieben,
  updateKanbanKarte,
  type KanbanImportErgebnis,
  type KanbanImportVorschau,
  type KanbanKonfliktWahl,
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
 * Entwicklungs-Kanban-Board (nur Admins). Eigenstaendiges Werkzeug zur Organisation der
 * Weiterentwicklung, ohne Bezug zum Torball-Fachmodell. Sync zwischen Instanzen (Dev/Prod)
 * ueber JSON-Export/-Import: Export ueberall, Import/Merge nur wo freigeschaltet (Dev).
 */
export function KanbanBoardPage() {
  const [karten, setKarten] = useState<KanbanKarte[]>([]);
  const [syncAktiv, setSyncAktiv] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [geladen, setGeladen] = useState(false);

  const [formular, setFormular] = useState(LEERES_FORMULAR);
  const [bearbeiteId, setBearbeiteId] = useState<string | undefined>();

  const [importErgebnis, setImportErgebnis] = useState<KanbanImportErgebnis | undefined>();
  // Zweistufiger Import: erst Vorschau (mit Konflikten), dann nach Entscheidung anwenden.
  const [vorschau, setVorschau] = useState<KanbanImportVorschau | undefined>();
  const [eingeleseneKarten, setEingeleseneKarten] = useState<KanbanKarte[]>([]);
  const [wahlen, setWahlen] = useState<Record<string, KanbanKonfliktWahl>>({});
  const [importLaeuft, setImportLaeuft] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const laden = useCallback(async () => {
    try {
      const board = await getKanbanBoard();
      setKarten(board.karten);
      setSyncAktiv(board.syncAktiv);
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

  function exportieren() {
    const inhalt = {
      typ: "torball-kanban-export",
      formatVersion: 1,
      exportiertAm: new Date().toISOString(),
      karten,
    };
    const blob = new Blob([JSON.stringify(inhalt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const datum = new Date().toISOString().slice(0, 10);
    a.download = `kanban-export-${datum}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importAbbrechen() {
    setVorschau(undefined);
    setEingeleseneKarten([]);
    setWahlen({});
  }

  // Schritt 1: Datei einlesen -> Vorschau holen (schreibt noch nichts). Konflikte werden
  // vorbelegt mit "lokal" (nichts wird ungefragt überschrieben); der neuere Stand wird nur
  // markiert, nicht automatisch genommen.
  async function dateiGewaehlt(event: React.ChangeEvent<HTMLInputElement>) {
    const datei = event.target.files?.[0];
    event.target.value = "";
    if (!datei) return;
    setImportErgebnis(undefined);
    importAbbrechen();
    try {
      const text = await datei.text();
      const geparst = JSON.parse(text);
      const liste = Array.isArray(geparst) ? geparst : geparst?.karten;
      if (!Array.isArray(liste)) {
        throw new Error("Die Datei enthält keine gültige Kartenliste.");
      }
      const v = await kanbanImportVorschau(liste);
      setEingeleseneKarten(liste as KanbanKarte[]);
      setVorschau(v);
      setWahlen(Object.fromEntries(v.konflikte.map((k) => [k.kanbanId, "lokal" as KanbanKonfliktWahl])));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Import-Vorschau fehlgeschlagen");
    }
  }

  // Schritt 2: mit den getroffenen Entscheidungen anwenden.
  async function importAnwenden() {
    if (!vorschau) return;
    setImportLaeuft(true);
    try {
      const ergebnis = await kanbanImportAnwenden(eingeleseneKarten, wahlen);
      setImportErgebnis(ergebnis);
      importAbbrechen();
      setFehler(undefined);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Import fehlgeschlagen");
    } finally {
      setImportLaeuft(false);
    }
  }

  function alleKonflikte(wahl: KanbanKonfliktWahl) {
    if (!vorschau) return;
    setWahlen(Object.fromEntries(vorschau.konflikte.map((k) => [k.kanbanId, wahl])));
  }

  const spaltenKarten = (spalte: KanbanSpalte) => karten.filter((k) => k.spalte === spalte);

  return (
    <>
      <h1>Entwicklungs-Board</h1>
      <p>
        Kleines Kanban-Board für die Weiterentwicklung (nur für Admins). Der Abgleich zwischen den
        Umgebungen läuft über Export/Import als JSON-Datei – ein zentraler Server ist dafür nicht nötig.
      </p>
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
                    </div>
                    <h3 className="kanban-karte-titel">{karte.titel}</h3>
                    {karte.beschreibung && <p className="kanban-karte-text">{karte.beschreibung}</p>}
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

      <section className="kanban-sync">
        <h2>Abgleich zwischen den Umgebungen</h2>
        <p>
          Karten als JSON-Datei exportieren und auf einer anderen Instanz wieder importieren. Der Import
          zeigt zuerst eine Vorschau; bei Konflikten (dieselbe Karte, aber unterschiedlicher Stand)
          entscheidest du je Karte, welche Fassung gewinnt – es wird nichts automatisch überschrieben.
        </p>
        <div className="kanban-sync-aktionen">
          <button type="button" onClick={exportieren} disabled={karten.length === 0}>
            Export (JSON herunterladen)
          </button>
          {syncAktiv ? (
            <>
              <button type="button" onClick={() => importInputRef.current?.click()}>
                Import (JSON einlesen)
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={dateiGewaehlt}
              />
            </>
          ) : (
            <span className="feld-hinweis">
              Import ist auf dieser Instanz nicht freigeschaltet (nur auf der Entwicklungs-Instanz).
            </span>
          )}
        </div>

        {vorschau && (
          <div className="kanban-import-vorschau">
            <h3>Import-Vorschau</h3>
            <p>
              {vorschau.neu.length} neu, {vorschau.identisch} unverändert, {vorschau.konflikte.length} Konflikt(e)
              {vorschau.uebersprungen > 0 ? `, ${vorschau.uebersprungen} übersprungen` : ""}.
            </p>

            {vorschau.konflikte.length > 0 && (
              <>
                <p className="feld-hinweis">
                  Bitte je Konflikt wählen, welche Fassung übernommen wird. Vorbelegt ist „lokal behalten".
                </p>
                <div className="kanban-sync-aktionen">
                  <button type="button" onClick={() => alleKonflikte("lokal")}>
                    Alle: lokal behalten
                  </button>
                  <button type="button" onClick={() => alleKonflikte("eingehend")}>
                    Alle: importierte übernehmen
                  </button>
                </div>
                <ul className="kanban-konflikte">
                  {vorschau.konflikte.map((k) => {
                    const lokalNeuer = k.lokal.aktualisiertAm >= k.eingehend.aktualisiertAm;
                    return (
                      <li key={k.kanbanId} className="kanban-konflikt">
                        <fieldset>
                          <legend>{k.lokal.titel !== k.eingehend.titel ? `${k.lokal.titel} ↔ ${k.eingehend.titel}` : k.lokal.titel}</legend>
                          <div className="kanban-konflikt-seiten">
                            <label className="kanban-konflikt-seite">
                              <input
                                type="radio"
                                name={`konflikt-${k.kanbanId}`}
                                checked={wahlen[k.kanbanId] === "lokal"}
                                onChange={() => setWahlen((w) => ({ ...w, [k.kanbanId]: "lokal" }))}
                              />
                              <span>
                                <strong>Lokal behalten{lokalNeuer ? " (neuer)" : ""}</strong>
                                <br />
                                {konfliktZusammenfassung(k.lokal)}
                              </span>
                            </label>
                            <label className="kanban-konflikt-seite">
                              <input
                                type="radio"
                                name={`konflikt-${k.kanbanId}`}
                                checked={wahlen[k.kanbanId] === "eingehend"}
                                onChange={() => setWahlen((w) => ({ ...w, [k.kanbanId]: "eingehend" }))}
                              />
                              <span>
                                <strong>Importierte übernehmen{!lokalNeuer ? " (neuer)" : ""}</strong>
                                <br />
                                {konfliktZusammenfassung(k.eingehend)}
                              </span>
                            </label>
                          </div>
                        </fieldset>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className="kanban-sync-aktionen">
              <button type="button" onClick={importAnwenden} disabled={importLaeuft}>
                {importLaeuft ? "Wird importiert…" : "Importieren"}
              </button>
              <button type="button" onClick={importAbbrechen} disabled={importLaeuft}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {importErgebnis && (
          <p role="status">
            Import abgeschlossen: {importErgebnis.eingefuegt} neu, {importErgebnis.ueberschrieben} überschrieben,{" "}
            {importErgebnis.lokalBehalten} lokal behalten, {importErgebnis.identisch} unverändert
            {importErgebnis.offen > 0 ? `, ${importErgebnis.offen} offen` : ""}
            {importErgebnis.uebersprungen > 0 ? `, ${importErgebnis.uebersprungen} übersprungen` : ""}.
          </p>
        )}
      </section>
    </>
  );
}

/** Kompakte Ein-Zeilen-Beschreibung einer Konfliktseite für die Auswahl. */
function konfliktZusammenfassung(karte: KanbanKarte): string {
  const teile = [
    SPALTEN_LABEL[karte.spalte],
    KATEGORIE_LABEL[karte.kategorie],
    PRIORITAET_LABEL[karte.prioritaet],
    formatiereZeitstempel(karte.aktualisiertAm),
  ];
  const autor = [karte.erstelltVonName, karte.erstelltVonEmail].filter(Boolean).join(" ");
  if (autor) teile.push(autor);
  return teile.join(" · ");
}
