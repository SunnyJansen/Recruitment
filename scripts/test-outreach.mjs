/**
 * Test van berichtteksten (lib/domain/templates.ts) en het omzetten van
 * connecties, gesprekken en berichten (lib/unipile/map.ts).
 * Gebruik:  npm run test:outreach
 */
import assert from "node:assert/strict";

import {
  checkTemplate,
  DEFAULT_TEMPLATE_EN,
  DEFAULT_TEMPLATE_NL,
  isOptOutReply,
  renderTemplate,
} from "../lib/domain/templates.ts";
import { incomingMessages, mapChats, mapRelations } from "../lib/unipile/map.ts";

let failed = 0;
function t(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const vars = { fullName: "Jan de Vries", vacancyTitle: "TIG-lasser", vacancyLocation: "Venlo", language: "nl", senderName: "Sunny Jansen", senderTitle: "Projectmanager", companyName: "Cr8las" };

console.log("Teksten:");
t("standaardteksten slagen voor de AVG-controle", () => {
  assert.deepEqual(checkTemplate(DEFAULT_TEMPLATE_NL, "nl"), []);
  assert.deepEqual(checkTemplate(DEFAULT_TEMPLATE_EN, "en"), []);
});
t("zonder bron of afmeldoptie geweigerd", () => {
  const p = checkTemplate("Hoi {voornaam}, kom bij ons werken!", "nl");
  assert.equal(p.length, 2);
});
t("onbekend invulveld gemeld", () => assert.match(checkTemplate(DEFAULT_TEMPLATE_NL + " {salaris}", "nl").join(), /\{salaris\}/));
t("invullen: voornaam, functie, plaats, afzender", () => {
  const r = renderTemplate("Hoi {voornaam}, {functie} in {plaats}. {afzender} ({afzender_functie}, {bedrijf})", vars);
  assert.equal(r, "Hoi Jan, TIG-lasser in Venlo. Sunny Jansen (Projectmanager, Cr8las)");
});
t("geen plaats → 'jouw regio' / 'your region'", () => {
  assert.equal(renderTemplate("{plaats}", { ...vars, vacancyLocation: null }), "jouw regio");
  assert.equal(renderTemplate("{plaats}", { ...vars, vacancyLocation: " ", language: "en" }), "your region");
});

console.log("Afmelding herkennen:");
for (const [text, expected] of [
  ["Geen interesse, bedankt", true],
  ["Ik ben niet geïnteresseerd.", true],
  ["STOP", true],
  ["Please remove me from your list", true],
  ["Not interested, thanks", true],
  ["No thanks", true],
  ["Ja, vertel me meer!", false],
  ["Hoeveel verdien je? Stop je ook met werken in de zomer?", false],
  ["Yes I'm interested, call me", false],
]) {
  t(`"${text}" → ${expected ? "afmelden" : "gewone reactie"}`, () => assert.equal(isOptOutReply(text), expected));
}

console.log("Unipile v2 omzetten:");
t("connecties: LinkedIn-id + profiellink", () => {
  const r = mapRelations({ data: [{ id: "r1", created_at: "2026-11-11T10:00:00Z", user: { id: "ACoA1", public_identifier: "jan-de-vries" } }], next_cursor: "c2" });
  assert.equal(r.relations[0].userId, "ACoA1");
  assert.equal(r.relations[0].profileUrl, "https://www.linkedin.com/in/jan-de-vries");
  assert.equal(r.cursor, "c2");
});
t("gesprekken: alleen 1-op-1", () => {
  const r = mapChats({ data: [{ id: "c1", user_id: "ACoA1", type: "1to1", is_1to1: true, last_message_timestamp: "2026-11-11T10:00:00Z" }, { id: "g1", type: "group", is_1to1: false }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].chatId, "c1");
});
t("berichten: alleen van de kandidaat, oudste eerst", () => {
  const r = incomingMessages({ data: [
    { id: "m3", text: "Graag!", is_sender: false, timestamp: "2026-11-11T12:00:00Z" },
    { id: "m2", text: "Ons bericht", is_sender: true, timestamp: "2026-11-11T11:00:00Z" },
    { id: "m1", text: "", is_sender: false, timestamp: "2026-11-11T10:00:00Z" },
    { id: "m0", text: "Eerder", is_sender: false, timestamp: "2026-11-11T09:00:00Z" },
  ] });
  assert.deepEqual(r.map((m) => m.messageId), ["m0", "m3"]);
});

console.log(`\n${failed ? `${failed} mislukt` : "Alles geslaagd"}`);
process.exit(failed ? 1 : 0);
