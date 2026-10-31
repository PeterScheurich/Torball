import type { Benutzer } from "@torball/shared";
import { findById, insertDoc } from "../repository";

/**
 * Aendert ein Benutzer-Dokument so, dass gleichzeitige Aenderungen sich nicht gegenseitig
 * verschlucken. Der Login las bisher das Konto, rechnete den Fehlversuch-Zaehler hoch und schrieb mit
 * der alten Revision zurueck - bei parallelen Anfragen gewann EINE, die anderen scheiterten mit einem
 * Revisionskonflikt und wurden nie mitgezaehlt. Wer also viele Versuche GLEICHZEITIG schickte, kam
 * an der Sperre vorbei.
 *
 * Bei einem Konflikt wird das Dokument frisch gelesen und die Aenderung erneut berechnet. Die
 * Funktion `aenderung` muss deshalb nur aus dem uebergebenen Stand ableiten (kein Merken zwischen
 * den Aufrufen). Liefert sie `undefined`, wird nichts geschrieben und `undefined` zurueckgegeben -
 * so laesst sich eine Bedingung ("nur wenn noch nicht verbraucht") atomar pruefen.
 *
 * Schlaegt es nach allen Versuchen weiter fehl, wird geworfen: fuer den Login heisst das, die
 * Anfrage scheitert (fail closed), statt einen ungezaehlten Versuch durchzulassen.
 */
export async function aendereBenutzerAtomar(
  benutzerId: string,
  aenderung: (aktuell: Benutzer) => Benutzer | undefined,
  maxVersuche = 20,
): Promise<Benutzer | undefined> {
  for (let i = 0; i < maxVersuche; i++) {
    const frisch = await findById<Benutzer>(benutzerId, "benutzer");
    if (!frisch) return undefined;
    const neu = aenderung(frisch);
    if (!neu) return undefined;
    try {
      return await insertDoc<Benutzer>(neu);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 409) continue;
      throw err;
    }
  }
  throw new Error("Das Konto konnte wegen gleichzeitiger Änderungen nicht gespeichert werden.");
}
