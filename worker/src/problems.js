// "Report a problem" with a paid order: the customer picks a reason, writes what's wrong and adds up to
// 4 photos (resized in the browser). Opened from My orders or the proof page, with the book's private
// link (the draft token), so only the family who ordered can report on it.
//
// The report and photos are kept privately in R2 (problems/<draft>/<report>/) and emailed to the brand's
// hello@ inbox, with the customer as reply-to, so David can answer straight away (reprint or refund).
// Photos are deleted when the report is settled (admin call below) and after 90 days at the latest.

import { brandFor, esc, letter, mailReady, sendMail } from "./mail.js";

export const REASONS = {
  damaged: "Arrived damaged",
  fault: "Printing fault",
  proof: "Doesn't match the proof I approved",
  pieces: "Missing or broken jigsaw pieces",
  lost: "Parcel hasn't arrived",
  other: "Something else"
};
const MAX_PHOTOS = 4, MAX_PHOTO_BYTES = 3 * 1024 * 1024, MAX_REPORTS = 5, KEEP_DAYS = 90;

function rid() {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789", b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, x => a[x % a.length]).join("");
}
function fromB64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function isJpeg(u) { return u.length > 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff; }

// body: { reason, details, photos: [base64 JPEG, ...] }. Throws { status, message } on bad input.
export async function report(env, meta, body, brandCode, httpErr) {
  if (!mailReady(env)) throw httpErr(503, "Reports can't be sent from here yet. Please email us with your order number and photos.");
  if (!meta.paid) throw httpErr(400, "You can report a problem once your order is paid.");
  const reason = REASONS[body.reason] ? body.reason : null;
  const details = String(body.details || "").trim().slice(0, 2000);
  if (!reason) throw httpErr(400, "Please choose what's wrong.");
  if (details.length < 5) throw httpErr(400, "Please tell us a little about the problem.");
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS + 1) : [];
  if (photos.length > MAX_PHOTOS) throw httpErr(400, "Please add at most " + MAX_PHOTOS + " photos.");
  const existing = await env.BUCKET.list({ prefix: "problems/" + meta.id + "/", delimiter: "/" });
  if ((existing.delimitedPrefixes || []).length >= MAX_REPORTS) throw httpErr(429, "You've sent several reports already. Please email us instead.");

  const bytes = photos.map(p => fromB64(String(p).replace(/^data:image\/jpeg;base64,/, "")));
  if (bytes.some(u => !isJpeg(u) || u.length > MAX_PHOTO_BYTES)) throw httpErr(400, "Photos must be JPEG pictures under 3 MB each.");

  const id = rid(), base = "problems/" + meta.id + "/" + id + "/", at = Date.now();
  for (let i = 0; i < bytes.length; i++) await env.BUCKET.put(base + (i + 1) + ".jpg", bytes[i], { httpMetadata: { contentType: "image/jpeg" } });
  const record = { id, draft: meta.id, order: meta.order || "", email: meta.email || "", reason, details, photos: bytes.length, at };
  await env.BUCKET.put(base + "report.json", JSON.stringify(record), { httpMetadata: { contentType: "application/json" } });

  let emailed = false;
  if (mailReady(env)) {
    const brand = brandFor(env, brandCode);
    try {
      await sendMail(env, {
        brand, to: brand.email, replyTo: meta.email || brand.email,
        subject: "Problem report: order " + (meta.order || meta.id) + ": " + REASONS[reason],
        html: letter(brand, [
          `<b>Order:</b> ${esc(meta.order || "unknown")} (book ${esc(meta.id)})`,
          `<b>Customer:</b> ${esc(meta.email || "no email on file")}`,
          `<b>Problem:</b> ${esc(REASONS[reason])}`,
          esc(details).replace(/\n/g, "<br>"),
          bytes.length ? bytes.length + " photo(s) attached." : "No photos.",
          `When it's settled, delete the photos: DELETE /api/admin/problems/${esc(meta.id)}/${id}`
        ]),
        attachments: bytes.map((u, i) => ({ name: "photo-" + (i + 1) + ".jpg", mime_type: "image/jpeg", content: toB64(u) }))
      });
      emailed = true;
    } catch (e) { console.error("problem email", e.message); }
  }
  await env.BUCKET.put(base + "report.json", JSON.stringify(Object.assign(record, { emailed })), { httpMetadata: { contentType: "application/json" } });
  return { ok: true, id, emailed };
}

function toB64(u) { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }

// Daily: photos and reports older than 90 days are deleted.
export async function cleanupProblems(env) {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  let cursor, n = 0;
  do {
    const list = await env.BUCKET.list({ prefix: "problems/", cursor });
    const old = list.objects.filter(o => new Date(o.uploaded).getTime() < cutoff).map(o => o.key);
    if (old.length) { await env.BUCKET.delete(old); n += old.length; }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return n;
}
