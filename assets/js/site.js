/* Family Board Books: shared page behaviour (theme shelf, style demo, sample pages, sign-up forms). */
(function () {
  "use strict";
  var F = window.FBB;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function minPrice(b) { return Math.min.apply(null, b.editions.filter(function (e) { return !e.isCopy; }).map(function (e) { return e.price; })); }
  F.minPrice = minPrice;

  // Wordmark: colour each letter like the pages of the original book.
  $$(".wordmark").forEach(function (el) {
    var i = 0;
    el.innerHTML = el.textContent.trim().split(" ").map(function (word) {
      return '<span class="w">' + word.split("").map(function (ch) { i++; return '<span class="l" style="--i:' + i + '">' + F.esc(ch) + "</span>"; }).join("") + "</span>";
    }).join(" ");
  });

  // Theme shelf
  var shelf = $("#shelf");
  if (shelf) {
    var html = F.order.map(function (k) {
      var b = F.books[k];
      return '<a class="tcard t-' + b.color + '" href="' + b.slug + '.html"><div class="glyph">' + F.glyph(b.glyph) + "</div><h3>" + F.esc(b.short === "ABC" ? "ABC" : b.short) + "</h3><p>" + F.esc(b.tagline) + '</p><div class="from"><span>From ' + F.money(minPrice(b)) + '</span><span aria-hidden="true">→</span></div></a>';
    }).join("");
    html += F.comingSoon.map(function (s) {
      return '<div class="tcard soon" aria-label="' + F.esc(s.name) + ', coming soon"><span class="tag">Coming soon</span><div class="glyph">' + F.glyph(s.glyph) + "</div><h3>" + F.esc(s.name) + "</h3><p>" + F.esc(s.line) + '</p><div class="from"><span>Join the waitlist</span></div></div>';
    }).join("");
    shelf.innerHTML = html;
    var prev = $("#shelf-prev"), next = $("#shelf-next");
    function upd() {
      prev.disabled = shelf.scrollLeft < 8;
      next.disabled = shelf.scrollLeft + shelf.clientWidth > shelf.scrollWidth - 8;
    }
    function step(dir) { shelf.scrollBy({ left: dir * (shelf.clientWidth * 0.8), behavior: "smooth" }); }
    prev.addEventListener("click", function () { step(-1); });
    next.addEventListener("click", function () { step(1); });
    shelf.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    upd();
  }

  // Style demo on the home page
  var stage = $("#demo-stage");
  if (stage) {
    var page = { heading: "Gg", color: "sky", items: [{ c: "grandpa", t: "Grandpa Joe" }, { c: "granny", t: "Granny Mae" }] };
    var tabs = $("#style-tabs");
    tabs.innerHTML = F.styles.map(function (s, i) {
      return '<button type="button" class="style-tab" data-style="' + s.id + '" aria-pressed="' + (i === 0) + '"><span class="mini">' + F.portrait("girl", s.id, ["red", "sky", "leaf", "grape"][i], "tab" + i) + "</span><span><strong>" + F.esc(s.name) + "</strong><span>" + F.esc(s.line) + "</span></span></button>";
    }).join("");
    function show(style) {
      stage.innerHTML = F.bookPage({ heading: page.heading, color: page.color, items: page.items, style: style });
      $$(".style-tab", tabs).forEach(function (t) { t.setAttribute("aria-pressed", String(t.dataset.style === style)); });
    }
    tabs.addEventListener("click", function (e) { var t = e.target.closest(".style-tab"); if (t) show(t.dataset.style); });
    show("splash");
  }

  // Sample pages on book pages: <div data-samples="abc" data-style="splash">
  $$("[data-samples]").forEach(function (el) {
    var b = F.books[el.dataset.samples]; if (!b) return;
    var max = Number(el.dataset.max || 3);
    el.innerHTML = b.samples.slice(0, max).map(function (p) { return F.bookPage({ heading: p.heading, color: p.color, items: p.items, style: el.dataset.style || "splash" }); }).join("");
  });

  // Price table on the home page
  var pt = $("#price-rows");
  if (pt) {
    pt.innerHTML = F.order.map(function (k) {
      var b = F.books[k], main = b.editions.filter(function (e) { return !e.isCopy; }), copy = b.editions.filter(function (e) { return e.isCopy; })[0];
      return '<tr><td><a href="' + b.slug + '.html"><span class="dot" style="--dc:var(--' + b.color + ')"></span>' + F.esc(b.name) + "</a></td><td>" + main.map(function (e) { return F.esc(e.pages); }).join(" or ") + '</td><td class="price">' + F.money(minPrice(b)) + "</td><td>" + (copy ? F.money(copy.price) : "") + "</td><td>" + F.esc(b.ages) + "</td></tr>";
    }).join("");
  }

  // Sign-up forms
  $$("form[data-signup]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = $(".form-msg", form), data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      data.form = form.dataset.signup;
      if (!data.email || !/^\S+@\S+\.\S+$/.test(data.email)) { msg.textContent = "Please enter an email address like name@example.com."; return; }
      F.send(data).then(function (sent) {
        msg.textContent = sent ? "You're on the list. We'll email you when ordering opens." : "Sorry, that didn't go through. Please try again, or email hello@familyboardbooks.com.";
        if (sent) form.reset();
      });
    });
  });

  F.send = function (data) {
    if (!F.config.formEndpoint) return Promise.resolve(false);
    var body = Object.assign({
      _subject: data.form === "reservation" ? "New book reservation: " + (data.book || "") : "New waitlist sign-up",
      _template: "table",
      _replyto: data.email,
      region: F.regionInfo ? F.regionInfo().name : ""
    }, data);
    return fetch(F.config.formEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.ok ? r.json().then(function (j) { return String(j.success) === "true"; }, function () { return true; }) : false; })
      .catch(function () { return false; });
  };

  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
