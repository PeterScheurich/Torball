import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAntwort } from "./klassifikation";

test("parseAntwort liest ein sauberes JSON-Objekt", () => {
  const antwort = JSON.stringify({
    mails: [
      { id: "a", kategorie: "fehlermeldung", kiZusammenfassung: "Absturz beim Speichern", istAnforderung: true },
    ],
    zusammenfassungText: "Eine Fehlermeldung.",
  });
  const lauf = parseAntwort(antwort);
  assert.equal(lauf.zusammenfassungText, "Eine Fehlermeldung.");
  assert.equal(lauf.ergebnisse.a.kategorie, "fehlermeldung");
  assert.equal(lauf.ergebnisse.a.istAnforderung, true);
});

test("parseAntwort ignoriert Text/Markdown-Fences rund um das JSON", () => {
  const antwort = `Hier ist die Klassifikation:\n\`\`\`json\n${JSON.stringify({
    mails: [{ id: "x", kategorie: "lob", kiZusammenfassung: "Danke!", istAnforderung: false }],
    zusammenfassungText: "Ein Lob.",
  })}\n\`\`\`\nEnde.`;
  const lauf = parseAntwort(antwort);
  assert.equal(lauf.ergebnisse.x.kategorie, "lob");
  assert.equal(lauf.ergebnisse.x.istAnforderung, false);
});

test("parseAntwort wirft bei fehlendem JSON-Objekt", () => {
  assert.throws(() => parseAntwort("Ich kann diese Anfrage nicht beantworten."));
});

test("parseAntwort behandelt eine leere mails-Liste", () => {
  const lauf = parseAntwort(JSON.stringify({ mails: [], zusammenfassungText: "Nichts Neues." }));
  assert.deepEqual(lauf.ergebnisse, {});
  assert.equal(lauf.zusammenfassungText, "Nichts Neues.");
});
