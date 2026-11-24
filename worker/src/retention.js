// How long a paid customer's drawings and print files are kept, and the reminders before they go.
//
// Policy (agreed with David, 24 Nov 2026): kept for 1 year after the item is posted (Lulu's "shipped", or
// "delivered" set by us), so the family can order more copies. Before deletion we send three emails,
// 30, 14 and 3 days ahead. Each offers a "keep it another year" button and links to a PDF copy where we have one.
// Pressing the button moves the deletion a year on and starts the reminders again.
// The same schedule will serve online-only books (1 year after purchase) when they are built.
//
// Nothing is deleted before all three reminders went out. If email isn't set up, files simply wait.

import { brandFor, esc, letter, mailReady, sendMail } from "./mail.js";

const DAY = 86400000;
export const KEEP_DAYS = 365;
const REMIND_BEFORE = [30, 14, 3];  // days before deletion
const UNSHIPPED_BACKSTOP = 180;     // a paid item that never shows as posted counts from its payment after this

// When the year starts: posted, delivered, or (backstop) long after payment.
function startOf(meta, now) {
  const posted = (meta.print && meta.print.shippedAt) || meta.deliveredAt;
  if (posted) return posted;
  if (meta.paidAt && now - meta.paidAt > UNSHIPPED_BACKSTOP * DAY) return meta.paidAt;
  return null;
}

export function deleteAt(meta, now) {
  if (!meta.paid) return null;
  const start = startOf(meta, now || Date.now());
  if (!start) return null;
  // meta.keep = the customer ticked "keep my files" on the proof page: a second year from the start.
  return Math.max(start + KEEP_DAYS * (meta.keep ? 2 : 1) * DAY, meta.keepUntil || 0);
}

function randomKey() {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789", b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b, x => a[x % a.length]).join("");
}

function day(ms) { return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }

async function remind(env, meta, when, n, origin, brand, updateMeta) {
  let keepKey = meta.keepKey;
  if (!keepKey) { keepKey = randomKey(); await updateMeta(env, meta.id, m => { m.keepKey = m.keepKey || keepKey; }); }
  const keepUrl = origin + "/api/keep/" + meta.id + "/" + keepKey;
  const pdf = meta.print && meta.print.pdfAt && meta.print.fileKey && await env.BUCKET.head("print/" + meta.id + "/interior.pdf")
    ? origin + "/api/print/files/" + meta.id + "/" + meta.print.fileKey + "/interior.pdf" : null;
  const what = meta.order ? "your order " + esc(meta.order) : "your order";
  const paras = [
    "Hello,",
    `We've kept the pictures and print files for ${what}, so you can order more copies whenever you like. We keep them for a year after your order is posted, and that year ends on <b>${day(when)}</b>.`,
    "If you'd like us to keep them for another year, press the button below. It's free.",
    pdf ? `Whatever you decide, here's a <a href="${pdf}">PDF copy of your book</a> to save and keep. The link stops working once the files are deleted.` : "",
    n === REMIND_BEFORE.length - 1 ? "This is our last reminder. If we don't hear from you, the files will be deleted for good on that date." : "If you don't need them, you don't have to do anything."
  ].filter(Boolean);
  await sendMail(env, {
    brand, to: meta.email,
    subject: n === REMIND_BEFORE.length - 1 ? "Last reminder: your " + brand.name + " files will be deleted on " + day(when) : "Shall we keep your " + brand.name + " files for another year?",
    html: letter(brand, paras, { label: "Keep them another year", url: keepUrl })
  });
}

// Runs inside the daily clean-up for each paid draft. Returns "deleted", "reminded" or null.
export async function retention(env, meta, now, ctx) {
  const when = deleteAt(meta, now);
  if (!when) return null;
  const sent = (meta.reminders || []).length;
  const brand = brandFor(env, ctx.brandCode(meta));
  if (meta.email && sent < REMIND_BEFORE.length && now >= when - REMIND_BEFORE[sent] * DAY) {
    if (!mailReady(env)) return null;
    try {
      await remind(env, meta, when, sent, ctx.origin, brand, ctx.updateMeta);
      await ctx.updateMeta(env, meta.id, m => { m.reminders = (m.reminders || []).concat(now); });
      return "reminded";
    } catch (e) { console.error("reminder", meta.id, e.message); return null; }
  }
  // Delete once the date has passed and every reminder went out at least 3 days before
  // (or there's no email address to remind).
  const last = (meta.reminders || [])[REMIND_BEFORE.length - 1];
  if (now >= when && (!meta.email || (sent >= REMIND_BEFORE.length && now - last >= 3 * DAY))) {
    await ctx.deleteDraft(env, meta.id);
    return "deleted";
  }
  return null;
}

// The "keep them another year" link from the reminder: a page with a button (a plain link would be pressed
// by email scanners). POST moves the deletion a year on and restarts the reminders.
export async function keepPage(env, req, id, key, getMeta, updateMeta, timingSafeEqual) {
  const meta = await getMeta(env, id);
  const html = (title, body) => new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#FDFCFA;color:#1E1A33;font:17px/1.5 Arial,Helvetica,sans-serif}main{max-width:520px;margin:12vh auto;padding:0 20px}button{background:#EE4B2B;color:#fff;border:0;border-radius:22px;padding:12px 22px;font:700 16px Arial,Helvetica,sans-serif;cursor:pointer}</style></head><body><main>${body}</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  if (!meta || !meta.keepKey || !timingSafeEqual(key, meta.keepKey)) return html("Not found", "<h1>We couldn't find these files</h1><p>They may already have been deleted. If you think that's wrong, reply to our email.</p>");
  const brand = brandFor(env, meta.brandCode || "default");
  const now = Date.now(), current = deleteAt(meta, now) || now;
  if (req.method === "POST") {
    let until;
    await updateMeta(env, id, m => { until = Math.max(current, now) + 365 * DAY; m.keepUntil = until; m.reminders = []; });
    return html("Kept", `<h1>Done, we'll keep them</h1><p>Your files are now kept until <b>${day(until)}</b>. We'll email you again before then.</p><p>${esc(brand.name)}</p>`);
  }
  return html("Keep your files", `<h1>Keep your files for another year?</h1><p>They're due to be deleted on <b>${day(current)}</b>. Press the button and we'll keep them until ${day(Math.max(current, now) + 365 * DAY)}. It's free.</p><form method="post"><button type="submit">Keep them another year</button></form>`);
}
