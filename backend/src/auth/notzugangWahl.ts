import type { Benutzer } from "@torball/shared";

/**
 * Reine Auswahl des Kontos fuer den Notzugang (siehe notzugang.ts) - bewusst ohne Datenbank-Import, damit sie im
 * normalen `npm test` ohne CouchDB geprueft werden kann.
 */

export type KontoAuswahl =
  | { art: "konto"; konto: Benutzer }
  | { art: "fehler"; meldung: string };

/** Beschreibt ein Konto fuer die Ausgabe in der Konsole. */
export function kontoZeile(b: Benutzer): string {
  const vorname = b.vorname ? `${b.vorname} ` : "";
  return `${b.email} (${vorname}${b.name}${b.gesperrt ? ", gesperrt" : ""})`;
}

/**
 * Waehlt das Konto, fuer das der Notzugang gelten soll - rein, ohne Datenbankzugriff.
 * Ohne E-Mail-Adresse genau dann, wenn es nur EIN nicht gesperrtes Admin-Konto gibt (man weiss im Notfall womoeglich
 * auch die Adresse nicht mehr); bei mehreren werden sie aufgelistet.
 */
export function waehleNotzugangKonto(alle: Benutzer[], email: string | undefined): KontoAuswahl {
  const admins = alle.filter((b) => b.globaleRolle === "admin");
  const adresse = email?.trim().toLowerCase();

  if (adresse) {
    const konto = alle.find((b) => b.email.toLowerCase() === adresse);
    if (!konto) return { art: "fehler", meldung: `Kein Konto mit der E-Mail-Adresse "${email!.trim()}" gefunden.` };
    if (konto.globaleRolle !== "admin") {
      return {
        art: "fehler",
        meldung:
          `"${konto.email}" ist kein Administrator-Konto. Der Notzugang gilt nur fuer Administratoren. ` +
          'Andere Konten setzen ihr Passwort ueber "Passwort vergessen" oder lassen es von einem Administrator zuruecksetzen.',
      };
    }
    return gesperrtOderKonto(konto);
  }

  if (admins.length === 0) {
    return { art: "fehler", meldung: "Es gibt noch kein Administrator-Konto. Das erste Konto legt die Ersteinrichtung an." };
  }
  const nutzbar = admins.filter((b) => !b.gesperrt);
  if (admins.length === 1) return gesperrtOderKonto(admins[0]);
  if (nutzbar.length === 1) return gesperrtOderKonto(nutzbar[0]);
  return {
    art: "fehler",
    meldung:
      "Es gibt mehrere Administrator-Konten. Bitte eines mit --email=\"<E-Mail>\" angeben:\n" +
      admins.map((b) => `  - ${kontoZeile(b)}`).join("\n"),
  };
}

function gesperrtOderKonto(konto: Benutzer): KontoAuswahl {
  if (konto.gesperrt) {
    return {
      art: "fehler",
      meldung:
        `Das Konto "${konto.email}" ist gesperrt${konto.gesperrtGrund ? ` (Grund: ${konto.gesperrtGrund})` : ""} - ` +
        "auch mit neuem Passwort koennte sich niemand anmelden. Bitte zuerst entsperren: " +
        `benutzer:entsperren --email="${konto.email}"`,
    };
  }
  return { art: "konto", konto };
}
