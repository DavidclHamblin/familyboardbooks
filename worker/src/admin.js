// Our Family Presents admin page: every paid book across the brands, its pages, reports from families,
// and the few things we do by hand (paint a page again with a note, release a held book, email the family).
//
//   GET  /admin                                  the page itself (no data in it; asks for the admin key)
//   GET  /api/admin/books                        paid books, newest first (index: paid/<id>, filled at payment)
//   GET  /api/admin/books/<id>                   one book in detail
//   GET  /api/admin/books/<id>/img/<slot>        a picture (screen copy when there is one)
//   POST /api/admin/books/<id>/repaint           { slot, note }: paint one storybook page again now
//   POST /api/admin/drafts/<id>/release          (index.js) release a held book
//
// Every /api/admin call needs "Authorization: Bearer <ADMIN_TOKEN>". The page keeps the key in the tab
// (sessionStorage) only. Customer photos are never shown here: only the drawn pictures.

import { STORIES } from "./stories.js";
import { productFor } from "./printing.js";
import { storyOf, repaintPage, PRINT_AFTER_DAYS } from "./painting.js";

const DAY = 86400000, PAID = "paid/";

export async function indexPaid(env, id, at) { await env.BUCKET.put(PAID + id, String(at || Date.now())); }

// Books paid before the index existed: found once by reading every draft record.
async function backfill(env) {
  let cursor, n = 0;
  do {
    const list = await env.BUCKET.list({ prefix: "meta/", cursor, limit: 1000 });
    for (const o of list.objects) {
      const m = await (await env.BUCKET.get(o.key))?.json().catch(() => null);
      if (m && m.paid) { await indexPaid(env, m.id, m.paidAt); n++; }
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  await env.BUCKET.put("paid-index-built", String(Date.now()));
  return n;
}

function stage(env, m) {
  const s = storyOf(env, m), p = m.paint || {};
  if (m.print && m.print.status) return { key: "print", text: "Printer: " + m.print.status };
  if (m.test) return { key: "held", text: "Test copy, " + (p.method || "old") + " method (never printed)" + (p.readyAt ? ": painted" : "") };
  if (m.approvedAt) return { key: "approved", text: m.autoApproved ? "Approved automatically" : "Approved by family" };
  if (!s) return { key: "paid", text: "Paid" };
  if (p.held) return { key: "held", text: "On hold: page reported" };
  if (p.stuckAt) return { key: "stuck", text: "Stuck: needs a look" };
  const n = Object.keys(s.story.scenes).filter(k => { const x = (m.slots || {})["s" + k]; return x && x.toon && /^[24]K$/.test(x.size || ""); }).length;
  if (!p.readyAt) return { key: "painting", text: "Painting " + n + " of " + Object.keys(s.story.scenes).length };
  return { key: "waiting", text: "Ready, waiting for family" };
}

function summary(env, m) {
  const s = storyOf(env, m), p = m.paint || {}, product = productFor(env, m);
  return {
    id: m.id, order: m.order || "", brand: m.brandCode || "", email: m.email || "", paidAt: m.paidAt || null,
    book: m.book || "", title: s ? s.story.title : (product ? product.name : m.book || ""), stage: stage(env, m),
    printOn: p.readyAt && !p.held && !m.approvedAt ? p.readyAt + PRINT_AFTER_DAYS * DAY : null,
    reports: Object.keys(p.issues || {}).length
  };
}

function detail(env, m) {
  const s = storyOf(env, m), p = m.paint || {};
  const gid = /\/Order\/(\d+)$/.exec(m.orderGid || "");
  const shop = (env.SHOPIFY_SHOP || "").replace(/\.myshopify\.com$/, "");
  const pages = s ? Object.keys(s.story.scenes).map(n => {
    const x = (m.slots || {})["s" + n] || {};
    return { slot: "s" + n, pages: (2 + n * 2) + " and " + (3 + n * 2), drawn: !!x.toon, size: x.size || null, engine: x.engine || null,
      busy: !!(x.pending && Date.now() - x.pending < 5 * 60000), example: s.story.brand ? null : "https://www.familystorybooks.co.uk/assets/img/" + s.key + "/s" + n + ".webp",
      report: (p.issues || {})["s" + n] || null, check: x.check ? { ok: x.check.ok, notes: x.check.notes || "", rounds: x.check.rounds || 0, scores: x.check.scores || null, swap: !!x.check.swap, replicate: x.check.replicate || null } : null };
  }) : [];
  const chars = Object.keys(m.slots || {}).filter(k => k.startsWith("c-") && m.slots[k].toon).map(k => ({ slot: k, standin: !!m.slots[k].standin }));
  return Object.assign(summary(env, m), {
    story: s ? s.key : null, copies: m.copies || 1, approvedAt: m.approvedAt || null,
    readyAt: p.readyAt || null, held: !!p.held, stuckAt: p.stuckAt || null, lastError: p.lastError || null,
    bookReport: (p.issues || {}).book || null, pages, chars,
    shopifyUrl: gid && shop ? "https://admin.shopify.com/store/" + shop + "/orders/" + gid[1] : null,
    proofUrl: m.proofUrl || null,
    ship: m.ship ? { name: m.ship.name, city: m.ship.city, country: m.ship.country_code } : null,
    print: m.print ? { status: m.print.status || (m.print.pdfAt ? "PDF_READY" : "QUEUED"), jobId: m.print.jobId || null, error: m.print.error || null, tracking: m.print.tracking || [] } : null
  });
}

export async function adminRoute(env, req, path, deps) {
  const { getMeta, json, err, timingSafeEqual } = deps, m = req.method;
  if (path === "/admin" && m === "GET") return new Response(PAGE, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob: https://www.familystorybooks.co.uk; connect-src 'self'; frame-ancestors 'none'" } });
  if (!path.startsWith("/api/admin/books")) return null;
  const a = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
  if (!env.ADMIN_TOKEN || !a || !timingSafeEqual(a[1], env.ADMIN_TOKEN)) return err(403, "Not allowed");

  if (path === "/api/admin/books" && m === "GET") {
    if (!(await env.BUCKET.get("paid-index-built"))) await backfill(env);
    const keys = [];
    let cursor;
    do { const l = await env.BUCKET.list({ prefix: PAID, cursor, limit: 1000 }); keys.push(...l.objects.map(o => o.key.slice(PAID.length))); cursor = l.truncated ? l.cursor : undefined; } while (cursor && keys.length < 5000);
    const books = [];
    for (const id of keys) { const meta = await getMeta(env, id); if (meta && meta.paid) books.push(summary(env, meta)); else await env.BUCKET.delete(PAID + id); }
    books.sort((x, y) => (y.paidAt || 0) - (x.paidAt || 0));
    return json({ books });
  }
  const b = /^\/api\/admin\/books\/([a-z0-9]{20})(\/img\/(s\d{1,2}|c-[a-z]{2,12})|\/repaint)?$/.exec(path);
  if (!b) return err(404, "Not found");
  const meta = await getMeta(env, b[1]);
  if (!meta || !meta.paid) return err(404, "Not found");
  if (!b[2] && m === "GET") return json(detail(env, meta));
  if (b[3] && m === "GET") {
    const o = (await env.BUCKET.get("toon/" + meta.id + "/" + b[3] + ".web.webp")) || (await env.BUCKET.get("toon/" + meta.id + "/" + b[3] + ".png"));
    if (!o) return err(404, "Not found");
    return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || "image/png", "Cache-Control": "private, no-store" } });
  }
  if (b[2] === "/repaint" && m === "POST") {
    if (meta.approvedAt) return err(409, "This book is approved already; it may be at the printer.");
    const body = await req.json().catch(() => ({}));
    const r = await repaintPage(env, meta, String(body.slot || ""), body.note, deps);
    return json(Object.assign(r, { book: detail(env, await getMeta(env, meta.id)) }), r.ok ? 200 : 502);
  }
  return err(405, "Not allowed");
}

const PAGE = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Orders admin | Our Family Presents</title>
<style>
:root{--bg:#faf8f5;--card:#fff;--ink:#1f1b2e;--muted:#6b6680;--line:#e6e1da;--red:#e0442a;--amber:#fff4e5;--green:#e5f4e4}
*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink)}
header{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line);background:var(--card)}
h1{font-size:18px;margin:0}main{padding:20px;max-width:1200px;margin:0 auto}button,.btn{font:inherit;border:1px solid var(--line);background:var(--card);border-radius:8px;padding:7px 12px;cursor:pointer;color:inherit;text-decoration:none;display:inline-block}
button.primary{background:var(--red);border-color:var(--red);color:#fff}button:disabled{opacity:.5;cursor:default}
input,textarea,select{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;width:100%}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:13px;color:var(--muted);font-weight:600}
tr.row{cursor:pointer}tr.row:hover{background:#f4f1ec}.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:13px;background:#eee}
.tag.held,.tag.stuck{background:#fde2dc;color:#8a2312}.tag.waiting{background:var(--amber)}.tag.painting{background:#e7f1fb}.tag.approved,.tag.print{background:var(--green)}
.muted{color:var(--muted)}.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 16px}.bar select{width:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(520px,1fr));gap:16px}.page{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;display:grid;gap:8px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}.pair img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:#eee}
.report{background:var(--amber);border-radius:8px;padding:8px 10px}.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px 16px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:16px}
.facts b{display:block;font-size:12px;color:var(--muted);font-weight:600}.login{max-width:420px;margin:60px auto;display:grid;gap:10px}
@media(max-width:600px){.grid{grid-template-columns:1fr}main{padding:12px}td:nth-child(4),th:nth-child(4){display:none}}
</style></head><body><header><h1>Our Family Presents · Orders</h1><span id="who" class="muted"></span></header><main id="app"></main>
<script>
(function(){
var app=document.getElementById("app"),key="",books=[],brand="",open=null,msg="";
try{key=sessionStorage.getItem("ofp-admin")||""}catch(e){}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function day(t){return t?new Date(t).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"}):""}
function api(method,path,body){return fetch(path,{method:method,headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined}).then(function(r){
  if(r.status===403){key="";try{sessionStorage.removeItem("ofp-admin")}catch(e){}login("That key wasn't accepted.");throw new Error("403")}
  return r.json().then(function(j){if(!r.ok&&!j.book)throw new Error(j.error||("Error "+r.status));return j})})}
var imgs={};function img(id,slot){var k=id+slot;if(imgs[k])return Promise.resolve(imgs[k]);return fetch("/api/admin/books/"+id+"/img/"+slot,{headers:{Authorization:"Bearer "+key}}).then(function(r){return r.ok?r.blob():null}).then(function(b){return b?(imgs[k]=URL.createObjectURL(b)):""})}
function login(why){app.innerHTML='<form class="login" id="lf"><h2>Sign in</h2><p class="muted">Paste the admin key (ADMIN_TOKEN). It stays in this tab only.</p><input id="k" type="password" autocomplete="off" required><button class="primary">Open orders</button><p class="muted">'+esc(why||"")+'</p></form>';
  document.getElementById("lf").onsubmit=function(e){e.preventDefault();key=document.getElementById("k").value.trim();try{sessionStorage.setItem("ofp-admin",key)}catch(x){}list()}}
function list(){open=null;app.innerHTML='<p class="muted">Loading orders…</p>';api("GET","/api/admin/books").then(function(j){books=j.books;drawList()},function(e){if(e.message!=="403")app.innerHTML='<p>'+esc(e.message)+'</p>'})}
function drawList(){var brands=[];books.forEach(function(b){if(brands.indexOf(b.brand)<0)brands.push(b.brand)});
  var rows=books.filter(function(b){return !brand||b.brand===brand}).map(function(b){return '<tr class="row" data-id="'+b.id+'"><td><b>'+esc(b.order||"–")+'</b><br><span class="muted">'+day(b.paidAt)+'</span></td><td>'+esc(b.brand)+'</td><td>'+esc(b.title)+'</td><td>'+esc(b.email)+'</td><td><span class="tag '+b.stage.key+'">'+esc(b.stage.text)+'</span>'+(b.reports?' <b>'+b.reports+' report'+(b.reports>1?"s":"")+'</b>':"")+'</td><td>'+(b.printOn?day(b.printOn):"")+'</td></tr>'}).join("");
  app.innerHTML='<div class="bar"><select id="br"><option value="">All brands</option>'+brands.map(function(x){return '<option'+(x===brand?" selected":"")+'>'+esc(x)+'</option>'}).join("")+'</select><button id="rf">Refresh</button><button id="lo">Sign out</button><span class="muted">'+books.length+' paid books</span></div>'+
  '<table><thead><tr><th>Order</th><th>Brand</th><th>Book</th><th>Customer</th><th>Status</th><th>Prints on its own</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="muted">No paid books yet.</td></tr>')+'</tbody></table>';
  document.getElementById("br").onchange=function(e){brand=e.target.value;drawList()};document.getElementById("rf").onclick=list;
  document.getElementById("lo").onclick=function(){key="";try{sessionStorage.removeItem("ofp-admin")}catch(e){}login()}}
function show(id){open=id;app.innerHTML='<p class="muted">Loading…</p>';api("GET","/api/admin/books/"+id).then(drawBook,function(e){app.innerHTML='<p>'+esc(e.message)+'</p>'})}
function drawBook(b){var mail="mailto:"+encodeURIComponent(b.email)+"?subject="+encodeURIComponent("Your book, order "+b.order);
  var facts=[["Order",b.order],["Status",b.stage.text],["Customer",b.email],["Book",b.title+(b.copies>1?" × "+b.copies:"")],["Paid",day(b.paidAt)],["Pages ready",day(b.readyAt)],["Prints on its own",b.printOn?day(b.printOn):"–"],["Posting to",b.ship?[b.ship.name,b.ship.city,b.ship.country].filter(Boolean).join(", "):"–"]];
  if(b.print)facts.push(["Printer",b.print.status+(b.print.jobId?" (Lulu "+b.print.jobId+")":"")+(b.print.error?" · "+b.print.error:"")]);
  if(b.lastError)facts.push(["Last painting error",b.lastError]);
  var h='<div class="bar"><button id="bk">← All orders</button>'+(b.shopifyUrl?'<a class="btn" target="_blank" rel="noopener" href="'+esc(b.shopifyUrl)+'">Shopify order</a>':"")+(b.proofUrl?'<a class="btn" target="_blank" rel="noopener noreferrer" href="'+esc(b.proofUrl)+'">Family\\'s proof page</a>':"")+(b.email?'<a class="btn" href="'+esc(mail)+'">Email the family</a>':"")+(b.held?'<button id="rl" class="primary">Release hold (four days start again)</button>':"")+'<span class="muted">'+esc(msg)+'</span></div>'+
  '<div class="facts">'+facts.map(function(f){return '<div><b>'+esc(f[0])+'</b>'+esc(f[1]||"–")+'</div>'}).join("")+'</div>'+
  (b.bookReport?'<p class="report"><b>Report about the whole book:</b> '+esc(b.bookReport.note)+'</p>':"")+
  '<div class="grid">'+b.pages.map(function(p){return '<div class="page" data-slot="'+p.slot+'"><div class="bar" style="margin:0;justify-content:space-between"><b>Pages '+esc(p.pages)+'</b><span class="muted">'+esc((p.size||"not drawn")+(p.engine?" · "+p.engine:""))+(p.busy?" · painting now":"")+'</span></div>'+
    '<div class="pair"><img data-img="'+p.slot+'" alt="Their page"><img src="'+esc(p.example||"")+'" alt="Our example page"></div><div class="muted" style="font-size:12px">Left: their book · Right: our example</div>'+
    (p.check?'<div class="muted" style="font-size:12px">Automatic check: '+(p.check.ok===true?"passed":p.check.ok===false?"<b>failed</b>":"not run")+(p.check.rounds?" after "+p.check.rounds+" tr"+(p.check.rounds>1?"ies":"y"):"")+(p.check.notes?" · "+esc(p.check.notes):"")+(p.check.swap?" · face swap":"")+(p.check.scores&&Object.keys(p.check.scores).length?" · likeness "+esc(Object.entries(p.check.scores).map(e=>e[0]+" "+e[1]).join(", ")):"")+(p.check.replicate&&p.check.replicate.length?" · "+esc(p.check.replicate.join("; ")):"")+'</div>':"")+
    (p.report?'<div class="report"><b>Family\\'s report ('+day(p.report.at)+'):</b> '+esc(p.report.note)+'</div>':"")+
    (b.approvedAt?"":'<textarea rows="2" maxlength="300" placeholder="Note for the painter (optional), e.g. Grandma should be inside" data-note="'+p.slot+'"></textarea><div><button data-repaint="'+p.slot+'">Paint this page again</button></div>')+'</div>'}).join("")+'</div>';
  app.innerHTML=h;document.getElementById("bk").onclick=function(){msg="";list()};
  var rl=document.getElementById("rl");if(rl)rl.onclick=function(){rl.disabled=true;api("POST","/api/admin/drafts/"+b.id+"/release").then(function(){msg="Hold released.";show(b.id)},function(e){msg=e.message;show(b.id)})};
  b.pages.forEach(function(p){if(p.drawn)img(b.id,p.slot).then(function(u){var el=app.querySelector('[data-img="'+p.slot+'"]');if(el&&u)el.src=u})})}
app.addEventListener("click",function(e){var r=e.target.closest("tr.row");if(r){msg="";return show(r.getAttribute("data-id"))}
  var rp=e.target.closest("[data-repaint]");if(rp){var slot=rp.getAttribute("data-repaint"),note=(app.querySelector('[data-note="'+slot+'"]')||{}).value||"";rp.disabled=true;rp.textContent="Painting… (about a minute)";
    api("POST","/api/admin/books/"+open+"/repaint",{slot:slot,note:note}).then(function(j){delete imgs[open+slot];msg=j.ok?"Page repainted.":"Painting failed: "+(j.error||"");drawBook(j.book)},function(e){msg=e.message;show(open)})}});
if(key)list();else login();
})();
</script></body></html>`;
