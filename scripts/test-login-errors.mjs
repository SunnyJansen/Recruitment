/**
 * Test van de Nederlandse foutmeldingen bij inloggen.
 * Gebruik:  npm run test:login
 */
import assert from "node:assert/strict";

import { describeLoginError } from "../lib/auth/login-errors.ts";

const cases = [
  {
    name: "één link per minuut → resterende seconden",
    input: { message: "For security purposes, you can only request this after 42 seconds.", status: 429, code: "over_email_send_rate_limit" },
    expect: (r) => r.waitSeconds === 42 && r.message.includes("42 seconden"),
  },
  {
    name: "maximum per uur → uitleg + Resend-tip",
    input: { message: "email rate limit exceeded", status: 429, code: "over_email_send_rate_limit" },
    expect: (r) => r.message.includes("per uur") && r.message.includes("Resend") && r.waitSeconds === 60,
  },
  {
    name: "te veel verzoeken",
    input: { message: "Request rate limit reached", status: 429, code: "over_request_rate_limit" },
    expect: (r) => r.message.includes("Te veel pogingen"),
  },
  {
    name: "niet toegevoegd e-mailadres → geen toegang",
    input: { message: "Signups not allowed for otp", status: 422, code: "otp_disabled" },
    expect: (r) => r.message.includes("geen toegang") && r.waitSeconds === 0,
  },
  {
    name: "onbekende fout → originele tekst erbij",
    input: { message: "Invalid API key", status: 401 },
    expect: (r) => r.message === "Versturen is mislukt: Invalid API key",
  },
];

let failed = 0;
for (const c of cases) {
  const result = describeLoginError(c.input);
  try {
    assert.ok(c.expect(result), JSON.stringify(result));
    console.log(`  ✓ ${c.name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${c.name}\n      ${e.message}`);
  }
}
console.log(`\n${cases.length - failed} geslaagd, ${failed} mislukt`);
process.exit(failed ? 1 : 0);
