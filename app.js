const DOUYIN_LIVE_URL = "https://live.douyin.com/49330409995";
const PLAYLIST_URL = "./data/playlist.json";
const PROFILE_URL = "./data/profile.json";
const STATUS_API_URL = "/api/status";
const GUESTBOOK_API_URL = "/api/guestbook";

const POLL_MS = 30_000;
const LOCAL_GUESTBOOK_KEY = "cf_pages_demo_guestbook_v1";
const SCHEDULE_WEEK_KEY_PREFIX = "cf_pages_demo_schedule_week_v1:";
const LOCAL_CONFIG_KEY = "cf_pages_demo_config_v1";
const LOCAL_ADMIN_KEY = "cf_pages_demo_admin_v1";
const LOCAL_ADMIN_TOKEN_KEY = "cf_pages_demo_admin_token_v1";
const LOCAL_PLAYLIST_KEY = "cf_pages_demo_playlist_v1";
const CONFIG_API_URL = "/api/config";
const PLAYLIST_API_URL = "/api/playlist";

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function normalize(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function option(label, value) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

function renderRow(song) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="td-title">${escapeHtml(song.title)}</td>
    <td class="td-artist">${escapeHtml(song.artist)}</td>
    <td class="td-genre">${escapeHtml(song.genre)}</td>
    <td class="td-price">${Number(song.price || 0)}</td>
  `;
  return tr;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadPlaylist() {
  let data;
  try {
    const res = await fetch(PLAYLIST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    // When opened via file://, many browsers block fetch() to local files.
    const isFile = typeof location !== "undefined" && location.protocol === "file:";
    if (isFile) {
      throw new Error("当前是本地 file 打开，浏览器会拦截读取 data/playlist.json。请用本地服务器打开（见 README）。");
    }
    throw new Error(`Failed to load playlist.json: ${e?.message || e}`);
  }
  if (!Array.isArray(data)) throw new Error("playlist.json must be an array");
  return data
    .map((x) => ({
      title: String(x.title ?? "").trim(),
      artist: String(x.artist ?? "").trim(),
      genre: String(x.genre ?? "").trim(),
      price: Number(x.price ?? 0),
    }))
    .filter((x) => x.title);
}

function applyFilters(allSongs) {
  const q = normalize($("q").value);
  const genre = $("genre").value;
  const sort = $("sort").value;

  let filtered = allSongs.filter((s) => {
    if (genre && s.genre !== genre) return false;
    if (!q) return true;
    const hay = normalize(`${s.title} ${s.artist} ${s.genre}`);
    return hay.includes(q);
  });

  if (sort === "price_asc") filtered.sort((a, b) => a.price - b.price);
  if (sort === "price_desc") filtered.sort((a, b) => b.price - a.price);
  if (sort === "title_asc") filtered.sort((a, b) => a.title.localeCompare(b.title, "zh"));

  return filtered;
}

function updateTable(songs) {
  const tbody = $("playlistBody");
  tbody.textContent = "";
  for (const s of songs) tbody.appendChild(renderRow(s));

  $("count").textContent = String(songs.length);
}

function setGenres(allSongs) {
  const genres = uniq(allSongs.map((s) => s.genre).filter(Boolean)).sort((a, b) => a.localeCompare(b, "zh"));
  const sel = $("genre");
  sel.textContent = "";
  sel.appendChild(option("全部分类", ""));
  for (const g of genres) sel.appendChild(option(g, g));
}

async function main() {
  $("y").textContent = String(new Date().getFullYear());
  $("douyinLive").href = DOUYIN_LIVE_URL;
  await loadAndRenderProfileOnce();
  const cfg = (await loadRemoteConfig()) || loadLocalConfig();
  applyConfig(cfg);
  initTabs();

  // Cross-device sync: keep pulling remote config when available.
  setInterval(() => {
    refreshRemoteConfigIfNewer();
  }, 15_000);
}

let _playlistCache = null;
let _playlistInited = false;
let _guestbookInited = false;
let _scheduleInited = false;
let _adminInited = false;
let _lastRemoteConfigUpdatedAt = "";

function initTabs() {
  const buttons = Array.from(document.querySelectorAll(".tabBtn"));
  const panels = {
    playlist: document.getElementById("tab-playlist"),
    guestbook: document.getElementById("tab-guestbook"),
    schedule: document.getElementById("tab-schedule"),
    recordings: document.getElementById("tab-recordings"),
    live: document.getElementById("tab-live"),
    admin: document.getElementById("tab-admin"),
  };
  const hint = document.getElementById("tabHint");

  function setActive(tab) {
    for (const [k, el] of Object.entries(panels)) {
      if (!el) continue;
      el.hidden = k !== tab;
    }
    for (const b of buttons) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    if (hint) hint.style.display = tab ? "none" : "";

    if (tab === "playlist") initPlaylistOnce();
    if (tab === "guestbook") initGuestbookOnce();
    if (tab === "schedule") initScheduleOnce();
    if (tab === "admin") initAdminOnce();
  }

  for (const b of buttons) {
    b.addEventListener("click", () => setActive(b.dataset.tab));
  }

  // Default: nothing expanded until click
  setActive("");
}

function initAdminOnce() {
  if (_adminInited) return;
  _adminInited = true;
  initAdmin();
}

async function initPlaylistOnce() {
  if (_playlistInited) return;
  _playlistInited = true;

  const allSongs = await loadPlaylistWithLocalOverride();
  _playlistCache = allSongs;
  setGenres(allSongs);

  const rerender = () => updateTable(applyFilters(allSongs));
  $("q").addEventListener("input", rerender);
  $("genre").addEventListener("change", rerender);
  $("sort").addEventListener("change", rerender);
  $("clear").addEventListener("click", () => {
    $("q").value = "";
    $("genre").value = "";
    $("sort").value = "title_asc";
    rerender();
  });
  rerender();
}

async function loadPlaylistWithLocalOverride() {
  const remote = await loadRemotePlaylist();
  if (remote?.length) return remote;
  const local = loadLocalPlaylist();
  if (local?.length) return local;
  return await loadPlaylist();
}

function loadLocalPlaylist() {
  try {
    const raw = localStorage.getItem(LOCAL_PLAYLIST_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(arr)) return null;
    return arr
      .map((x) => ({
        title: String(x.title ?? "").trim(),
        artist: String(x.artist ?? "").trim(),
        genre: String(x.genre ?? "").trim(),
        price: Number(x.price ?? 0),
      }))
      .filter((x) => x.title);
  } catch {
    return null;
  }
}

function saveLocalPlaylist(arr) {
  try {
    localStorage.setItem(LOCAL_PLAYLIST_KEY, JSON.stringify(arr ?? []));
  } catch {
    // ignore
  }
}

async function loadRemotePlaylist() {
  try {
    const res = await fetch(PLAYLIST_API_URL, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j?.ok) return null;
    const arr = Array.isArray(j.playlist) ? j.playlist : null;
    const normalized = arr
      ? arr
          .map((x) => ({
            title: String(x.title ?? "").trim(),
            artist: String(x.artist ?? "").trim(),
            genre: String(x.genre ?? "").trim(),
            price: Number(x.price ?? 0),
          }))
          .filter((x) => x.title)
      : null;
    if (normalized?.length) {
      saveLocalPlaylist(normalized);
      return normalized;
    }
    return [];
  } catch {
    return null;
  }
}

async function saveRemotePlaylist(list) {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const res = await fetch(PLAYLIST_API_URL, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ playlist: list }),
    });
    if (res.status === 404) return false;
    const j = await res.json().catch(() => null);
    return !!(res.ok && j?.ok);
  } catch {
    return false;
  }
}

function initGuestbookOnce() {
  if (_guestbookInited) return;
  _guestbookInited = true;
  initGuestbook();
}

function initScheduleOnce() {
  if (_scheduleInited) return;
  _scheduleInited = true;
  renderSchedule();
}

function initGuestbook() {
  const form = document.getElementById("guestbookForm");
  if (!form) return;

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById("gbError");
    const sendBtn = document.getElementById("gbSend");
    if (errEl) errEl.textContent = "";

    const name = cleanText(document.getElementById("gbName")?.value, 24);
    const content = cleanText(document.getElementById("gbContent")?.value, 500);
    const website = cleanText(document.getElementById("gbWebsite")?.value, 200);

    if (!content) {
      if (errEl) errEl.textContent = "内容不能为空";
      return;
    }

    try {
      if (sendBtn) sendBtn.disabled = true;
      const ok = await guestbookPost({ name, content, website });
      if (!ok) throw new Error("发送失败");
      const contentEl = document.getElementById("gbContent");
      if (contentEl) contentEl.value = "";
      await loadGuestbook();
    } catch (e) {
      if (errEl) errEl.textContent = `发送失败：${e?.message || e}`;
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  });

  loadGuestbook();
}

async function loadGuestbook() {
  const listEl = document.getElementById("gbList");
  const hintEl = document.getElementById("gbHint");
  if (!listEl) return;

  try {
    const { mode, messages } = await guestbookList();
    if (hintEl) {
      hintEl.textContent = "";
      hintEl.style.display = "none";
    }
    const msgs = Array.isArray(messages) ? messages : [];
    renderGuestbook(listEl, msgs);
  } catch {
    if (hintEl) {
      hintEl.textContent = "留言加载失败，请稍后重试。";
      hintEl.style.display = "";
    }
  }
}

function deleteLocalGuestbook(id) {
  try {
    const cur = loadLocalGuestbook();
    const next = cur.filter((x) => String(x?.id) !== String(id));
    localStorage.setItem(LOCAL_GUESTBOOK_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function guestbookDelete(id) {
  // Local preview: no DELETE endpoint, fallback to local.
  try {
    const u = new URL(GUESTBOOK_API_URL, location.origin);
    u.searchParams.set("id", String(id));
    const token = getAdminToken();
    const res = await fetch(u.toString(), {
      method: "DELETE",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 404) {
      deleteLocalGuestbook(id);
      return true;
    }
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
    return true;
  } catch {
    deleteLocalGuestbook(id);
    return true;
  }
}

function renderGuestbook(container, messages) {
  container.textContent = "";
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "还没有留言，来当第一个吧。";
    container.appendChild(empty);
    return;
  }

  for (const m of messages) {
    container.appendChild(renderGuestbookItem(m));
  }
}

function renderGuestbookItem(m) {
  const wrap = document.createElement("div");
  wrap.className = "gbItem";

  const main = document.createElement("div");
  main.className = "gbMain";

  const meta = document.createElement("div");
  meta.className = "gbMeta";

  const name = document.createElement("div");
  name.className = "gbName";
  name.textContent = String(m?.name || "匿名").slice(0, 24);

  const time = document.createElement("div");
  time.className = "gbTime";
  time.textContent = formatTime(m?.created_at);

  meta.appendChild(name);
  meta.appendChild(time);

  const content = document.createElement("div");
  content.className = "gbContent";
  content.textContent = String(m?.content || "").slice(0, 500);

  main.appendChild(meta);
  main.appendChild(content);

  if (isAdmin()) {
    const actions = document.createElement("div");
    actions.style.marginTop = "10px";
    const del = document.createElement("button");
    del.className = "btn secondary";
    del.type = "button";
    del.textContent = "删除";
    del.addEventListener("click", async () => {
      const ok = confirm("确定删除这条留言吗？");
      if (!ok) return;
      await guestbookDelete(m?.id);
      await loadGuestbook();
    });
    actions.appendChild(del);
    main.appendChild(actions);
  }

  wrap.appendChild(main);
  return wrap;
}

function cleanText(v, maxLen) {
  return String(v ?? "").trim().slice(0, maxLen);
}

function formatTime(iso) {
  const s = String(iso || "");
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 19).replace("T", " ");
  return d.toLocaleString(undefined, { hour12: false });
}

async function guestbookList() {
  try {
    const res = await fetch(`${GUESTBOOK_API_URL}?limit=50`, { cache: "no-store" });
    if (res.status === 404) {
      return { mode: "local", messages: loadLocalGuestbook() };
    }
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
    return { mode: "remote", messages: j.messages || [] };
  } catch {
    // If remote fails (e.g. local preview), fallback to local.
    return { mode: "local", messages: loadLocalGuestbook() };
  }
}

async function guestbookPost({ name, content, website }) {
  try {
    const res = await fetch(GUESTBOOK_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, content, website }),
    });
    if (res.status === 404) {
      appendLocalGuestbook({ name, content });
      return true;
    }
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
    return true;
  } catch {
    // If remote fails, still allow local testing.
    appendLocalGuestbook({ name, content });
    return true;
  }
}

function loadLocalGuestbook() {
  try {
    const raw = localStorage.getItem(LOCAL_GUESTBOOK_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 50);
  } catch {
    return [];
  }
}

function appendLocalGuestbook({ name, content }) {
  const msg = {
    id: Date.now(),
    name: cleanText(name, 24) || "匿名",
    content: cleanText(content, 500),
    created_at: new Date().toISOString(),
  };
  const cur = loadLocalGuestbook();
  const next = [msg, ...cur].slice(0, 50);
  try {
    localStorage.setItem(LOCAL_GUESTBOOK_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function renderSchedule() {
  const body = document.getElementById("scheduleBody");
  if (!body) return;
  const cfg = loadLocalConfig();
  const plan = getWeeklySchedulePlan();
  const topics = ["纯唱", "点歌", "聊天", "互动", "练歌", "随缘"];
  const items = plan.isRestDay
    ? [
        {
          date: `${plan.weekLabel} · ${plan.restDayLabel}`,
          time: "休息",
          topic: "今天随机休息一天～",
          action: "",
        },
      ]
    : [
        {
          date: `${plan.weekLabel} · 每天`,
          time: "13:00 - 15:00（固定）",
          topic: String(cfg?.schedule?.t1 || "唱歌 + 杂谈"),
          action: DOUYIN_LIVE_URL,
        },
        {
          date: `${plan.weekLabel} · 每天`,
          time: "16:00 - 18:00（固定）",
          topic: String(cfg?.schedule?.t2 || "唱歌 + 杂谈"),
          action: DOUYIN_LIVE_URL,
        },
        {
          date: `${plan.weekLabel} · 每天`,
          time: "22:00 - 23:00（随机）",
          topic: String(cfg?.schedule?.t3 || "唱歌 + 杂谈"),
          action: DOUYIN_LIVE_URL,
        },
      ];
  body.textContent = "";
  for (const it of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(it.date)}</td>
      <td>${escapeHtml(it.time)}</td>
      <td>${escapeHtml(it.topic)}</td>
      <td class="th-num">${
        it.action
          ? `<a class="btn secondary" href="${escapeHtml(it.action)}" target="_blank" rel="noreferrer">进入</a>`
          : `<span class="muted">—</span>`
      }</td>
    `;
    body.appendChild(tr);
  }
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function getISOWeekYearAndNumber(d) {
  // ISO week date algorithm
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}

function getWeeklySchedulePlan() {
  const now = new Date();
  const { year, week } = getISOWeekYearAndNumber(now);
  const key = `${SCHEDULE_WEEK_KEY_PREFIX}${year}-W${String(week).padStart(2, "0")}`;

  let restDay = null;
  try {
    restDay = localStorage.getItem(key);
  } catch {
    // ignore
  }
  if (!restDay) {
    // 0..6 where 0 is Sunday in JS
    restDay = String((Math.random() * 7) | 0);
    try {
      localStorage.setItem(key, restDay);
    } catch {
      // ignore
    }
  }

  const rest = Number.parseInt(restDay, 10);
  const today = now.getDay(); // 0..6
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekLabel = `${year}年第${week}周`;
  return {
    weekLabel,
    restDay: rest,
    restDayLabel: `随机休息日：${dayNames[rest]}`,
    isRestDay: today === rest,
  };
}

async function loadAndRenderProfileOnce() {
  // Prefer realtime status from edge API. Fallback to static profile.json.
  const ok = await tryLoadAndRenderRealtime();
  if (!ok) await loadAndRenderStaticProfile();
  // keep polling realtime in background
  setInterval(() => {
    tryLoadAndRenderRealtime();
  }, POLL_MS);
}

async function tryLoadAndRenderRealtime() {
  const errorEl = document.getElementById("profileError");
  try {
    const u = new URL(STATUS_API_URL, location.origin);
    u.searchParams.set("live_id", DOUYIN_LIVE_URL.split("/").pop() || "");
    const res = await fetch(u.toString(), { cache: "no-store" });
    // When previewing locally via python http.server, /api/status does not exist (404).
    // Only Cloudflare Pages will run Functions.
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = await res.json();
    if (!p || p.ok !== true) throw new Error(p?.error || "API 返回异常");
    renderProfile(p);
    if (errorEl) errorEl.textContent = "";
    return true;
  } catch (e) {
    // don't spam error; only show if we have nothing rendered
    if (errorEl && !errorEl.textContent) errorEl.textContent = `实时状态暂不可用：${e?.message || e}`;
    return false;
  }
}

async function loadAndRenderStaticProfile() {
  const nameEl = document.getElementById("nickname");
  const statusEl = document.getElementById("liveStatus");
  const updatedEl = document.getElementById("profileUpdatedAt");
  const errorEl = document.getElementById("profileError");

  try {
    const res = await fetch(PROFILE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = await res.json();
    renderProfile(p);
    // If we have a valid static profile, prefer hiding the realtime error.
    if (errorEl) errorEl.textContent = String(p?.error || "");
  } catch (e) {
    const msg = `加载主播信息失败：${e?.message || e}`;
    if (errorEl) errorEl.textContent = msg;
    if (nameEl) nameEl.textContent = nameEl.textContent || "歌手主页";
    if (statusEl) statusEl.textContent = statusEl.textContent || "状态未知";
    if (updatedEl) updatedEl.textContent = updatedEl.textContent || "";
  }
}

function renderProfile(p) {
  const nameEl = document.getElementById("nickname");
  const statusEl = document.getElementById("liveStatus");
  const updatedEl = document.getElementById("profileUpdatedAt");
  const titleEl = document.getElementById("liveTitle");
  const liveBtn = document.getElementById("douyinLive");

  const nickname = String(p?.nickname || "").trim();
  if (nameEl) nameEl.textContent = nickname || "歌手主页";
  if (nickname) document.title = `${nickname} - 歌单`;

  const isLive = p?.is_live;
  if (statusEl) {
    if (isLive === true) {
      statusEl.textContent = "直播中";
      statusEl.classList.remove("badge-off");
      statusEl.classList.add("badge-on");
    } else if (isLive === false) {
      statusEl.textContent = "未开播";
      statusEl.classList.remove("badge-on");
      statusEl.classList.add("badge-off");
    } else {
      statusEl.textContent = "状态未知";
      statusEl.classList.remove("badge-on");
      statusEl.classList.add("badge-off");
    }
  }

  if (titleEl) {
    const t = String(p?.title || "").trim();
    titleEl.textContent = t;
    titleEl.style.display = t ? "" : "none";
  }

  if (updatedEl) updatedEl.textContent = formatDateOnly(p?.updated_at);
  if (liveBtn) liveBtn.textContent = nickname ? `打开抖音直播间（${nickname}）` : "打开抖音直播间";
}

function formatDateOnly(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  // Prefer fast path: ISO-like string starts with YYYY-MM-DD
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function loadLocalConfig() {
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function saveLocalConfig(cfg) {
  try {
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(cfg || {}));
  } catch {
    // ignore
  }
}

function applyConfig(cfg) {
  if (!cfg) return;
  const introEl = document.getElementById("introText");
  if (introEl && typeof cfg.intro === "string") introEl.textContent = cfg.intro.slice(0, 500);

  const chips = document.getElementById("tagChips");
  if (chips && Array.isArray(cfg.tags)) {
    chips.textContent = "";
    for (const t of cfg.tags.slice(0, 24)) {
      const s = String(t || "").trim();
      if (!s) continue;
      const span = document.createElement("span");
      span.className = "chip";
      span.textContent = s.slice(0, 12);
      chips.appendChild(span);
    }
  }

  const rec1 = document.getElementById("recordingLink1");
  if (rec1 && cfg.recordings?.url1) {
    rec1.href = String(cfg.recordings.url1);
    rec1.textContent = String(cfg.recordings.label1 || "打开录屏").slice(0, 32);
  }
}

function isAdmin() {
  try {
    return localStorage.getItem(LOCAL_ADMIN_KEY) === "1";
  } catch {
    return false;
  }
}

function getAdminToken() {
  try {
    return localStorage.getItem(LOCAL_ADMIN_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setAdmin(v) {
  try {
    localStorage.setItem(LOCAL_ADMIN_KEY, v ? "1" : "0");
  } catch {
    // ignore
  }
}

function setAdminToken(token) {
  try {
    if (token) localStorage.setItem(LOCAL_ADMIN_TOKEN_KEY, String(token));
    else localStorage.removeItem(LOCAL_ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function initAdmin() {
  const statusEl = document.getElementById("adminStatus");
  const loginBox = document.getElementById("adminLogin");
  const panel = document.getElementById("adminPanel");
  const pwEl = document.getElementById("adminPassword");
  const errEl = document.getElementById("adminError");

  function refresh() {
    const ok = isAdmin();
    if (statusEl) statusEl.textContent = ok ? "已登录" : "未登录";
    if (loginBox) loginBox.hidden = ok;
    if (panel) panel.hidden = !ok;
    if (errEl) errEl.textContent = "";

    const cfg = loadLocalConfig() || {};
    const intro = document.getElementById("adminIntro");
    const tags = document.getElementById("adminTags");
    const rurl = document.getElementById("adminRecUrl1");
    const rlab = document.getElementById("adminRecLabel1");
    const s1 = document.getElementById("adminSch1");
    const s2 = document.getElementById("adminSch2");
    const s3 = document.getElementById("adminSch3");

    if (intro && intro.value === "") intro.value = String(cfg.intro || document.getElementById("introText")?.textContent || "");
    if (tags && tags.value === "") tags.value = Array.isArray(cfg.tags) ? cfg.tags.join(",") : Array.from(document.querySelectorAll("#tagChips .chip")).map((x) => x.textContent).join(",");
    if (rurl && rurl.value === "") rurl.value = String(cfg.recordings?.url1 || document.getElementById("recordingLink1")?.getAttribute("href") || "");
    if (rlab && rlab.value === "") rlab.value = String(cfg.recordings?.label1 || document.getElementById("recordingLink1")?.textContent || "");
    if (s1 && s1.value === "") s1.value = String(cfg.schedule?.t1 || "唱歌 + 杂谈");
    if (s2 && s2.value === "") s2.value = String(cfg.schedule?.t2 || "唱歌 + 杂谈");
    if (s3 && s3.value === "") s3.value = String(cfg.schedule?.t3 || "唱歌 + 杂谈");
  }

  document.getElementById("adminLoginBtn")?.addEventListener("click", async () => {
    const pw = String(pwEl?.value || "").trim();
    if (!pw) {
      if (errEl) errEl.textContent = "请输入口令";
      return;
    }
    if (errEl) errEl.textContent = "";

    // If running on Pages with Functions, validate password against a protected endpoint.
    const ok = await verifyAdminPassword(pw);
    if (!ok) {
      setAdmin(false);
      setAdminToken("");
      if (errEl) errEl.textContent = "口令不正确（或线上接口未生效）";
      return;
    }

    setAdmin(true);
    setAdminToken(pw);
    if (pwEl) pwEl.value = "";
    refresh();
  });

  document.getElementById("adminLogoutBtn")?.addEventListener("click", () => {
    setAdmin(false);
    setAdminToken("");
    refresh();
  });

  document.getElementById("adminSaveIntro")?.addEventListener("click", () => {
    const intro = String(document.getElementById("adminIntro")?.value || "").trim().slice(0, 500);
    const cfg = loadLocalConfig() || {};
    cfg.intro = intro;
    saveLocalConfig(cfg);
    applyConfig(cfg);
    saveRemoteConfig(cfg);
  });

  document.getElementById("adminSaveTags")?.addEventListener("click", () => {
    const raw = String(document.getElementById("adminTags")?.value || "");
    const tags = raw
      .split(/[,，]/g)
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 24);
    const cfg = loadLocalConfig() || {};
    cfg.tags = tags;
    saveLocalConfig(cfg);
    applyConfig(cfg);
    saveRemoteConfig(cfg);
  });

  document.getElementById("adminSaveRecordings")?.addEventListener("click", () => {
    const url1 = String(document.getElementById("adminRecUrl1")?.value || "").trim().slice(0, 500);
    const label1 = String(document.getElementById("adminRecLabel1")?.value || "").trim().slice(0, 32);
    const cfg = loadLocalConfig() || {};
    cfg.recordings = { url1, label1 };
    saveLocalConfig(cfg);
    applyConfig(cfg);
    saveRemoteConfig(cfg);
  });

  document.getElementById("adminSaveSchedule")?.addEventListener("click", () => {
    const t1 = String(document.getElementById("adminSch1")?.value || "").trim().slice(0, 60);
    const t2 = String(document.getElementById("adminSch2")?.value || "").trim().slice(0, 60);
    const t3 = String(document.getElementById("adminSch3")?.value || "").trim().slice(0, 60);
    const cfg = loadLocalConfig() || {};
    cfg.schedule = { t1, t2, t3 };
    saveLocalConfig(cfg);
    renderSchedule();
    saveRemoteConfig(cfg);
  });

  let editIndex = -1;

  function setEditIndex(i) {
    editIndex = Number.isFinite(i) ? i : -1;
    const btn = document.getElementById("adminPlAdd");
    if (btn) btn.textContent = editIndex >= 0 ? "保存修改" : "添加到歌单";
  }

  function renderAdminPlaylist() {
    const body = document.getElementById("adminPlaylistBody");
    if (!body) return;
    const list = loadLocalPlaylist() || _playlistCache || [];
    body.textContent = "";
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.title)}</td>
        <td>${escapeHtml(s.artist || "")}</td>
        <td>${escapeHtml(s.genre || "")}</td>
        <td class="th-num">${Number(s.price || 0)}</td>
        <td class="th-num">
          <button class="btn secondary" type="button" data-act="edit" data-i="${i}">编辑</button>
          <button class="btn secondary" type="button" data-act="del" data-i="${i}">删除</button>
        </td>
      `;
      tr.querySelectorAll("button").forEach((b) => {
        b.addEventListener("click", () => {
          const act = b.dataset.act;
          const idx = Number.parseInt(b.dataset.i || "-1", 10);
          const cur = loadLocalPlaylist() || _playlistCache || [];
          if (act === "edit") {
            const row = cur[idx];
            if (!row) return;
            const t = document.getElementById("adminPlTitle");
            const a = document.getElementById("adminPlArtist");
            const g = document.getElementById("adminPlGenre");
            const p = document.getElementById("adminPlPrice");
            if (t) t.value = row.title || "";
            if (a) a.value = row.artist || "";
            if (g) g.value = row.genre || "";
            if (p) p.value = String(row.price ?? 0);
            setEditIndex(idx);
            return;
          }
          if (act === "del") {
            const ok = confirm("确定删除这首歌吗？");
            if (!ok) return;
            const next = cur.filter((_, j) => j !== idx);
            saveLocalPlaylist(next);
            _playlistCache = next;
            if (editIndex === idx) setEditIndex(-1);
            renderAdminPlaylist();
            if (_playlistInited) {
              setGenres(next);
              updateTable(applyFilters(next));
            }
            saveRemotePlaylist(next);
          }
        });
      });
      body.appendChild(tr);
    }
  }

  document.getElementById("adminPlAdd")?.addEventListener("click", () => {
    const err = document.getElementById("adminPlError");
    if (err) err.textContent = "";
    const title = String(document.getElementById("adminPlTitle")?.value || "").trim();
    const artist = String(document.getElementById("adminPlArtist")?.value || "").trim();
    const genre = String(document.getElementById("adminPlGenre")?.value || "").trim();
    const price = Number(document.getElementById("adminPlPrice")?.value || 0);
    if (!title) {
      if (err) err.textContent = "歌名必填";
      return;
    }
    const cur = loadLocalPlaylist() || _playlistCache || [];
    let next;
    if (editIndex >= 0) {
      next = cur.map((x, i) => (i === editIndex ? { title, artist, genre, price: Number.isFinite(price) ? price : 0 } : x));
      setEditIndex(-1);
    } else {
      next = [{ title, artist, genre, price: Number.isFinite(price) ? price : 0 }, ...cur].slice(0, 2000);
    }
    saveLocalPlaylist(next);
    _playlistCache = next;
    renderAdminPlaylist();
    if (_playlistInited) {
      setGenres(next);
      updateTable(applyFilters(next));
    }
    saveRemotePlaylist(next).then((ok) => {
      if (!ok && location.origin.startsWith("http")) {
        const e = document.getElementById("adminPlError");
        if (e && !e.textContent) e.textContent = "提示：在线保存失败（可能未部署/未登录/口令不对）";
      }
    });
    const t = document.getElementById("adminPlTitle");
    if (t) t.value = "";
    const a = document.getElementById("adminPlArtist");
    const g = document.getElementById("adminPlGenre");
    const p = document.getElementById("adminPlPrice");
    if (a) a.value = "";
    if (g) g.value = "";
    if (p) p.value = "";
  });

  document.getElementById("adminPlClear")?.addEventListener("click", () => {
    const ok = confirm("确定清空本地歌单覆盖吗？（会恢复为 data/playlist.json）");
    if (!ok) return;
    try {
      localStorage.removeItem(LOCAL_PLAYLIST_KEY);
    } catch {
      // ignore
    }
    // Reload from static
    loadPlaylist()
      .then((all) => {
        _playlistCache = all;
        if (_playlistInited) {
          setGenres(all);
          updateTable(applyFilters(all));
        }
        setEditIndex(-1);
        renderAdminPlaylist();
        saveRemotePlaylist(all);
      })
      .catch(() => {
        setEditIndex(-1);
        renderAdminPlaylist();
      });
  });

  async function renderAdminGuestbook() {
    const body = document.getElementById("adminGuestbookBody");
    const err = document.getElementById("adminGbError");
    if (!body) return;
    body.textContent = "";
    if (err) err.textContent = "";
    try {
      const { messages } = await guestbookList();
      const msgs = Array.isArray(messages) ? messages : [];
      for (const m of msgs) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(String(m?.id ?? ""))}</td>
          <td>${escapeHtml(String(m?.name ?? ""))}</td>
          <td>${escapeHtml(formatTime(m?.created_at))}</td>
          <td>${escapeHtml(String(m?.content ?? "")).slice(0, 200)}</td>
          <td class="th-num"><button class="btn secondary" type="button">删除</button></td>
        `;
        tr.querySelector("button")?.addEventListener("click", async () => {
          const ok = confirm("确定删除这条留言吗？");
          if (!ok) return;
          await guestbookDelete(m?.id);
          await renderAdminGuestbook();
        });
        body.appendChild(tr);
      }
    } catch (e) {
      if (err) err.textContent = `加载失败：${e?.message || e}`;
    }
  }

  document.getElementById("adminReloadGuestbook")?.addEventListener("click", () => {
    renderAdminGuestbook();
  });

  const oldRefresh = refresh;
  refresh = function refreshWithAdminLists() {
    oldRefresh();
    if (isAdmin()) {
      renderAdminPlaylist();
      renderAdminGuestbook();
    }
  };

  refresh();
}

async function loadRemoteConfig() {
  try {
    const res = await fetch(CONFIG_API_URL, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j?.ok) return null;
    const cfg = j.config && typeof j.config === "object" ? j.config : null;
    if (j?.updated_at) _lastRemoteConfigUpdatedAt = String(j.updated_at);
    if (cfg) saveLocalConfig(cfg);
    return cfg;
  } catch {
    return null;
  }
}

async function saveRemoteConfig(cfg) {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const res = await fetch(CONFIG_API_URL, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ config: cfg }),
    });
    if (res.status === 404) return false;
    const j = await res.json().catch(() => null);
    if (j?.updated_at) _lastRemoteConfigUpdatedAt = String(j.updated_at);
    return !!(res.ok && j?.ok);
  } catch {
    return false;
  }
}

async function refreshRemoteConfigIfNewer() {
  try {
    const res = await fetch(CONFIG_API_URL, { cache: "no-store" });
    if (res.status === 404) return false;
    if (!res.ok) return false;
    const j = await res.json().catch(() => null);
    if (!j?.ok) return false;
    const updatedAt = String(j?.updated_at || "");
    if (!updatedAt || updatedAt === _lastRemoteConfigUpdatedAt) return false;
    const cfg = j.config && typeof j.config === "object" ? j.config : null;
    _lastRemoteConfigUpdatedAt = updatedAt;
    if (cfg) {
      saveLocalConfig(cfg);
      applyConfig(cfg);
      // schedule depends on config
      renderSchedule();
    }
    return true;
  } catch {
    return false;
  }
}

async function verifyAdminPassword(pw) {
  // Local preview: Functions don't exist, allow any non-empty password.
  try {
    const res = await fetch(CONFIG_API_URL, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${pw}` },
      body: JSON.stringify({ config: loadLocalConfig() || {} }),
    });
    if (res.status === 404) return true;
    if (res.status === 401) return false;
    // If PUT is allowed and returns ok, password is correct.
    const j = await res.json().catch(() => null);
    return !!(res.ok && j?.ok);
  } catch {
    // Network errors: treat as local preview / offline.
    return true;
  }
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById("playlistError");
  if (el) el.textContent = `加载歌单失败：${err?.message || err}`;
});

