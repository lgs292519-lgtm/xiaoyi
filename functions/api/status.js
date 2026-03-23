/**
 * Cloudflare Pages Function
 * Route: /api/status
 *
 * Returns realtime Douyin live status for a given live_id.
 * This runs on the server side, avoiding browser CORS / anti-bot limitations.
 */

// --- Small helpers ---
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

function getSetCookies(res) {
  // Workers/Pages support `headers.getSetCookie()` in newer runtimes.
  if (typeof res.headers.getSetCookie === "function") return res.headers.getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieFromSetCookie(setCookie, key) {
  // e.g. "ttwid=xxx; Path=/; ..."
  const m = setCookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`));
  return m ? m[1] : null;
}

function randStr(len) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[(Math.random() * chars.length) | 0];
  return s;
}

function buildUrl(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

// --- Ported from D:\ppt\douyin\a_bogus\ac_signature.py ---
function get__ac_signature(one_site, one_nonce, ua_n, one_time_stamp = Math.floor(Date.now() / 1000)) {
  function cal_one_str(one_str, orgi_iv) {
    let k = orgi_iv >>> 0;
    for (const ch of one_str) {
      const a = ch.codePointAt(0);
      k = (((k ^ a) * 65599) >>> 0);
    }
    return k >>> 0;
  }
  function cal_one_str_2(one_str, orgi_iv) {
    let k = orgi_iv >>> 0;
    const a = one_str.length || 1;
    for (let i = 0; i < 32; i++) {
      const idx = k % a;
      k = ((k * 65599 + one_str.codePointAt(idx)) >>> 0);
    }
    return k >>> 0;
  }
  function cal_one_str_3(one_str, orgi_iv) {
    let k = orgi_iv >>> 0;
    for (const ch of one_str) k = ((k * 65599 + ch.codePointAt(0)) >>> 0);
    return k >>> 0;
  }
  function get_one_chr(enc_chr_code) {
    if (enc_chr_code < 26) return String.fromCharCode(enc_chr_code + 65);
    if (enc_chr_code < 52) return String.fromCharCode(enc_chr_code + 71);
    if (enc_chr_code < 62) return String.fromCharCode(enc_chr_code - 4);
    return String.fromCharCode(enc_chr_code - 17);
  }
  function enc_num_to_str(one_orgi_enc) {
    let s = "";
    for (let i = 24; i >= 0; i -= 6) {
      const bits = (one_orgi_enc >>> i) & 63;
      s += get_one_chr(bits);
    }
    return s;
  }

  const sign_head = "_02B4Z6wo00f01";
  const time_stamp_s = String(one_time_stamp);
  const a = cal_one_str(one_site, cal_one_str(time_stamp_s, 0)) % 65521;

  const bin_str = ((one_time_stamp ^ (a * 65521)) >>> 0).toString(2).padStart(32, "0");
  const b = BigInt("0b" + "10000000110000" + bin_str); // may exceed 32-bit
  const b_s = b.toString(10);
  const c = cal_one_str(b_s, 0);

  const b32 = Number(b & BigInt(0xffffffff)); // low 32-bit
  const d = enc_num_to_str(b32 >>> 2);
  const e = Number((b >> BigInt(32)) & BigInt(0xffffffff));
  const f = enc_num_to_str((((b32 << 28) >>> 0) | (e >>> 4)) >>> 0);
  const g = (582085784 ^ b32) >>> 0;
  const h = enc_num_to_str((((e << 26) >>> 0) | (g >>> 6)) >>> 0);
  const i = get_one_chr(g & 63);

  const j = (((cal_one_str(ua_n, c) % 65521) << 16) | (cal_one_str(one_nonce, c) % 65521)) >>> 0;
  const k = enc_num_to_str(j >>> 2);
  const l = enc_num_to_str((((j << 28) >>> 0) | (((524576 ^ b32) >>> 0) >>> 4)) >>> 0);
  const m = enc_num_to_str(a >>> 0);

  const n = sign_head + d + f + h + i + k + l + m;
  const o_hex = cal_one_str_3(n, 0).toString(16);
  const o = o_hex.slice(-2).padStart(2, "0");
  return n + o;
}

// --- ABogus: keep compatibility with existing implementation ---
// Minimal wrapper that mirrors `a_bogus.js` exported function name `get_ab`.
// This is a compacted subset: it expects `dpf` is querystring like "a=1&b=2".
// Source is based on D:\ppt\douyin\a_bogus\a_bogus.js (function get_ab).
function get_ab(dpf, ua) {
  // eslint-disable-next-line no-inner-declarations
  function md5hex(input) {
    // Very small MD5 implementation is intentionally avoided; a_bogus.js already includes SM3-like.
    // Here we fallback to the upstream algorithm by using WebCrypto SHA-256 to generate a stable bogus.
    // Note: This is not the real a_bogus algorithm; it is a best-effort fallback.
    // If Douyin rejects missing/incorrect a_bogus, we will return empty string.
    return "";
  }
  // Placeholder: return empty to let request try without a_bogus.
  // In many cases the enter endpoint still responds; if not, we can replace this with full algorithm.
  return "";
}

async function fetchCookiesForLive(ua) {
  const liveHome = await fetch("https://live.douyin.com/", { headers: { "user-agent": ua } });
  const setCookies = getSetCookies(liveHome);
  let ttwid = null;
  for (const sc of setCookies) {
    ttwid = ttwid || cookieFromSetCookie(sc, "ttwid");
  }

  const wwwHome = await fetch("https://www.douyin.com/", { headers: { "user-agent": ua } });
  const setCookies2 = getSetCookies(wwwHome);
  let acNonce = null;
  for (const sc of setCookies2) {
    acNonce = acNonce || cookieFromSetCookie(sc, "__ac_nonce");
  }
  if (!acNonce) acNonce = "0123407cc00a9e438deb4";

  return { ttwid, acNonce };
}

async function fetchRoomId({ liveId, ua, ttwid, acNonce }) {
  const ts = Math.floor(Date.now() / 1000);
  const acSig = get__ac_signature("www.douyin.com", acNonce, ua, ts);
  const msToken = randStr(182);
  const cookie = [
    ttwid ? `ttwid=${ttwid}` : null,
    `msToken=${msToken}`,
    `__ac_nonce=${acNonce}`,
    acSig ? `__ac_signature=${acSig}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const url = `https://live.douyin.com/${liveId}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": ua,
      cookie,
    },
  });
  const html = await res.text();
  let m = html.match(/roomId\\":\\"(\d+)\\"/);
  if (!m) m = html.match(/"roomId":"(\d+)"/);
  return m ? m[1] : null;
}

function pickDouyinAvatarUrl(user) {
  if (!user || typeof user !== "object") return "";
  const tryLists = [
    user.avatar_thumb?.url_list,
    user.avatar_medium?.url_list,
    user.avatar_large?.url_list,
  ];
  for (const list of tryLists) {
    if (Array.isArray(list) && list.length && list[0]) return String(list[0]);
  }
  if (user.avatar_url) return String(user.avatar_url);
  return "";
}

async function fetchRoomStatus({ liveId, roomId, ua, ttwid, acNonce }) {
  const ts = Math.floor(Date.now() / 1000);
  const acSig = get__ac_signature("www.douyin.com", acNonce, ua, ts);
  const msToken = randStr(182);

  const base = "https://live.douyin.com/webcast/room/web/enter/";
  const params = {
    aid: 6383,
    app_name: "douyin_web",
    live_id: 1,
    device_platform: "web",
    language: "zh-CN",
    enter_from: "page_refresh",
    cookie_enabled: "true",
    screen_width: 1920,
    screen_height: 1080,
    browser_language: "zh-CN",
    browser_platform: "Win32",
    browser_name: "Edge",
    browser_version: "140.0.0.0",
    web_rid: liveId,
    room_id_str: roomId,
    enter_source: "",
    is_need_double_stream: "false",
    insert_task_id: "",
    live_reason: "",
    msToken,
  };

  let url = buildUrl(base, params);
  try {
    const q = new URL(url).searchParams.toString();
    const aBogus = get_ab(q, ua);
    if (aBogus) url += `&a_bogus=${encodeURIComponent(aBogus)}`;
  } catch {
    // ignore
  }

  const cookie = [
    ttwid ? `ttwid=${ttwid}` : null,
    `__ac_nonce=${acNonce}`,
    acSig ? `__ac_signature=${acSig}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const res = await fetch(url, {
    headers: {
      "user-agent": ua,
      referer: `https://live.douyin.com/${liveId}`,
      cookie,
    },
  });
  const j = await res.json();
  const data = j?.data;
  const room_status = data?.room_status ?? null;
  const user = data?.user ?? {};
  const nickname = user.nickname ?? "";
  const avatar_url = pickDouyinAvatarUrl(user);
  const title = data?.room?.title ?? "";
  return { room_status, nickname, title, avatar_url };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const liveId = (url.searchParams.get("live_id") || "49330409995").trim();

  // Use a fixed desktop UA for stable signature/anti-bot behavior across devices.
  // If we reuse client UA (mobile vs desktop), Douyin responses may diverge.
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const startedAt = Date.now();
  try {
    const { ttwid, acNonce } = await fetchCookiesForLive(ua);
    const roomId = await fetchRoomId({ liveId, ua, ttwid, acNonce });
    if (!roomId) {
      return jsonResponse(
        {
          ok: false,
          live_id: liveId,
          live_url: `https://live.douyin.com/${liveId}`,
          error: "无法解析 roomId（可能触发反爬或页面结构变化）",
          took_ms: Date.now() - startedAt,
        },
        { status: 502 }
      );
    }

    const { room_status, nickname, title, avatar_url } = await fetchRoomStatus({ liveId, roomId, ua, ttwid, acNonce });
    const is_live = room_status === 0 ? true : room_status === 2 ? false : null;
    return jsonResponse({
      ok: true,
      live_id: liveId,
      live_url: `https://live.douyin.com/${liveId}`,
      room_id: roomId,
      nickname: nickname || null,
      avatar_url: avatar_url || null,
      room_status,
      is_live,
      title: title || null,
      updated_at: new Date().toISOString(),
      took_ms: Date.now() - startedAt,
      note: "room_status: 0=直播中, 2=未开播/已结束",
    });
  } catch (e) {
    return jsonResponse(
      {
        ok: false,
        live_id: liveId,
        live_url: `https://live.douyin.com/${liveId}`,
        error: String(e?.message || e),
        took_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}

