import type { KanbanKarte, MailBericht, MailBerichtAusloeser, MailNachricht } from "@torball/shared";
import { deleteDoc, findAllByType, findAllBySelector, insertDoc, newId } from "../repository";
import { istVeraltet, kanbanKategorieFuer, naechsteReihenfolgeOffen, STANDARD_AUFBEWAHRUNG_TAGE } from "./berichtHilfen";
import { holeNeueMails } from "./imapClient";
import { klassifiziereMails } from "./klassifikation";
import { aktuelleMailPostfachEinstellungen, MAIL_POSTFACH_EINSTELLUNGEN_ID } from "./postfach";
import { mailKonfiguriert, sendeMail } from "./transport";

export interface AusloesenderBenutzer {
  _id: string;
  name: string;
}

/**
 * Orchestriert einen Berichtslauf: IMAP-Abruf neuer Mails -> als MailNachricht speichern -> alle
 * noch unverarbeiteten Mails (auch aus einem zuvor fehlgeschlagenen Lauf) per KI klassifizieren ->
 * fuer erkannte Anforderungen automatisch eine "KI-erstellt/ungeprueft" markierte Kanban-Karte
 * anlegen -> MailBericht-Doc speichern -> Bericht per Mail verschicken (best effort).
 *
 * Die IMAP-UID wird bewusst SOFORT nach dem Einlesen fortgeschrieben (vor der KI-Klassifikation):
 * schlaegt die Klassifikation fehl (z. B. kein API-Key hinterlegt), sollen die bereits gespeicherten
 * MailNachricht-Docs beim naechsten Lauf erneut klassifiziert werden, aber NICHT nochmal per IMAP
 * abgerufen werden (sonst entstuenden Duplikate).
 *
 * IMAP-Zugang und API-Key kommen aus den per Oberflaeche gepflegten MailPostfachEinstellungen
 * (siehe mail/postfach.ts), nicht aus .env - Nutzer-Vorgabe: alle Konfigurationsdaten dieses
 * Features werden ueber die App gepflegt.
 */
export async function erstelleMailBericht(
  ausgeloestDurch: MailBerichtAusloeser,
  ausgeloestVon?: AusloesenderBenutzer,
): Promise<MailBericht> {
  const einstellungen = await aktuelleMailPostfachEinstellungen();
  if (!einstellungen.imapHost || !einstellungen.imapUser || !einstellungen.imapPasswort) {
    throw new Error("IMAP ist nicht konfiguriert (bitte in den Mail-Postfach-Einstellungen eintragen).");
  }
  const neueRohMails = await holeNeueMails(einstellungen.letzteImapUid ?? 0, {
    host: einstellungen.imapHost,
    port: einstellungen.imapPort,
    user: einstellungen.imapUser,
    passwort: einstellungen.imapPasswort,
  });

  const jetzt = new Date().toISOString();
  for (const roh of neueRohMails) {
    const nachricht: MailNachricht = {
      _id: newId("mailNachricht"),
      docType: "mailNachricht",
      imapUid: roh.imapUid,
      von: roh.von,
      betreff: roh.betreff,
      empfangenAm: roh.empfangenAm,
      text: roh.text,
      erstelltAm: jetzt,
      aktualisiertAm: jetzt,
    };
    await insertDoc(nachricht);
  }

  if (neueRohMails.length > 0) {
    const hoechsteUid = Math.max(...neueRohMails.map((m) => m.imapUid));
    await insertDoc({
      ...(await aktuelleMailPostfachEinstellungen()),
      _id: MAIL_POSTFACH_EINSTELLUNGEN_ID,
      docType: "mailPostfachEinstellungen",
      letzteImapUid: hoechsteUid,
    });
  }

  const unverarbeitet = await findAllBySelector<MailNachricht>({
    docType: "mailNachricht",
    beruecksichtigtInBerichtId: { $exists: false },
  });

  if (unverarbeitet.length > 0 && !einstellungen.anthropicApiKey) {
    throw new Error("KI-Klassifikation ist nicht konfiguriert (bitte API-Key in den Mail-Postfach-Einstellungen eintragen).");
  }
  const klassifikationsLauf = await klassifiziereMails(
    unverarbeitet.map((m) => ({ id: m._id, von: m.von, betreff: m.betreff, text: m.text })),
    einstellungen.anthropicApiKey ?? "",
  );

  const alleKarten = await findAllByType<KanbanKarte>("kanbanKarte");
  let reihenfolge = naechsteReihenfolgeOffen(alleKarten);

  const berichtId = newId("mailBericht");
  const erstellteKartenIds: string[] = [];
  const verarbeiteteMails: MailNachricht[] = [];

  for (const mail of unverarbeitet) {
    const ergebnis = klassifikationsLauf.ergebnisse[mail._id];
    let kanbanKartenId: string | undefined;

    if (ergebnis?.istAnforderung) {
      const kartenJetzt = new Date().toISOString();
      const karteId = newId("kanbanKarte");
      const karte: KanbanKarte = {
        _id: karteId,
        docType: "kanbanKarte",
        kanbanId: karteId,
        titel: ergebnis.vorgeschlagenerTitel ?? mail.betreff,
        beschreibung: ergebnis.vorgeschlageneBeschreibung ?? mail.text.slice(0, 2000),
        spalte: "offen",
        kategorie: kanbanKategorieFuer(ergebnis),
        prioritaet: "mittel",
        reihenfolge: reihenfolge++,
        erstelltVon: ausgeloestVon?._id,
        erstelltVonName: ausgeloestVon?.name ?? "Mail-Postfach (automatisch)",
        herkunft: "mailPostfach",
        kiErstellt: true,
        quellMailId: mail._id,
        erstelltAm: kartenJetzt,
        aktualisiertAm: kartenJetzt,
      };
      await insertDoc(karte);
      erstellteKartenIds.push(karteId);
      kanbanKartenId = karteId;
    }

    const aktualisiert: MailNachricht = {
      ...mail,
      kategorie: ergebnis?.kategorie ?? "sonstiges",
      kiZusammenfassung: ergebnis?.kiZusammenfassung,
      kanbanKartenId,
      beruecksichtigtInBerichtId: berichtId,
      aktualisiertAm: new Date().toISOString(),
    };
    verarbeiteteMails.push(await insertDoc(aktualisiert));
  }

  const bericht: MailBericht = {
    _id: berichtId,
    docType: "mailBericht",
    erzeugtAm: new Date().toISOString(),
    ausgeloestDurch,
    anzahlMails: verarbeiteteMails.length,
    zusammenfassungText: klassifikationsLauf.zusammenfassungText,
    mailIds: verarbeiteteMails.map((m) => m._id),
    erstellteKartenIds,
    kiInputTokens: klassifikationsLauf.usage?.inputTokens,
    kiOutputTokens: klassifikationsLauf.usage?.outputTokens,
  };
  const gespeicherterBericht = await insertDoc(bericht);

  if (einstellungen.berichtEmpfaenger && mailKonfiguriert()) {
    try {
      await sendeMail({
        an: einstellungen.berichtEmpfaenger,
        betreff: `Mail-Postfach-Bericht (${ausgeloestDurch}): ${verarbeiteteMails.length} neue Mail(s)`,
        text: klassifikationsLauf.zusammenfassungText,
      });
    } catch (err) {
      // Best effort - ein fehlgeschlagener Mailversand darf den Bericht nicht ungueltig machen.
      console.error("Mail-Postfach-Bericht: Mailversand fehlgeschlagen", err);
    }
  }

  try {
    await raeumeAlteMailsAuf(einstellungen.aufbewahrungTage ?? STANDARD_AUFBEWAHRUNG_TAGE);
  } catch (err) {
    // Best effort, gleiches Muster wie oben beim Mailversand - ein fehlgeschlagenes Aufraeumen
    // darf den eigentlichen Berichtslauf nicht ungueltig machen.
    console.error("Mail-Postfach-Bericht: Aufraeumen veralteter Mails fehlgeschlagen", err);
  }

  return gespeicherterBericht;
}

/**
 * Loescht erledigte/ignorierte Mails, die die Aufbewahrungsfrist ueberschritten haben
 * (Nutzer-Vorgabe, siehe istVeraltet in berichtHilfen.ts) - laeuft am Ende jedes Berichtslaufs
 * (automatisch taeglich UND bei "Bericht jetzt erstellen") mit, kein eigener Zeitplan noetig.
 * Betrifft nur die hier gespeicherte Kopie/Klassifikation, nicht die Original-Mail im Postfach.
 */
async function raeumeAlteMailsAuf(aufbewahrungTage: number): Promise<number> {
  const alle = await findAllByType<MailNachricht>("mailNachricht");
  const jetzt = new Date();
  const veraltet = alle.filter((mail) => istVeraltet(mail, jetzt, aufbewahrungTage));
  for (const mail of veraltet) {
    await deleteDoc(mail._id, mail._rev!);
  }
  return veraltet.length;
}
