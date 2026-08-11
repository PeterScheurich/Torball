import { Link, useNavigate, useParams } from "react-router-dom";
import { SchiedsrichterVerwaltung } from "../components/SchiedsrichterVerwaltung";

/**
 * Optionaler Assistenten-Schritt (nur wenn beim Anlegen "Schiedsrichter-Planung" gewaehlt
 * wurde, siehe Turnier.schiedsrichterPlanung). Nutzt dieselbe Schiedsrichter-Verwaltung wie
 * der gleichnamige Reiter - das Erfassen ist bewusst nicht verpflichtend, "Weiter" ist
 * jederzeit moeglich.
 */
export function SchiedsrichterErfassenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const navigate = useNavigate();

  return (
    <>
      <p>
        Schritt 3 von 4: Schiedsrichter erfassen ·{" "}
        <Link to={`/turniere/${encodeURIComponent(turnierId)}/mannschaften-erfassen`}>Zurück zu Mannschaften</Link>
      </p>
      <h1>Schiedsrichter</h1>
      <p className="feld-hinweis">
        Optional: Erfasse hier die Schiedsrichter für dieses Turnier. Wird einer Person eine Mannschaft zugeordnet,
        vermeidet die spätere Schiedsrichter-Einteilung, dass sie das eigene Team pfeift. Du kannst den Schritt auch
        einfach überspringen.
      </p>

      <SchiedsrichterVerwaltung turnierId={turnierId} />

      <button
        type="button"
        onClick={() => navigate(`/turniere/${encodeURIComponent(turnierId)}/spielplan-erstellen`)}
      >
        Weiter zum Spielplan
      </button>
    </>
  );
}
