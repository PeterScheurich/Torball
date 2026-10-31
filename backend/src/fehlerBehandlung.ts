import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

// Uebersetzt einen unbehandelten CouchDB-Versionskonflikt (409 - tritt auf, wenn zwei Anfragen
// nahezu gleichzeitig dasselbe Dokument aendern, z.B. eine Ergebniserfassung intern UND parallel
// ueber den externen Erfassungslink) in eine verstaendliche deutsche Meldung, statt die rohe
// CouchDB-Antwort ("Conflict"/"Document update conflict.") an den Client durchzureichen - fiel
// beim Systemtest 2026-08-14 auf der Token-Erfassungsseite auf, die dieses Wort unuebersetzt
// angezeigt haette. Alle anderen Fehler unveraendert weiterreichen (Fastifys eigenes Verhalten).
export function zentralerFehlerHandler(error: FastifyError, req: FastifyRequest, reply: FastifyReply): void {
  const status = (error as { statusCode?: number }).statusCode;
  if (status === 409) {
    reply.code(409).send({
      error: "Das wurde soeben von anderer Stelle geändert. Bitte neu laden und erneut versuchen.",
    });
    return;
  }
  // Serverfehler (5xx, oder ein Fehler ganz ohne Status): NICHT die Originalmeldung an den Client.
  // Bei Datenbankproblemen steht darin z. B. "Connect Timeout Error (attempted address: 10.x.x.x:5984)"
  // - Interna, die jeder anonyme Aufrufer sonst bei einem Ausfall zu sehen bekaeme (OWASP A10,
  // Durchgang 2026-10-31). Die Ursache bleibt im Server-Protokoll.
  if (status === undefined || status >= 500) {
    req.log.error(error);
    reply.code(status && status >= 500 ? status : 500).send({
      error: "Interner Fehler. Bitte später erneut versuchen.",
    });
    return;
  }
  reply.send(error);
}
