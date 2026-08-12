import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth.tsx'
import { themeInitialisieren } from './theme'
import { dichteInitialisieren } from './dichte'
import { breiteInitialisieren } from './breite'

// Einstiegspunkt des Frontends: haengt die App in #root und umschliesst sie mit Router und
// Auth-Context. Davor werden Theme/Dichte einmalig angewendet (siehe Kommentar unten).

// Vor dem ersten Render anwenden (nicht erst in einer Komponente, die evtl. auf der
// aktuellen Seite gar nicht gemountet wird - z.B. ThemeUmschalter/DichteUmschalter
// stecken nur auf der Einstellungen-Seite) - sonst fehlt data-theme/data-dichte nach
// einem Reload (F5) auf jeder anderen Seite und es gilt wieder der Standardwert.
themeInitialisieren()
dichteInitialisieren()
breiteInitialisieren()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
