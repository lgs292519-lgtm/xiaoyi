/**
 * Cloudflare Pages Function
 * Routes:
 * - GET  /api/config
 * - PUT  /api/config
 *
 * Requires:
 * - D1 binding `DB`
 * - Env var `ADMIN_PASSWORD`
 */

function jsonResponse(obj, { status = 200 } = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

async function ensureTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS site_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function getBearer(request) {
  const h = request.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function constantTimeEqual(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

function isAuthed({ request, env }) {
  const token = getBearer(request);
  const pw = String(env.ADMIN_PASSWORD || "");
  if (!pw) return false;
  return constantTimeEqual(token, pw);
}

export async function onRequestGet({ env }) {
  if (!env.DB) return jsonResponse({ ok: false, error: "Missing D1 binding: DB" }, { status: 500 });
  try {
    await ensureTable(env.DB);
    const { results } = await env.DB.prepare(`SELECT value, updated_at FROM site_config WHERE key='config' LIMIT 1`).all();
    const row = results?.[0] || null;
    const value = row?.value ? JSON.parse(row.value) : null;
    return jsonResponse({ ok: true, config: value, updated_at: row?.updated_at || null });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function onRequestPut({ env, request }) {
  if (!env.DB) return jsonResponse({ ok: false, error: "Missing D1 binding: DB" }, { status: 500 });
  if (!isAuthed({ request, env })) return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const cfg = body?.config;
  if (!cfg || typeof cfg !== "object") return jsonResponse({ ok: false, error: "Missing config" }, { status: 400 });

  try {
    await ensureTable(env.DB);
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO site_config (key, value, updated_at) VALUES ('config', ?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
    )
      .bind(JSON.stringify(cfg), updatedAt)
      .run();
    return jsonResponse({ ok: true, updated_at: updatedAt });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

