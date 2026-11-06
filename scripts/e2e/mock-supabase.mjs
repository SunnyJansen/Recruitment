/**
 * Nep-Supabase voor de end-to-end test van het inloggen. Bootst alleen na wat
 * het inloggen en het dashboard nodig hebben, en onthoudt elk verzoek.
 */
import http from "node:http";

export const MOCK_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "sunny@cr8las.nl",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
  "access-control-expose-headers": "*",
};

export function startMockSupabase(port) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, auth: Boolean(req.headers.authorization), body });
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        return res.end();
      }
      const json = (code, obj, extra = {}) => {
        res.writeHead(code, { ...cors, "content-type": "application/json", ...extra });
        res.end(JSON.stringify(obj));
      };
      if (req.url.startsWith("/auth/v1/otp")) return json(200, {});
      if (req.url.startsWith("/auth/v1/user")) {
        return req.headers.authorization ? json(200, MOCK_USER) : json(401, { code: "no_authorization" });
      }
      if (req.url.startsWith("/rest/v1/settings")) {
        return json(200, [{ key: "max_invites_per_day", value: 10, description: "Max. connectieverzoeken per dag." }]);
      }
      if (req.url.startsWith("/rest/v1/")) {
        return json(req.method === "POST" ? 201 : 200, [], { "content-range": "*/0" });
      }
      json(404, {});
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, requests })));
}
