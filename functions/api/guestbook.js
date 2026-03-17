/**
 * Cloudflare Pages Function
 * Routes:
 * - GET  /api/guestbook?limit=50
 * - POST /api/guestbook
 * - DELETE /api/guestbook?id=123   (admin)
 *
 * Requires a D1 binding named `DB`.
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

function clampInt(v, { min, max, fallback }) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanText(s, { maxLen }) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLen);
}

async function ensureTable(db) {
  // Use a single-statement prepare().run() for D1 compatibility.
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS guestbook_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)"
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

export async function onRequestGet({ env, request }) {
  if (!env.DB) return jsonResponse({ ok: false, error: "Missing D1 binding: DB" }, { status: 500 });
  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get("limit"), { min: 1, max: 100, fallback: 50 });

  try {
    await ensureTable(env.DB);
    const { results } = await env.DB.prepare(
      `SELECT id, name, content, created_at FROM guestbook_messages ORDER BY id DESC LIMIT ?1`
    )
      .bind(limit)
      .all();
    return jsonResponse({ ok: true, messages: results ?? [] });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function onRequestPost({ env, request }) {
  if (!env.DB) return jsonResponse({ ok: false, error: "Missing D1 binding: DB" }, { status: 500 });

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const name = cleanText(body?.name, { maxLen: 24 }) || "匿名";
  const content = cleanText(body?.content, { maxLen: 500 });
  const honey = cleanText(body?.website, { maxLen: 200 }); // anti-spam honeypot

  if (honey) return jsonResponse({ ok: true });
  if (!content) return jsonResponse({ ok: false, error: "内容不能为空" }, { status: 400 });

  try {
    await ensureTable(env.DB);
    const createdAt = new Date().toISOString();
    const r = await env.DB.prepare(
      `INSERT INTO guestbook_messages (name, content, created_at) VALUES (?1, ?2, ?3)`
    )
      .bind(name, content, createdAt)
      .run();

    return jsonResponse({
      ok: true,
      message: {
        id: r?.meta?.last_row_id ?? null,
        name,
        content,
        created_at: createdAt,
      },
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function onRequestDelete({ env, request }) {
  if (!env.DB) return jsonResponse({ ok: false, error: "Missing D1 binding: DB" }, { status: 500 });
  if (!isAuthed({ request, env })) return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const id = clampInt(url.searchParams.get("id"), { min: 1, max: 1_000_000_000, fallback: 0 });
  if (!id) return jsonResponse({ ok: false, error: "Missing id" }, { status: 400 });

  try {
    await ensureTable(env.DB);
    await env.DB.prepare(`DELETE FROM guestbook_messages WHERE id=?1`).bind(id).run();
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

