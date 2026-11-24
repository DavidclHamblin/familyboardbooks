// Printing: turns an approved, paid book into Lulu's two PDFs and a Lulu print job.
// Shared by every brand. A book is printed when its draft's `book` starts with a PRINT_PRODUCTS row's
// `bookPrefix` (e.g. "fst-" for Family Storybooks). The row's `printUrl` is the brand's print page, which
// lays the book out (familystorybooks print.html); Cloudflare's built-in browser (Browser Run) saves it as PDF.
//
// The queue: approving a paid book adds print/queue/<id>. Every 10 minutes the cron takes queued books
// one step at a time: make the PDFs -> send the job to Lulu -> follow Lulu's status until shipped.
// Books of one paid order with the same product (meta.pack, e.g. a Learn to Read pack) go as one job, one parcel.
// LULU_ENV = "sandbox" sends jobs to Lulu's test system, where nothing is printed or charged.
import puppeteer from "@cloudflare/puppeteer";
import { lulu, luluEnv, luluReady, printProducts } from "./lulu.js";
import { shopifyReady, markInProduction, addTracking } from "./shopify.js";

const QUEUE = "print/queue/";
const DONE = ["SHIPPED", "REJECTED", "CANCELED"];

export function productFor(env, meta) {
  const all = printProducts(env);
  for (const [code, p] of Object.entries(all)) if (p.bookPrefix && (meta.book || "").startsWith(p.bookPrefix)) return Object.assign({ code }, p);
  return null;
}

// Shopify's paid order: keep what Lulu needs to post the book (deleted with the draft).
export function shippingFrom(order) {
  const a = order.shipping_address || {};
  return {
    name: [a.first_name, a.last_name].filter(Boolean).join(" ") || a.name || "", organization: a.company || undefined,
    street1: a.address1 || "", street2: a.address2 || undefined, city: a.city || "", postcode: a.zip || "",
    state_code: a.province_code || undefined, country_code: a.country_code || "",
    phone_number: a.phone || order.phone || (order.customer && order.customer.phone) || "",
    email: order.email || order.contact_email || ""
  };
}

export async function enqueue(env, id) {
  await env.BUCKET.put(QUEUE + id, String(Date.now()));
}

// Lulu downloads the PDFs from here. fileKey is a random secret per book, so the address can't be guessed.
export async function servePrintFile(env, id, key, name, getMeta, timingSafeEqual) {
  const meta = await getMeta(env, id);
  if (!meta || !meta.print || !meta.print.fileKey || !timingSafeEqual(key, meta.print.fileKey)) return null;
  const obj = await env.BUCKET.get("print/" + id + "/" + name);
  return obj ? new Response(obj.body, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } }) : null;
}

// Opens one print page in Cloudflare's browser and saves it as PDF. The page sets body data-ready or data-error.
async function pagePdf(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("document.body.dataset.ready || document.body.dataset.error", { timeout: 120000 });
    const error = await page.evaluate(() => document.body.dataset.error || "");
    if (error) throw new Error("print page: " + error);
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 120000 });
  } finally { await page.close().catch(() => {}); }
}

async function makePdfs(env, meta, product) {
  const story = (meta.cover && meta.cover.story) || meta.book.slice(product.bookPrefix.length);
  const base = product.printUrl.replace("{story}", encodeURIComponent(story)) + "&d=" + meta.id;
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    for (const part of ["interior", "cover"]) {
      const pdf = await pagePdf(browser, base + "&part=" + part + "#" + encodeURIComponent(meta.print.key));
      await env.BUCKET.put("print/" + meta.id + "/" + part + ".pdf", pdf, { httpMetadata: { contentType: "application/pdf" } });
    }
  } finally { await browser.close(); }
}

// A trial run on our example book (no customer data), with its pictures stretched to full print size (&full=1),
// so we can see Cloudflare's browser cope with a real-sized book. Saved as print/test/<part>.pdf.
export async function testPdf(env, product, story, part) {
  const t0 = Date.now(), browser = await puppeteer.launch(env.BROWSER);
  try {
    const pdf = await pagePdf(browser, product.printUrl.replace("{story}", encodeURIComponent(story)) + "&full=1&part=" + part);
    await env.BUCKET.put("print/test/" + part + ".pdf", pdf, { httpMetadata: { contentType: "application/pdf" } });
    return { part, story, seconds: Math.round((Date.now() - t0) / 100) / 10, megabytes: Math.round(pdf.byteLength / 1e5) / 10 };
  } finally { await browser.close(); }
}

// One Lulu job for one or more books that go to the same address (a Learn to Read pack is several books
// in one parcel). Each book is a line item with its own PDFs.
function jobBody(env, metas, product, origin) {
  const first = metas[0], s = first.ship || {};
  const file = (m, name) => origin + "/api/print/files/" + m.id + "/" + m.print.fileKey + "/" + name + ".pdf";
  const address = Object.fromEntries(Object.entries({
    name: s.name, organization: s.organization, street1: s.street1, street2: s.street2, city: s.city,
    postcode: s.postcode, state_code: s.state_code, country_code: s.country_code, phone_number: s.phone_number
  }).filter(([, v]) => v));
  return {
    external_id: first.order || first.id, contact_email: env.PRINT_CONTACT_EMAIL || "hello@familyboardbooks.com",
    shipping_level: env.PRINT_SHIPPING || "MAIL", shipping_address: address,
    line_items: metas.map(m => ({ external_id: m.id, title: product.name, quantity: Math.max(1, m.copies || 1),
      printable_normalization: { pod_package_id: product.pkg, interior: { source_url: file(m, "interior") }, cover: { source_url: file(m, "cover") } } }))
  };
}

// A pack waits for all its books (each approved and with its PDFs made) so they post as one parcel.
// If a book is still not approved this long after the first one was, the ready ones go without it.
const PACK_WAIT_MS = 7 * 24 * 3600 * 1000;
async function packReady(env, meta) {
  const others = [];
  for (const sid of (meta.pack || []).filter(x => x !== meta.id)) {
    const sm = await (await env.BUCKET.get("meta/" + sid + ".json"))?.json();
    if (sm && sm.paid && !(sm.print && sm.print.jobId)) others.push(sm);
  }
  const ready = others.filter(sm => sm.approvedAt && sm.print && sm.print.pdfAt && sm.ship && sm.ship.street1);
  const waiting = others.length - ready.length;
  return { books: [meta].concat(ready), waiting, timedOut: Date.now() - (meta.approvedAt || 0) > PACK_WAIT_MS };
}

// One step for one queued book. Returns a short note for the log.
async function step(env, id, origin, updateMeta) {
  let meta = await (await env.BUCKET.get("meta/" + id + ".json"))?.json();
  if (!meta || !meta.paid || !meta.approvedAt) { await env.BUCKET.delete(QUEUE + id); return id + ": dropped (gone, unpaid or not approved)"; }
  const product = productFor(env, meta);
  if (!product) { await env.BUCKET.delete(QUEUE + id); return id + ": dropped (no print product)"; }
  const p = meta.print || {};
  if (!p.pdfAt) {
    try { await makePdfs(env, meta, product); }
    catch (e) { await updateMeta(env, id, m => { m.print.error = String(e.message).slice(0, 300); m.print.tries = (m.print.tries || 0) + 1; }); return id + ": PDF failed: " + e.message; }
    await updateMeta(env, id, m => { m.print.pdfAt = Date.now(); delete m.print.error; });
    return id + ": PDFs made";
  }
  if (!p.jobId) {
    if (!meta.ship || !meta.ship.street1) return id + ": waiting for a delivery address";
    const pack = await packReady(env, meta);
    if (pack.waiting && !pack.timedOut) return id + ": waiting for " + pack.waiting + " more book(s) in the pack";
    const r = await lulu(env, "POST", "/print-jobs/", jobBody(env, pack.books, product, origin));
    if (!r.ok) { await updateMeta(env, id, m => { m.print.error = JSON.stringify(r.data).slice(0, 500); }); return id + ": Lulu refused (" + r.status + ")"; }
    for (const b of pack.books)
      await updateMeta(env, b.id, m => { m.print.jobId = r.data.id; m.print.lulu = luluEnv(env); m.print.status = r.data.status && r.data.status.name; m.print.sentAt = Date.now(); delete m.print.error; });
    await shopifyInProduction(env, pack.books.map(b => b.id), updateMeta);
    return id + ": sent to Lulu as job " + r.data.id + (pack.books.length > 1 ? " with " + pack.books.length + " books" : "");
  }
  if (shopifyReady(env) && !p.fulfillmentId && meta.orderGid) await shopifyInProduction(env, [id].concat((meta.pack || []).filter(x => x !== id)), updateMeta);
  const r = await lulu(env, "GET", "/print-jobs/" + p.jobId + "/");
  if (!r.ok) return id + ": couldn't read Lulu job " + p.jobId;
  const status = r.data.status && r.data.status.name;
  const tracking = [].concat(...(r.data.line_items || []).map(l => l.tracking_urls || []));
  await updateMeta(env, id, m => {
    m.print.status = status; if (tracking.length) m.print.tracking = tracking;
    if (status === "IN_PRODUCTION" || status === "SHIPPED") m.printedAt = m.printedAt || Date.now();
    if (status === "SHIPPED") m.print.shippedAt = m.print.shippedAt || Date.now();
  });
  // Lulu has posted it: add the tracking to the Shopify order, which emails the customer. Once per parcel
  // (a pack's books share one), retried on later runs if Shopify fails.
  const fid = p.fulfillmentId && p.fulfillmentId !== "none" ? p.fulfillmentId : null;
  if (status === "SHIPPED" && tracking.length && fid && !p.trackingSentAt) {
    try {
      await addTracking(env, fid, tracking, "Lulu");
      for (const b of [id].concat((meta.pack || []).filter(x => x !== id))) await updateMeta(env, b, m => { if (m.print) m.print.trackingSentAt = Date.now(); }).catch(() => {});
    } catch (e) {
      await updateMeta(env, id, m => { m.print.shopifyError = String(e.message).slice(0, 300); });
      return id + ": Lulu says SHIPPED, tracking not yet in Shopify";
    }
  }
  if (DONE.includes(status)) await env.BUCKET.delete(QUEUE + id);
  return id + ": Lulu says " + status;
}

// The order's lines for these books are marked fulfilled in Shopify (customer not told), so the customer can no
// longer cancel a book that is being printed. Tracking is added when the printer posts it. Failures are kept on
// the draft and retried on the next run; printing never waits for Shopify.
async function shopifyInProduction(env, ids, updateMeta) {
  if (!shopifyReady(env)) return;
  const first = await (await env.BUCKET.get("meta/" + ids[0] + ".json"))?.json();
  if (!first || !first.orderGid || (first.print && first.print.fulfillmentId)) return;
  try {
    const fid = await markInProduction(env, first.orderGid, ids);
    for (const b of ids) await updateMeta(env, b, m => { m.print = m.print || {}; m.print.fulfillmentId = fid || "none"; delete m.print.shopifyError; });
  } catch (e) {
    await updateMeta(env, ids[0], m => { m.print.shopifyError = String(e.message).slice(0, 300); });
  }
}

// Runs from the cron. Makes PDFs for at most one book per run (the free plan has 10 browser minutes a day).
export async function runPrintQueue(env, updateMeta) {
  if (!luluReady(env) || !env.BROWSER) return ["printing is not set up"];
  const origin = env.PUBLIC_URL || "https://familyboardbooks-api.silent-forest-c98a.workers.dev";
  const list = await env.BUCKET.list({ prefix: QUEUE });
  const notes = []; let rendered = false;
  for (const o of list.objects.slice(0, 20)) {
    const id = o.key.slice(QUEUE.length);
    const meta = await (await env.BUCKET.get("meta/" + id + ".json"))?.json();
    const needsPdf = meta && meta.print && !meta.print.pdfAt;
    if (needsPdf && (rendered || (meta.print.tries || 0) >= 5)) continue;
    if (needsPdf) rendered = true;
    try { notes.push(await step(env, id, origin, updateMeta)); } catch (e) { notes.push(id + ": " + e.message); }
  }
  return notes;
}
