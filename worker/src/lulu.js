// Lulu Print API: the printer for hardcover books (Family Storybooks first; any brand can use it).
// Shared by every brand: one Lulu account, one pair of secrets (LULU_CLIENT_KEY, LULU_CLIENT_SECRET),
// one switch for test or live (LULU_ENV). Each book product is a row in PRINT_PRODUCTS (wrangler.toml),
// so a new brand (for example learn-to-read books) only adds a row, never new code or new keys.

const HOSTS = { sandbox: "https://api.sandbox.lulu.com", live: "https://api.lulu.com" };
const TOKEN_PATH = "/auth/realms/glasstree/protocol/openid-connect/token";
export const PKG_RE = /^[0-9]{4}X[0-9]{4}[A-Z0-9]{18}$/;  // Lulu pod_package_id: 27 characters

export function luluEnv(env) { return env.LULU_ENV === "live" ? "live" : "sandbox"; }
export function luluReady(env) { return !!(env.LULU_CLIENT_KEY && env.LULU_CLIENT_SECRET); }

// Book products, keyed by our own product code. Each: { brand, name, pkg (Lulu pod_package_id), pages }.
export function printProducts(env) {
  try { return JSON.parse(env.PRINT_PRODUCTS || "{}"); } catch (e) { return {}; }
}

// Keys pasted into Cloudflare can pick up invisible characters (spaces, non-breaking spaces, zero-width marks).
// Lulu's keys are plain ASCII, so anything else is dropped before signing in.
const clean = (s) => String(s || "").replace(/[^\x21-\x7e]/g, "");

let cached = null;  // { env, token, until }: reused while this Worker instance lives
async function token(env) {
  const which = luluEnv(env);
  if (cached && cached.env === which && cached.until > Date.now()) return cached.token;
  const res = await fetch(HOSTS[which] + TOKEN_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(clean(env.LULU_CLIENT_KEY) + ":" + clean(env.LULU_CLIENT_SECRET)) },
    body: "grant_type=client_credentials"
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error("Lulu sign-in failed (" + res.status + ")");
  cached = { env: which, token: j.access_token, until: Date.now() + Math.max(60, (j.expires_in || 600) - 60) * 1000 };
  return cached.token;
}

export async function lulu(env, method, path, body) {
  const res = await fetch(HOSTS[luluEnv(env)] + path, {
    method, headers: { Authorization: "Bearer " + await token(env), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, data };
}

// Sample addresses for price checks only (no person, nothing is ordered).
// Lulu needs state_code for Spain: the province part of ISO 3166-2 (ES-B = Barcelona).
const SAMPLE = {
  GB: { name: "Price check", street1: "10 Downing Street", city: "London", postcode: "SW1A 2AA", country_code: "GB", phone_number: "+44 20 7946 0000" },
  ES: { name: "Price check", street1: "Plaça de Catalunya 1", city: "Barcelona", postcode: "08002", state_code: "B", country_code: "ES", phone_number: "+34 930 000 000" }
};

// Print cost, postage and VAT for one copy (or `qty` copies in one parcel, e.g. a pack) to the UK and Spain,
// plus the cover size Lulu wants.
export async function quote(env, product, pkgOverride, pagesOverride, qty) {
  const pkg = pkgOverride || product.pkg, pages = pagesOverride || product.pages, quantity = qty || 1;
  const out = { lulu: luluEnv(env), pkg, pages, quantity, prices: {}, cover: null };
  for (const [cc, address] of Object.entries(SAMPLE)) {
    const r = await lulu(env, "POST", "/print-job-cost-calculations/", {
      line_items: [{ pod_package_id: pkg, page_count: pages, quantity }],
      shipping_address: address, shipping_option: "MAIL"
    });
    out.prices[cc] = r.ok ? {
      currency: r.data.currency,
      print: r.data.line_item_costs && r.data.line_item_costs[0] && r.data.line_item_costs[0].total_cost_excl_tax,
      postage: r.data.shipping_cost && r.data.shipping_cost.total_cost_excl_tax,
      fulfilment: r.data.fulfillment_cost && r.data.fulfillment_cost.total_cost_excl_tax,
      fees: (r.data.fees || []).map(f => ({ type: f.fee_type, cost: f.total_cost_excl_tax })),
      totalExVat: r.data.total_cost_excl_tax, vat: r.data.total_tax, total: r.data.total_cost_incl_tax
    } : { error: r.status, detail: r.data };
  }
  const c = await lulu(env, "POST", "/cover-dimensions/", { pod_package_id: pkg, interior_page_count: pages, unit: "mm" });
  out.cover = c.ok ? c.data : { error: c.status, detail: c.data };
  return out;
}
