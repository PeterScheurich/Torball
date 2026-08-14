import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type SymbolVerweisArt = "einstellungen" | "hilfe" | "ueber" | "profil";

/** Muss zu den Symbolen in der Kopfzeile passen (siehe Kopfzeile-Komponente in App.tsx). */
const VERWEISE: Record<SymbolVerweisArt, { symbol: string; label: string; to: string }> = {
  einstellungen: { symbol: "⚙", label: "Einstellungen", to: "/einstellungen" },
  hilfe: { symbol: "?", label: "Hilfe", to: "/hilfe" },
  ueber: { symbol: "ℹ", label: "Über", to: "/ueber" },
  profil: { symbol: "👤", label: "Mein Profil", to: "/profil" },
};

/**
 * Inline-Link auf einen Kopfzeilen-Menuepunkt, der dort nur als Symbol dargestellt wird (siehe
 * Kopfzeile in App.tsx). Zeigt neben dem Text zusaetzlich dasselbe Symbol, damit ein Textverweis
 * wie "unter Einstellungen" im Fliesstext auch visuell mit dem gesuchten Kopfzeilen-Symbol
 * zusammenhaengt - und fuehrt gleich per Klick dorthin (Nutzer-Vorgabe).
 */
export function SymbolVerweis({ art }: { art: SymbolVerweisArt }): ReactNode {
  const { symbol, label, to } = VERWEISE[art];
  return (
    <Link to={to} className="symbol-verweis">
      <span aria-hidden="true">{symbol}</span> {label}
    </Link>
  );
}

const VERWEIS_TOKEN = /\{\{(einstellungen|hilfe|ueber|profil)\}\}/g;

/**
 * Ersetzt Platzhalter wie "{{einstellungen}}" in einem Fliesstext durch einen SymbolVerweis -
 * genutzt in den Hilfe-Inhalten (hilfe/inhalte.ts), die aus reinen Strings bestehen und daher
 * keine eingebetteten JSX-Links enthalten koennen.
 */
export function textMitSymbolVerweisen(text: string): ReactNode {
  const teile = text.split(VERWEIS_TOKEN);
  if (teile.length === 1) return text;
  return teile.map((teil, i) =>
    i % 2 === 1 ? <SymbolVerweis key={i} art={teil as SymbolVerweisArt} /> : teil,
  );
}
