import { useCallback, useEffect, useState } from "react";
import type { MailBericht, MailKategorie, MailManuellerStatus, MailNachricht } from "@torball/shared";
import {
  erstelleKarteAusMail,
  erstelleMailBericht,
  getMailBerichte,
  getMailNachrichten,
  getMailPostfachEinstellungen,
  testeAnthropicApiKey,
  testeImapVerbindung,
  updateMailNachricht,
  updateMailPostfachEinstellungen,
  type MailTestErgebnis,
} from "../api";
import { formatiereZeitstempel } from "../format";

const KATEGORIE_LABEL: Record<MailKategorie, string> = {
  fehlermeldung: "Fehlermeldung",
  lob: "Lob",
  anregung: "Anregung",
  kritik: "Kritik",
  spam: "Spam",
  sonstiges: "Sonstiges",
};

const LEERES_EINSTELLUNGEN_FORMULAR = {
  berichtszeit: "07:00",
  berichtEmpfaenger: "",
  imapHost: "",
  imapPort: "",
  imapUser: "",
  imapPasswort: "",
  anthropicApiKey: "",
};

/**
 * Mail-Postfach (nur Admins, nur wenn MAIL_POSTFACH_AKTIV=true auf dieser Instanz - siehe
 * App.tsx, das den Menuepunkt/die Route nur bei mailPostfachVerfuegbar() zeigt). Liest ein
 * zentrales Feedback-Postfach der Software per IMAP, laesst neue Mails per KI klassifizieren und
 * erkannte Anforderungen automatisch als "KI-erstellt/ungeprueft" markierte Kanban-Karte anlegen
 * (Entwicklungs-Board). Diese Seite deckt das manuelle Durchsuchen/Abarbeiten, die komplette
 * Konfiguration (IMAP-Zugang, Anthropic-API-Key, Berichts-Empfänger - bewusst alles über die
 * Oberfläche statt in backend/.env) sowie den Berichtslauf ab.
 */
export function MailPostfachPage() {
  const [mails, setMails] = useState<MailNachricht[]>([]);
  const [berichte, setBerichte] = useState<MailBericht[]>([]);
  const [einstellungenForm, setEinstellungenForm] = useState(LEERES_EINSTELLUNGEN_FORMULAR);
  const [imapPasswortGesetzt, setImapPasswortGesetzt] = useState(false);
  const [anthropicApiKeyGesetzt, setAnthropicApiKeyGesetzt] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [berichtLaeuft, setBerichtLaeuft] = useState(false);

  const [imapTestLaeuft, setImapTestLaeuft] = useState(false);
  const [imapTestErgebnis, setImapTestErgebnis] = useState<MailTestErgebnis | undefined>();
  const [apiKeyTestLaeuft, setApiKeyTestLaeuft] = useState(false);
  const [apiKeyTestErgebnis, setApiKeyTestErgebnis] = useState<MailTestErgebnis | undefined>();

  const [suchtext, setSuchtext] = useState("");
  const [kategorieFilter, setKategorieFilter] = useState<MailKategorie | "">("");
  const [statusFilter, setStatusFilter] = useState<MailManuellerStatus | "">("");

  const laden = useCallback(async () => {
    try {
      const [nachrichten, einstellungen, letzteBerichte] = await Promise.all([
        getMailNachrichten({
          suchtext: suchtext.trim() || undefined,
          kategorie: kategorieFilter || undefined,
          manuellerStatus: statusFilter || undefined,
        }),
        getMailPostfachEinstellungen(),
        getMailBerichte(),
      ]);
      setMails(nachrichten);
      setEinstellungenForm({
        berichtszeit: einstellungen.berichtszeit,
        berichtEmpfaenger: einstellungen.berichtEmpfaenger ?? "",
        imapHost: einstellungen.imapHost ?? "",
        imapPort: einstellungen.imapPort ? String(einstellungen.imapPort) : "",
        imapUser: einstellungen.imapUser ?? "",
        imapPasswort: "",
        anthropicApiKey: "",
      });
      setImapPasswortGesetzt(einstellungen.imapPasswortGesetzt);
      setAnthropicApiKeyGesetzt(einstellungen.anthropicApiKeyGesetzt);
      setBerichte(letzteBerichte);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    } finally {
      setGeladen(true);
    }
  }, [suchtext, kategorieFilter, statusFilter]);

  useEffect(() => {
    laden();
  }, [laden]);

  async function statusSetzen(mail: MailNachricht, status: MailManuellerStatus | null) {
    try {
      await updateMailNachricht(mail._id, status);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern des Status");
    }
  }

  async function karteAnlegen(mail: MailNachricht) {
    try {
      await erstelleKarteAusMail(mail._id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen der Karte");
    }
  }

  // berichtEmpfaenger/imapHost/imapPort/imapUser zeigt das Formular immer im Klartext - ein
  // geleertes Feld bedeutet hier also "löschen" (null). imapPasswort/anthropicApiKey werden nie
  // angezeigt - ein leeres Feld bedeutet "unverändert lassen" (Feld fehlt im Request, siehe
  // MailPostfachEinstellungenEingabe in api.ts); explizites Löschen läuft über die eigenen
  // "entfernen"-Knöpfe unten.
  async function einstellungenSpeichern(event: React.FormEvent) {
    event.preventDefault();
    try {
      const ergebnis = await updateMailPostfachEinstellungen({
        berichtszeit: einstellungenForm.berichtszeit,
        berichtEmpfaenger: einstellungenForm.berichtEmpfaenger.trim() || null,
        imapHost: einstellungenForm.imapHost.trim() || null,
        imapPort: einstellungenForm.imapPort.trim() ? Number(einstellungenForm.imapPort) : null,
        imapUser: einstellungenForm.imapUser.trim() || null,
        imapPasswort: einstellungenForm.imapPasswort.trim() || undefined,
        anthropicApiKey: einstellungenForm.anthropicApiKey.trim() || undefined,
      });
      setImapPasswortGesetzt(ergebnis.imapPasswortGesetzt);
      setAnthropicApiKeyGesetzt(ergebnis.anthropicApiKeyGesetzt);
      setEinstellungenForm((f) => ({ ...f, imapPasswort: "", anthropicApiKey: "" }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
    }
  }

  async function geheimwertEntfernen(feld: "imapPasswort" | "anthropicApiKey") {
    try {
      const ergebnis = await updateMailPostfachEinstellungen({
        berichtszeit: einstellungenForm.berichtszeit,
        berichtEmpfaenger: einstellungenForm.berichtEmpfaenger.trim() || null,
        imapHost: einstellungenForm.imapHost.trim() || null,
        imapPort: einstellungenForm.imapPort.trim() ? Number(einstellungenForm.imapPort) : null,
        imapUser: einstellungenForm.imapUser.trim() || null,
        [feld]: null,
      });
      setImapPasswortGesetzt(ergebnis.imapPasswortGesetzt);
      setAnthropicApiKeyGesetzt(ergebnis.anthropicApiKeyGesetzt);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Entfernen");
    }
  }

  // Beide Test-Knöpfe schicken die aktuell im Formular stehenden Werte; ein leeres Passwort-/
  // API-Key-Feld lässt das Backend auf den bereits gespeicherten Wert zurückfallen (so lässt sich
  // auch ohne erneute Eingabe testen, ob ein zuvor gespeicherter Wert noch funktioniert).
  async function imapVerbindungTesten() {
    setImapTestLaeuft(true);
    setImapTestErgebnis(undefined);
    try {
      setImapTestErgebnis(
        await testeImapVerbindung({
          host: einstellungenForm.imapHost.trim() || undefined,
          port: einstellungenForm.imapPort.trim() ? Number(einstellungenForm.imapPort) : undefined,
          user: einstellungenForm.imapUser.trim() || undefined,
          passwort: einstellungenForm.imapPasswort.trim() || undefined,
        }),
      );
    } catch (err) {
      setImapTestErgebnis({ ok: false, fehler: err instanceof Error ? err.message : "Test fehlgeschlagen" });
    } finally {
      setImapTestLaeuft(false);
    }
  }

  async function apiKeyTesten() {
    setApiKeyTestLaeuft(true);
    setApiKeyTestErgebnis(undefined);
    try {
      setApiKeyTestErgebnis(await testeAnthropicApiKey(einstellungenForm.anthropicApiKey.trim() || undefined));
    } catch (err) {
      setApiKeyTestErgebnis({ ok: false, fehler: err instanceof Error ? err.message : "Test fehlgeschlagen" });
    } finally {
      setApiKeyTestLaeuft(false);
    }
  }

  async function berichtJetztErstellen() {
    setBerichtLaeuft(true);
    try {
      await erstelleMailBericht();
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Berichtslauf fehlgeschlagen");
    } finally {
      setBerichtLaeuft(false);
    }
  }

  return (
    <>
      <h1>Mail-Postfach</h1>
      <p>
        Zentrales Feedback-Postfach der Software (Fehlermeldungen, Lob, Anregungen, Kritik, Spam). Neue Mails werden
        beim Berichtslauf per KI klassifiziert; erkannte Anforderungen landen als „KI · ungeprüft" markierte Karte im{" "}
        <a href="/entwicklungs-board">Entwicklungs-Board</a>.
      </p>
      {fehler && <p role="alert">{fehler}</p>}

      <section>
        <h2>Einstellungen</h2>
        <form onSubmit={einstellungenSpeichern} className="regeln-formular">
          <div className="tabellen-wrapper">
            <table className="uebersicht-tabelle regeln-tabelle">
              <caption className="sr-only">Bericht</caption>
              <tbody>
                <tr>
                  <th scope="row">
                    <label htmlFor="mail-berichtszeit">Tägliche Berichtszeit</label>
                  </th>
                  <td>
                    <input
                      id="mail-berichtszeit"
                      type="time"
                      required
                      value={einstellungenForm.berichtszeit}
                      onChange={(e) => setEinstellungenForm((f) => ({ ...f, berichtszeit: e.target.value }))}
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="mail-empfaenger">Bericht-Empfänger (E-Mail)</label>
                  </th>
                  <td>
                    <input
                      id="mail-empfaenger"
                      type="email"
                      value={einstellungenForm.berichtEmpfaenger}
                      onChange={(e) => setEinstellungenForm((f) => ({ ...f, berichtEmpfaenger: e.target.value }))}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>IMAP-Zugang</h3>
          <div className="tabellen-wrapper">
            <table className="uebersicht-tabelle regeln-tabelle">
              <caption className="sr-only">IMAP-Zugang</caption>
              <tbody>
                <tr>
                  <th scope="row">
                    <label htmlFor="mail-imap-host">Host</label>
                  </th>
                  <td>
                    <input
                      id="mail-imap-host"
                      value={einstellungenForm.imapHost}
                      onChange={(e) => setEinstellungenForm((f) => ({ ...f, imapHost: e.target.value }))}
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="mail-imap-port">Port</label>
                  </th>
                  <td>
                    <input
                      id="mail-imap-port"
                      type="number"
                      placeholder="993"
                      value={einstellungenForm.imapPort}
                      onChange={(e) => setEinstellungenForm((f) => ({ ...f, imapPort: e.target.value }))}
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="mail-imap-user">Benutzer</label>
                  </th>
                  <td>
                    <input
                      id="mail-imap-user"
                      value={einstellungenForm.imapUser}
                      onChange={(e) => setEinstellungenForm((f) => ({ ...f, imapUser: e.target.value }))}
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="mail-imap-passwort">Passwort</label>
                  </th>
                  <td>
                    <input
                      id="mail-imap-passwort"
                      type="password"
                      autoComplete="new-password"
                      value={einstellungenForm.imapPasswort}
                      onChange={(e) => setEinstellungenForm((f) => ({ ...f, imapPasswort: e.target.value }))}
                    />
                    <p className="feld-hinweis">
                      {imapPasswortGesetzt ? "Hinterlegt – leer lassen, um es zu behalten." : "Noch nicht hinterlegt."}
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="kanban-sync-aktionen">
            <button type="button" onClick={imapVerbindungTesten} disabled={imapTestLaeuft}>
              {imapTestLaeuft ? "Verbindung wird getestet…" : "Verbindung testen"}
            </button>
            {imapPasswortGesetzt && (
              <button type="button" onClick={() => geheimwertEntfernen("imapPasswort")}>
                Passwort entfernen
              </button>
            )}
          </div>
          {imapTestErgebnis && (
            <p role="status">{imapTestErgebnis.ok ? "✓ Verbindung erfolgreich." : `✗ ${imapTestErgebnis.fehler}`}</p>
          )}

          <h3>KI-Klassifikation</h3>
          <div className="tabellen-wrapper">
            <table className="uebersicht-tabelle regeln-tabelle">
              <caption className="sr-only">KI-Klassifikation</caption>
              <tbody>
                <tr>
                  <th scope="row">
                    <label htmlFor="mail-api-key">Anthropic-API-Key</label>
                  </th>
                  <td>
                    <input
                      id="mail-api-key"
                      type="password"
                      autoComplete="new-password"
                      value={einstellungenForm.anthropicApiKey}
                      onChange={(e) => setEinstellungenForm((f) => ({ ...f, anthropicApiKey: e.target.value }))}
                    />
                    <p className="feld-hinweis">
                      {anthropicApiKeyGesetzt ? "Hinterlegt – leer lassen, um ihn zu behalten." : "Noch nicht hinterlegt."}
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="kanban-sync-aktionen">
            <button type="button" onClick={apiKeyTesten} disabled={apiKeyTestLaeuft}>
              {apiKeyTestLaeuft ? "API-Key wird getestet…" : "API-Key testen"}
            </button>
            {anthropicApiKeyGesetzt && (
              <button type="button" onClick={() => geheimwertEntfernen("anthropicApiKey")}>
                API-Key entfernen
              </button>
            )}
          </div>
          {apiKeyTestErgebnis && (
            <p role="status">{apiKeyTestErgebnis.ok ? "✓ API-Key gültig." : `✗ ${apiKeyTestErgebnis.fehler}`}</p>
          )}

          <div className="kanban-formular-aktionen">
            <button type="submit">Einstellungen speichern</button>
            <button type="button" onClick={berichtJetztErstellen} disabled={berichtLaeuft}>
              {berichtLaeuft ? "Bericht wird erstellt…" : "Bericht jetzt erstellen"}
            </button>
          </div>
        </form>

        {berichte.length > 0 && (
          <ul>
            {berichte.map((b) => (
              <li key={b._id}>
                <strong>{formatiereZeitstempel(b.erzeugtAm)}</strong> ({b.ausgeloestDurch}, {b.anzahlMails} Mail(s),{" "}
                {b.erstellteKartenIds.length} Karte(n)
                {b.kiInputTokens !== undefined && b.kiOutputTokens !== undefined
                  ? `, ${b.kiInputTokens} Input-/${b.kiOutputTokens} Output-Tokens`
                  : ""}
                ): {b.zusammenfassungText || "(keine Zusammenfassung)"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Mails durchsuchen</h2>
        <div className="kanban-formular-zeile">
          <div className="feld">
            <label htmlFor="mail-suchtext">Suche</label>
            <input
              id="mail-suchtext"
              value={suchtext}
              onChange={(e) => setSuchtext(e.target.value)}
              placeholder="Betreff, Absender, Text…"
            />
          </div>
          <div className="feld">
            <label htmlFor="mail-kategorie-filter">Kategorie</label>
            <select
              id="mail-kategorie-filter"
              value={kategorieFilter}
              onChange={(e) => setKategorieFilter(e.target.value as MailKategorie | "")}
            >
              <option value="">Alle</option>
              {Object.entries(KATEGORIE_LABEL).map(([wert, label]) => (
                <option key={wert} value={wert}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="feld">
            <label htmlFor="mail-status-filter">Status</label>
            <select
              id="mail-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MailManuellerStatus | "")}
            >
              <option value="">Alle</option>
              <option value="erledigt">Erledigt</option>
              <option value="ignoriert">Ignoriert</option>
            </select>
          </div>
        </div>

        {!geladen && <p>Lädt…</p>}
        {geladen && mails.length === 0 && <p>Keine Mails gefunden.</p>}
        {geladen && mails.length > 0 && (
          <table className="uebersicht-tabelle">
            <thead>
              <tr>
                <th>Empfangen</th>
                <th>Von</th>
                <th>Betreff</th>
                <th>Kategorie</th>
                <th>KI-Zusammenfassung</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {mails.map((mail) => (
                <tr key={mail._id}>
                  <td>{formatiereZeitstempel(mail.empfangenAm)}</td>
                  <td>{mail.von}</td>
                  <td>{mail.betreff}</td>
                  <td>{mail.kategorie ? KATEGORIE_LABEL[mail.kategorie] : "noch nicht klassifiziert"}</td>
                  <td>{mail.kiZusammenfassung ?? "–"}</td>
                  <td>{mail.manuellerStatus ?? "–"}</td>
                  <td>
                    {mail.kanbanKartenId ? (
                      <span>Kanban-Karte angelegt</span>
                    ) : (
                      <button type="button" onClick={() => karteAnlegen(mail)}>
                        Als Kanban-Karte übernehmen
                      </button>
                    )}
                    {mail.manuellerStatus !== "erledigt" && (
                      <button type="button" onClick={() => statusSetzen(mail, "erledigt")}>
                        Erledigt
                      </button>
                    )}
                    {mail.manuellerStatus !== "ignoriert" && (
                      <button type="button" onClick={() => statusSetzen(mail, "ignoriert")}>
                        Ignorieren
                      </button>
                    )}
                    {mail.manuellerStatus && (
                      <button type="button" onClick={() => statusSetzen(mail, null)}>
                        Status zurücksetzen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
