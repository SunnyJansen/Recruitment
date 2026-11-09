/**
 * Test van werktijden/feestdagen (lib/queue/schedule.ts) en het omzetten van
 * Unipile-antwoorden (lib/unipile/map.ts).
 * Gebruik:  npm run test:linkedin
 */
import assert from "node:assert/strict";

import { experienceToText } from "../lib/domain/forms.ts";
import { checkWorkingHours, DEFAULT_SCHEDULE, dutchHolidays } from "../lib/queue/schedule.ts";
import { countryFromLocation, mapSearchResponse, profileToCandidate } from "../lib/unipile/map.ts";

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
const at = (iso) => new Date(iso);

console.log("Werktijden (Nederlandse tijd):");
t("dinsdag 10:00 → open", () => assert.equal(checkWorkingHours(at("2026-11-10T09:00:00Z")).open, true));
t("dinsdag 07:59 → dicht", () => assert.equal(checkWorkingHours(at("2026-11-10T06:59:00Z")).open, false));
t("dinsdag 18:00 → dicht", () => assert.equal(checkWorkingHours(at("2026-11-10T17:00:00Z")).open, false));
t("zomertijd: 1 juli 08:30 NL (06:30 UTC) → open", () => assert.equal(checkWorkingHours(at("2027-07-01T06:30:00Z")).open, true));
t("zaterdag → dicht", () => assert.match(checkWorkingHours(at("2026-11-14T10:00:00Z")).reason, /werkdagen/));
t("instelbaar: zaterdag als werkdag → open", () =>
  assert.equal(checkWorkingHours(at("2026-11-14T10:00:00Z"), { ...DEFAULT_SCHEDULE, workDays: [1, 2, 3, 4, 5, 6] }).open, true));

console.log("Feestdagen:");
t("Pasen 2027 = 28 maart; Tweede Paasdag 29 maart", () => {
  const h = dutchHolidays(2027);
  assert.equal(h.get("2027-03-28"), "Eerste Paasdag");
  assert.equal(h.get("2027-03-29"), "Tweede Paasdag");
  assert.equal(h.get("2027-05-06"), "Hemelvaartsdag");
  assert.equal(h.get("2027-05-17"), "Tweede Pinksterdag");
});
t("Koningsdag op zondag 2031 → zaterdag 26 april", () => assert.equal(dutchHolidays(2031).get("2031-04-26"), "Koningsdag"));
t("Tweede Kerstdag 2026 (zaterdag) en Eerste Kerstdag op vrijdag → dicht met naam", () =>
  assert.match(checkWorkingHours(at("2026-12-25T10:00:00Z")).reason, /Eerste Kerstdag/));
t("feestdagen uit te zetten", () =>
  assert.equal(checkWorkingHours(at("2026-12-25T10:00:00Z"), { ...DEFAULT_SCHEDULE, skipDutchHolidays: false }).open, true));

console.log("Zoekresultaten omzetten (Unipile v2):");
t("persoon in v2-vorm (data, display_name, next_cursor)", () => {
  const r = mapSearchResponse({
    data: [
      { object: "PeopleSearchResult", id: "ACoAAAdHsOU", display_name: "Piyush Narwani", public_identifier: "piyushnarwani", profile_url: "https://www.linkedin.com/in/piyushnarwani?miniProfileUrn=x", network_distance: "SECOND_DEGREE", location: "San Francisco, CA", headline: "Co-Founder", product: "classic" },
    ],
    next_cursor: "abc",
    total_count: 57,
  });
  assert.equal(r.people.length, 1);
  assert.equal(r.people[0].name, "Piyush Narwani");
  assert.equal(r.people[0].profileUrl, "https://www.linkedin.com/in/piyushnarwani");
  assert.equal(r.people[0].distance, 2);
  assert.equal(r.cursor, "abc");
  assert.equal(r.total, 57);
});
t("laatste pagina: geen next_cursor", () => assert.equal(mapSearchResponse({ data: [] }).cursor, null));

console.log("Profiel → kandidaat:");
t("land uit locatie", () => {
  assert.equal(countryFromLocation("Venlo, Limburg, Netherlands"), "NL");
  assert.equal(countryFromLocation("Secunda, Mpumalanga, South Africa"), "ZA");
  assert.equal(countryFromLocation("Remote"), null);
});
t("v2-profiel wordt kandidaat; geen e-mail/telefoon; huidige werkgever; taal", () => {
  const c = profileToCandidate({
    id: "ACoAAB1",
    public_identifier: "jan-lasser",
    display_name: "Jan Lasser",
    description: "TIG-lasser",
    location: "Venlo, Limburg, Netherlands",
    emails: ["jan@example.com"],
    phone_numbers: ["0612345678"],
    specifics: {
      experience: [
        { company: { name: "Staalbouw BV" }, job_title: "TIG-lasser", started_on: "01/01/2021" },
        { company: { name: "Oud BV" }, job_title: "Leerling-lasser", started_on: "01/01/2018", ended_on: "12/31/2020" },
      ],
      skills: [{ name: "TIG", endorsement_count: 3 }, { name: "RVS", endorsement_count: 1 }, { name: "TIG", endorsement_count: 0 }],
    },
  });
  assert.equal(c.full_name, "Jan Lasser");
  assert.equal(c.headline, "TIG-lasser");
  assert.equal(c.linkedin_provider_id, "ACoAAB1");
  assert.equal(c.linkedin_url, "https://www.linkedin.com/in/jan-lasser");
  assert.equal(c.country, "NL");
  assert.equal(c.language, "nl");
  assert.equal(c.current_company, "Staalbouw BV");
  assert.deepEqual(c.skills, ["TIG", "RVS"]);
  assert.equal("email" in c, false);
  assert.equal("phone" in c, false);
  assert.equal(experienceToText(c.experience), "TIG-lasser – Staalbouw BV – 01/01/2021–heden\nLeerling-lasser – Oud BV – 01/01/2018–12/31/2020");
});
t("Zuid-Afrikaans profiel → Engels", () =>
  assert.equal(profileToCandidate({ id: "x", location: "Secunda, South Africa" }).language, "en"));
t("naam uit voor- en achternaam als display_name ontbreekt", () =>
  assert.equal(profileToCandidate({ id: "x", first_name: "Thabo", last_name: "Nkosi" }).full_name, "Thabo Nkosi"));

console.log(`\n${failed ? `${failed} mislukt` : "Alles geslaagd"}`);
process.exit(failed ? 1 : 0);
