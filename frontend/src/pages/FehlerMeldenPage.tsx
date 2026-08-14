import { useState } from "react";
import { useLocation } from "react-router-dom";
import type { GlobaleRolle } from "@torball/shared";
import { useAuth } from "../auth";
import { ENTWICKLER } from "../entwicklerKontakt";

const ROLLEN_LABEL: Record<GlobaleRolle, string> = {
  admin: "Admin",
  manager: "Manager",
  benutzer: "Benutzer",
};

/**
 * Erkennt die aktuelle Instanz aus reinen Build-Infos (kein Laufzeit-API-Aufruf) - dieselben
 * Signale wie UmgebungsBanner.tsx: import.meta.env.DEV kommt von Vite, VITE_INSTANZ_NAME wird
 * von deploy/deploy-instanz.sh vor dem Produktions-Build geschrieben.
 */
function aktuelleUmgebung(): string {
  if (import.meta.env.DEV) return "Entwicklung (lokal)";
  const instanz = import.meta.env.VITE_INSTANZ_NAME;
  if (instanz === "prod") return "Produktion";
  if (instanz) return instanz.charAt(0).toUpperCase() + instanz.slice(1);
  return "Lokale Installation";
}

/**
 * Strukturiertes Formular für Fehlermeldungen/Auffälligkeiten - Ergänzung zum freien
 * "Feedback"-Mail-Link in der Fusszeile. Erzeugt daraus einen fertigen Mail-Entwurf an dieselbe
 * Feedback-Adresse; nichts wird automatisch verschickt (kein Server-seitiger Mailversand aus dem
 * Frontend). Umgebung und meldende Person werden automatisch mitgeschickt, nicht manuell
 * abgefragt - beides ist an dieser Stelle bereits zuverlässig bekannt (Build-Info bzw. Login).
 * Die Ausgangsseite (von wo „Fehler melden" aufgerufen wurde) kommt per Link-`state` aus der
 * Fusszeile (Fusszeile.tsx) - fehlt sie (z.B. Seite neu geladen, Lesezeichen), wird das im
 * Mailtext klar als „nicht bekannt" ausgewiesen statt eine falsche Stelle zu suggerieren.
 */
export function FehlerMeldenPage() {
  const { benutzer } = useAuth();
  const herkunft = (useLocation().state as { herkunft?: string } | null)?.herkunft;
  const [titel, setTitel] = useState("");
  const [fundstelle, setFundstelle] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [screenshot, setScreenshot] = useState(false);
  const [hinweis, setHinweis] = useState<string | undefined>();
  const [hinweisArt, setHinweisArt] = useState<"status" | "fehler">("status");

  if (!benutzer) return null;

  const gemeldetVon = `${benutzer.vorname ? `${benutzer.vorname} ${benutzer.name}` : benutzer.name} (${ROLLEN_LABEL[benutzer.globaleRolle]})`;
  const umgebung = aktuelleUmgebung();
  const ausgangsseite = herkunft ? `${window.location.origin}${herkunft}` : undefined;

  function baueText(): string {
    return [
      `Ausgangsseite: ${ausgangsseite ?? "nicht bekannt"}`,
      `Fundstelle: ${fundstelle.trim() || "–"}`,
      `Umgebung: ${umgebung}`,
      `Gemeldet von: ${gemeldetVon}`,
      "",
      "Beschreibung:",
      beschreibung.trim() || "–",
      ...(screenshot ? ["", "Hinweis: Screenshot liegt bei (manuell angehängt)."] : []),
      "",
      "--",
      'Direkt aus der App gesendet (Seite "Fehler melden").',
    ].join("\n");
  }

  function gueltig(): boolean {
    return titel.trim().length > 0 && beschreibung.trim().length > 0;
  }

  function mailtoUrl(): string {
    const betreff = `[Fehler] ${titel.trim()}`;
    return `mailto:${ENTWICKLER.email}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(baueText())}`;
  }

  function pruefenUndMelden(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!gueltig()) {
      event.preventDefault();
      setHinweisArt("fehler");
      setHinweis("Bitte zuerst Kurztitel und Beschreibung ausfüllen.");
      return;
    }
    setHinweisArt("status");
    setHinweis("Mail-Entwurf geöffnet – bitte im Mailprogramm noch senden.");
  }

  async function textKopieren() {
    if (!gueltig()) {
      setHinweisArt("fehler");
      setHinweis("Bitte zuerst Kurztitel und Beschreibung ausfüllen.");
      return;
    }
    try {
      await navigator.clipboard.writeText(`Betreff: [Fehler] ${titel.trim()}\n\n${baueText()}`);
      setHinweisArt("status");
      setHinweis("Text kopiert.");
    } catch {
      setHinweisArt("fehler");
      setHinweis("Kopieren nicht möglich – Text bitte manuell markieren.");
    }
  }

  return (
    <>
      <h1>Fehler melden</h1>
      <p>
        Für strukturierte Meldungen zu Fehlern oder Auffälligkeiten – öffnet einen fertigen Mail-Entwurf an dieselbe
        Adresse wie „Feedback" in der Fußzeile. Für freies Lob oder allgemeine Anregungen reicht der einfache
        Feedback-Link.
      </p>

      <p className="pflicht-legende">
        <span className="stern">*</span> Pflichtfeld
      </p>

      <div className="feld">
        <label htmlFor="fmTitel">Kurztitel</label>
        <input
          id="fmTitel"
          required
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder="z. B. „n. a.“-Hilfetext war veraltet"
        />
      </div>

      <div className="feld">
        <label htmlFor="fmFundstelle">Fundstelle</label>
        <input
          id="fmFundstelle"
          value={fundstelle}
          onChange={(e) => setFundstelle(e.target.value)}
          placeholder="z. B. Hilfe → Ergebnisse erfassen"
        />
      </div>

      <div className="feld">
        <label htmlFor="fmBeschreibung">Beschreibung</label>
        <textarea
          id="fmBeschreibung"
          required
          rows={5}
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
          placeholder="Was ist passiert? Was hättest du erwartet? Fehlermeldungen bitte wörtlich einfügen."
        />
      </div>

      <label className="feld-checkbox">
        <input type="checkbox" checked={screenshot} onChange={(e) => setScreenshot(e.target.checked)} />{" "}
        Ich habe einen Screenshot – hänge ihn nach dem Öffnen der Mail selbst an (geht bei Links nicht automatisch).
      </label>

      <p className="feld-hinweis">
        Wird automatisch mitgeschickt: Ausgangsseite „{herkunft ?? "nicht bekannt"}" · Umgebung „{umgebung}" ·
        Gemeldet von {gemeldetVon}.
      </p>

      {hinweis && <p role={hinweisArt === "fehler" ? "alert" : "status"}>{hinweis}</p>}

      <p>
        <a href={mailtoUrl()} className="button-link" onClick={pruefenUndMelden}>
          Mail-Entwurf öffnen
        </a>{" "}
        <button type="button" className="button-sekundaer" onClick={textKopieren}>
          Text kopieren
        </button>
      </p>
    </>
  );
}
