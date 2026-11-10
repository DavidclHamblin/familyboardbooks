/* Family Board Books: Shopify checkout (headless, Storefront API).
   The site builds the order; Shopify takes payment on its own secure checkout page.
   Checkout is switched on with FBB.config.shopify.checkoutLive, or for testing by
   opening the creator with #shoptest at the end of the address. */
(function () {
  "use strict";
  var F = window.FBB, S = F.config.shopify || {};
  var API = "https://" + S.domain + "/api/" + (S.apiVersion || "2025-07") + "/graphql.json";

  F.shop = {};

  F.shop.enabled = function () {
    if (!S.domain || !S.token) return false;
    if (/shoptest/.test(location.hash)) return true;
    // Checkout must be live overall and open for the visitor's region (the UK opens later).
    return !!S.checkoutLive && !!(F.regionInfo && F.regionInfo().ordering);
  };

  function gql(query, variables) {
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": S.token },
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.errors) throw new Error(j.errors.map(function (e) { return e.message; }).join("; "));
      return j.data;
    });
  }

  // Variant IDs are looked up by product handle, so prices and IDs only live in Shopify.
  var cache = {};
  function variants(handle) {
    if (cache[handle]) return Promise.resolve(cache[handle]);
    return gql("query($h:String!){product(handle:$h){variants(first:20){nodes{id sku}}}}", { h: handle }).then(function (d) {
      if (!d.product) throw new Error("Product not found in Shopify: " + handle);
      var map = {};
      d.product.variants.nodes.forEach(function (v) { map[v.sku] = v.id; });
      cache[handle] = map;
      return map;
    });
  }

  function attrs(obj) {
    return Object.keys(obj).filter(function (k) { return obj[k] !== "" && obj[k] != null; }).map(function (k) {
      return { key: k, value: String(obj[k]).slice(0, 2000) };
    });
  }

  // UK carts are created for Great Britain so Shopify checks out in pounds with UK shipping.
  function cartInput(lines, extra) {
    var r = F.regionInfo ? F.regionInfo() : {}, input = { lines: lines, attributes: attrs(Object.assign({ Source: "familyboardbooks.com creator", Region: r.name || "" }, extra || {})) };
    if (r.country) input.buyerIdentity = { countryCode: r.country };
    return input;
  }

  /* order = { book, edition, copies, bilingual, giftbox, details:{...visible}, hidden:{...} }
     Resolves with Shopify's checkout URL. */
  F.shop.checkout = function (order) {
    var b = F.books[order.book], handle = S.handles[order.book];
    var skuBase = "FBB-" + b.slug.toUpperCase() + "-";
    var lookups = [variants(handle)];
    if (order.bilingual || order.giftbox) lookups.push(variants(S.handles.bilingual), variants(S.handles.giftbox));
    return Promise.all(lookups).then(function (maps) {
      var book = maps[0], lines = [];
      var main = book[skuBase + order.edition.toUpperCase()];
      if (!main) throw new Error("Edition not found in Shopify: " + order.edition);
      var all = Object.assign({}, order.details, order.hidden);
      lines.push({ merchandiseId: main, quantity: 1, attributes: attrs(all) });
      if (order.copies > 0) lines.push({ merchandiseId: book[skuBase + "COPY"], quantity: order.copies, attributes: attrs({ "Copy of": order.details["Cover title"] }) });
      if (order.bilingual) lines.push({ merchandiseId: maps[1]["FBB-ADDON-BILINGUAL"], quantity: 1, attributes: attrs({ "For": order.details["Cover title"] }) });
      if (order.giftbox) lines.push({ merchandiseId: maps[2]["FBB-ADDON-GIFTBOX"], quantity: 1, attributes: attrs({ "For": order.details["Cover title"] }) });
      return gql("mutation($input:CartInput!){cartCreate(input:$input){cart{checkoutUrl} userErrors{message}}}", {
        input: cartInput(lines, order.cartAttributes)
      });
    }).then(function (d) {
      var res = d.cartCreate;
      if (res.userErrors && res.userErrors.length) throw new Error(res.userErrors.map(function (e) { return e.message; }).join("; "));
      return res.cart.checkoutUrl;
    });
  };
})();
