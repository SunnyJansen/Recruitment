/**
 * Nep-Unipile (API v2) voor de end-to-end tests. Gedraagt zich zoals de
 * officiële v2-documentatie (docs/UNIPILE.md): zelfde paden met account-ID in
 * het pad (acc_…), zelfde velden en foutvorm, 10 personen per pagina.
 */
import http from "node:http";

export const FAKE_KEY = "unipile_test_key";
export const FAKE_ACCOUNT = "acc_test123";

const PEOPLE = [
  ["Jan Bakker", "TIG-lasser RVS bij Staalbouw Venlo", "Venlo, Limburg, Netherlands"],
  ["Kees Jansen", "Lasser MIG/MAG", "Roermond, Limburg, Netherlands"],
  ["Piet de Groot", "Constructiebankwerker / lasser", "Weert, Limburg, Netherlands"],
  ["Thabo Nkosi", "Coded Welder TIG/ARC", "Secunda, Mpumalanga, South Africa"],
  ["Johan van der Merwe", "Pipe Welder 6G", "Pretoria, Gauteng, South Africa"],
  ["Sanne Willems", "TIG-lasser aluminium", "Maastricht, Limburg, Netherlands"],
  ["Mark Peeters", "Allround lasser", "Sittard, Limburg, Netherlands"],
  ["Ruud Hendriks", "Lasser RVS leidingwerk", "Heerlen, Limburg, Netherlands"],
  ["Lerato Dlamini", "Boilermaker / Welder", "Johannesburg, Gauteng, South Africa"],
  ["Bas Smeets", "Orbitaallasser", "Venray, Limburg, Netherlands"],
  ["Tom Vos", "Lasser in opleiding", "Venlo, Limburg, Netherlands"],
  ["Wim Claessens", "TIG-lasser", "Echt, Limburg, Netherlands"],
  ["Verdwenen Profiel", "Lasser", "Venlo, Limburg, Netherlands"],
].map(([name, headline, location], i) => {
  const n = String(i + 1).padStart(2, "0");
  return { id: `ACoAAFake${n}`, public_identifier: name.toLowerCase().replaceAll(" ", "-"), name, headline, location };
});

/** Profiel 13 bestaat niet meer (404), om foutafhandeling te testen. */
export const MISSING_PROFILE_ID = "ACoAAFake13";
export const FAKE_PEOPLE = PEOPLE;

export async function startFakeUnipile(port) {
  const requests = [];
  const state = {
    mode: "ok", // "ok" | "disconnected"
    invited: [], // user_ids met een uitnodiging
    notesSent: 0, // uitnodigingen mét tekst
    noteLimit: Infinity, // zoals LinkedIn: daarna weigert het uitnodigingen mét tekst
    relations: [], // user_ids die geaccepteerd hebben (oudste eerst)
    chats: new Map(), // chat_id → { userId, messages: [{ id, text, is_sender, timestamp }] }
  };
  let seq = 0;
  const nextId = (prefix) => `${prefix}_${++seq}`;
  const iso = () => new Date(Date.now() + seq).toISOString();

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://fake");
      requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), queryAll: [...url.searchParams], body: raw ? JSON.parse(raw) : null, at: Date.now(), apiKey: req.headers["x-api-key"] });
      const error = (status, type, title, detail) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ object: "Error", type, status, title, detail, req_id: "req_test" }));
      };
      const send = (obj) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };

      if (!req.headers["x-api-key"]) return error(401, "api/missing_authorization", "Missing authorization");
      if (req.headers["x-api-key"] !== FAKE_KEY) return error(401, "api/expired_authorization", "Expired authorization");

      const m = url.pathname.match(/^\/v2\/([^/]+)\/(.*)$/);
      if (!m) return error(404, "api/resource_not_found", "Route not found");
      const [, accountId, rest] = m;
      if (!/^acc_/.test(accountId)) {
        return error(400, "api/invalid_parameters", "Invalid parameters", 'params/account_id : must match pattern "^acc_(.*)$"');
      }
      if (accountId !== FAKE_ACCOUNT) return error(404, "api/resource_not_found", "Account not found");
      if (state.mode === "disconnected") return error(401, "provider/invalid_authorization", "Invalid authorization");

      if (req.method === "GET" && rest === "linkedin/search/parameters") {
        const kw = url.searchParams.get("keywords");
        if (url.searchParams.get("type") !== "LOCATION" || !kw) return error(400, "api/invalid_parameters", "Invalid parameters", "type/keywords");
        return send({
          data: [
            { object: "SearchParameter", id: "90009706", name: `${kw}, Nederland` },
            { object: "SearchParameter", id: "90009707", name: `${kw}, België` },
          ],
        });
      }

      if (req.method === "POST" && rest === "linkedin/search/people") {
        const body = raw ? JSON.parse(raw) : {};
        // v2: geen api/category meer (additionalProperties: false).
        const allowed = ["keywords", "network_distance", "location", "current_company", "past_company", "school", "connections_of", "followers_of", "industry", "service", "profile_language", "open_to_volunteering", "advanced_keywords"];
        const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
        if (unknown.length) return error(400, "api/invalid_parameters", "Invalid parameters", `body must NOT have additional properties: ${unknown.join(",")}`);
        const cursor = url.searchParams.get("cursor");
        const start = cursor ? JSON.parse(Buffer.from(cursor, "base64").toString()).start : 0;
        const page = PEOPLE.slice(start, start + 10);
        const next = start + 10 < PEOPLE.length ? Buffer.from(JSON.stringify({ start: start + 10 })).toString("base64") : undefined;
        return send({
          data: page.map((p) => ({
            object: "PeopleSearchResult",
            id: p.id,
            member_id: `member-${p.id}`,
            display_name: p.name,
            public_identifier: p.public_identifier,
            profile_url: `https://www.linkedin.com/in/${p.public_identifier}`,
            location: p.location,
            headline: p.headline,
            network_distance: "SECOND_DEGREE",
            product: "classic",
          })),
          total_count: PEOPLE.length,
          ...(next ? { next_cursor: next } : {}),
        });
      }

      // ---- Benaderen: uitnodigingen, connecties, gesprekken (v2) ----
      if (req.method === "POST" && rest === "users/me/relation-requests") {
        const body = raw ? JSON.parse(raw) : {};
        if (!body.user_id) return error(400, "api/invalid_parameters", "Invalid parameters", "body must have required property 'user_id'");
        if (state.invited.includes(body.user_id) || state.relations.includes(body.user_id)) {
          return error(422, "provider/unprocessable_entity", "Unprocessable", "An invitation is already pending");
        }
        if (body.message !== undefined) {
          if (body.message.length > 200) return error(422, "provider/unprocessable_entity", "Unprocessable", "Message too long (max 200 for free accounts)");
          if (state.notesSent >= state.noteLimit) return error(422, "provider/unprocessable_entity", "Unprocessable", "Weekly limit of invitations with a note reached");
          state.notesSent++;
        }
        state.invited.push(body.user_id);
        res.writeHead(201, { "content-type": "application/json" });
        return res.end(JSON.stringify({ object: "RelationRequest", type: "sent", id: nextId("rr"), created_at: iso() }));
      }
      if (req.method === "GET" && rest === "users/me/relations") {
        const limit = Number(url.searchParams.get("limit") ?? 20);
        const start = Number(url.searchParams.get("cursor") ?? 0);
        const all = [...state.relations].reverse(); // nieuwste eerst
        const page = all.slice(start, start + limit);
        return send({
          data: page.map((id) => {
            const p = PEOPLE.find((x) => x.id === id) ?? { id, name: id, public_identifier: null };
            return { id: `rel_${id}`, object: "UserRelation", created_at: iso(), user: { id, object: "User", type: "user", display_name: p.name, public_identifier: p.public_identifier } };
          }),
          ...(start + limit < all.length ? { next_cursor: String(start + limit) } : {}),
        });
      }
      if (req.method === "POST" && rest === "inboxes/CLASSIC_PRIMARY/chats/send") {
        const body = raw ? JSON.parse(raw) : {};
        if (typeof body.users_ids !== "string") {
          return error(400, "api/invalid_parameters", "Invalid parameters", "users_ids as array would start a group");
        }
        if (!state.relations.includes(body.users_ids)) return error(403, "provider/insufficient_permissions", "Not a relation", "Recipient is not a relation");
        const chatId = nextId("chat");
        const messageId = nextId("msg");
        state.chats.set(chatId, { userId: body.users_ids, messages: [{ id: messageId, text: body.text, is_sender: true, timestamp: iso() }] });
        return send({ object: "ChatStarted", chat_id: chatId, message_id: messageId });
      }
      if (req.method === "GET" && rest === "chats") {
        const list = [...state.chats.entries()]
          .map(([id, c]) => ({ id, object: "Chat", type: "1to1", is_1to1: true, user_id: c.userId, last_message_timestamp: c.messages.at(-1)?.timestamp }))
          .sort((a, b) => b.last_message_timestamp.localeCompare(a.last_message_timestamp));
        return send({ data: list.slice(0, Number(url.searchParams.get("limit") ?? 20)) });
      }
      const msgs = rest.match(/^chats\/([^/]+)\/messages$/);
      if (req.method === "GET" && msgs) {
        const chat = state.chats.get(decodeURIComponent(msgs[1]));
        if (!chat) return error(404, "provider/resource_not_found", "Chat not found");
        const after = url.searchParams.get("after");
        const list = chat.messages
          .filter((m) => !after || m.timestamp > after)
          .map((m) => ({ object: "Message", id: m.id, text: m.text, chat_id: msgs[1], sender_id: m.is_sender ? "me" : chat.userId, is_sender: m.is_sender, timestamp: m.timestamp, is_event: false, is_deleted: false }))
          .reverse();
        return send({ data: list });
      }

      const profile = rest.match(/^users\/([^/]+)$/);
      if (req.method === "GET" && profile) {
        const id = decodeURIComponent(profile[1]);
        const p = PEOPLE.find((x) => x.id === id || x.public_identifier === id);
        if (!p || p.id === MISSING_PROFILE_ID) return error(404, "provider/resource_not_found", "Resource not found");
        return send({
          object: "UserProfile",
          id: p.id,
          type: "user",
          provider: "linkedin",
          public_identifier: p.public_identifier,
          display_name: p.name,
          first_name: p.name.split(" ")[0],
          last_name: p.name.split(" ").slice(1).join(" "),
          profile_url: `https://www.linkedin.com/in/${p.public_identifier}`,
          description: p.headline,
          bio: "Ervaren lasser.",
          location: p.location,
          // Mag NIET overgenomen worden (besluit: e-mail alleen handmatig).
          emails: [`${p.public_identifier}@example.com`],
          phone_numbers: ["+31612345678"],
          specifics: {
            network_distance: "SECOND_DEGREE",
            experience: [
              { company: { id: "1", name: "Huidig Bedrijf BV" }, job_title: p.headline, started_on: "01/01/2021", location: p.location },
              { company: { id: "2", name: "Vorig Bedrijf BV" }, job_title: "Leerling-lasser", started_on: "01/01/2017", ended_on: "12/31/2020" },
            ],
            skills: [
              { name: "TIG", endorsement_count: 4 },
              { name: "RVS", endorsement_count: 2 },
            ],
          },
        });
      }

      error(404, "api/resource_not_found", "Route not found");
    });
  });

  /** Test-hulp: kandidaat accepteert de uitnodiging. */
  const accept = (userId) => {
    if (!state.relations.includes(userId)) state.relations.push(userId);
  };
  /** Test-hulp: kandidaat stuurt een reactie in het bestaande gesprek. */
  const reply = (userId, text) => {
    const entry = [...state.chats.entries()].find(([, c]) => c.userId === userId);
    if (!entry) throw new Error(`Geen gesprek met ${userId}`);
    seq += 1000;
    entry[1].messages.push({ id: nextId("msg"), text, is_sender: false, timestamp: iso() });
  };

  await new Promise((resolve) => server.listen(port, resolve));
  return { server, requests, state, accept, reply };
}
