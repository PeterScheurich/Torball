import type { MannschaftImTurnier, Spiel, Spielfeld, Spielmodus, Turnier } from "@torball/shared";

const BASIS = "/api";

async function anfrage<T>(pfad: string, init?: RequestInit): Promise<T> {
  let antwort: Response;
  try {
    antwort = await fetch(`${BASIS}${pfad}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    // fetch() wirft nur, wenn die Verbindung gar nicht erst zustande kommt
    // (Backend nicht gestartet, Netzwerk weg) - klar von einer HTTP-Fehlerantwort unterscheiden.
    throw new Error("Server nicht erreichbar. Läuft das Backend?");
  }

  if (!antwort.ok) {
    if (antwort.status === 502 || antwort.status === 503 || antwort.status === 504) {
      throw new Error(`Backend antwortet nicht (Status ${antwort.status}). Läuft der Server?`);
    }
    const body = await antwort.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `Anfrage fehlgeschlagen (Status ${antwort.status})`);
  }

  if (antwort.status === 204) {
    return undefined as T;
  }

  return antwort.json() as Promise<T>;
}

export interface NeuesTurnier {
  name: string;
  datum: string;
  startzeit?: string;
  felder: Spielfeld[];
  spielplanModus?: Spielmodus;
}

export function getTurniere(): Promise<Turnier[]> {
  return anfrage("/turniere");
}

export function getTurnier(id: string): Promise<Turnier> {
  return anfrage(`/turniere/${id}`);
}

export function createTurnier(daten: NeuesTurnier): Promise<Turnier> {
  return anfrage("/turniere", { method: "POST", body: JSON.stringify(daten) });
}

export function deleteTurnier(id: string): Promise<void> {
  return anfrage(`/turniere/${id}`, { method: "DELETE" });
}

export function updateTurnier(id: string, daten: Partial<Pick<Turnier, "spielplanModus">>): Promise<Turnier> {
  return anfrage(`/turniere/${id}`, { method: "PUT", body: JSON.stringify(daten) });
}

export interface NeueMannschaft {
  turnierId: string;
  name: string;
  vereinId?: string;
  bundesland?: string;
}

export function getMannschaften(turnierId: string): Promise<MannschaftImTurnier[]> {
  return anfrage(`/turniere/${turnierId}/mannschaften`);
}

export function createMannschaft(daten: NeueMannschaft): Promise<MannschaftImTurnier> {
  return anfrage("/mannschaften", { method: "POST", body: JSON.stringify(daten) });
}

export interface MannschaftAktualisierung {
  name: string;
  vereinId?: string;
  bundesland?: string;
}

export function updateMannschaft(id: string, daten: MannschaftAktualisierung): Promise<MannschaftImTurnier> {
  return anfrage(`/mannschaften/${id}`, { method: "PUT", body: JSON.stringify(daten) });
}

export function deleteMannschaft(id: string): Promise<void> {
  return anfrage(`/mannschaften/${id}`, { method: "DELETE" });
}

export function mannschaftReihenfolgeAendern(
  turnierId: string,
  mannschaftIds: string[],
): Promise<MannschaftImTurnier[]> {
  return anfrage(`/turniere/${turnierId}/mannschaften/reihenfolge`, {
    method: "PUT",
    body: JSON.stringify({ mannschaftIds }),
  });
}

export interface SpielplanVorschlagEintrag {
  mannschaftAId: string;
  mannschaftBId: string;
  feldId: string;
  slot: number;
  warnung?: string;
  startzeitGeplant?: string;
}

export interface SpielplanVorschlag {
  turnierId: string;
  wiederholungen: number;
  spiele: SpielplanVorschlagEintrag[];
}

export function getSpielplanVorschlag(turnierId: string, wiederholungen: 1 | 2): Promise<SpielplanVorschlag> {
  return anfrage(`/turniere/${turnierId}/spielplan-vorschlag?wiederholungen=${wiederholungen}`);
}

export interface SpielplanErgebnis {
  turnierId: string;
  spielplanVersion: number;
  anzahlSpiele: number;
  spiele: Spiel[];
}

export function erzeugeSpielplan(
  turnierId: string,
  wiederholungen: 1 | 2,
  eintraege?: SpielplanVorschlagEintrag[],
): Promise<SpielplanErgebnis> {
  return anfrage(`/turniere/${turnierId}/spielplan?wiederholungen=${wiederholungen}`, {
    method: "POST",
    body: eintraege ? JSON.stringify({ eintraege }) : undefined,
  });
}

export function getSpiele(turnierId: string): Promise<Spiel[]> {
  return anfrage(`/turniere/${turnierId}/spiele`);
}

export function reihenfolgeAendern(turnierId: string, spielIds: string[]): Promise<Spiel[]> {
  return anfrage(`/turniere/${turnierId}/spiele/reihenfolge`, {
    method: "PUT",
    body: JSON.stringify({ spielIds }),
  });
}

export interface SpielAnpassung {
  runde?: string;
  feldId?: string;
  startzeitGeplant?: string;
}

/** Gezielte Einzelanpassung (z.B. nur runde+Startzeit tauschen), ohne wie reihenfolgeAendern alle Spiele neu durchzunummerieren. */
export function spielAnpassen(spielId: string, daten: SpielAnpassung): Promise<Spiel> {
  return anfrage(`/spiele/${spielId}`, { method: "PUT", body: JSON.stringify(daten) });
}

/** Verschiebt dieses Spiel auf die neue Startzeit; alle nachfolgenden geplanten Spiele wandern um dasselbe Delta mit. */
export function spielStartzeitAendern(spielId: string, startzeitGeplant: string): Promise<Spiel[]> {
  return anfrage(`/spiele/${spielId}/startzeit`, {
    method: "PUT",
    body: JSON.stringify({ startzeitGeplant }),
  });
}
