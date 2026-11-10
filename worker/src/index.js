/* Family Board Books: photo storage and cartoon pipeline (Cloudflare Worker + R2, EU jurisdiction).

   Storage layout in the R2 bucket:
     meta/<draft>.json          draft record (no photos; page texts, status, counters)
     orig/<draft>/<slot>        customer's original photo (resized and EXIF-free in the browser)
     toon/<draft>/<slot>.png    cartoon made from that photo
     styles/<style>/<n>.png     optional style reference images, uploaded by us

   A "draft" is one book in progress. The browser gets a random secret token when the draft is
   created; every request for that draft must carry it. We store only a hash of the token, so
   nobody can open a draft from the stored data alone.

   Free preview: before payment a draft can make FREE_SLOTS cartoons (two pages) with a few redos.
   Shopify's orders/paid webhook marks the draft paid, which unlocks the whole book.
   A daily cron deletes unpaid drafts, originals after printing, and cartoons 30 days after
   delivery unless the customer chose to keep them. */

const SLOT_RE = /^(p\d{1,3}-\d{1,2}|cover-front|cover-back)$/;
const ID_RE = /^[a-z0-9]{20}$/;
const STYLES = ["splash", "painted", "watercolour", "comic", "storybook"];
const ENGINES = ["gemini", "openai"];
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const DAY = 86400000;

const STYLE_PROMPTS = {
  splash: "a smooth, painterly digital cartoon look with bold shading and slightly simplified detail, cut out from the background and sitting on a messy paint-splash shape in black plus one bright colour (yellow, blue or orange) with drips and spatters",
  watercolour: "a soft children's-book watercolour illustration with gentle washes of colour, light pencil lines and a loose round watercolour wash behind the person",
  comic: "a bright comic-book style with strong black outlines, flat bold colours and halftone dots, on a round coloured background",
  storybook: "a calm, classic picture-book illustration in soft pastel colours with gentle shading, inside a rounded pastel frame"
};
// "Painted Splash" uses the same brief; the difference comes from the model it is sent to (see STYLE_ENGINES).
STYLE_PROMPTS.painted = STYLE_PROMPTS.splash;

function prompt(style) {
  return "Turn the person or people in the FIRST image into a cartoon portrait for a children's board book, in " +
    (STYLE_PROMPTS[style] || STYLE_PROMPTS.splash) +
    ", on a plain white background. If more images follow, they are style references: match their art style closely. " +
    "Keep every person clearly recognisable: same face shape, features, skin tone, hair, glasses and clothes, same number of people, same pose. " +
    "Friendly and warm, suitable for babies and toddlers. No text, letters, logos or captions.";
}

// ---------- small helpers ----------
function cors(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const h = { "Vary": "Origin" };
  if (allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
    h["Access-Control-Allow-Headers"] = "Authorization,Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}
function json(data, status, extra) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, extra) });
}
function err(status, message, extra) { return json({ error: message }, status, extra); }

function randomId(n) {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789", bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = ""; for (const b of bytes) s += abc[b % 36]; return s;
}
function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function b64(buf) {
  const bytes = new Uint8Array(buf); let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str) {
  const s = atob(str), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }

// ---------- draft records ----------
async function getMeta(env, id) {
  const o = await env.BUCKET.get("meta/" + id + ".json");
  return o ? o.json() : null;
}
async function putMeta(env, meta) {
  meta.updated = Date.now();
  await env.BUCKET.put("meta/" + meta.id + ".json", JSON.stringify(meta), { httpMetadata: { contentType: "application/json" } });
}
async function authDraft(env, req, id) {
  if (!ID_RE.test(id)) return { error: err(404, "Not found") };
  const meta = await getMeta(env, id);
  if (!meta) return { error: err(404, "Not found") };
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
  if (!m || !timingSafeEqual(await sha256(m[1]), meta.tokenHash)) return { error: err(403, "Not allowed") };
  return { meta };
}
async function deletePrefix(env, prefix) {
  let cursor, n = 0;
  do {
    const list = await env.BUCKET.list({ prefix, cursor });
    const keys = list.objects.map(o => o.key);
    if (keys.length) { await env.BUCKET.delete(keys); n += keys.length; }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return n;
}
async function deleteDraft(env, id) {
  await deletePrefix(env, "orig/" + id + "/");
  await deletePrefix(env, "toon/" + id + "/");
  await env.BUCKET.delete("meta/" + id + ".json");
}

function publicStatus(meta) {
  return {
    id: meta.id, book: meta.book, style: meta.style, paid: !!meta.paid, approved: !!meta.approvedAt,
    keep: !!meta.keep, pages: meta.pages || null, cover: meta.cover || null,
    photos: Object.keys(meta.slots).filter(s => meta.slots[s].orig),
    cartoons: Object.keys(meta.slots).filter(s => meta.slots[s].toon),
    freeLeft: meta.paid ? null : Math.max(0, freeSlots(meta) - toonCount(meta)),
    redosLeft: meta.paid ? null : Math.max(0, meta.freeGens - meta.gens)
  };
}
function toonCount(meta) { return Object.values(meta.slots).filter(s => s.toon).length; }
function freeSlots(meta) { return meta.freeSlots; }

// ---------- cartoon engines ----------
async function styleRefs(env, style) {
  let list = await env.BUCKET.list({ prefix: "styles/" + style + "/" });
  if (!list.objects.length && style === "painted") list = await env.BUCKET.list({ prefix: "styles/splash/" });
  const out = [];
  for (const o of list.objects.slice(0, 2)) {
    const obj = await env.BUCKET.get(o.key);
    if (obj) out.push({ bytes: await obj.arrayBuffer(), type: obj.httpMetadata?.contentType || "image/png" });
  }
  return out;
}

async function gemini(env, photo, refs, style) {
  const model = env.GEMINI_MODEL || "gemini-3.1-flash-image";
  const parts = [{ inline_data: { mime_type: photo.type, data: b64(photo.bytes) } }]
    .concat(refs.map(r => ({ inline_data: { mime_type: r.type, data: b64(r.bytes) } })))
    .concat([{ text: prompt(style) }]);
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE"] } })
  });
  const j = await res.json();
  if (!res.ok) throw new Error("Gemini " + res.status + ": " + (j.error && j.error.message || "error"));
  for (const c of j.candidates || []) for (const p of (c.content && c.content.parts) || []) {
    const d = p.inlineData || p.inline_data;
    if (d && d.data) return { bytes: unb64(d.data), type: d.mimeType || d.mime_type || "image/png" };
  }
  throw new Error("Gemini returned no image");
}

async function openai(env, photo, refs, style) {
  const fd = new FormData();
  fd.append("model", env.OPENAI_MODEL || "gpt-image-2");
  fd.append("prompt", prompt(style));
  fd.append("size", "1024x1024");
  fd.append("quality", env.OPENAI_QUALITY || "medium");
  fd.append("image[]", new Blob([photo.bytes], { type: photo.type }), "photo.jpg");
  refs.forEach((r, i) => fd.append("image[]", new Blob([r.bytes], { type: r.type }), "style" + i + ".png"));
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + env.OPENAI_API_KEY }, body: fd });
  const j = await res.json();
  if (!res.ok) throw new Error("OpenAI " + res.status + ": " + (j.error && j.error.message || "error"));
  return { bytes: unb64(j.data[0].b64_json), type: "image/png" };
}

// "mock" returns the photo unchanged: for testing the whole flow without paying for AI.
async function mock(env, photo) { return { bytes: photo.bytes, type: photo.type }; }

// Which model draws which style. ENGINE=auto uses STYLE_ENGINES; ENGINE=gemini/openai forces one; mock skips AI.
function engineFor(env, style) {
  const forced = env.ENGINE || "mock";
  if (forced !== "auto") return forced;
  let map = {};
  try { map = JSON.parse(env.STYLE_ENGINES || "{}"); } catch (e) {}
  return ENGINES.includes(map[style]) ? map[style] : "gemini";
}
function hasKey(env, engine) { return engine === "gemini" ? !!env.GEMINI_API_KEY : engine === "openai" ? !!env.OPENAI_API_KEY : false; }
const RUN = { gemini, openai };

async function makeCartoon(env, photo, style) {
  const first = engineFor(env, style);
  if (first === "mock") return Object.assign(await mock(env, photo), { engine: "mock" });
  const refs = await styleRefs(env, style);
  // If the chosen model fails (outage, refusal), the other one draws it so the customer isn't stuck.
  const order = [first].concat(ENGINES.filter(e => e !== first)).filter(e => hasKey(env, e));
  let lastErr = new Error("No AI key set for " + first);
  for (const eng of order) {
    try { return Object.assign(await RUN[eng](env, photo, refs, style), { engine: eng }); }
    catch (e) { lastErr = e; console.error("engine failed", eng, e.message); }
  }
  throw lastErr;
}

// Cost ceiling for free previews: a daily total for the whole site and per internet connection.
// Connections are stored only as a salted hash, and the counters are deleted after two days.
function today() { return new Date().toISOString().slice(0, 10); }
async function freeAllowance(env, req) {
  const key = "stats/free-" + today() + ".json";
  const o = await env.BUCKET.get(key);
  const st = o ? await o.json() : { total: 0, ips: {} };
  const ip = await sha256(today() + "|" + (req.headers.get("CF-Connecting-IP") || "unknown"));
  const ipKey = ip.slice(0, 16);
  if (st.total >= num(env.FREE_DAILY_CAP, 150)) return { ok: false, message: "So many families are trying the free preview today that we've paused it until tomorrow. You can still order your book and see every page." };
  if ((st.ips[ipKey] || 0) >= num(env.FREE_IP_DAILY, 12)) return { ok: false, message: "You've made lots of free cartoons today. Order your book to see every page, or try again tomorrow." };
  return { ok: true, record: async () => { st.total++; st.ips[ipKey] = (st.ips[ipKey] || 0) + 1; await env.BUCKET.put(key, JSON.stringify(st)); } };
}

// ---------- abuse protection ----------
async function turnstileOk(env, req, token) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const fd = new FormData();
  fd.append("secret", env.TURNSTILE_SECRET); fd.append("response", token);
  fd.append("remoteip", req.headers.get("CF-Connecting-IP") || "");
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd });
  const j = await r.json(); return !!j.success;
}
async function rateLimited(env, req) {
  if (!env.DRAFT_LIMIT) return false;
  const { success } = await env.DRAFT_LIMIT.limit({ key: req.headers.get("CF-Connecting-IP") || "unknown" });
  return !success;
}

// ---------- Shopify webhook ----------
async function shopifyVerify(env, req, raw) {
  if (!env.SHOPIFY_WEBHOOK_SECRET) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SHOPIFY_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, raw);
  return timingSafeEqual(b64(sig), req.headers.get("X-Shopify-Hmac-Sha256") || "");
}
async function onOrderPaid(env, order) {
  const attrs = (order.note_attributes || []).concat(...(order.line_items || []).map(l => l.properties || []));
  const ids = [...new Set(attrs.filter(a => a.name === "_draft").map(a => String(a.value)))];
  for (const id of ids) {
    if (!ID_RE.test(id)) continue;
    const meta = await getMeta(env, id);
    if (!meta || meta.paid) continue;
    meta.paid = true; meta.paidAt = Date.now(); meta.order = String(order.name || order.id || "");
    await putMeta(env, meta);
  }
  return ids.length;
}

// ---------- request handling ----------
async function handle(req, env) {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, ""), m = req.method;
  const h = cors(env, req);
  if (m === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const J = (d, s) => json(d, s, h), E = (s, msg) => err(s, msg, h);

  if (path === "/api/health") return J({ ok: true, engine: env.ENGINE || "mock", gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY, shopify: !!env.SHOPIFY_WEBHOOK_SECRET });

  // Shopify calls this when an order is paid.
  if (path === "/api/shopify/orders-paid" && m === "POST") {
    const raw = await req.arrayBuffer();
    if (!(await shopifyVerify(env, req, raw))) return err(401, "Bad signature");
    const n = await onOrderPaid(env, JSON.parse(new TextDecoder().decode(raw)));
    return json({ ok: true, drafts: n });
  }

  // Status changes from us or the printer integration: printed, delivered.
  let mm = /^\/api\/admin\/drafts\/([a-z0-9]+)\/status$/.exec(path);
  if (mm && m === "POST") {
    const a = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
    if (!env.ADMIN_TOKEN || !a || !timingSafeEqual(a[1], env.ADMIN_TOKEN)) return err(403, "Not allowed");
    const meta = await getMeta(env, mm[1]); if (!meta) return err(404, "Not found");
    const body = await req.json();
    if (body.status === "printed") { meta.printedAt = Date.now(); await deletePrefix(env, "orig/" + meta.id + "/"); Object.values(meta.slots).forEach(s => { s.orig = false; }); }
    else if (body.status === "delivered") meta.deliveredAt = Date.now();
    else return err(400, "Unknown status");
    await putMeta(env, meta);
    return json({ ok: true });
  }

  // Create a draft.
  if (path === "/api/drafts" && m === "POST") {
    if (await rateLimited(env, req)) return E(429, "Too many new books from this connection. Please try again in a minute.");
    const body = await req.json().catch(() => ({}));
    if (!body.consent) return E(400, "Please confirm you have permission to use these photos.");
    if (!(await turnstileOk(env, req, body.turnstile))) return E(403, "Please try again.");
    const token = randomToken(), id = randomId(20);
    const meta = {
      id, tokenHash: await sha256(token), created: Date.now(), book: String(body.book || "").slice(0, 20),
      style: STYLES.includes(body.style) ? body.style : "splash", consentAt: Date.now(), keep: false, paid: false,
      gens: 0, freeSlots: num(env.FREE_SLOTS, 6), freeGens: num(env.FREE_GENS, 10), slots: {}
    };
    await putMeta(env, meta);
    return J({ id, token }, 201);
  }

  mm = /^\/api\/drafts\/([a-z0-9]+)(\/.*)?$/.exec(path);
  if (!mm) return E(404, "Not found");
  const id = mm[1], rest = mm[2] || "";
  const auth = await authDraft(env, req, id);
  if (auth.error) { Object.entries(h).forEach(([k, v]) => auth.error.headers.set(k, v)); return auth.error; }
  const meta = auth.meta;

  if (rest === "" && m === "GET") return J(publicStatus(meta));

  if (rest === "" && m === "PATCH") {
    const body = await req.json().catch(() => ({}));
    if (STYLES.includes(body.style)) meta.style = body.style;
    if (typeof body.keep === "boolean") meta.keep = body.keep;
    if (Array.isArray(body.pages)) meta.pages = JSON.parse(JSON.stringify(body.pages).slice(0, 60000));
    if (body.cover && typeof body.cover === "object") meta.cover = JSON.parse(JSON.stringify(body.cover).slice(0, 4000));
    if (body.approve === true) { if (!meta.paid) return E(402, "Please complete your order first."); meta.approvedAt = Date.now(); }
    await putMeta(env, meta);
    return J(publicStatus(meta));
  }

  if (rest === "" && m === "DELETE") { await deleteDraft(env, id); return J({ ok: true, deleted: true }); }

  const sm = /^\/(photos|cartoons)\/([a-z0-9-]+)$/.exec(rest);
  if (!sm || !SLOT_RE.test(sm[2])) return E(404, "Not found");
  const kind = sm[1], slot = sm[2];

  if (kind === "photos" && m === "PUT") {
    const type = (req.headers.get("Content-Type") || "").split(";")[0];
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return E(415, "Please upload a JPG, PNG or WebP photo.");
    const len = num(req.headers.get("Content-Length"), 0);
    if (len > MAX_PHOTO_BYTES) return E(413, "That photo is too large.");
    if (Object.keys(meta.slots).length >= 80 && !meta.slots[slot]) return E(400, "Too many photos in this book.");
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > MAX_PHOTO_BYTES || bytes.byteLength < 100) return E(413, "That photo is too large or empty.");
    await env.BUCKET.put("orig/" + id + "/" + slot, bytes, { httpMetadata: { contentType: type } });
    const s = meta.slots[slot] || (meta.slots[slot] = { gens: 0 });
    s.orig = true; s.toon = false; s.uploaded = Date.now();
    await env.BUCKET.delete("toon/" + id + "/" + slot + ".png");
    await putMeta(env, meta);
    return J({ ok: true, slot });
  }

  if (kind === "photos" && m === "DELETE") {
    await env.BUCKET.delete(["orig/" + id + "/" + slot, "toon/" + id + "/" + slot + ".png"]);
    delete meta.slots[slot]; await putMeta(env, meta);
    return J({ ok: true });
  }

  if (kind === "cartoons" && m === "POST") {
    const s = meta.slots[slot];
    if (!s || !s.orig) return E(404, "Upload the photo first.");
    const body = await req.json().catch(() => ({}));
    const style = STYLES.includes(body.style) ? body.style : meta.style;
    if (!meta.paid) {
      if (!s.toon && toonCount(meta) >= meta.freeSlots) return E(402, "Your free preview is used up. Order your book to see every page.");
      if (meta.gens >= meta.freeGens) return E(402, "You've used your free redos. Order your book to see every page.");
    } else {
      const limit = Object.keys(meta.slots).length * 4 + 20;
      if (meta.gens >= meta.freeGens + limit) return E(429, "Too many redos. Please email hello@familyboardbooks.com and we'll help.");
    }
    let allowance = null;
    if (!meta.paid) {
      allowance = await freeAllowance(env, req);
      if (!allowance.ok) return E(429, allowance.message);
    }
    const obj = await env.BUCKET.get("orig/" + id + "/" + slot);
    if (!obj) return E(404, "Upload the photo first.");
    let out;
    try { out = await makeCartoon(env, { bytes: await obj.arrayBuffer(), type: obj.httpMetadata?.contentType || "image/jpeg" }, style); }
    catch (e) { console.error("cartoon failed", id, slot, e.message); return E(502, "We couldn't draw this one. Please try again, or try a different photo."); }
    await env.BUCKET.put("toon/" + id + "/" + slot + ".png", out.bytes, { httpMetadata: { contentType: out.type } });
    if (allowance && out.engine !== "mock") await allowance.record();
    const fresh = await getMeta(env, id) || meta;  // re-read so parallel uploads aren't lost
    const fs = fresh.slots[slot] || (fresh.slots[slot] = { gens: 0, orig: true });
    fs.toon = true; fs.gens = (fs.gens || 0) + 1; fs.style = style; fs.engine = out.engine; fresh.gens = (fresh.gens || 0) + 1;
    await putMeta(env, fresh);
    return J({ ok: true, slot, ...publicStatus(fresh) });
  }

  if (kind === "cartoons" && m === "GET") {
    const obj = await env.BUCKET.get("toon/" + id + "/" + slot + ".png");
    if (!obj) return E(404, "Not found");
    return new Response(obj.body, { headers: Object.assign({ "Content-Type": obj.httpMetadata?.contentType || "image/png", "Cache-Control": "private, no-store" }, h) });
  }

  return E(405, "Not allowed");
}

// ---------- daily clean-up ----------
async function cleanup(env) {
  const now = Date.now(), unpaidDays = num(env.UNPAID_DAYS, 14), keepAfterDelivery = 30, origBackstop = 60;
  let cursor, removed = 0;
  do {
    const list = await env.BUCKET.list({ prefix: "meta/", cursor });
    for (const o of list.objects) {
      const meta = await (await env.BUCKET.get(o.key))?.json();
      if (!meta) continue;
      if (!meta.paid && now - meta.created > unpaidDays * DAY) { await deleteDraft(env, meta.id); removed++; continue; }
      if (meta.paid && (meta.printedAt || now - meta.paidAt > origBackstop * DAY) && Object.values(meta.slots).some(s => s.orig)) {
        await deletePrefix(env, "orig/" + meta.id + "/");
        Object.values(meta.slots).forEach(s => { s.orig = false; });
        await putMeta(env, meta);
      }
      if (meta.paid && !meta.keep && meta.deliveredAt && now - meta.deliveredAt > keepAfterDelivery * DAY) { await deleteDraft(env, meta.id); removed++; }
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  const keepStats = [today(), new Date(now - DAY).toISOString().slice(0, 10)];
  const stats = await env.BUCKET.list({ prefix: "stats/" });
  const old = stats.objects.map(o => o.key).filter(k => !keepStats.some(d => k.includes(d)));
  if (old.length) await env.BUCKET.delete(old);
  console.log("cleanup removed", removed);
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (e) { console.error(e && e.stack || e); return err(500, "Something went wrong. Please try again."); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(cleanup(env)); }
};
