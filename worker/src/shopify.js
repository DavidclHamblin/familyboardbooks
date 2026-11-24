// Shopify Admin API: marks an order as "being made" (fulfilled, customer not told) when its book goes to
// the printer, so the customer's Cancel button disappears at the right moment, and later adds the
// printer's tracking (customer told, with Shopify's shipping email).
//
// Access, set by David as secrets (never in code), either:
//   SHOPIFY_ADMIN_TOKEN                      a custom app's Admin API access token, or
//   SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET  a Dev Dashboard app installed on our store (client credentials;
//                                            the 24-hour token is fetched and cached here).
// Scopes: read_orders, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders.
// SHOPIFY_SHOP (wrangler.toml) is the store's myshopify.com name. Without access, nothing here runs and
// printing carries on as before.

const VERSION = "2025-07";
let cached = null;  // { token, until }

export function shopifyReady(env) {
  return !!(env.SHOPIFY_SHOP && (env.SHOPIFY_ADMIN_TOKEN || (env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET)));
}

async function accessToken(env) {
  if (env.SHOPIFY_ADMIN_TOKEN) return env.SHOPIFY_ADMIN_TOKEN.trim();
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch("https://" + env.SHOPIFY_SHOP + "/admin/oauth/access_token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.SHOPIFY_CLIENT_ID.trim(), client_secret: env.SHOPIFY_CLIENT_SECRET.trim() })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error("Shopify token " + res.status);
  cached = { token: j.access_token, until: Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000 };
  return cached.token;
}

export async function admin(env, query, variables) {
  const res = await fetch("https://" + env.SHOPIFY_SHOP + "/admin/api/" + VERSION + "/graphql.json", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await accessToken(env) },
    body: JSON.stringify({ query, variables: variables || {} })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.errors) throw new Error("Shopify " + res.status + ": " + JSON.stringify(j.errors || j).slice(0, 300));
  return j.data;
}

const OPEN_FOS = `query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 20) { nodes { id status
  lineItems(first: 50) { nodes { id remainingQuantity lineItem { customAttributes { key value } } } } } } } }`;
const CREATE = `mutation($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { fulfillment { id } userErrors { message } } }`;
const TRACK = `mutation($id: ID!, $t: FulfillmentTrackingInput!) {
  fulfillmentTrackingInfoUpdate(fulfillmentId: $id, trackingInfoInput: $t, notifyCustomer: true) { fulfillment { id } userErrors { message } } }`;

// Fulfils the order lines that carry these drafts (plus add-ons with no draft, such as a gift box, which travel
// with them), without telling the customer. Returns the fulfillment id, or null when there's nothing to do.
export async function markInProduction(env, orderGid, draftIds) {
  if (!shopifyReady(env) || !orderGid) return null;
  const data = await admin(env, OPEN_FOS, { id: orderGid });
  const fos = ((data.order && data.order.fulfillmentOrders.nodes) || []).filter(f => f.status === "OPEN" || f.status === "IN_PROGRESS");
  const byOrder = [];
  for (const fo of fos) {
    const lines = fo.lineItems.nodes.filter(l => l.remainingQuantity > 0).filter(l => {
      const d = (l.lineItem.customAttributes || []).find(a => a.key === "_draft");
      return !d || draftIds.includes(String(d.value));
    });
    if (lines.length) byOrder.push({ fulfillmentOrderId: fo.id, fulfillmentOrderLineItems: lines.map(l => ({ id: l.id, quantity: l.remainingQuantity })) });
  }
  if (!byOrder.length) return null;
  const r = await admin(env, CREATE, { f: { lineItemsByFulfillmentOrder: byOrder, notifyCustomer: false } });
  const out = r.fulfillmentCreate;
  if (out.userErrors && out.userErrors.length) throw new Error(out.userErrors.map(e => e.message).join("; "));
  return out.fulfillment && out.fulfillment.id;
}

// Adds the printer's tracking link to that fulfillment; Shopify then emails the customer.
export async function addTracking(env, fulfillmentId, urls, company) {
  if (!shopifyReady(env) || !fulfillmentId || !urls.length) return false;
  const r = await admin(env, TRACK, { id: fulfillmentId, t: Object.assign(urls.length > 1 ? { urls: urls.slice(0, 5) } : { url: urls[0] }, { company: company || "Other" }) });
  const out = r.fulfillmentTrackingInfoUpdate;
  if (out.userErrors && out.userErrors.length) throw new Error(out.userErrors.map(e => e.message).join("; "));
  return true;
}
