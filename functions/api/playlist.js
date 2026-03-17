/**
 * Cloudflare Pages Function
 * Routes:
 * - GET  /api/playlist
 * - PUT  /api/playlist
 *
 * Requires:
 * - D1 binding `DB`
 * - Env var `ADMIN_PASSWORD` for PUT
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
  // Use a single-statement prepare().run() for D1 compatibility.
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS playlist_store (key TEXT PRIMARY KEY, json_value TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )
    .run();
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

function normalizeSong(x) {
  const title = String(x?.title ?? "").trim();
  if (!title) return null;
  return {
    title,
    artist: String(x?.artist ?? "").trim(),
    genre: String(x?.genre ?? "").trim(),
    price: Number(x?.price ?? 0) || 0,
  };
}

export async function onRequestGet({ env }) {
  if (!env.DB) return jsonResponse({ ok: false, error: "Missing D1 binding: DB" }, { status: 500 });
  try {
    await ensureTable(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT json_value, updated_at FROM playlist_store WHERE key='playlist' LIMIT 1"
    ).all();
    const row = results?.[0] || null;
    const arr = row?.json_value ? JSON.parse(row.json_value) : null;
    return jsonResponse({ ok: true, playlist: Array.isArray(arr) ? arr : [], updated_at: row?.updated_at || null });
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
  const list = body?.playlist;
  if (!Array.isArray(list)) return jsonResponse({ ok: false, error: "Missing playlist" }, { status: 400 });

  const normalized = [];
  for (const x of list) {
    const s = normalizeSong(x);
    if (s) normalized.push(s);
    if (normalized.length >= 5000) break;
  }

  try {
    await ensureTable(env.DB);
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO playlist_store (key, json_value, updated_at) VALUES ('playlist', ?1, ?2)
       ON CONFLICT(key) DO UPDATE SET json_value=excluded.json_value, updated_at=excluded.updated_at`
    )
      .bind(JSON.stringify(normalized), updatedAt)
      .run();
    return jsonResponse({ ok: true, count: normalized.length, updated_at: updatedAt });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

