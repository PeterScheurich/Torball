import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { KanbanKarte, MailBericht, MailManuellerStatus, MailNachricht } from "@torball/shared";
import { deleteDoc, findAllByType, findById, insertDoc, newId } from "../repository";
import { requireRolle } from "../auth/plugin";
import { erstelleMailBericht } from "../mail/bericht";
import { testeImapVerbindung } from "../mail/imapClient";
import { testeAnthropicApiKey } from "../mail/klassifikation";
import {
  aktuelleMailPostfachEinstellungen,
  MAIL_POSTFACH_EINSTELLUNGEN_ID,
  mailPostfachAktiv,
  oeffentlicheMailPostfachEinstellungen,
} from "../mail/postfach";

/**
 * Mail-Postfach (nur Entwicklungsinstanz, siehe mail/postfach.ts::mailPostfachAktiv). Alle Routen
 * ausser /verfuegbar sind zusaetzlich zur Admin-Rolle hinter dem Env-Flag gesperrt - identisches
 * Muster wie der Kanban-Import in routes/kanban.ts (importVorbedingung).
 */
const vorbedingung = (req: FastifyRequest, reply: FastifyReply): boolean => {
  if (!requireRolle(req, reply, ["admin"])) return false;
  if (!mailPostfachAktiv()) {
    reply.code(403).send({ error: "Mail-Postfach ist auf dieser Instanz nicht freigeschaltet (nur Dev)." });
    return false;
  }
  return true;
};

function naechsteReihenfolgeOffen(karten: KanbanKarte[]): number {
  const inSpalte = karten.filter((k) => k.spalte === "offen");
  if (inSpalte.length === 0) return 0;
  return Math.max(...inSpalte.map((k) => k.reihenfolge)) + 1;
}

export async function mailPostfachRoutes(app: FastifyInstance): Promise<void> {
  // Oeffentlich (kein Login), analog GET /auth/registrierung-verfuegbar - damit das Frontend den
  // Admin-Menuepunkt ausblenden kann, ohne vorher als Admin eingeloggt sein zu muessen.
  app.get("/mail-postfach/verfuegbar", async () => {
    return { verfuegbar: mailPostfachAktiv() };
  });

  app.get<{ Querystring: { suchtext?: string; kategorie?: string; manuellerStatus?: string } }>(
    "/mail-postfach/nachrichten",
    async (req, reply) => {
      if (!vorbedingung(req, reply)) return;
      const alle = await findAllByType<MailNachricht>("mailNachricht");
      const { suchtext, kategorie, manuellerStatus } = req.query;
      const suchtextKlein = suchtext?.trim().toLowerCase();

      const gefiltert = alle.filter((mail) => {
        if (kategorie && mail.kategorie !== kategorie) return false;
        // "offen" ist kein gespeicherter Status (nur "erledigt"/"ignoriert" sind das), sondern
        // das Filter-Gegenstueck fuer "noch kein manueller Status gesetzt".
        if (manuellerStatus === "offen" && mail.manuellerStatus) return false;
        if (manuellerStatus && manuellerStatus !== "offen" && mail.manuellerStatus !== manuellerStatus) return false;
        if (
          suchtextKlein &&
          !mail.betreff.toLowerCase().includes(suchtextKlein) &&
          !mail.von.toLowerCase().includes(suchtextKlein) &&
          !mail.text.toLowerCase().includes(suchtextKlein)
        ) {
          return false;
        }
        return true;
      });

      return gefiltert.sort((a, b) => b.empfangenAm.localeCompare(a.empfangenAm));
    },
  );

  app.put<{ Params: { id: string }; Body: { manuellerStatus: MailManuellerStatus | null } }>(
    "/mail-postfach/nachrichten/:id",
    {
      schema: {
        body: {
          type: "object",
          required: ["manuellerStatus"],
          properties: { manuellerStatus: { type: ["string", "null"], enum: ["erledigt", "ignoriert", null] } },
        },
      },
    },
    async (req, reply) => {
      if (!vorbedingung(req, reply)) return;
      const mail = await findById<MailNachricht>(req.params.id);
      if (!mail || mail.docType !== "mailNachricht") {
        return reply.code(404).send({ error: "Mail nicht gefunden" });
      }
      return insertDoc({
        ...mail,
        manuellerStatus: req.body.manuellerStatus ?? undefined,
        aktualisiertAm: new Date().toISOString(),
      });
    },
  );

  // Loescht eine einzelne Mail aus der lokalen Liste (manuell ausgeloest, unabhaengig vom
  // automatischen Aufraeumen nach der Aufbewahrungsfrist in mail/bericht.ts::raeumeAlteMailsAuf).
  // Betrifft nur die hier gespeicherte Kopie - die Original-Mail bleibt im echten Postfach
  // erhalten (Nutzer-Vorgabe), daher unproblematisch auch fuer noch nicht "erledigte" Mails.
  app.delete<{ Params: { id: string } }>("/mail-postfach/nachrichten/:id", async (req, reply) => {
    if (!vorbedingung(req, reply)) return;
    const mail = await findById<MailNachricht>(req.params.id);
    if (!mail || mail.docType !== "mailNachricht") {
      return reply.code(404).send({ error: "Mail nicht gefunden" });
    }
    await deleteDoc(mail._id, mail._rev!);
    return reply.code(204).send();
  });

  // Legt manuell eine Kanban-Karte aus einer Mail an, auch wenn die KI sie nicht als Anforderung
  // erkannt hat (Werkzeug fuer die manuelle Nachbearbeitung/"Abarbeiten" des Postfachs).
  app.post<{ Params: { id: string } }>("/mail-postfach/nachrichten/:id/karte", async (req, reply) => {
    if (!vorbedingung(req, reply)) return;
    const mail = await findById<MailNachricht>(req.params.id);
    if (!mail || mail.docType !== "mailNachricht") {
      return reply.code(404).send({ error: "Mail nicht gefunden" });
    }
    if (mail.kanbanKartenId) {
      return reply.code(409).send({ error: "Fuer diese Mail existiert bereits eine Kanban-Karte." });
    }

    const alleKarten = await findAllByType<KanbanKarte>("kanbanKarte");
    const jetzt = new Date().toISOString();
    const karteId = newId("kanbanKarte");
    const karte: KanbanKarte = {
      _id: karteId,
      docType: "kanbanKarte",
      kanbanId: karteId,
      titel: mail.betreff,
      beschreibung: mail.text.slice(0, 2000),
      spalte: "offen",
      kategorie: mail.kategorie === "fehlermeldung" ? "bug" : "wunsch",
      prioritaet: "mittel",
      reihenfolge: naechsteReihenfolgeOffen(alleKarten),
      erstelltVon: req.benutzer!._id,
      erstelltVonName: req.benutzer!.name,
      erstelltVonEmail: req.benutzer!.email,
      herkunft: "mailPostfach",
      kiErstellt: false,
      quellMailId: mail._id,
      erstelltAm: jetzt,
      aktualisiertAm: jetzt,
    };
    await insertDoc(karte);
    const aktualisierteMail = await insertDoc({ ...mail, kanbanKartenId: karteId, aktualisiertAm: jetzt });
    return reply.code(201).send({ mail: aktualisierteMail, karte });
  });

  app.get("/mail-postfach/einstellungen", async (req, reply) => {
    if (!vorbedingung(req, reply)) return;
    return oeffentlicheMailPostfachEinstellungen(await aktuelleMailPostfachEinstellungen());
  });

  interface MailEinstellungenBody {
    berichtszeit: string;
    aufbewahrungTage: number;
    berichtEmpfaenger?: string | null;
    imapHost?: string | null;
    imapPort?: number | null;
    imapUser?: string | null;
    // null loescht einen gesetzten Wert gezielt; ein FEHLENDES Feld laesst den bisherigen Wert
    // unveraendert (siehe CLAUDE.md, "Optionale Textfelder leeren") - fuer imapPasswort/
    // anthropicApiKey wichtig, weil das Formular die aktuellen Geheimwerte nie anzeigt und beim
    // Speichern nur mitschickt, wenn tatsaechlich ein neuer Wert eingegeben wurde.
    imapPasswort?: string | null;
    anthropicApiKey?: string | null;
  }

  /** undefined = Feld fehlte im Body -> bisherigen Wert behalten; null -> gezielt loeschen. */
  function feldOderBisherig<T>(wert: T | null | undefined, bisherigerWert: T | undefined): T | undefined {
    return wert === undefined ? bisherigerWert : (wert ?? undefined);
  }

  app.put<{ Body: MailEinstellungenBody }>(
    "/mail-postfach/einstellungen",
    {
      schema: {
        body: {
          type: "object",
          required: ["berichtszeit", "aufbewahrungTage"],
          properties: {
            berichtszeit: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
            aufbewahrungTage: { type: "number", minimum: 1 },
            berichtEmpfaenger: { type: ["string", "null"] },
            imapHost: { type: ["string", "null"] },
            imapPort: { type: ["number", "null"] },
            imapUser: { type: ["string", "null"] },
            imapPasswort: { type: ["string", "null"] },
            anthropicApiKey: { type: ["string", "null"] },
          },
        },
      },
    },
    async (req, reply) => {
      if (!vorbedingung(req, reply)) return;
      const bisherige = await aktuelleMailPostfachEinstellungen();
      const gespeichert = await insertDoc({
        ...bisherige,
        _id: MAIL_POSTFACH_EINSTELLUNGEN_ID,
        docType: "mailPostfachEinstellungen",
        berichtszeit: req.body.berichtszeit,
        aufbewahrungTage: req.body.aufbewahrungTage,
        berichtEmpfaenger: feldOderBisherig(req.body.berichtEmpfaenger, bisherige.berichtEmpfaenger),
        imapHost: feldOderBisherig(req.body.imapHost, bisherige.imapHost),
        imapPort: feldOderBisherig(req.body.imapPort, bisherige.imapPort),
        imapUser: feldOderBisherig(req.body.imapUser, bisherige.imapUser),
        imapPasswort: feldOderBisherig(req.body.imapPasswort, bisherige.imapPasswort),
        anthropicApiKey: feldOderBisherig(req.body.anthropicApiKey, bisherige.anthropicApiKey),
      });
      return oeffentlicheMailPostfachEinstellungen(gespeichert);
    },
  );

  // Beide Test-Endpunkte antworten bewusst mit 200 + { ok: false, fehler } statt einem HTTP-Fehler
  // - ein fehlgeschlagener Verbindungstest ist ein normales, erwartbares Ergebnis fuer den Knopf in
  // der Oberflaeche, kein Server-Fehler. Fehlende Felder im Body fallen auf den bereits
  // gespeicherten Wert zurueck, damit ein Test auch ohne erneute Passwort-/Key-Eingabe moeglich ist.
  app.post<{ Body: { host?: string; port?: number; user?: string; passwort?: string } }>(
    "/mail-postfach/einstellungen/imap-testen",
    async (req, reply) => {
      if (!vorbedingung(req, reply)) return;
      const bisherige = await aktuelleMailPostfachEinstellungen();
      const host = req.body.host ?? bisherige.imapHost;
      const port = req.body.port ?? bisherige.imapPort;
      const user = req.body.user ?? bisherige.imapUser;
      const passwort = req.body.passwort ?? bisherige.imapPasswort;
      if (!host || !user || !passwort) {
        return { ok: false, fehler: "Host, Benutzer und Passwort werden benötigt." };
      }
      try {
        await testeImapVerbindung({ host, port, user, passwort });
        return { ok: true };
      } catch (err) {
        return { ok: false, fehler: err instanceof Error ? err.message : "Verbindung fehlgeschlagen" };
      }
    },
  );

  app.post<{ Body: { apiKey?: string } }>("/mail-postfach/einstellungen/anthropic-testen", async (req, reply) => {
    if (!vorbedingung(req, reply)) return;
    const bisherige = await aktuelleMailPostfachEinstellungen();
    const apiKey = req.body.apiKey ?? bisherige.anthropicApiKey;
    if (!apiKey) {
      return { ok: false, fehler: "Kein API-Key hinterlegt." };
    }
    try {
      await testeAnthropicApiKey(apiKey);
      return { ok: true };
    } catch (err) {
      return { ok: false, fehler: err instanceof Error ? err.message : "API-Key ungültig" };
    }
  });

  app.post("/mail-postfach/bericht", async (req, reply) => {
    if (!vorbedingung(req, reply)) return;
    try {
      const bericht = await erstelleMailBericht("manuell", { _id: req.benutzer!._id, name: req.benutzer!.name });
      return reply.code(201).send(bericht);
    } catch (err) {
      // Bewusst kein 502/503/504 - diese Codes bedeutet dem Frontend-Client "Backend nicht
      // erreichbar" (siehe frontend/src/api.ts) und wuerden die eigentliche Fehlermeldung
      // (z.B. "IMAP ist nicht konfiguriert") hinter einer generischen Meldung verstecken.
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Berichtslauf fehlgeschlagen" });
    }
  });

  app.get("/mail-postfach/berichte", async (req, reply) => {
    if (!vorbedingung(req, reply)) return;
    const alle = await findAllByType<MailBericht>("mailBericht");
    return alle.sort((a, b) => b.erzeugtAm.localeCompare(a.erzeugtAm)).slice(0, 30);
  });
}
