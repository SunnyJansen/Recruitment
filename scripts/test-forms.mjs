/**
 * Test van de formuliercontrole voor vacatures en kandidaten (lib/domain/forms.ts).
 * Gebruik:  npm run test:forms
 */
import assert from "node:assert/strict";

import {
  experienceToText,
  languageForCountry,
  normalizeLinkedinUrl,
  parseCandidateForm,
  parseVacancyForm,
  readRequirements,
  splitList,
} from "../lib/domain/forms.ts";

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

console.log("Lijsten:");
t("komma, puntkomma en enter splitsen; dubbelen weg", () =>
  assert.deepEqual(splitList("TIG, MIG;  rvs\nTIG , "), ["TIG", "MIG", "rvs"]));

console.log("Vacatures:");
t("titel verplicht", () => {
  const r = parseVacancyForm({ title: "  " });
  assert.equal(r.ok, false);
  assert.match(r.errors.title, /functietitel/);
});
t("volledige vacature met eisen", () => {
  const r = parseVacancyForm({
    title: "TIG-lasser RVS",
    location: "Venlo",
    country: "NL",
    status: "open",
    lasprocessen: ["TIG (141)", "MAG (135)"],
    materialen: "RVS",
    verplichte_skills: "Tekening lezen, Hechten",
    certificaten: "NEN-EN-ISO 9606-1; VCA",
    min_jaren_ervaring: "3",
    max_reisafstand_km: "50",
    talen: "Nederlands, Engels",
    salaris: "€ 3.200 – 3.800",
  });
  assert.equal(r.ok, true);
  assert.equal(r.data.title, "TIG-lasser RVS");
  assert.deepEqual(r.data.requirements.lasprocessen, ["TIG (141)", "MAG (135)"]);
  assert.deepEqual(r.data.requirements.materialen, ["RVS"]);
  assert.deepEqual(r.data.requirements.certificaten, ["NEN-EN-ISO 9606-1", "VCA"]);
  assert.equal(r.data.requirements.min_jaren_ervaring, 3);
  assert.equal(r.data.requirements.max_reisafstand_km, 50);
  assert.equal(r.data.description, null);
});
t("ongeldige jaren ervaring", () => {
  const r = parseVacancyForm({ title: "Lasser", min_jaren_ervaring: "drie" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.min_jaren_ervaring);
});
t("onbekende status geweigerd", () => assert.equal(parseVacancyForm({ title: "x", status: "weg" }).ok, false));
t("eisen uit database met ontbrekende velden", () => {
  const r = readRequirements({ lasprocessen: ["TIG (141)"], min_jaren_ervaring: "x" });
  assert.deepEqual(r.lasprocessen, ["TIG (141)"]);
  assert.equal(r.min_jaren_ervaring, null);
  assert.deepEqual(r.materialen, []);
});

console.log("Kandidaten:");
t("taal: Nederland → nl, Zuid-Afrika → en", () => {
  assert.equal(languageForCountry("NL"), "nl");
  assert.equal(languageForCountry("ZA"), "en");
  assert.equal(languageForCountry(null), "en");
});
t("LinkedIn-link eenvormig maken", () => {
  assert.equal(normalizeLinkedinUrl("linkedin.com/in/Jan-de-Vries-123/"), "https://www.linkedin.com/in/jan-de-vries-123");
  assert.equal(normalizeLinkedinUrl("https://nl.linkedin.com/in/jan-de-vries-123?trk=x"), "https://www.linkedin.com/in/jan-de-vries-123");
  assert.equal(normalizeLinkedinUrl("https://www.linkedin.com/company/cr8las"), null);
  assert.equal(normalizeLinkedinUrl("https://evil.example/in/jan"), null);
  assert.equal(normalizeLinkedinUrl(""), null);
});
t("naam verplicht, foute LinkedIn-link en e-mail gemeld", () => {
  const r = parseCandidateForm({ full_name: "", linkedin_url: "https://example.com", email: "geen-mail" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.full_name && r.errors.linkedin_url && r.errors.email);
});
t("volledige kandidaat; taal volgt land", () => {
  const r = parseCandidateForm({
    full_name: "Pieter van Wyk",
    country: "ZA",
    email: "Pieter@Example.co.za ",
    skills: "TIG, Pijpleidingen",
    experience: "Lasser – Sasol – 2019-2024\n\nPijpfitter – Eskom – 2015-2019",
    linkedin_url: "https://za.linkedin.com/in/pietervanwyk",
  });
  assert.equal(r.ok, true);
  assert.equal(r.data.language, "en");
  assert.equal(r.data.email, "pieter@example.co.za");
  assert.deepEqual(r.data.skills, ["TIG", "Pijpleidingen"]);
  assert.equal(r.data.experience.length, 2);
  assert.equal(r.data.linkedin_url, "https://www.linkedin.com/in/pietervanwyk");
});
t("taal handmatig overschrijven", () => {
  const r = parseCandidateForm({ full_name: "Jan", country: "BE", language: "nl" });
  assert.equal(r.data.language, "nl");
});
t("ervaring terug naar tekst", () => {
  assert.equal(experienceToText([{ omschrijving: "Lasser" }, { title: "Fitter", company: "X", period: "2020" }]), "Lasser\nFitter – X – 2020");
});

console.log(`\n${failed ? `${failed} mislukt` : "Alles geslaagd"}`);
process.exit(failed ? 1 : 0);
