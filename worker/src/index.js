import { STORIES, WHO, WHERE, characterPrompt, standinPrompt, villainPrompt, scenePrompt } from "./stories.js";
import { PKG_RE, luluEnv, luluReady, printProducts, quote } from "./lulu.js";
import { productFor, shippingFrom, enqueue, servePrintFile, runPrintQueue, testPdf } from "./printing.js";
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

const SLOT_RE = /^(p\d{1,3}-\d{1,2}|cover-front|cover-back|c-[a-z]{2,12}|s\d{1,2})$/;
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

function prompt(style, refCount) {
  const refs = refCount
    ? "IMAGE 1 is the customer's photo. The other " + refCount + " image(s) are ART STYLE examples only: copy their drawing style, colours and paint-splash background, " +
      "but NEVER copy their people, faces, bodies, clothes or poses. Every person you draw must come from IMAGE 1, and only from IMAGE 1. "
    : "";
  return refs + "Turn the person or people in IMAGE 1 into a cartoon portrait for a children's board book, in " +
    (STYLE_PROMPTS[style] || STYLE_PROMPTS.splash) + ", on a plain white background. " +
    "Keep every person from IMAGE 1 clearly recognisable: same face shape, features, skin tone, hair, glasses and clothes, same number of people, same pose. " +
    "If IMAGE 1 is a drawing, a pet or a toy, redraw that in the style instead. Never add people who are not in IMAGE 1. " +
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
// Many cartoons for one book can be drawn at the same time, so every change to the draft record is a
// conditional write: if someone else changed it in between, read it again and re-apply the change.
function httpErr(status, message) { return Object.assign(new Error(message), { status }); }
async function updateMeta(env, id, change) {
  const key = "meta/" + id + ".json";
  for (let i = 0; i < 10; i++) {
    const o = await env.BUCKET.get(key);
    if (!o) throw httpErr(404, "Not found");
    const meta = await o.json();
    if (change(meta) === false) return meta;
    meta.updated = Date.now();
    const ok = await env.BUCKET.put(key, JSON.stringify(meta), { httpMetadata: { contentType: "application/json" }, onlyIf: { etagMatches: o.etag } });
    if (ok) return meta;
    await new Promise(r => setTimeout(r, 40 + Math.random() * 160 * (i + 1)));
  }
  throw httpErr(503, "We're busy saving your book. Please try again.");
}
const PENDING_MS = 3 * 60 * 1000;
function busySlots(meta) { const now = Date.now(); return Object.values(meta.slots).filter(s => s.toon || (s.pending && now - s.pending < PENDING_MS)).length; }

async function authDraft(env, req, id) {
  if (!ID_RE.test(id)) return { error: err(404, "Not found") };
  const meta = await getMeta(env, id);
  if (!meta) return { error: err(404, "Not found") };
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
  // The print key (made when a book is approved) lets our print page read the book, but change nothing.
  const printKey = m && req.method === "GET" && meta.print && meta.print.key && timingSafeEqual(m[1], meta.print.key);
  if (!m || !(printKey || timingSafeEqual(await sha256(m[1]), meta.tokenHash))) return { error: err(403, "Not allowed") };
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
  await deletePrefix(env, "print/" + id + "/");
  await env.BUCKET.delete(["meta/" + id + ".json", "print/queue/" + id]);
}

function publicStatus(meta) {
  return {
    id: meta.id, book: meta.book, style: meta.style, paid: !!meta.paid, approved: !!meta.approvedAt,
    keep: !!meta.keep, pages: meta.pages || null, cover: meta.cover || null,
    photos: Object.keys(meta.slots).filter(s => meta.slots[s].orig),
    cartoons: Object.keys(meta.slots).filter(s => meta.slots[s].toon),
    // Story scenes drawn at print size (PRINT_IMAGE_SIZE). A paid book redraws its other scenes before printing.
    printReady: Object.keys(meta.slots).filter(s => meta.slots[s].toon && /^[24]K$/.test(meta.slots[s].size || "")),
    freeLeft: meta.paid ? null : Math.max(0, freeSlots(meta) - busySlots(meta)),
    redosLeft: meta.paid ? null : Math.max(0, meta.freeGens - meta.gens),
    print: meta.print ? { status: meta.print.status || (meta.print.pdfAt ? "PDF_READY" : "QUEUED"), tracking: meta.print.tracking || [] } : null
  };
}
function toonCount(meta) { return Object.values(meta.slots).filter(s => s.toon).length; }
function freeSlots(meta) { return meta.freeSlots; }

// ---------- cartoon engines ----------
async function styleRefs(env, style) {
  let list = await env.BUCKET.list({ prefix: "styles/" + style + "/" });
  if (!list.objects.length && style === "painted") list = await env.BUCKET.list({ prefix: "styles/splash/" });
  const out = [];
  for (const o of list.objects.filter(x => x.size > 1000 && /\.(png|jpe?g|webp)$/i.test(x.key)).slice(0, 2)) {
    const obj = await env.BUCKET.get(o.key);
    if (obj) out.push({ bytes: await obj.arrayBuffer(), type: obj.httpMetadata?.contentType || "image/png" });
  }
  return out;
}

async function gemini(env, photo, refs, style) {
  const model = env.GEMINI_MODEL || "gemini-3.1-flash-image";
  const parts = [{ inline_data: { mime_type: photo.type, data: b64(photo.bytes) } }]
    .concat(refs.map(r => ({ inline_data: { mime_type: r.type, data: b64(r.bytes) } })))
    .concat([{ text: prompt(style, refs.length) }]);
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
  fd.append("prompt", prompt(style, refs.length));
  fd.append("size", "1024x1024");
  fd.append("quality", env.OPENAI_QUALITY || "medium");
  fd.append("image[]", new Blob([photo.bytes], { type: photo.type }), "photo.jpg");
  refs.forEach((r, i) => fd.append("image[]", new Blob([r.bytes], { type: r.type }), "style" + i + ".png"));
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + env.OPENAI_API_KEY }, body: fd });
  const j = await res.json();
  if (!res.ok) throw new Error("OpenAI " + res.status + ": " + (j.error && j.error.message || "error"));
  return { bytes: unb64(j.data[0].b64_json), type: "image/png" };
}

// Generic calls: any number of input images plus an instruction. Used by story books.
async function geminiImages(env, images, text, aspect, size) {
  const model = env.GEMINI_MODEL || "gemini-3.1-flash-image";
  const parts = images.map(r => ({ inline_data: { mime_type: r.type, data: b64(r.bytes) } })).concat([{ text }]);
  const cfg = { responseModalities: ["IMAGE"] };
  if (aspect || size) cfg.imageConfig = Object.assign(aspect ? { aspectRatio: aspect } : {}, size ? { imageSize: size } : {});
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: cfg })
  });
  const j = await res.json();
  if (!res.ok) throw new Error("Gemini " + res.status + ": " + (j.error && j.error.message || "error"));
  for (const c of j.candidates || []) for (const p of (c.content && c.content.parts) || []) {
    const d = p.inlineData || p.inline_data;
    if (d && d.data) return { bytes: unb64(d.data), type: d.mimeType || d.mime_type || "image/png", size: size || "1K" };
  }
  throw new Error("Gemini returned no image");
}
async function openaiImages(env, images, text, aspect) {
  if (!images.length) {  // nothing to edit (stand-ins and villains): draw from the words alone
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST", headers: { Authorization: "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.OPENAI_MODEL || "gpt-image-2", prompt: text, size: aspect === "16:9" ? "1536x1024" : aspect === "3:4" ? "1024x1536" : "1024x1024", quality: env.OPENAI_QUALITY || "medium" })
    });
    const j = await res.json();
    if (!res.ok) throw new Error("OpenAI " + res.status + ": " + (j.error && j.error.message || "error"));
    return { bytes: unb64(j.data[0].b64_json), type: "image/png" };
  }
  const fd = new FormData();
  fd.append("model", env.OPENAI_MODEL || "gpt-image-2");
  fd.append("prompt", text);
  fd.append("size", aspect === "16:9" ? "1536x1024" : aspect === "3:4" ? "1024x1536" : "1024x1024");
  fd.append("quality", env.OPENAI_QUALITY || "medium");
  images.forEach((r, i) => fd.append("image[]", new Blob([r.bytes], { type: r.type }), "ref" + i + ".png"));
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + env.OPENAI_API_KEY }, body: fd });
  const j = await res.json();
  if (!res.ok) throw new Error("OpenAI " + res.status + ": " + (j.error && j.error.message || "error"));
  return { bytes: unb64(j.data[0].b64_json), type: "image/png" };
}
// size: Gemini imageSize ("1K" default, "2K", "4K"). OpenAI has no 4K, so a backup drawing comes back small
// and says so in .size; the print step redraws any picture that isn't print size.
async function drawStory(env, images, text, aspect, size) {
  const forced = env.ENGINE || "mock";
  if (forced === "mock") return Object.assign(await mock(env, images[0] || { bytes: new Uint8Array(200), type: "image/png" }), { engine: "mock", size: size || "1K" });
  const first = ENGINES.includes(env.STORY_ENGINE) ? env.STORY_ENGINE : "gemini";
  const order = [first].concat(ENGINES.filter(e => e !== first)).filter(e => hasKey(env, e));
  let lastErr = new Error("No AI key set");
  for (const eng of order) {
    try { return Object.assign(await (eng === "gemini" ? geminiImages : openaiImages)(env, images, text, aspect, size), { engine: eng }); }
    catch (e) { lastErr = e; console.error("story engine failed", eng, e.message); }
  }
  throw lastErr;
}
async function loadImage(env, key) {
  const o = await env.BUCKET.get(key);
  return o ? { bytes: await o.arrayBuffer(), type: o.httpMetadata?.contentType || "image/png" } : null;
}

// "mock" returns the photo unchanged: for testing the whole flow without paying for AI.
async function mock(env, photo) {
  if (env.MOCK_DELAY_MS) await new Promise(r => setTimeout(r, num(env.MOCK_DELAY_MS, 0)));  // simulate AI drawing time in tests
  if (env.MOCK_FAIL_RATE && Math.random() < num(env.MOCK_FAIL_RATE, 0)) throw new Error("simulated AI failure");  // tests only
  return { bytes: photo.bytes, type: photo.type };
}

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
    if (!(await getMeta(env, id))) continue;
    // Every line that carries this draft is a printed copy (the book line, plus an "extra copy" line for print products).
    const copies = (order.line_items || []).filter(l => (l.properties || []).some(a => a.name === "_draft" && String(a.value) === id))
      .reduce((n, l) => n + (Number(l.quantity) || 0), 0);
    await updateMeta(env, id, meta => {
      if (meta.paid) return false;
      meta.paid = true; meta.paidAt = Date.now(); meta.order = String(order.name || order.id || "");
      // Books that a printer posts keep the delivery address until the draft is deleted.
      if (productFor(env, meta)) { meta.ship = shippingFrom(order); meta.copies = Math.max(1, Math.min(20, copies || 1)); }
    });
  }
  // Several printed books of the same product in one order (a Learn to Read pack) are posted together:
  // each draft lists the others in meta.pack, and the print queue sends them to Lulu as one job.
  const groups = {};
  for (const id of ids) {
    const meta = ID_RE.test(id) && await getMeta(env, id), product = meta && productFor(env, meta);
    if (product) (groups[product.code] = groups[product.code] || []).push(id);
  }
  for (const pack of Object.values(groups)) if (pack.length > 1)
    for (const id of pack) await updateMeta(env, id, meta => { if (meta.pack) return false; meta.pack = pack.slice(0, 20); });
  return ids.length;
}

// ---------- request handling ----------
async function handle(req, env) {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, ""), m = req.method;
  const h = cors(env, req);
  if (m === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const J = (d, s) => json(d, s, h), E = (s, msg) => err(s, msg, h);

  if (path === "/api/health") return J({ ok: true, engine: env.ENGINE || "mock", gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY, shopify: !!env.SHOPIFY_WEBHOOK_SECRET, lulu: luluReady(env) ? luluEnv(env) : false, browser: !!env.BROWSER, images: !!env.IMAGES });

  // Printer price check (Lulu): print cost, postage and VAT to the UK and Spain, and the cover size.
  // Orders nothing. Products come from PRINT_PRODUCTS; ?pkg= and ?pages= try another Lulu format, ?qty= prices
  // several copies posted together (a pack).
  // Answers are kept for a day, so repeat visits don't call Lulu again.
  if (path === "/api/print/quote" && m === "GET") {
    if (!luluReady(env)) return E(503, "Lulu keys are not set yet");
    const products = printProducts(env), code = url.searchParams.get("product") || Object.keys(products)[0];
    const product = products[code];
    if (!product) return E(404, "Unknown product. Products: " + Object.keys(products).join(", "));
    const pkg = (url.searchParams.get("pkg") || product.pkg || "").toUpperCase(), pages = parseInt(url.searchParams.get("pages") || product.pages, 10);
    const qty = parseInt(url.searchParams.get("qty") || "1", 10);  // copies in one parcel, e.g. a pack of 5 or 10
    if (!PKG_RE.test(pkg) || !(pages >= 24 && pages <= 200) || !(qty >= 1 && qty <= 20)) return E(400, "Bad pkg, pages or qty");
    const key = "print/quote/" + luluEnv(env) + "-" + pkg + "-" + pages + (qty > 1 ? "-x" + qty : "") + ".json";
    const hit = await env.BUCKET.get(key);
    if (hit && Date.parse(hit.uploaded) > Date.now() - 86400000) return J(Object.assign(await hit.json(), { product: code, cached: true }));
    if (env.DRAFT_LIMIT) {
      const { success } = await env.DRAFT_LIMIT.limit({ key: "quote:" + (req.headers.get("CF-Connecting-IP") || "?") });
      if (!success) return E(429, "Too many price checks, try again in a minute");
    }
    let q; try { q = await quote(env, product, pkg, pages, qty); } catch (e) { return E(502, e.message); }
    if (Object.values(q.prices).every(p => !p.error) && !q.cover.error)  // keep only full answers
      await env.BUCKET.put(key, JSON.stringify(q), { httpMetadata: { contentType: "application/json" } });
    return J(Object.assign(q, { product: code, brand: product.brand, name: product.name }));
  }

  // Trial print run on our example book (no customer data): GET /api/print/test?part=interior|cover.
  // One run per 10 minutes, because the free plan has 10 browser minutes a day; in between it shows the last result.
  if (path === "/api/print/test" && m === "GET") {
    const products = printProducts(env), product = products[url.searchParams.get("product") || "storybook"];
    if (!product || !product.printUrl || !env.BROWSER) return E(503, "Printing is not set up");
    const part = url.searchParams.get("part") === "cover" ? "cover" : "interior";
    const story = (url.searchParams.get("story") || "redhood").replace(/[^a-z]/g, "");
    const last = await (await env.BUCKET.get("print/test/last.json"))?.json();
    if (last && last.at > Date.now() - 600000) return J(Object.assign(last, { note: "Last result; the next trial can run after " + new Date(last.at + 600000).toISOString() }));
    await env.BUCKET.put("print/test/last.json", JSON.stringify({ at: Date.now(), running: part }));
    let out; try { out = Object.assign({ ok: true }, await testPdf(env, product, story, part)); out.pdf = url.origin + "/api/print/test/" + part + ".pdf"; }
    catch (e) { out = { ok: false, part, error: String(e.message).slice(0, 500) }; }
    out.at = Date.now();
    await env.BUCKET.put("print/test/last.json", JSON.stringify(out));
    return J(out);
  }
  let pt = /^\/api\/print\/test\/(interior|cover)\.pdf$/.exec(path);
  if (pt && m === "GET") {
    const obj = await env.BUCKET.get("print/test/" + pt[1] + ".pdf");
    return obj ? new Response(obj.body, { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } }) : err(404, "Not found");
  }

  // Shopify calls this when an order is paid.
  if (path === "/api/shopify/orders-paid" && m === "POST") {
    const raw = await req.arrayBuffer();
    if (!(await shopifyVerify(env, req, raw))) return err(401, "Bad signature");
    const n = await onOrderPaid(env, JSON.parse(new TextDecoder().decode(raw)));
    return json({ ok: true, drafts: n });
  }

  // Lulu fetches a book's print files from here (the address holds the book's secret file key).
  let pf = /^\/api\/print\/files\/([a-z0-9]{20})\/([a-z0-9]{24})\/(interior|cover)\.pdf$/.exec(path);
  if (pf && m === "GET") return (await servePrintFile(env, pf[1], pf[2], pf[3] + ".pdf", getMeta, timingSafeEqual)) || err(404, "Not found");

  // Status changes from us or the printer integration: printed, delivered.
  let mm = /^\/api\/admin\/drafts\/([a-z0-9]+)\/status$/.exec(path);
  if (mm && m === "POST") {
    const a = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
    if (!env.ADMIN_TOKEN || !a || !timingSafeEqual(a[1], env.ADMIN_TOKEN)) return err(403, "Not allowed");
    if (!ID_RE.test(mm[1]) || !(await getMeta(env, mm[1]))) return err(404, "Not found");
    const body = await req.json();
    if (body.status !== "printed" && body.status !== "delivered") return err(400, "Unknown status");
    if (body.status === "printed") await deletePrefix(env, "orig/" + mm[1] + "/");
    await updateMeta(env, mm[1], meta => {
      if (body.status === "printed") { meta.printedAt = Date.now(); Object.values(meta.slots).forEach(s => { s.orig = false; }); }
      else meta.deliveredAt = Date.now();
    });
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
    const pagesJson = Array.isArray(body.pages) ? JSON.stringify(body.pages) : null;
    const coverJson = body.cover && typeof body.cover === "object" ? JSON.stringify(body.cover) : null;
    if ((pagesJson && pagesJson.length > 60000) || (coverJson && coverJson.length > 4000)) return E(413, "Your book details are too long.");
    const updated = await updateMeta(env, id, meta => {
      if (STYLES.includes(body.style)) meta.style = body.style;
      if (typeof body.keep === "boolean") meta.keep = body.keep;
      if (pagesJson) meta.pages = JSON.parse(pagesJson);
      if (coverJson) meta.cover = JSON.parse(coverJson);
      if (body.approve === true) {
        if (!meta.paid) throw httpErr(402, "Please complete your order first.");
        // A printed storybook needs every scene drawn at print size before it can be approved.
        const product = productFor(env, meta), story = product && STORIES[(meta.cover && meta.cover.story) || meta.book.slice(product.bookPrefix.length)];
        if (story && story.scenes && Object.keys(story.scenes).some(n => { const s = meta.slots["s" + n]; return !s || !s.toon || !/^[24]K$/.test(s.size || ""); }))
          throw httpErr(409, "Some pictures are still being drawn. Please wait until every page is ready.");
        meta.approvedAt = meta.approvedAt || Date.now();
        if (productFor(env, meta) && !meta.print) meta.print = { key: randomToken(), fileKey: randomId(24) };
      }
    });
    if (body.approve === true && updated.print && !updated.print.pdfAt) await enqueue(env, id);
    return J(publicStatus(updated));
  }

  if (rest === "" && m === "DELETE") { await deleteDraft(env, id); return J({ ok: true, deleted: true }); }

  // Copy drawn characters from another of the family's books: POST /copy { from, fromToken }.
  // Learn to Read packs are several books with one cast; every reader shares one style and outfit,
  // so the characters are drawn once and copied into the other books. Only c-<role> slots this book's
  // story uses are copied, both books must be Learn to Read books, and the caller must hold both tokens.
  if (rest === "/copy" && m === "POST") {
    const body = await req.json().catch(() => ({}));
    const from = String(body.from || "");
    if (!ID_RE.test(from) || from === id) return E(400, "Unknown book.");
    const src = await getMeta(env, from);
    if (!src || typeof body.fromToken !== "string" || !timingSafeEqual(await sha256(body.fromToken), src.tokenHash)) return E(403, "Not allowed");
    const story = STORIES[meta.book.replace(/^flr-/, "")], srcStory = STORIES[(src.book || "").replace(/^flr-/, "")];
    if (!/^flr-/.test(meta.book) || !/^flr-/.test(src.book || "") || !story || !srcStory || story.brand !== "FLR" || srcStory.brand !== "FLR")
      return E(400, "Characters can only be copied between Learn to Read books.");
    const copied = [];
    for (const role of Object.keys(story.roles)) {
      const slot = "c-" + role, s = src.slots[slot];
      if (!s || !s.toon) continue;
      const obj = await env.BUCKET.get("toon/" + from + "/" + slot + ".png");
      if (!obj) continue;
      await env.BUCKET.put("toon/" + id + "/" + slot + ".png", await obj.arrayBuffer(), { httpMetadata: { contentType: obj.httpMetadata?.contentType || "image/png" } });
      await env.BUCKET.delete("toon/" + id + "/" + slot + ".web.webp");
      copied.push({ slot, style: s.style, engine: s.engine });
    }
    const fresh = await updateMeta(env, id, m => {
      for (const c of copied) {
        const s = m.slots[c.slot] || (m.slots[c.slot] = { gens: 0 });
        s.toon = true; s.style = c.style; s.engine = c.engine; s.copiedFrom = from; delete s.pending; delete s.size;
      }
    });
    return J({ ok: true, copied: copied.map(c => c.slot), ...publicStatus(fresh) });
  }

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
    await env.BUCKET.delete("toon/" + id + "/" + slot + ".png");
    await updateMeta(env, id, meta => {
      if (Object.keys(meta.slots).length >= 80 && !meta.slots[slot]) throw httpErr(400, "Too many photos in this book.");
      const s = meta.slots[slot] || (meta.slots[slot] = { gens: 0 });
      s.orig = true; s.toon = false; s.uploaded = Date.now(); delete s.pending;
    });
    return J({ ok: true, slot });
  }

  if (kind === "photos" && m === "DELETE") {
    await env.BUCKET.delete(["orig/" + id + "/" + slot, "toon/" + id + "/" + slot + ".png"]);
    await updateMeta(env, id, meta => { delete meta.slots[slot]; });
    return J({ ok: true });
  }

  if (kind === "cartoons" && m === "POST") {
    const body = await req.json().catch(() => ({}));
    // Story books: c-<role> draws a family member as a story character from their photo,
    // s<n> draws scene n from the approved characters. Prompts come only from stories.js.
    // Without a photo: c-<role> with standin:true draws our own invented character for that part,
    // and c-villain draws the story's villain (never a family member).
    const isScene = /^s\d/.test(slot), isChar = /^c-/.test(slot);
    let story = null, noPhoto = isScene;
    if (isScene || isChar) {
      story = STORIES[body.story];
      if (!story) return E(400, "Unknown story.");
      const isVillain = slot === "c-villain";
      if (isVillain && !story.villain) return E(400, "Unknown role.");
      if (isChar && !isVillain && !story.roles[slot.slice(2)]) return E(400, "Unknown role.");
      if (isVillain || (isChar && body.standin === true)) noPhoto = true;
      if (isScene && !story.scenes[slot.slice(1)]) return E(400, "Unknown scene.");
      if (body.who && !WHO.includes(body.who)) return E(400, "Unknown person.");
      if (body.where && !WHERE.includes(body.where)) return E(400, "Unknown position.");
    }
    // Our own example artwork (ART_DRAFTS in wrangler.toml) is drawn like a paid book: no free limits.
    // Each listed draft still needs its secret token, which only we hold.
    const isArt = (env.ART_DRAFTS || "").split(",").map(x => x.trim()).includes(id);
    let allowance = null;
    if (!meta.paid && !isArt) {
      allowance = await freeAllowance(env, req);
      if (!allowance.ok) return E(429, allowance.message);
    }
    // Reserve this drawing first, so parallel requests can't go over the free preview.
    let style;
    await updateMeta(env, id, m => {
      let s = m.slots[slot];
      if (noPhoto && !s) s = m.slots[slot] = { gens: 0 };
      if (!s || (!s.orig && !noPhoto)) throw httpErr(404, "Upload the photo first.");
      if (s.pending && Date.now() - s.pending < PENDING_MS) throw httpErr(409, "This picture is already being drawn.");
      if (!m.paid && !isArt) {
        if (!s.toon && busySlots(m) >= m.freeSlots) throw httpErr(402, "Your free preview is used up. Order your book to see every page.");
        if (m.gens >= m.freeGens) throw httpErr(402, "You've used your free redos. Order your book to see every page.");
      } else if (!isArt && m.gens >= m.freeGens + Object.keys(m.slots).length * 4 + 20) {
        throw httpErr(429, "Too many redos. Please email hello@familyboardbooks.com and we'll help.");
      }
      style = STYLES.includes(body.style) ? body.style : m.style;
      m.gens = (m.gens || 0) + 1; s.pending = Date.now();
    });
    let sizeDrawn = null;  // set below from the drawing (scenes only)
    const release = ok => updateMeta(env, id, m => {
      const s = m.slots[slot]; if (!s) return false;
      delete s.pending;
      if (ok) { s.toon = true; s.gens = (s.gens || 0) + 1; s.style = style; s.engine = ok; if (sizeDrawn) s.size = sizeDrawn; else delete s.size; } else m.gens = Math.max(0, (m.gens || 1) - 1);
    });
    let out;
    if (isScene) {
      const sc = story.scenes[slot.slice(1)], refs = [];
      for (const role of sc.cast) {
        const img = await loadImage(env, "toon/" + id + "/c-" + role + ".png");
        if (!img) { await release(false); return E(409, "Draw " + story.roles[role].name + " first."); }
        refs.push(img);
      }
      // The drawn villain (c-villain), when the book has one, keeps the Wolf the same on every page.
      const villain = sc.wolf ? await loadImage(env, "toon/" + id + "/c-villain.png") : null;
      if (villain) refs.push(villain);
      // Paid books draw their scenes at print size; the free preview and our example art stay at screen size.
      const size = meta.paid && !isArt ? (env.PRINT_IMAGE_SIZE || "4K") : null;
      try { out = await drawStory(env, refs, scenePrompt(body.story, slot.slice(1), !!villain), "16:9", size); }
      catch (e) { console.error("scene failed", id, slot, e.message); await release(false); return E(502, "We couldn't draw this scene. Please try again."); }
    } else if (noPhoto) {
      const text = slot === "c-villain" ? villainPrompt(body.story) : standinPrompt(body.story, slot.slice(2));
      try { out = await drawStory(env, [], text, "3:4"); }
      catch (e) { console.error("stand-in failed", id, slot, e.message); await release(false); return E(502, "We couldn't draw this one. Please try again."); }
    } else {
    const obj = await env.BUCKET.get("orig/" + id + "/" + slot);
    if (!obj) { await release(false); return E(404, "Upload the photo first."); }
    const photo = { bytes: await obj.arrayBuffer(), type: obj.httpMetadata?.contentType || "image/jpeg" };
    try { out = isChar ? await drawStory(env, [photo], characterPrompt(body.story, slot.slice(2), body.who, body.where), "3:4") : await makeCartoon(env, photo, style); }
    catch (e) { console.error("cartoon failed", id, slot, e.message); await release(false); return E(502, "We couldn't draw this one. Please try again, or try a different photo."); }
    }
    sizeDrawn = isScene ? (out.engine === "openai" ? "1K" : (out.size || "1K")) : null;
    await env.BUCKET.put("toon/" + id + "/" + slot + ".png", out.bytes, { httpMetadata: { contentType: out.type } });
    await env.BUCKET.delete("toon/" + id + "/" + slot + ".web.webp");  // the old screen copy is out of date
    if (allowance && out.engine !== "mock") await allowance.record();
    const fresh = await release(out.engine);
    return J({ ok: true, slot, ...publicStatus(fresh) });
  }

  if (kind === "cartoons" && m === "GET") {
    // ?w=web: a smaller WebP copy for showing on screen (print-size scenes can be 10 MB or more). Made once with
    // Cloudflare Images (binding IMAGES) and kept beside the picture; without the binding, the full picture is sent.
    if (url.searchParams.get("w") === "web" && env.IMAGES) {
      const webKey = "toon/" + id + "/" + slot + ".web.webp";
      let web = await env.BUCKET.get(webKey);
      if (!web) {
        const full = await env.BUCKET.get("toon/" + id + "/" + slot + ".png");
        if (!full) return E(404, "Not found");
        try {
          const res = (await env.IMAGES.input(full.body).transform({ width: 1600, fit: "scale-down" }).output({ format: "image/webp", quality: 82 })).response();
          await env.BUCKET.put(webKey, await res.arrayBuffer(), { httpMetadata: { contentType: "image/webp" } });
          web = await env.BUCKET.get(webKey);
        } catch (e) { console.error("web copy failed", id, slot, e.message); }
      }
      if (web) return new Response(web.body, { headers: Object.assign({ "Content-Type": "image/webp", "Cache-Control": "private, no-store" }, h) });
    }
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
        await updateMeta(env, meta.id, m => { Object.values(m.slots).forEach(s => { s.orig = false; }); }).catch(() => {});
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
    catch (e) {
      const h = cors(env, req);
      if (e && e.status) return err(e.status, e.message, h);
      console.error(e && e.stack || e); return err(500, "Something went wrong. Please try again.", h);
    }
  },
  async scheduled(event, env, ctx) {
    if (event.cron === "17 3 * * *") ctx.waitUntil(cleanup(env));
    else ctx.waitUntil(runPrintQueue(env, updateMeta).then(notes => notes.length && console.log("print queue", notes.join(" | "))));
  }
};
