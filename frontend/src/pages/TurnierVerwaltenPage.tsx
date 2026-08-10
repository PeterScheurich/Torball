import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Turnier } from "@torball/shared";
import { getTurnier } from "../api";
import { MannschaftenListe } from "../components/MannschaftenListe";
import { SpielplanVerwaltung } from "../components/SpielplanVerwaltung";
import { formatiereDatum, formatiereUhrzeit } from "../format";

type Tab = "uebersicht" | "mannschaften" | "spielplan";

const TABS: { id: Tab; label: string }[] = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "mannschaften", label: "Mannschaften" },
  { id: "spielplan", label: "Spielplan" },
];

export function TurnierVerwaltenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;

  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();
  const [aktiverTab, setAktiverTab] = useState<Tab>("uebersicht");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    uebersicht: null,
    mannschaften: null,
    spielplan: null,
  });

  useEffect(() => {
    getTurnier(turnierId)
      .then(setTurnier)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden"));
  }, [turnierId]);

  function tabWechseln(index: number) {
    const naechster = TABS[(index + TABS.length) % TABS.length];
    setAktiverTab(naechster.id);
    tabRefs.current[naechster.id]?.focus();
  }

  function aufTastendruck(event: React.KeyboardEvent, aktuellerIndex: number) {
    if (event.key === "ArrowRight") tabWechseln(aktuellerIndex + 1);
    else if (event.key === "ArrowLeft") tabWechseln(aktuellerIndex - 1);
    else if (event.key === "Home") tabWechseln(0);
    else if (event.key === "End") tabWechseln(TABS.length - 1);
  }

  if (!turnier) {
    return fehler ? <p role="alert">{fehler}</p> : <p>Lädt…</p>;
  }

  return (
    <>
      <p>
        <Link to="/">&larr; Zurück zur Turnierliste</Link>
      </p>
      <h1>{turnier.name}</h1>

      <div role="tablist" aria-label="Turnierbereiche">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={aktiverTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={aktiverTab === tab.id ? 0 : -1}
            className={aktiverTab === tab.id ? "tab tab-aktiv" : "tab"}
            onClick={() => setAktiverTab(tab.id)}
            onKeyDown={(e) => aufTastendruck(e, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-uebersicht" aria-labelledby="tab-uebersicht" hidden={aktiverTab !== "uebersicht"}>
        <p>
          {formatiereDatum(turnier.datum)}
          {turnier.startzeit ? `, ${formatiereUhrzeit(`${turnier.datum}T${turnier.startzeit}:00`)}` : ""} · Status:{" "}
          {turnier.status} · Felder: {turnier.felder.map((f) => f.name).join(", ") || "keine"}
        </p>
      </div>

      <div
        role="tabpanel"
        id="panel-mannschaften"
        aria-labelledby="tab-mannschaften"
        hidden={aktiverTab !== "mannschaften"}
      >
        <MannschaftenListe turnierId={turnierId} />
      </div>

      <div role="tabpanel" id="panel-spielplan" aria-labelledby="tab-spielplan" hidden={aktiverTab !== "spielplan"}>
        <SpielplanVerwaltung turnierId={turnierId} />
      </div>
    </>
  );
}
