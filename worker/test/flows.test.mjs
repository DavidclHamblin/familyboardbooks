// Offline checks for the Shopify marking, the 1-year file keep with reminders, and problem reports.
// Run: node test/flows.test.mjs   (from worker/). Uses an in-memory R2 and fake Shopify, Lulu and email APIs.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const DAY = 86400000;
class Bucket {
  constructor() { this.m = new Map(); }
  wrap(k, v) { const body = v.data; return { key: k, etag: v.etag, uploaded: new Date(v.at), body, json: async () => JSON.parse(new TextDecoder().decode(body)), text: async () => new TextDecoder().decode(body), arrayBuffer: async () => body.buffer }; }
  async get(k) { const v = this.m.get(k); return v ? this.wrap(k, v) : null; }
  async head(k) { return this.m.has(k) ? { key: k } : null; }
  async put(k, data, opts) {
    const cur = this.m.get(k);
    if (opts && opts.onlyIf && opts.onlyIf.etagMatches && (!cur || cur.etag !== opts.onlyIf.etagMatches)) return null;
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    this.m.set(k, { data: bytes, etag: String(Math.random()), at: (opts && opts._at) || Date.now() }); return { key: k };
  }
  async delete(keys) { for (const k of [].concat(keys)) this.m.delete(k); }
  async list({ prefix = "", delimiter }) {
    const keys = [...this.m.keys()].filter(k => k.startsWith(prefix)).sort();
    if (delimiter) { const pre = new Set(); const objs = []; for (const k of keys) { const rest = k.slice(prefix.length); const i = rest.indexOf(delimiter); if (i >= 0) pre.add(prefix + rest.slice(0, i + 1)); else objs.push(k); } return { objects: objs.map(k => this.wrap(k, this.m.get(k))), delimitedPrefixes: [...pre], truncated: false }; }
    return { objects: keys.map(k => this.wrap(k, this.m.get(k))), truncated: false };
  }
}

const calls = [];
let luluStatus = "IN_PRODUCTION";
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const body = init.body ? (typeof init.body === "string" ? init.body : init.body.toString()) : "";
  calls.push({ url, body });
  const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });
  if (url.includes("/admin/oauth/access_token")) return J({ access_token: "tok", expires_in: 86400 });
  if (url.includes("/graphql.json")) {
    const q = JSON.parse(body);
    if (q.query.includes("fulfillmentOrders")) return J({ data: { order: { fulfillmentOrders: { nodes: [{ id: "gid://shopify/FulfillmentOrder/1", status: "OPEN", lineItems: { nodes: [
      { id: "gid://shopify/FulfillmentOrderLineItem/11", remainingQuantity: 1, lineItem: { customAttributes: [{ key: "_draft", value: "aaaaaaaaaaaaaaaaaaaa" }] } },
      { id: "gid://shopify/FulfillmentOrderLineItem/12", remainingQuantity: 1, lineItem: { customAttributes: [{ key: "_draft", value: "zzzzzzzzzzzzzzzzzzzz" }] } },
      { id: "gid://shopify/FulfillmentOrderLineItem/13", remainingQuantity: 1, lineItem: { customAttributes: [] } } ] } }] } } } });
    if (q.query.includes("fulfillmentCreate")) return J({ data: { fulfillmentCreate: { fulfillment: { id: "gid://shopify/Fulfillment/99" }, userErrors: [] } } });
    if (q.query.includes("fulfillmentTrackingInfoUpdate")) return J({ data: { fulfillmentTrackingInfoUpdate: { fulfillment: { id: "gid://shopify/Fulfillment/99" }, userErrors: [] } } });
  }
  if (url.includes("lulu.com") && url.includes("/auth/")) return J({ access_token: "lt", expires_in: 3600 });
  if (url.includes("lulu.com") && url.includes("/print-jobs/") && init.method === "POST") return J({ id: 555, status: { name: "CREATED" } }, 201);
  if (url.includes("lulu.com") && url.includes("/print-jobs/555")) return J({ id: 555, status: { name: luluStatus }, line_items: [{ tracking_urls: luluStatus === "SHIPPED" ? ["https://track.example/1"] : [] }] });
  if (url.includes("zeptomail")) return J({ data: [{ message: "OK" }] }, 201);
  throw new Error("unexpected fetch " + url);
};

const worker = (await import("../src/index.js")).default;
const toml = (await import("node:fs")).readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const grab = n => { const m = new RegExp("^" + n + "\\s*=\\s*(?:'([^']*)'|\"([^\"]*)\")", "m").exec(toml); return m && (m[1] ?? m[2]); };
const env = { BUCKET: new Bucket(), PRINT_PRODUCTS: grab("PRINT_PRODUCTS"), BRANDS: grab("BRANDS"), SHOPIFY_SHOP: grab("SHOPIFY_SHOP"),
  SHOPIFY_CLIENT_ID: "id", SHOPIFY_CLIENT_SECRET: "secret", MAIL_API_KEY: "k", LULU_ENV: "sandbox", LULU_CLIENT_KEY: "a", LULU_CLIENT_SECRET: "b",
  BROWSER: {}, SHOPIFY_WEBHOOK_SECRET: "whsec", ADMIN_TOKEN: "admintoken", ALLOWED_ORIGINS: "https://www.familystorybooks.co.uk" };
const ctx = { waitUntil: p => (ctx.p = p) };
const api = (path, init) => worker.fetch(new Request("https://api.test" + path, init), env);

// A paid storybook draft, approved, with PDFs made (as if the queue had run), in a pack-free order.
const id = "aaaaaaaaaaaaaaaaaaaa", token = "secrettoken";
const hash = Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).toString("hex");
const meta0 = { id, book: "fst-redhood", tokenHash: hash, slots: {}, created: Date.now(), paid: false, keep: false, style: "splash", gens: 0, freeSlots: 6, freeGens: 10 };
await env.BUCKET.put("meta/" + id + ".json", JSON.stringify(meta0));

// 1. Paid webhook stores order id, email and brand.
const order = { id: 1, name: "#1001", admin_graphql_api_id: "gid://shopify/Order/1", email: "parent@example.com",
  shipping_address: { first_name: "A", last_name: "B", address1: "1 Road", city: "Leeds", zip: "LS1", country_code: "ES", phone: "600" },
  line_items: [{ sku: "FST-BOOK", quantity: 1, properties: [{ name: "_draft", value: id }] }] };
const raw = JSON.stringify(order);
const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode("whsec"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const sig = Buffer.from(await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw))).toString("base64");
let r = await api("/api/shopify/orders-paid", { method: "POST", body: raw, headers: { "X-Shopify-Hmac-Sha256": sig } });
assert.equal(r.status, 200, await r.clone().text());
let meta = JSON.parse(await (await env.BUCKET.get("meta/" + id + ".json")).text());
assert.equal(meta.orderGid, "gid://shopify/Order/1"); assert.equal(meta.email, "parent@example.com"); assert.equal(meta.brandCode, "FST");
console.log("ok  paid webhook keeps order id, email and brand");

// Hash check: does the draft token work with authDraft's sha256 encoding?
r = await api("/api/drafts/" + id, { headers: { Authorization: "Bearer " + token } });
const tokenOk = r.status === 200;

// 2. Print queue: approved with PDFs made -> sent to Lulu -> Shopify marked (customer not told).
meta.approvedAt = Date.now(); meta.print = { key: "pk", fileKey: "f".repeat(24), pdfAt: Date.now() };
await env.BUCKET.put("meta/" + id + ".json", JSON.stringify(meta)); await env.BUCKET.put("print/queue/" + id, "1");
await env.BUCKET.put("print/" + id + "/interior.pdf", "%PDF");
await worker.scheduled({ cron: "*/10 * * * *" }, env, ctx); await ctx.p;
meta = JSON.parse(await (await env.BUCKET.get("meta/" + id + ".json")).text());
assert.equal(meta.print.jobId, 555); assert.equal(meta.print.fulfillmentId, "gid://shopify/Fulfillment/99");
const create = calls.find(c => c.body.includes("fulfillmentCreate"));
const fv = JSON.parse(create.body).variables.f;
assert.equal(fv.notifyCustomer, false);
assert.deepEqual(fv.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems.map(l => l.id), ["gid://shopify/FulfillmentOrderLineItem/11", "gid://shopify/FulfillmentOrderLineItem/13"]);
console.log("ok  sent to printer -> order lines for this book (and add-ons) fulfilled, customer not emailed");

// 3. Lulu ships -> tracking added once, customer told; queue entry removed.
luluStatus = "SHIPPED";
await worker.scheduled({ cron: "*/10 * * * *" }, env, ctx); await ctx.p;
meta = JSON.parse(await (await env.BUCKET.get("meta/" + id + ".json")).text());
assert.ok(meta.print.trackingSentAt && meta.print.shippedAt);
assert.equal(calls.filter(c => c.body.includes("fulfillmentTrackingInfoUpdate")).length, 1);
assert.ok(!(await env.BUCKET.get("print/queue/" + id)));
console.log("ok  shipped -> tracking added to Shopify once, queue done");

// 4. Retention: nothing for 11 months; reminders at 30, 14 and 3 days before; then deletion.
const realNow = Date.now; const t0 = meta.print.shippedAt;
const runCleanup = async at => { Date.now = () => at; await worker.scheduled({ cron: "17 3 * * *" }, env, ctx); await ctx.p; Date.now = realNow; };
const mails = () => calls.filter(c => c.url.includes("zeptomail")).length;
await runCleanup(t0 + 300 * DAY); assert.equal(mails(), 0);
await runCleanup(t0 + 336 * DAY); assert.equal(mails(), 1);
const first = JSON.parse(calls.filter(c => c.url.includes("zeptomail"))[0].body);
assert.equal(first.from.address, "hello@familystorybooks.co.uk"); assert.equal(first.to[0].email_address.address, "parent@example.com");
assert.match(first.htmlbody, /\/api\/keep\/aaaaaaaaaaaaaaaaaaaa\/[a-z0-9]{24}/); assert.match(first.htmlbody, /interior\.pdf/);
await runCleanup(t0 + 337 * DAY); assert.equal(mails(), 1);
await runCleanup(t0 + 352 * DAY); assert.equal(mails(), 2);
await runCleanup(t0 + 363 * DAY); assert.equal(mails(), 3);
await runCleanup(t0 + 364 * DAY); assert.ok(await env.BUCKET.get("meta/" + id + ".json"), "not deleted before the date");
console.log("ok  three reminders at 30, 14 and 3 days before, from the brand's address, with keep link and PDF");

// 5. The keep page: GET shows a button, POST moves deletion a year on and restarts reminders.
meta = JSON.parse(await (await env.BUCKET.get("meta/" + id + ".json")).text());
r = await api("/api/keep/" + id + "/" + meta.keepKey); assert.match(await r.text(), /<form method="post">/);
r = await api("/api/keep/" + id + "/" + "x".repeat(24)); assert.match(await r.text(), /couldn't find/);
Date.now = () => t0 + 364 * DAY; r = await api("/api/keep/" + id + "/" + meta.keepKey, { method: "POST" }); Date.now = realNow;
assert.match(await r.text(), /kept until/);
meta = JSON.parse(await (await env.BUCKET.get("meta/" + id + ".json")).text());
assert.equal(meta.reminders.length, 0); assert.equal(meta.keepUntil, t0 + 730 * DAY);
await runCleanup(t0 + 366 * DAY); assert.ok(await env.BUCKET.get("meta/" + id + ".json"), "kept after extension");
console.log("ok  keep page extends by a year and restarts the reminders");

// 6. Without an extension, it is deleted only after the date and all reminders.
meta.keepUntil = 0; meta.reminders = [t0 + 336 * DAY, t0 + 352 * DAY, t0 + 363 * DAY];
await env.BUCKET.put("meta/" + id + ".json", JSON.stringify(meta));
await runCleanup(t0 + 366 * DAY); assert.ok(!(await env.BUCKET.get("meta/" + id + ".json")), "deleted");
assert.ok(!(await env.BUCKET.get("print/" + id + "/interior.pdf")));
console.log("ok  deleted after the year once all reminders went out");

// 7. Without email set up, nothing is deleted.
const id2 = "bbbbbbbbbbbbbbbbbbbb";
await env.BUCKET.put("meta/" + id2 + ".json", JSON.stringify(Object.assign({}, meta0, { id: id2, paid: true, paidAt: t0, email: "x@example.com", print: { shippedAt: t0 } })));
const savedKey = env.MAIL_API_KEY; delete env.MAIL_API_KEY;
await runCleanup(t0 + 400 * DAY); assert.ok(await env.BUCKET.get("meta/" + id2 + ".json"));
env.MAIL_API_KEY = savedKey;
console.log("ok  without email set up, files wait instead of being deleted unannounced");

// 8. Problem report: needs the book's token; stores photos and emails the brand inbox with them attached.
const id3 = "cccccccccccccccccccc";
await env.BUCKET.put("meta/" + id3 + ".json", JSON.stringify(Object.assign({}, meta0, { id: id3, paid: true, paidAt: realNow(), email: "p@example.com", order: "#1002", brandCode: "FST" })));
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
const post = (b, tok) => api("/api/drafts/" + id3 + "/problems", { method: "POST", body: JSON.stringify(b), headers: { Authorization: "Bearer " + (tok || token), "Content-Type": "application/json" } });
assert.ok(tokenOk, "draft token accepted");
{
  r = await post({ reason: "damaged", details: "The cover is bent", photos: [jpeg] }, "wrong"); assert.equal(r.status, 403);
  delete env.MAIL_API_KEY; r = await post({ reason: "damaged", details: "The cover is bent" }); assert.equal(r.status, 503); env.MAIL_API_KEY = savedKey;
  r = await post({ reason: "nope", details: "The cover is bent" }); assert.equal(r.status, 400);
  r = await post({ reason: "damaged", details: "The cover is bent", photos: ["notajpeg"] }); assert.equal(r.status, 400);
  const before = mails();
  r = await post({ reason: "damaged", details: "The cover is bent", photos: [jpeg, jpeg] }); assert.equal(r.status, 201, await r.clone().text());
  const res = await r.json(); assert.ok(res.emailed);
  const mail = JSON.parse(calls.filter(c => c.url.includes("zeptomail")).at(-1).body);
  assert.equal(mails(), before + 1); assert.equal(mail.to[0].email_address.address, "hello@familystorybooks.co.uk");
  assert.equal(mail.reply_to[0].address, "p@example.com"); assert.equal(mail.attachments.length, 2);
  assert.ok(await env.BUCKET.get("problems/" + id3 + "/" + res.id + "/1.jpg"));
  r = await api("/api/admin/problems/" + id3 + "/" + res.id, { method: "DELETE", headers: { Authorization: "Bearer admintoken" } });
  assert.equal((await r.json()).deleted, 3);
  console.log("ok  problem report: token checked, photos stored, brand inbox emailed with photos, admin delete");
}
console.log("all passed");
