// Paid storybooks are painted on our server, not in the customer's browser, and the customer is emailed when
// every page is ready to check. Checking is optional: if they don't approve, the book goes to print anyway on day 4.
//
// 1. Paint queue (paint/queue/<id>): the order-paid webhook adds a paid storybook. Every 10 minutes the cron paints
//    what's missing: the villain, a stand-in for each part with no family photo, then every scene at print size.
//    When nothing is missing: readyAt is set, the "pages ready" email goes out, and the book moves to step 2.
// 2. Approval wait (paint/wait/<id>): reminders on days 1, 2 and 3 after the pages were ready; on day 4 the
//    book is approved for the customer and joins the print queue. Approving earlier takes it out of the wait.
//
// A picture that fails three times stops the book and emails the brand's hello@ address, so it isn't left stuck.

import { STORIES, standinPrompt, villainPrompt, scenePrompt } from "./stories.js";
import { productFor, enqueue } from "./printing.js";
import { brandFor, esc, letter, mailReady, sendMail } from "./mail.js";
import { admin, shopifyReady } from "./shopify.js";
import { paintSwap } from "./swap.js";
import { paintMask } from "./mask.js";

const PAINT = "paint/queue/", WAIT = "paint/wait/";
const DAY = 86400000;
export const PRINT_AFTER_DAYS = 4;
const PER_RUN = 8, AT_ONCE = 2, MAX_TRIES = 3, PENDING_MS = 5 * 60000;
const SWAP_PER_RUN = 2;  // a "swap" or "mask" page takes several drawings and a check: fewer per cron run

export function storyOf(env, meta) {
  const product = productFor(env, meta);
  if (!product) return null;
  const key = (meta.cover && meta.cover.story) || meta.book.slice(product.bookPrefix.length);
  const story = STORIES[key];
  return story && story.scenes && !story.brand ? { key, story } : null;  // storybooks only (Learn to Read is layered)
}

// Called by the order-paid webhook for each paid draft. Keeps the customer's own book link from the order line.
export async function startPainting(env, id, order, updateMeta) {
  const line = (order.line_items || []).find(l => (l.properties || []).some(a => a.name === "_draft" && String(a.value) === id));
  const link = line && (line.properties || []).find(a => a.name === "Your book link");
  await updateMeta(env, id, m => {
    if (link && /^https:\/\/[^\s"<>]+\/proof\.html\?d=[a-z0-9]{20}#[A-Za-z0-9_-]+$/.test(String(link.value))) m.proofUrl = String(link.value);
    // PAINT_METHOD "swap" (swap.js) or "mask" (mask.js) paints new books one family member at a time, with a check.
    m.paint = m.paint || Object.assign({ queuedAt: Date.now() }, /^(swap|mask)$/.test(env.PAINT_METHOD || "") ? { method: env.PAINT_METHOD } : {});
  });
  await env.BUCKET.put(PAINT + id, String(Date.now()));
}

// What still has to be painted, in order: characters first (scenes are drawn from them), then scenes.
function missing(meta, story) {
  const slots = meta.slots || {}, chars = [], scenes = [];
  if (story.villain && !(slots["c-villain"] && slots["c-villain"].toon)) chars.push("c-villain");
  for (const role of Object.keys(story.roles)) if (!(slots["c-" + role] && slots["c-" + role].toon)) chars.push("c-" + role);
  for (const n of Object.keys(story.scenes)) { const s = slots["s" + n]; if (!s || !s.toon || !/^[24]K$/.test(s.size || "")) scenes.push("s" + n); }
  return { chars, scenes };
}

async function paintSlot(env, id, key, story, slot, deps, opts) {
  const o = opts || {};
  const { drawStory, styleImage, sceneRefs, updateMeta } = deps;
  let mine = false;
  await updateMeta(env, id, m => {
    mine = false;
    const s = m.slots[slot] = m.slots[slot] || { gens: 0 };
    if (s.pending && Date.now() - s.pending < PENDING_MS) return false;  // being drawn already (e.g. a redraw on the proof page)
    if (!o.force && s.toon && (slot.startsWith("c-") || /^[24]K$/.test(s.size || ""))) return false;  // finished meanwhile (the proof page drew it): never paint over it
    s.pending = Date.now(); mine = true;
  });
  if (!mine) return "busy";
  let out = null, error = null, check = null;
  try {
    if (slot === "c-villain") out = await drawStory(env, [], villainPrompt(key), "3:4");
    else if (slot.startsWith("c-")) {
      const styleImg = await styleImage(env, story, key, slot.slice(2));
      out = await drawStory(env, styleImg ? [styleImg] : [], standinPrompt(key, slot.slice(2), styleImg && styleImg.style), "3:4");
    } else if (deps.checkPicture && /^(swap|mask)$/.test(((await deps.getMeta(env, id)).paint || {}).method || "")) {
      const touch = () => updateMeta(env, id, m => { const s = m.slots[slot]; if (!s || !s.pending) return false; s.pending = Date.now(); });
      const pm = (await deps.getMeta(env, id)).paint, method = pm.method;
      const paintOpts = { swap: !!pm.swap, tries: pm.tries || 1 };  // test copies only, for now (replicate.js)
      const r = await (method === "mask" ? paintMask : paintSwap)(env, id, key, story, slot.slice(1), Object.assign({}, deps, { touch, paintOpts }), o.note);
      out = r.out; check = r.check;
    } else {
      const r = await sceneRefs(env, id, story, key, slot.slice(1), false);
      if (r.missing) throw new Error("character " + r.missing + " missing");
      out = await drawStory(env, r.refs, scenePrompt(key, slot.slice(1), r.villain, { example: r.example, note: o.note }), "16:9", env.PRINT_IMAGE_SIZE || "4K");
    }
    await env.BUCKET.put("toon/" + id + "/" + slot + ".png", out.bytes, { httpMetadata: { contentType: out.type } });
    await env.BUCKET.delete("toon/" + id + "/" + slot + ".web.webp");
  } catch (e) { error = String(e.message || e).slice(0, 200); out = null; }
  const size = out && slot.startsWith("s") ? (out.engine === "openai" ? "1K" : (out.size || "1K")) : null;
  const tooSmall = size && !/^[24]K$/.test(size);
  const creditSkip = tooSmall && (out.skipped || []).some(isCreditError);
  if (tooSmall) error = "drawn too small to print by the backup engine (" + (out.skipped || []).join("; ").slice(0, 150) + ")";
  if (!out && isCreditError(error)) {  // not this book's fault: don't count it towards "stuck"
    await updateMeta(env, id, m => { const s = m.slots[slot]; if (!s) return false; delete s.pending; m.paint = m.paint || {}; m.paint.lastError = slot + ": " + error; });
    return "nocredit";
  }
  await updateMeta(env, id, m => {
    const s = m.slots[slot]; if (!s) return false;
    delete s.pending;
    if (out) {
      s.toon = true; s.gens = (s.gens || 0) + 1; s.style = m.style; s.engine = out.engine; s.standin = slot.startsWith("c-") || undefined;
      if (size) s.size = size; else delete s.size;
      if (check) s.check = check; else delete s.check;
      // A page that still failed the check after its tries: keep it, but hold the book for us to look at.
      if (check && check.ok === false && !m.test) {
        m.paint = m.paint || {}; m.paint.issues = m.paint.issues || {}; m.paint.held = true;
        m.paint.issues[slot] = { note: "Automatic check: " + (check.notes || "failed"), at: Date.now(), auto: true };
      }
      m.gens = (m.gens || 0) + 1;
      if (m.paint && m.paint.fails && !tooSmall) delete m.paint.fails[slot];
    }
    if (creditSkip) { m.paint = m.paint || {}; m.paint.lastError = slot + ": " + error; }
    if (!out || (tooSmall && !creditSkip)) {
      m.paint = m.paint || {}; m.paint.fails = m.paint.fails || {};
      m.paint.fails[slot] = (m.paint.fails[slot] || 0) + 1; m.paint.lastError = slot + ": " + error;
    }
  });
  return creditSkip ? "nocredit" : out && !tooSmall ? "ok" : out ? "small" : "failed";
}

async function pool(items, n, fn) {
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; results.push(await fn(it)); } }));
  return results;
}

// The customer's private book link: kept from the order, or read from Shopify for orders paid before we kept it.
async function proofUrlFor(env, meta, updateMeta) {
  if (meta.proofUrl) return meta.proofUrl;
  if (!meta.orderGid || !shopifyReady(env)) return null;
  try {
    const d = await admin(env, `query($id: ID!) { order(id: $id) { lineItems(first: 50) { nodes { customAttributes { key value } } } } }`, { id: meta.orderGid });
    for (const l of (d.order && d.order.lineItems.nodes) || []) {
      const a = l.customAttributes.find(x => x.key === "Your book link");
      if (a && a.value.includes("d=" + meta.id + "#")) { await updateMeta(env, meta.id, m => { m.proofUrl = a.value; }); return a.value; }
    }
  } catch (e) { console.error("proof link lookup failed", meta.id, e.message); }
  return null;
}

function day(ms) { return new Date(ms).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }); }

// n = 0: the pages are ready; 1-3: reminders. The print date is always said, so nobody is surprised.
export function readyEmail(brand, meta, story, n) {
  const printOn = day(meta.paint.readyAt + PRINT_AFTER_DAYS * DAY);
  const hero = esc(((meta.cover && meta.cover.names && meta.cover.names.hero) || "").trim());
  const book = "<b>" + esc(story.title) + "</b>" + (hero ? " starring " + hero : "");
  const order = meta.order ? " (order " + esc(meta.order) + ")" : "";
  const subjects = [
    "Your storybook pages are ready to look at",
    "Reminder: your storybook goes to print on " + printOn,
    "Reminder: your storybook goes to print on " + printOn,
    "Last chance to change anything: your storybook prints tomorrow"
  ];
  const paras = n === 0 ? [
    "Hello,",
    "We've painted every page of " + book + order + ".",
    "Have a look whenever you like. If you'd like a page or a character redrawn, you can do it there, as often as you need. If you're happy, press Approve and we'll print it straight away.",
    "You don't have to do anything: if we don't hear from you, we'll print your book as it is on <b>" + printOn + "</b>, so it isn't delayed."
  ] : [
    "Hello,",
    "Just a reminder that the pages of " + book + order + " are ready to look at.",
    n === 3 ? "<b>We'll print your book tomorrow</b> exactly as the pages look now. If you'd like anything changed, please do it today." :
      "We'll print it as it is on <b>" + printOn + "</b>. If you're happy already, press Approve and it goes to print straight away.",
    "You don't have to do anything if you're happy with it."
  ];
  return { subject: subjects[n], html: letter(brand, paras, { label: "Look at my pages", url: meta.proofUrl }) };
}

// An AI account out of credit stops every book, so it gets its own alert (at most one every 6 hours per engine).
const CREDIT_RE = /credit|quota|billing|prepayment|insufficient|exceeded your current/i;
export function isCreditError(msg) { return /\b(402|429)\b/.test(msg || "") && CREDIT_RE.test(msg || ""); }
export async function alertCredits(env, engine, msg) {
  if (!mailReady(env)) return;
  const key = "alert/credits-" + engine, last = await env.BUCKET.get(key);
  if (last && Date.now() - Number(await last.text()) < 6 * 3600000) return;
  await env.BUCKET.put(key, String(Date.now()));
  const brand = brandFor(env, "FST"), where = engine === "gemini" ? "Google AI Studio (aistudio.google.com, Billing)" : "OpenAI (platform.openai.com, Billing)";
  try {
    await sendMail(env, { brand, to: brand.email, subject: "[Urgent] The " + engine + " drawing account has run out of credit",
      html: letter(brand, ["Pictures can't be drawn until credit is added, so paid books are waiting.", "Please add credit in " + esc(where) + ". Books carry on by themselves once it's added.",
        "The message was: " + esc(String(msg).slice(0, 300))]) });
  } catch (e) { console.error("credit alert failed", e.message); }
}

async function alertStuck(env, meta, why) {
  if (!mailReady(env)) return;
  const brand = brandFor(env, meta.brandCode || "FST");
  try {
    await sendMail(env, { brand, to: brand.email, subject: "[Needs a look] Storybook " + (meta.order || meta.id) + " is stuck",
      html: letter(brand, ["A paid storybook has stopped and needs a look.", "Order: " + esc(meta.order || "?") + "<br>Draft: " + esc(meta.id) + "<br>Problem: " + esc(why),
        "Nothing more will be tried for this book until it's put back in the queue."]) });
  } catch (e) { console.error("stuck alert failed", meta.id, e.message); }
}

async function sendReady(env, meta, story, n, updateMeta) {
  const brand = brandFor(env, meta.brandCode || "FST");
  if (!meta.email || !mailReady(env)) return false;
  const proofUrl = await proofUrlFor(env, meta, updateMeta);
  if (!proofUrl) return false;
  await sendMail(env, Object.assign({ brand, to: meta.email }, readyEmail(brand, Object.assign({}, meta, { proofUrl }), story, n)));
  return true;
}

// One cron run: paint what's missing, then send reminders and approve books whose four days are up.
export async function runPainting(env, deps) {
  const { getMeta, updateMeta, randomToken, randomId } = deps, notes = [], now = Date.now();
  let budget = PER_RUN;

  const queued = await env.BUCKET.list({ prefix: PAINT, limit: 20 });
  for (const obj of queued.objects) {
    if (budget <= 0) break;
    const id = obj.key.slice(PAINT.length), meta = await getMeta(env, id), s = meta && storyOf(env, meta);
    if (!meta || !meta.paid || !s) { await env.BUCKET.delete(obj.key); continue; }
    const fails = (meta.paint && meta.paint.fails) || {};
    const stuck = Object.keys(fails).find(k => fails[k] >= MAX_TRIES);
    if (stuck) {
      await env.BUCKET.delete(obj.key);
      await updateMeta(env, id, m => { m.paint = m.paint || {}; m.paint.stuckAt = now; });
      await alertStuck(env, meta, "the picture " + stuck + " failed " + MAX_TRIES + " times (" + (meta.paint.lastError || "") + ")");
      notes.push(id + ": stuck on " + stuck); continue;
    }
    const { chars, scenes } = missing(meta, s.story);
    if (chars.length) {
      const batch = chars.slice(0, budget); budget -= batch.length;
      const r = await pool(batch, AT_ONCE, slot => paintSlot(env, id, s.key, s.story, slot, deps));
      notes.push(id + ": characters " + r.join(","));
      if (r.includes("nocredit")) { notes.push("stopped: out of credit"); break; }
      if (budget <= 0) break;
    }
    const after = chars.length ? missing(await getMeta(env, id), s.story) : { chars, scenes };
    if (after.chars.length) continue;  // try again next run
    if (after.scenes.length) {
      const swap = meta.paint && /^(swap|mask)$/.test(meta.paint.method || "");
      const per = meta.paint.swap || meta.paint.tries > 1 ? 1 : SWAP_PER_RUN;  // face swap and scoring take longer
      const batch = after.scenes.slice(0, swap ? Math.min(budget, per) : budget); budget = swap ? 0 : budget - batch.length;
      const r = await pool(batch, AT_ONCE, slot => paintSlot(env, id, s.key, s.story, slot, deps));
      notes.push(id + ": scenes " + r.join(","));
      if (r.includes("nocredit")) { notes.push("stopped: out of credit"); break; }
    }
    const done = await getMeta(env, id), left = missing(done, s.story);
    if (!left.chars.length && !left.scenes.length) {
      await env.BUCKET.delete(obj.key);
      if (done.approvedAt) { notes.push(id + ": ready (already approved)"); continue; }
      if (done.test) {  // our own test copy: no emails, no approval wait, never printed
        await updateMeta(env, id, m => { m.paint = m.paint || {}; if (m.paint.readyAt) return false; m.paint.readyAt = Date.now(); });
        notes.push(id + ": test copy ready"); continue;
      }
      if (done.paint && done.paint.readyAt) { await env.BUCKET.put(WAIT + id, String(done.paint.readyAt)); notes.push(id + ": repainted"); continue; }  // a page redrawn after "ready": no new email
      const ready = await updateMeta(env, id, m => { m.paint = m.paint || {}; m.paint.readyAt = m.paint.readyAt || Date.now(); });
      await env.BUCKET.put(WAIT + id, String(ready.paint.readyAt));
      try { if (await sendReady(env, ready, s.story, 0, updateMeta)) await updateMeta(env, id, m => { m.paint.sent = 0; }); }
      catch (e) { console.error("ready email failed", id, e.message); }
      notes.push(id + ": ready");
    }
  }

  // Reminders and the day-4 print.
  const waiting = await env.BUCKET.list({ prefix: WAIT, limit: 200 });
  for (const obj of waiting.objects) {
    const id = obj.key.slice(WAIT.length), meta = await getMeta(env, id), s = meta && storyOf(env, meta);
    if (!meta || !s || meta.approvedAt || !(meta.paint && meta.paint.readyAt)) { await env.BUCKET.delete(obj.key); continue; }
    if (meta.paint.held) continue;  // a page was reported: no reminders and no printing until it's fixed
    const days = Math.floor((now - meta.paint.readyAt) / DAY);
    const left = missing(meta, s.story);
    if (left.scenes.length || left.chars.length) {  // a redraw on the proof page came back too small to print: paint it again here
      if (!(await env.BUCKET.get(PAINT + id))) await requeue(env, id);
      if (days >= PRINT_AFTER_DAYS) continue;
    }
    if (days >= PRINT_AFTER_DAYS) {
      const updated = await updateMeta(env, id, m => {
        if (m.approvedAt) return false;
        m.approvedAt = Date.now(); m.autoApproved = true;
        if (!m.print) m.print = { key: randomToken(), fileKey: randomId(24) };
      });
      if (updated && updated.print && !updated.print.pdfAt) await enqueue(env, id);
      await env.BUCKET.delete(obj.key);
      notes.push(id + ": approved automatically on day " + days);
      continue;
    }
    const sent = meta.paint.sent == null ? -1 : meta.paint.sent;
    if (days >= 1 && days > sent) {
      try { if (await sendReady(env, meta, s.story, Math.min(days, 3), updateMeta)) await updateMeta(env, id, m => { m.paint.sent = days; }); }
      catch (e) { console.error("reminder failed", id, e.message); }
    } else if (sent < 0 && days === 0) {  // the "ready" email didn't go (no link or email yet): try again
      try { if (await sendReady(env, meta, s.story, 0, updateMeta)) await updateMeta(env, id, m => { m.paint.sent = 0; }); }
      catch (e) { console.error("ready email retry failed", id, e.message); }
    }
  }
  return notes;
}

// A family reports a problem with a page ({ slot: "s<n>" or "book", note }). The book is held: no reminders and no
// day-4 printing until it's fixed, and the brand's hello@ address is told. Redrawing every reported page releases it.
export async function reportIssue(env, meta, body, updateMeta, httpErr) {
  const story = storyOf(env, meta);
  if (!meta.paid || !story) throw httpErr(400, "This book can't take page reports.");
  if (meta.approvedAt) throw httpErr(409, "Your book has already gone to print. Please use Report a problem in My orders.");
  const slot = String(body.slot || ""), note = String(body.note || "").replace(/\s+/g, " ").trim().slice(0, 1000);
  if (slot !== "book" && !(/^s\d{1,2}$/.test(slot) && story.story.scenes[slot.slice(1)])) throw httpErr(400, "Unknown page.");
  if (note.length < 3) throw httpErr(400, "Please tell us what's wrong.");
  const updated = await updateMeta(env, meta.id, m => {
    m.paint = m.paint || {}; m.paint.issues = m.paint.issues || {};
    if (Object.keys(m.paint.issues).length >= 20) return false;
    m.paint.issues[slot] = { note, at: Date.now() }; m.paint.held = true;
  });
  const n = slot === "book" ? 0 : Number(slot.slice(1));
  const where = n ? "Pages " + (2 + n * 2) + " and " + (3 + n * 2) + " (" + slot + ")" : "The whole book";
  if (mailReady(env)) {
    const brand = brandFor(env, meta.brandCode || "FST");
    try {
      await sendMail(env, { brand, to: brand.email, replyTo: meta.email || undefined, subject: "[Page problem] Storybook " + (meta.order || meta.id) + ": " + where,
        html: letter(brand, ["A family has reported a problem with their storybook before it's printed. It is on hold: it won't print until the page is redrawn or the book is approved.",
          "Order: " + esc(meta.order || "?") + "<br>Draft: " + esc(meta.id) + "<br>Story: " + esc(story.story.title) + "<br>Where: " + esc(where) + "<br>Their words: " + esc(note),
          "Redraw the page from the family's proof page (the link is on the Shopify order as \u201cYour book link\u201d) with a note for the painter. Once every reported page is redrawn, the book's four days start again."]) });
    } catch (e) { console.error("page report email failed", meta.id, e.message); }
  }
  return updated;
}
// After a page is redrawn: if it had been reported, clear it; with none left, release the hold and start the four days again.
export async function redrawn(env, id, slot, updateMeta) {
  return updateMeta(env, id, m => {
    const issues = m.paint && m.paint.issues;
    if (!issues || !issues[slot]) return false;
    delete issues[slot];
    if (Object.keys(issues).some(k => k !== "book")) return;
    if (issues.book) return;  // a whole-book report is released by us (admin) or by approving
    m.paint.held = false;
    if (m.paint.readyAt) { m.paint.readyAt = Date.now(); m.paint.sent = 0; }
  });
}
// Us (ADMIN_TOKEN): release a held book, starting its four days again from now.
export async function release(env, id, updateMeta) {
  const m = await updateMeta(env, id, mm => { if (!mm.paint) return false; mm.paint.issues = {}; mm.paint.held = false; if (mm.paint.readyAt) { mm.paint.readyAt = Date.now(); mm.paint.sent = 0; } });
  if (m && m.paint && m.paint.readyAt && !m.approvedAt) await env.BUCKET.put(WAIT + id, String(m.paint.readyAt));
  return m;
}

// Us (the admin page): paint one page of a paid storybook again now, with an optional note for the painter.
// A reported page that comes back at print size is cleared, as when the family redraws it.
export async function repaintPage(env, meta, slot, note, deps) {
  const s = storyOf(env, meta);
  if (!s || !/^s\d{1,2}$/.test(slot) || !s.story.scenes[slot.slice(1)]) return { ok: false, error: "Unknown page" };
  const r = await paintSlot(env, meta.id, s.key, s.story, slot, deps, { force: true, note: String(note || "").replace(/[\u0000-\u001f"<>{}\[\]`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) });
  if (r === "ok") await redrawn(env, meta.id, slot, deps.updateMeta);
  const after = await deps.getMeta(env, meta.id);
  return { ok: r === "ok", result: r, error: r === "ok" ? null : (after.paint && after.paint.lastError) || r };
}

// Put a paid storybook back in the paint queue (after a stuck alert, or for books paid before this existed).
export async function requeue(env, id) { await env.BUCKET.put(PAINT + id, String(Date.now())); }
