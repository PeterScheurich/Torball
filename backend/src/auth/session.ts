import { createHash, randomBytes } from "node:crypto";
import type { Session } from "@torball/shared";
import { deleteDoc, findAllBySelector, findById, insertDoc } from "../repository";

/** Inaktivitaets-Fenster (Abschnitt 25.1: "automatischer Logout nach konfigurierbarer Inaktivitaet"). Aktuell fest, spaeter aus der Systemkonfiguration. */
const INAKTIVITAETS_FENSTER_MS = 12 * 60 * 60 * 1000;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Session-Dokumente werden ueber den Hash des Tokens adressiert (`_id`), damit die Pruefung ein direkter `findById`-Lookup ist statt einer Selector-Abfrage ueber alle Sessions. Der Klartext-Token selbst wird nie persistiert. */
function sessionIdVon(token: string): string {
  return `session:${tokenHash(token)}`;
}

export async function erstelleSession(benutzerId: string): Promise<{ token: string; session: Session }> {
  const token = randomBytes(32).toString("hex");
  const jetzt = new Date();
  const session: Session = {
    _id: sessionIdVon(token),
    docType: "session",
    sessionId: sessionIdVon(token),
    benutzerId,
    erstelltAm: jetzt.toISOString(),
    laeuftAbAm: new Date(jetzt.getTime() + INAKTIVITAETS_FENSTER_MS).toISOString(),
    letzteAktivitaetAm: jetzt.toISOString(),
  };
  await insertDoc(session);
  return { token, session };
}

export async function findeSessionPerToken(token: string): Promise<Session | null> {
  const session = await findById<Session>(sessionIdVon(token));
  if (!session) return null;
  if (new Date(session.laeuftAbAm).getTime() < Date.now()) {
    await deleteDoc(session._id, session._rev!);
    return null;
  }
  return session;
}

/** Gleitendes Inaktivitaets-Fenster: bei jeder authentifizierten Anfrage neu berechnet. Fehler hierbei duerfen die eigentliche Anfrage nicht blockieren - rein buchhalterisch. */
export async function beruehreSession(session: Session): Promise<void> {
  try {
    const jetzt = new Date();
    await insertDoc({
      ...session,
      letzteAktivitaetAm: jetzt.toISOString(),
      laeuftAbAm: new Date(jetzt.getTime() + INAKTIVITAETS_FENSTER_MS).toISOString(),
    });
  } catch {
    // Bewusst ignoriert (z.B. Rev-Konflikt bei parallelen Requests) - die Session bleibt bis zum naechsten erfolgreichen Touch gueltig.
  }
}

export async function loescheSessionPerToken(token: string): Promise<void> {
  const session = await findById<Session>(sessionIdVon(token));
  if (session) await deleteDoc(session._id, session._rev!);
}

/** Abschnitt 21.4: Passwort-Reset beendet alle aktiven Sessions dieses Benutzers. */
export async function loescheAlleSessionenVonBenutzer(benutzerId: string): Promise<void> {
  const sessions = await findAllBySelector<Session>({ docType: "session", benutzerId });
  for (const session of sessions) {
    await deleteDoc(session._id, session._rev!);
  }
}
