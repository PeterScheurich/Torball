import { Link, Route, Routes } from "react-router-dom";
import { TurnierListePage } from "./pages/TurnierListePage";
import { TurnierDetailPage } from "./pages/TurnierDetailPage";

function App() {
  return (
    <>
      <header>
        <nav>
          <Link to="/">Torball-Turniere</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<TurnierListePage />} />
          <Route path="/turniere/:id" element={<TurnierDetailPage />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
