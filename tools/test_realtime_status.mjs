// Local test for the realtime Douyin fetch logic.
// Run: node .\tools\test_realtime_status.mjs

const LIVE_ID = process.env.DOUYIN_LIVE_ID || "49330409995";
const UA =
  process.env.UA ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function getSetCookies(res) {
  const sc = res.headers.get("set-cookie");
  return sc ? [sc] : [];
}
function cookieFromSetCookie(setCookie, key) {
  const m = setCookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`));
  return m ? m[1] : null;
}
function randStr(len) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[(Math.random() * chars.length) | 0];
  return s;
}

function get__ac_signature(one_site, one_nonce, ua_n, one_time_stamp = Math.floor(Date.now() / 1000)) {
  function cal_one_str(one_str, orgi_iv) {
    let k = orgi_iv >>> 0;
    for (const ch of one_str) {
      const a = ch.codePointAt(0);
      k = (((k ^ a) * 65599) >>> 0);
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
    for (let i = 24; i >= 0; i -= 6) s += get_one_chr((one_orgi_enc >>> i) & 63);
    return s;
  }
  const sign_head = "_02B4Z6wo00f01";
  const time_stamp_s = String(one_time_stamp);
  const a = cal_one_str(one_site, cal_one_str(time_stamp_s, 0)) % 65521;
  const bin_str = ((one_time_stamp ^ (a * 65521)) >>> 0).toString(2).padStart(32, "0");
  const b = BigInt("0b" + "10000000110000" + bin_str);
  const b32 = Number(b & BigInt(0xffffffff));
  const e = Number((b >> BigInt(32)) & BigInt(0xffffffff));
  const d = enc_num_to_str(b32 >>> 2);
  const f = enc_num_to_str((((b32 << 28) >>> 0) | (e >>> 4)) >>> 0);
  const g = (582085784 ^ b32) >>> 0;
  const h = enc_num_to_str((((e << 26) >>> 0) | (g >>> 6)) >>> 0);
  const i = get_one_chr(g & 63);
  const c = cal_one_str(b.toString(10), 0);
  const j = (((cal_one_str(ua_n, c) % 65521) << 16) | (cal_one_str(one_nonce, c) % 65521)) >>> 0;
  const k = enc_num_to_str(j >>> 2);
  const l = enc_num_to_str((((j << 28) >>> 0) | (((524576 ^ b32) >>> 0) >>> 4)) >>> 0);
  const m = enc_num_to_str(a >>> 0);
  const n = sign_head + d + f + h + i + k + l + m;
  const o_hex = cal_one_str_3(n, 0).toString(16);
  const o = o_hex.slice(-2).padStart(2, "0");
  return n + o;
}

async function fetchCookies() {
  const liveHome = await fetch("https://live.douyin.com/", { headers: { "user-agent": UA } });
  let ttwid = null;
  for (const sc of getSetCookies(liveHome)) ttwid = ttwid || cookieFromSetCookie(sc, "ttwid");

  const wwwHome = await fetch("https://www.douyin.com/", { headers: { "user-agent": UA } });
  let acNonce = null;
  for (const sc of getSetCookies(wwwHome)) acNonce = acNonce || cookieFromSetCookie(sc, "__ac_nonce");
  if (!acNonce) acNonce = "0123407cc00a9e438deb4";
  return { ttwid, acNonce };
}

async function fetchRoomId(ttwid, acNonce) {
  const ts = Math.floor(Date.now() / 1000);
  const acSig = get__ac_signature("www.douyin.com", acNonce, UA, ts);
  const msToken = randStr(182);
  const cookie = [`ttwid=${ttwid}`, `msToken=${msToken}`, `__ac_nonce=${acNonce}`, `__ac_signature=${acSig}`].join("; ");
  const res = await fetch(`https://live.douyin.com/${LIVE_ID}`, { headers: { "user-agent": UA, cookie } });
  const html = await res.text();
  let m = html.match(/roomId\\":\\"(\d+)\\"/);
  if (!m) m = html.match(/"roomId":"(\d+)"/);
  return m ? m[1] : null;
}

async function fetchStatus(ttwid, acNonce, roomId) {
  const ts = Math.floor(Date.now() / 1000);
  const acSig = get__ac_signature("www.douyin.com", acNonce, UA, ts);
  const msToken = randStr(182);
  const url =
    "https://live.douyin.com/webcast/room/web/enter/?" +
    new URLSearchParams({
      aid: "6383",
      app_name: "douyin_web",
      live_id: "1",
      device_platform: "web",
      language: "zh-CN",
      enter_from: "page_refresh",
      cookie_enabled: "true",
      screen_width: "1920",
      screen_height: "1080",
      browser_language: "zh-CN",
      browser_platform: "Win32",
      browser_name: "Edge",
      browser_version: "140.0.0.0",
      web_rid: LIVE_ID,
      room_id_str: roomId,
      enter_source: "",
      is_need_double_stream: "false",
      insert_task_id: "",
      live_reason: "",
      msToken,
    }).toString();
  const cookie = [`ttwid=${ttwid}`, `__ac_nonce=${acNonce}`, `__ac_signature=${acSig}`].join("; ");
  const res = await fetch(url, { headers: { "user-agent": UA, referer: `https://live.douyin.com/${LIVE_ID}`, cookie } });
  const j = await res.json();
  return {
    room_status: j?.data?.room_status,
    nickname: j?.data?.user?.nickname,
    title: j?.data?.room?.title,
  };
}

async function main() {
  console.log("Testing live_id:", LIVE_ID);
  const { ttwid, acNonce } = await fetchCookies();
  console.log("ttwid?", !!ttwid, "acNonce:", acNonce);
  if (!ttwid) throw new Error("No ttwid cookie");
  const roomId = await fetchRoomId(ttwid, acNonce);
  console.log("roomId:", roomId);
  if (!roomId) throw new Error("No roomId");
  const st = await fetchStatus(ttwid, acNonce, roomId);
  console.log(st);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});

