# Sicherheits-Response-Header (Sicherheitsdurchsicht #3)

**Datum:** 20.08.2026

Dritter Punkt der Sicherheitsdurchsicht der Server-Version.

## Befund

Weder das Backend noch die nginx-Site setzten Sicherheits-Header: kein `X-Content-Type-Options`,
`X-Frame-Options`/CSP (Clickjacking, MIME-Sniffing), keine `Referrer-Policy`, kein HSTS – obwohl die
Zentrale Plattform öffentlich über HTTPS läuft.

## Umsetzung

Gesetzt werden (konservativer, SPA-verträglicher Satz):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` + `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
- `Referrer-Policy: strict-origin-when-cross-origin` (schützt u. a. die token-tragenden öffentlichen
  URLs – der Pfad fließt beim Klick auf externe Links nicht als Referer ab)
- `Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()`
- `Strict-Transport-Security: max-age=15552000` **nur** bei `COOKIE_SECURE=true`

**Bewusst KEINE restriktive CSP für Skripte/Styles/Bilder** – die würde die Vite-SPA, Google-Fonts
und den YouTube-Embed leicht brechen (Nutzer-Vorgabe). Die CSP beschränkt nur Einbettung/`<base>`/
Plugins, ohne das Laden der App-Ressourcen zu berühren.

**HSTS-Feinheiten:** gated auf `COOKIE_SECURE` (dasselbe „wir sind hinter HTTPS"-Signal); über HTTP/
eine IP ignorieren Browser den Header ohnehin. **Ohne `includeSubDomains`** – die Instanzen teilen
sich die Parent-Domain (`turniere` / `turniere-demo` `.blindentorball.de`) mit evtl. weiteren
Diensten; `includeSubDomains` würde HTTPS geschwisterweit erzwingen. `max-age` bewusst 180 Tage (statt
aggressiver 1 Jahr) für die Beta. Robusteste HSTS-Stelle bleibt der externe TLS-Endpunkt (NPM).

### Zwei Auslieferungswege

- **Backend** (`backend/src/sicherheitsHeader.ts`, onSend-Hook auf der Root-Instanz in `index.ts`):
  deckt alle API-Antworten ab **und** im `SERVE_FRONTEND`-Modus (Windows-Installation) auch die
  statisch ausgelieferten Frontend-Dateien.
- **nginx** (`deploy/deploy-instanz.sh`, im `location /`-Block – nicht global, damit `/api`-Antworten
  die Header nicht doppelt bekommen; die setzt das Backend und nginx reicht sie durch): deckt die auf
  dem Debian-Prod von nginx selbst ausgelieferten Frontend-Dateien ab. HSTS gehört hier nicht hin
  (nginx lauscht auf HTTP hinter dem TLS-Proxy); es genügt, dass eine `/api`-Antwort pro Seitenaufruf
  HSTS über HTTPS liefert – HSTS gilt origin-weit.

## Verifikation

- 2 neue Unit-Tests (`sicherheitsHeader.test.ts`, ohne CouchDB): alle Header gesetzt; HSTS nur bei
  `COOKIE_SECURE=true` und ohne `includeSubDomains`.
- Live-Rauchtest (gebootetes Backend, `curl -D -`): alle sechs Header auf `/health` vorhanden, HSTS
  `max-age=15552000` bei `COOKIE_SECURE=true`.

## Rollout

Backend-Header wirken nach Rebuild + Neustart je Instanz; die nginx-Header erst beim nächsten
`deploy-instanz.sh`-Lauf (die Site wird dabei neu geschrieben). Kein Datenmodell-Wechsel.
