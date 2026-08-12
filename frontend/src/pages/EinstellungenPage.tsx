import { ThemeUmschalter } from "../components/ThemeUmschalter";
import { DichteUmschalter } from "../components/DichteUmschalter";
import { BreiteUmschalter } from "../components/BreiteUmschalter";
import { useAuth } from "../auth";

/** Rein geraetelokale Anzeige-Einstellungen (localStorage) - bewusst NICHT an ein
 * Benutzerkonto gebunden: fuer den geplanten Offline/LAN-Betrieb (Gesamtspezifikation
 * Abschnitt 21.3) gibt es keine angemeldeten Benutzer, die Seite muss also auch ohne
 * Login funktionieren (siehe Route in App.tsx, ausserhalb von GeschuetzteRoute).
 * Angemeldete Benutzer haben zusaetzlich einen kontogebundenen Standardwert in ihrem
 * Profil - diese Seite hier ueberschreibt ihn nur auf DIESEM Geraet (z.B. gemeinsam
 * genutzter Rechner), aendert aber nichts am hinterlegten Konto-Standard selbst. */
export function EinstellungenPage() {
  const { benutzer } = useAuth();

  return (
    <>
      <h1>Einstellungen</h1>
      <p>Diese Einstellungen gelten nur für dieses Gerät bzw. diesen Browser.</p>
      {benutzer && (
        <p>
          Angemeldet als „{benutzer.name}": deine kontogebundenen Standardwerte legst du stattdessen in{" "}
          <a href="/profil">deinem Profil</a> fest - die gelten dann auch auf anderen Geräten. Hier änderst du nur,
          was auf diesem Gerät angezeigt wird.
        </p>
      )}

      <h2>Farbschema</h2>
      <ThemeUmschalter />

      <h2>Zeilenabstand</h2>
      <p>Wirkt sich auf die Zeilenhöhe von Tabellen und die Höhe von Eingabefeldern in der ganzen Anwendung aus.</p>
      <DichteUmschalter />

      <h2>Breite</h2>
      <p>„Breit" nutzt mehr Bildschirmbreite (z. B. auf Widescreen-Monitoren); „Standard" hält eine schmalere, gut lesbare Spalte.</p>
      <BreiteUmschalter />
    </>
  );
}
