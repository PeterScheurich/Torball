/**
 * Gemeinsame Hilfsfunktionen für den Zugriff auf die BookStack-API.
 *
 * Konfiguration über Umgebungsvariablen (siehe .env.example):
 *   BOOKSTACK_URL          z. B. http://bookstack-host
 *   BOOKSTACK_TOKEN_ID     Token-ID aus BookStack
 *   BOOKSTACK_TOKEN_SECRET Token-Secret aus BookStack
 *   BOOKSTACK_BOOK         Name des Buches, z. B. "Software-Entwicklung"
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Umgebungsvariable ${name} fehlt. Bitte .env anlegen (Vorlage: .env.example).`
    );
  }
  return value;
}

export function getConfig() {
  return {
    baseUrl: requireEnv('BOOKSTACK_URL').replace(/\/+$/, ''),
    tokenId: requireEnv('BOOKSTACK_TOKEN_ID'),
    tokenSecret: requireEnv('BOOKSTACK_TOKEN_SECRET'),
    bookName: requireEnv('BOOKSTACK_BOOK'),
  };
}

async function request(config, method, path, body) {
  const url = `${config.baseUrl}/api/${path}`;
  const options = {
    method,
    headers: {
      Authorization: `Token ${config.tokenId}:${config.tokenSecret}`,
      Accept: 'application/json',
    },
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${method} ${path} fehlgeschlagen (HTTP ${response.status}): ${text.slice(0, 500)}`
    );
  }

  return response.json();
}

export const api = {
  get: (config, path) => request(config, 'GET', path),
  post: (config, path, body) => request(config, 'POST', path, body),
  put: (config, path, body) => request(config, 'PUT', path, body),
};

/**
 * Sucht ein Buch anhand seines Namens und liefert dessen ID und Slug.
 */
export async function findBook(config) {
  const result = await api.get(config, 'books?count=500');
  const book = result.data.find((entry) => entry.name === config.bookName);

  if (!book) {
    const available = result.data.map((entry) => entry.name).join(', ');
    throw new Error(
      `Buch "${config.bookName}" nicht gefunden. Vorhanden: ${available}`
    );
  }

  return book;
}

/**
 * Liefert alle Seiten eines Buches (ohne Inhalt – der kommt über fetchPage).
 */
export async function listPages(config, bookId) {
  const result = await api.get(config, `pages?count=500&filter[book_id]=${bookId}`);
  return result.data;
}

/**
 * Liefert eine einzelne Seite inklusive Inhalt.
 */
export async function fetchPage(config, pageId) {
  return api.get(config, `pages/${pageId}`);
}

/**
 * Baut die im Browser aufrufbare URL einer Seite.
 */
export function pageUrl(config, bookSlug, pageSlug) {
  return `${config.baseUrl}/books/${bookSlug}/page/${pageSlug}`;
}
