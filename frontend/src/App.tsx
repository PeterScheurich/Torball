import { Link, Route, Routes } from "react-router-dom";
import { TurnierListePage } from "./pages/TurnierListePage";
import { TurnierAnlegenPage } from "./pages/TurnierAnlegenPage";
import { MannschaftenErfassenPage } from "./pages/MannschaftenErfassenPage";
import { SpielplanErstellenPage } from "./pages/SpielplanErstellenPage";
import { TurnierVerwaltenPage } from "./pages/TurnierVerwaltenPage";
import { ThemeUmschalter } from "./components/ThemeUmschalter";

function App() {
  return (
    <>
      <header>
        <nav>
          <Link to="/" className="marke">
            <img className="logo logo-hell" src="/images/torball-logo.svg" alt="" width="32" height="32" />
            <img className="logo logo-dunkel" src="/images/torball-logo-dark.svg" alt="" width="32" height="32" />
            Torball-Turniere
          </Link>
          <ThemeUmschalter />
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<TurnierListePage />} />
          <Route path="/turniere/neu" element={<TurnierAnlegenPage />} />
          <Route path="/turniere/:id/mannschaften-erfassen" element={<MannschaftenErfassenPage />} />
          <Route path="/turniere/:id/spielplan-erstellen" element={<SpielplanErstellenPage />} />
          <Route path="/turniere/:id" element={<TurnierVerwaltenPage />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
