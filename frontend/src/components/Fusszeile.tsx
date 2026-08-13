import { useAuth } from "../auth";
import { APP_VERSION } from "../version";

/** Globale Fusszeile (auf jeder Seite sichtbar, analog zur Kopfzeile): zeigt den angemeldeten
 *  Benutzer (Vorname + Name, sofern vorhanden) und die App-Version. Der Benutzername stand
 *  frueher im Kopfzeilen-Menue (dort blieb nur noch das 👤-Symbol), die Version frueher als
 *  farbiges Badge neben der Marke. */
export function Fusszeile() {
  const { benutzer } = useAuth();

  return (
    <footer className="fusszeile">
      <span>{benutzer && (benutzer.vorname ? `${benutzer.vorname} ${benutzer.name}` : benutzer.name)}</span>
      <span className="marke-version">{APP_VERSION}</span>
    </footer>
  );
}
