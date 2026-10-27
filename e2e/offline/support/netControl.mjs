// Offline e2e network control (FP-OFF-01 §S.8). One Node process with:
//
// - an on/off HTTP proxy (FP_OFFLINE_PROXY_PORT, 3220) in front of
//   `next start` (FP_OFFLINE_APP_PORT, 3200). The browser only talks to the
//   proxy. "Off" destroys every open and new connection, so the network is
//   cut outside the browser: the service worker's own fetches fail too
//   (`context.setOffline(true)` does not stop them in Chromium).
// - a minimal Supabase stub (FP_OFFLINE_STUB_PORT, 3229): auth/v1 and a few
//   rest/v1 tables with fake data. No real project, no secrets. It goes dark
//   with the proxy.
// - a control API (FP_OFFLINE_CONTROL_PORT, 3221), used by the specs:
//   POST /network/on|off, GET /state, GET /log, POST /log/clear,
//   POST /sw-variant {"suffix":"-next","mode":"on"|"off"} | {} to reset,
//   POST /public-share {"answer": …} sets what the stub's
//   get_public_match_share returns (FEAT-SHARE-04 spec; null by default).
//   The variant rewrites the served /serwist/sw.js config banner (build id
//   and mode) to simulate a new build or the kill switch without a second
//   `next build` (sw-update spec).
//
// Every listener binds to 127.0.0.1 only: nothing here is reachable from the
// network (the stub hands out fake sessions, the control API cuts traffic).
import http from "node:http";
import { randomUUID } from "node:crypto";

const APP_PORT = Number(process.env.FP_OFFLINE_APP_PORT ?? 3200);
const PROXY_PORT = Number(process.env.FP_OFFLINE_PROXY_PORT ?? 3220);
const STUB_PORT = Number(process.env.FP_OFFLINE_STUB_PORT ?? 3229);
const CONTROL_PORT = Number(process.env.FP_OFFLINE_CONTROL_PORT ?? 3221);
const HOST = "127.0.0.1";

let online = true;
let swVariant = null; // { suffix, mode }
// The stub's answer to rpc/get_public_match_share (the public share page).
let publicShare = null;
const log = [];
const sockets = new Set();

function track(server) {
  server.on("connection", (socket) => {
    if (!online) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
}

function cut() {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
}

function record(target, req) {
  log.push({
    at: Date.now(),
    target,
    method: req.method,
    url: req.url,
    hasCookie: Boolean(req.headers.cookie),
    precache: req.headers["x-fp-sw-precache"] ?? null,
    rsc: req.headers.rsc ?? null,
  });
  if (log.length > 5000) log.splice(0, log.length - 5000);
}

// ── Proxy ─────────────────────────────────────────────────────────────────────
const proxy = http.createServer((req, res) => {
  if (!online) {
    req.socket.destroy();
    return;
  }
  record("app", req);
  const isSw = req.url.startsWith("/serwist/sw.js") && swVariant;
  const headers = { ...req.headers, host: `localhost:${APP_PORT}` };
  if (isSw) delete headers["accept-encoding"];

  const upstream = http.request({ host: "127.0.0.1", port: APP_PORT, method: req.method, path: req.url, headers }, (up) => {
    if (!isSw) {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
      return;
    }
    const chunks = [];
    up.on("data", (chunk) => chunks.push(chunk));
    up.on("end", () => {
      let body = Buffer.concat(chunks).toString("utf8");
      body = body.replace(/"buildId":"([^"]+)"/, (_m, id) => `"buildId":"${id}${swVariant.suffix ?? ""}"`);
      if (swVariant.mode) body = body.replace(/"mode":"(on|off)"/, `"mode":"${swVariant.mode}"`);
      const outHeaders = { ...up.headers };
      delete outHeaders["content-length"];
      delete outHeaders["content-encoding"];
      delete outHeaders.etag;
      res.writeHead(up.statusCode ?? 502, outHeaders);
      res.end(body);
    });
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});
track(proxy);

// ── Supabase stub ─────────────────────────────────────────────────────────────
const T0 = "2026-10-01T10:00:00.000Z";
export const STUB_USER = { id: "11111111-1111-4111-8111-111111111111", email: "trener@example.test" };
const TEAM = { id: "22222222-2222-4222-8222-222222222222", name: "Skyløvene G12", created_at: T0, updated_at: T0 };
const PLAYER_NAMES = ["Alma", "Bea", "Cora", "Dina", "Eli", "Fia", "Gro", "Hege", "Iben"];
const PLAYERS = PLAYER_NAMES.map((name, index) => ({
  id: `33333333-3333-4333-8333-33333333333${index}`,
  name,
  number: index + 1,
  preferred_position: null,
  source: "manual",
  external_provider: null,
  external_id: null,
  is_managed: false,
  created_at: T0,
  updated_at: T0,
}));

function session() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "stub-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "stub-refresh-token",
    user: { ...STUB_USER, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: T0 },
  };
}

function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("Access-Control-Expose-Headers", "content-range, x-supabase-api-version");
}

function json(req, res, status, body) {
  cors(req, res);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function rows(table) {
  switch (table) {
    case "team_members":
      return [{ team_id: TEAM.id, user_id: STUB_USER.id, role: "owner" }];
    case "teams":
      return [TEAM];
    case "profiles":
      return [{ id: STUB_USER.id, active_team_id: TEAM.id, display_name: "trener", preferred_language: "no" }];
    case "players":
      return PLAYERS;
    default:
      return [];
  }
}

const stub = http.createServer((req, res) => {
  if (!online) {
    req.socket.destroy();
    return;
  }
  record("supabase", req);
  if (req.method === "OPTIONS") {
    cors(req, res);
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${STUB_PORT}`);
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const authorised = /^Bearer stub-access-token/.test(req.headers.authorization ?? "");
    if (url.pathname === "/auth/v1/user") return authorised ? json(req, res, 200, session().user) : json(req, res, 401, { msg: "no session" });
    if (url.pathname === "/auth/v1/token") return json(req, res, 200, session());
    if (url.pathname === "/auth/v1/logout") return json(req, res, 204);
    if (url.pathname.startsWith("/auth/")) return json(req, res, 404, { msg: "stub" });
    if (url.pathname === "/rest/v1/rpc/get_public_match_share") return json(req, res, 200, publicShare);

    const match = url.pathname.match(/^\/rest\/v1\/([a-z_]+)/);
    if (!match) return json(req, res, 404, { message: "stub: unknown path" });
    const table = match[1];
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    if (req.method === "GET" || req.method === "HEAD") {
      const data = rows(table);
      if (single) return data.length ? json(req, res, 200, data[0]) : json(req, res, 406, { code: "PGRST116", message: "no rows" });
      cors(req, res);
      res.setHeader("content-range", `0-${Math.max(0, data.length - 1)}/${data.length}`);
      return json(req, res, 200, data);
    }
    if (req.method === "DELETE") return json(req, res, 204);
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
    const list = (Array.isArray(body) ? body : [body]).map((item) => ({
      id: randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...item,
    }));
    return json(req, res, req.method === "POST" ? 201 : 200, single ? list[0] : list);
  });
});
track(stub);

// ── Control ───────────────────────────────────────────────────────────────────
const control = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "POST" && req.url === "/network/off") {
      online = false;
      cut();
      return send(200, { online });
    }
    if (req.method === "POST" && req.url === "/network/on") {
      online = true;
      return send(200, { online });
    }
    if (req.url === "/state") return send(200, { online, swVariant });
    if (req.url === "/log" && req.method === "GET") return send(200, log);
    if (req.url === "/log/clear" && req.method === "POST") {
      log.length = 0;
      return send(200, { ok: true });
    }
    if (req.url === "/sw-variant" && req.method === "POST") {
      const body = raw ? JSON.parse(raw) : {};
      swVariant = body && (body.suffix || body.mode) ? { suffix: body.suffix ?? "", mode: body.mode ?? null } : null;
      return send(200, { swVariant });
    }
    if (req.url === "/public-share" && req.method === "POST") {
      publicShare = (raw ? JSON.parse(raw) : {}).answer ?? null;
      return send(200, { ok: true });
    }
    // Health check for Playwright's webServer: the proxy answers only when
    // next start is up behind it.
    if (req.url === "/health") return send(200, { ok: true });
    return send(404, { error: "unknown" });
  });
});

proxy.listen(PROXY_PORT, HOST);
stub.listen(STUB_PORT, HOST);
control.listen(CONTROL_PORT, HOST);
console.log(`[netControl] ${HOST}: proxy :${PROXY_PORT} -> :${APP_PORT}, supabase stub :${STUB_PORT}, control :${CONTROL_PORT}`);
