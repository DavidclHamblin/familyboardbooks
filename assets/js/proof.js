/* Family Board Books: private proof page. Opened from the link in the order (proof.html?d=<id>#<secret>).
   Draws any missing cartoons, lets the customer redraw any portrait, approve the book, or delete everything. */
(function () {
  "use strict";
  var F = window.FBB, esc = F.esc, root = document.getElementById("proof");
  var id = new URLSearchParams(location.search).get("d") || "", token = location.hash.replace(/^#/, "");
  var d = { id: id, token: token }, st = null, imgs = {}, busy = {}, errs = {}, queue = [], running = false, confirmDelete = false;

  if (!F.toons.enabled()) { root.innerHTML = msgBox("Your proof page opens soon", "We'll email you when your cartoons are ready to check."); return; }
  if (!/^[a-z0-9]{20}$/.test(id) || !token) { root.innerHTML = msgBox("This link isn't complete", "Please open the full link from your order email, or email hello@familyboardbooks.com and we'll send it again."); return; }

  function msgBox(h, p) { return '<section class="panel"><h1>' + esc(h) + "</h1><p>" + esc(p) + "</p></section>"; }

  function load() {
    return F.toons.status(d).then(function (j) {
      st = j;
      var jobs = j.cartoons.filter(function (s) { return !imgs[s]; }).map(function (s) {
        return F.toons.image(d, s).then(function (u) { imgs[s] = u; });
      });
      return Promise.all(jobs);
    });
  }

  function slotsWithPhotos() { return st.photos.concat(st.cartoons).filter(function (s, i, a) { return a.indexOf(s) === i; }); }

  function enqueueMissing() {
    if (!st.paid) return;
    slotsWithPhotos().forEach(function (s) { if (!imgs[s] && queue.indexOf(s) < 0 && !busy[s] && !errs[s]) queue.push(s); });
    run();
  }
  function run() {
    if (running || !queue.length) return;
    running = true;
    var s = queue.shift(); busy[s] = true; errs[s] = ""; render();
    F.toons.make(d, s, st.style).then(function (j) { st = Object.assign(st, j); return F.toons.image(d, s); })
      .then(function (u) { imgs[s] = u; })
      .catch(function (e) { errs[s] = e.message; })
      .then(function () { busy[s] = false; running = false; render(); run(); });
  }

  function portraitItem(slot, text) {
    var item = imgs[slot] ? { cartoon: imgs[slot], t: text } : { empty: true, t: text };
    return item;
  }

  function controls(slot) {
    if (!slot) return "";
    if (busy[slot]) return '<span class="toon-status busy">Drawing…</span>';
    if (errs[slot]) return '<span class="toon-status" role="alert">' + esc(errs[slot]) + '</span> <button type="button" class="linkish" data-redo="' + slot + '">Try again</button>';
    if (!imgs[slot]) return queue.indexOf(slot) >= 0 ? '<span class="toon-status">Waiting to be drawn</span>' : "";
    if (st.approved || !st.paid || st.photos.indexOf(slot) < 0) return "";
    return '<button type="button" class="linkish" data-redo="' + slot + '">Draw again</button>';
  }

  function pageCard(p, i) {
    var items = p.items.filter(function (it) { return it.slot || it.t; });
    if (!items.length && !p.heading) return "";
    var heading = p.kind === "sayings" && p.heading ? "“" + p.heading + "”" : p.heading;
    var model = { heading: heading, color: p.color, style: st.style, items: items.map(function (it) { return it.slot ? portraitItem(it.slot, it.t) : { empty: true, t: it.t }; }) };
    var ctl = items.filter(function (it) { return it.slot; }).map(function (it, n) { return '<div class="slot-actions"><span class="hint">Picture ' + (n + 1) + "</span>" + controls(it.slot) + "</div>"; }).join("");
    if (!items.length) ctl = '<span class="hint">We\'ll add a friendly picture from our library to this page.</span>';
    return '<figure class="proof-page">' + F.bookPage(model) + "<figcaption>Page " + (i + 1) + ctl + "</figcaption></figure>";
  }

  function coverCard() {
    var cv = st.cover || {}, out = "";
    ["front", "back"].forEach(function (side) {
      var slot = "cover-" + side; if (!cv[side]) return;
      out += '<figure class="proof-page">' + F.bookPage({ heading: side === "front" ? cv.title || "" : "", color: cv.color, style: st.style, items: [portraitItem(slot, side === "back" ? cv.backMessage : "")] }) +
        "<figcaption>" + (side === "front" ? "Front cover" : "Back cover") + '<div class="slot-actions">' + controls(slot) + "</div></figcaption></figure>";
    });
    return out;
  }

  function render() {
    if (!st) return;
    var total = slotsWithPhotos().length, done = slotsWithPhotos().filter(function (s) { return imgs[s]; }).length;
    var head = st.approved
      ? '<p class="notice">Thank you! You approved your book and it is on its way to the printer. We\'ll email you when it ships.</p>'
      : !st.paid ? '<p class="notice">We\'re waiting for your payment to come through. This usually takes a minute: refresh this page shortly.</p>'
      : '<p class="notice">Here is every page of your book. Check names and spelling, and choose <strong>Draw again</strong> under any picture you\'d like redrawn. ' + (done < total ? "Drawing your cartoons: " + done + " of " + total + " ready." : "All " + total + " cartoons are ready.") + "</p>";
    var pages = (st.pages || []).map(pageCard).join("");
    var approve = st.paid && !st.approved
      ? '<section class="panel"><h2>Approve your book</h2><form class="form" id="approve"><label class="check"><input type="checkbox" id="ap-ok"><span>I\'ve checked every page, including names and spelling. Print my book as shown.</span></label><p class="form-msg" role="status"></p><button type="submit" class="btn red"' + (done < total ? " disabled" : "") + ">Approve and print</button></form></section>" : "";
    var del = '<section class="panel"><h2>Your photos</h2><p class="hint">Your original photos are deleted once your book is printed. Cartoons and the print file are deleted 30 days after delivery' + (st.keep ? ", but you asked us to keep them in your account for reorders." : ".") + "</p>" +
      '<button type="button" class="btn ghost btn-sm" data-delete>' + (confirmDelete ? "Yes, delete everything now" : "Delete my photos and cartoons now") + "</button>" + (confirmDelete ? ' <span class="hint">This can\'t be undone. If your book isn\'t printed yet, we\'ll need the photos again.</span>' : "") + "</section>";
    root.innerHTML = '<section class="panel"><p class="eyebrow">Your proof</p><h1>' + esc((st.cover && st.cover.title) || "Your book") + "</h1>" + head + "</section>" +
      '<div class="proof-grid">' + coverCard() + pages + "</div>" + approve + del;
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.redo) { errs[b.dataset.redo] = ""; queue.push(b.dataset.redo); delete imgs[b.dataset.redo]; render(); run(); }
    else if (b.hasAttribute("data-delete")) {
      if (!confirmDelete) { confirmDelete = true; render(); return; }
      F.toons.destroy(d).then(function () { root.innerHTML = msgBox("Deleted", "Your photos and cartoons have been deleted."); });
    }
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "approve") return;
    e.preventDefault();
    var m = e.target.querySelector(".form-msg");
    if (!document.getElementById("ap-ok").checked) { m.textContent = "Please tick the box to confirm you've checked every page."; return; }
    F.toons.update(d, { approve: true }).then(function (j) { st = Object.assign(st, j); render(); window.scrollTo(0, 0); })
      .catch(function (err) { m.textContent = err.message; });
  });

  root.innerHTML = '<section class="panel"><p class="toon-status busy">Opening your book…</p></section>';
  load().then(function () { render(); enqueueMissing(); }).catch(function (e) {
    root.innerHTML = e.status === 404 || e.status === 403
      ? msgBox("We couldn't find this book", "The link may be incomplete, or the photos have been deleted. Email hello@familyboardbooks.com and we'll help.")
      : msgBox("Something went wrong", e.message);
  });
})();
