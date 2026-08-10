import { useCallback, useEffect, useState } from "react";
import type { GlobaleRolle } from "@torball/shared";
import { benutzerAktualisieren, benutzerEinladen, getBenutzerListe, type BenutzerProfil } from "../api";
import { useAuth } from "../auth";

const ROLLEN_LABEL: Record<GlobaleRolle, string> = {
  admin: "Admin",
  manager: "Manager",
  benutzer: "Benutzer",
};

export function BenutzerverwaltungPage() {
  const { benutzer: angemeldeter } = useAuth();
  const [liste, setListe] = useState<BenutzerProfil[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rolle, setRolle] = useState<GlobaleRolle>("benutzer");
  const [einladungslink, setEinladungslink] = useState<string | undefined>();
  const [einladungPerMail, setEinladungPerMail] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();

  const laden = useCallback(async () => {
    try {
      setListe(await getBenutzerListe());
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  const vergebbareRollen: GlobaleRolle[] =
    angemeldeter?.globaleRolle === "admin" ? ["admin", "manager", "benutzer"] : ["manager", "benutzer"];

  async function einladen(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    setEinladungslink(undefined);
    setEinladungPerMail(false);
    try {
      const { einladungsToken } = await benutzerEinladen({ name, email, globaleRolle: rolle });
      if (einladungsToken) {
        setEinladungslink(`${window.location.origin}/einladung/${einladungsToken}`);
      } else {
        setEinladungPerMail(true);
      }
      setName("");
      setEmail("");
      setRolle("benutzer");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Einladen");
    }
  }

  async function rolleAendern(id: string, neueRolle: GlobaleRolle) {
    try {
      await benutzerAktualisieren(id, { globaleRolle: neueRolle });
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Rolle");
    }
  }

  async function sperrenUmschalten(b: BenutzerProfil) {
    try {
      await benutzerAktualisieren(b._id, { gesperrt: !b.gesperrt });
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Sperrung");
    }
  }

  return (
    <>
      <h1>Benutzerverwaltung</h1>
      {fehler && <p role="alert">{fehler}</p>}

      <h2>Bestehende Benutzer</h2>
      <div className="tabellen-wrapper">
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">E-Mail</th>
              <th scope="col">Rolle</th>
              <th scope="col">Status</th>
              <th scope="col">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((b) => (
              <tr key={b._id}>
                <td>{b.name}</td>
                <td>{b.email}</td>
                <td>
                  <label className="sr-only" htmlFor={`rolle-${b._id}`}>
                    Rolle von {b.name}
                  </label>
                  <select
                    id={`rolle-${b._id}`}
                    value={b.globaleRolle}
                    disabled={b._id === angemeldeter?._id || (angemeldeter?.globaleRolle !== "admin" && b.globaleRolle === "admin")}
                    onChange={(e) => rolleAendern(b._id, e.target.value as GlobaleRolle)}
                  >
                    {(angemeldeter?.globaleRolle === "admin"
                      ? (["admin", "manager", "benutzer"] as GlobaleRolle[])
                      : (["manager", "benutzer"] as GlobaleRolle[])
                    ).map((r) => (
                      <option key={r} value={r}>
                        {ROLLEN_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{b.gesperrt ? "Gesperrt" : !b.hatPasswort ? "Einladung offen" : "Aktiv"}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => sperrenUmschalten(b)}
                    disabled={b._id === angemeldeter?._id}
                  >
                    {b.gesperrt ? "Entsperren" : "Sperren"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Neuen Benutzer einladen</h2>
      <form onSubmit={einladen}>
        <div className="feld">
          <label htmlFor="name">Name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="email">E-Mail</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="rolle">Rolle</label>
          <select id="rolle" value={rolle} onChange={(e) => setRolle(e.target.value as GlobaleRolle)}>
            {vergebbareRollen.map((r) => (
              <option key={r} value={r}>
                {ROLLEN_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Einladen</button>
      </form>

      {einladungPerMail && <p>Einladung wurde per E-Mail verschickt.</p>}
      {einladungslink && (
        <p>
          Kein E-Mail-Versand konfiguriert - Einladungslink bitte manuell weitergeben:
          <br />
          <input type="text" readOnly value={einladungslink} onFocus={(e) => e.target.select()} />
        </p>
      )}
    </>
  );
}
