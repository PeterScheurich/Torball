import { test } from "node:test";
import assert from "node:assert/strict";
import type { KanbanKarte, MailNachricht } from "@torball/shared";
import { istVeraltet, kanbanKategorieFuer, naechsteReihenfolgeOffen } from "./berichtHilfen";
import type { Klassifikationsergebnis } from "./klassifikation";

function karte(spalte: KanbanKarte["spalte"], reihenfolge: number): KanbanKarte {
  return {
    _id: `kanbanKarte:${spalte}-${reihenfolge}`,
    docType: "kanbanKarte",
    kanbanId: `kanbanKarte:${spalte}-${reihenfolge}`,
    titel: "Testkarte",
    spalte,
    kategorie: "aufgabe",
    prioritaet: "mittel",
    reihenfolge,
    erstelltAm: "2026-01-01T00:00:00.000Z",
    aktualisiertAm: "2026-01-01T00:00:00.000Z",
  };
}

test("naechsteReihenfolgeOffen: 0 bei leerer Spalte 'offen'", () => {
  assert.equal(naechsteReihenfolgeOffen([karte("inArbeit", 0), karte("erledigt", 3)]), 0);
});

test("naechsteReihenfolgeOffen: haengt hinter die hoechste bestehende Reihenfolge in 'offen' an", () => {
  assert.equal(naechsteReihenfolgeOffen([karte("offen", 0), karte("offen", 2), karte("inArbeit", 9)]), 3);
});

function ergebnis(kategorie: Klassifikationsergebnis["kategorie"]): Klassifikationsergebnis {
  return { kategorie, kiZusammenfassung: "Test", istAnforderung: true };
}

test("kanbanKategorieFuer: Fehlermeldungen werden zu 'bug'", () => {
  assert.equal(kanbanKategorieFuer(ergebnis("fehlermeldung")), "bug");
});

test("kanbanKategorieFuer: alles andere (Anregung/Kritik/Sonstiges) wird zu 'wunsch'", () => {
  assert.equal(kanbanKategorieFuer(ergebnis("anregung")), "wunsch");
  assert.equal(kanbanKategorieFuer(ergebnis("kritik")), "wunsch");
  assert.equal(kanbanKategorieFuer(ergebnis("sonstiges")), "wunsch");
});

function mail(manuellerStatus: MailNachricht["manuellerStatus"], aktualisiertAm: string): MailNachricht {
  return {
    _id: "mailNachricht:test",
    docType: "mailNachricht",
    imapUid: 1,
    von: "test@example.com",
    betreff: "Test",
    empfangenAm: aktualisiertAm,
    text: "Testinhalt",
    manuellerStatus,
    erstelltAm: aktualisiertAm,
    aktualisiertAm,
  };
}

const JETZT = new Date("2026-08-20T12:00:00.000Z");

test("istVeraltet: 'offene' (kein manueller Status) Mails veralten nie, egal wie alt", () => {
  assert.equal(istVeraltet(mail(undefined, "2020-01-01T00:00:00.000Z"), JETZT, 7), false);
});

test("istVeraltet: erledigt/ignoriert vor weniger als 7 Tagen ist bei 7 Tagen Frist noch nicht veraltet", () => {
  const vorSechsTagen = new Date(JETZT.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(istVeraltet(mail("erledigt", vorSechsTagen), JETZT, 7), false);
  assert.equal(istVeraltet(mail("ignoriert", vorSechsTagen), JETZT, 7), false);
});

test("istVeraltet: erledigt/ignoriert vor mindestens 7 Tagen ist bei 7 Tagen Frist veraltet", () => {
  const vorSiebenTagen = new Date(JETZT.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const vorZehnTagen = new Date(JETZT.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(istVeraltet(mail("erledigt", vorSiebenTagen), JETZT, 7), true);
  assert.equal(istVeraltet(mail("ignoriert", vorZehnTagen), JETZT, 7), true);
});

test("istVeraltet: die Frist ist konfigurierbar, nicht fest auf 7 Tage", () => {
  const vorZweiTagen = new Date(JETZT.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(istVeraltet(mail("erledigt", vorZweiTagen), JETZT, 1), true);
  assert.equal(istVeraltet(mail("erledigt", vorZweiTagen), JETZT, 30), false);
});

test("istVeraltet: 'kanban' veraltet nie, egal wie alt (bewusst von der Aufraeumung ausgenommen)", () => {
  assert.equal(istVeraltet(mail("kanban", "2020-01-01T00:00:00.000Z"), JETZT, 7), false);
});
