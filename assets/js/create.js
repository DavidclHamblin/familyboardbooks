/* Family Board Books: the step-by-step book creator.
   Photos stay in the visitor's browser for now; the cartoon API plugs in later (see makeCartoons). */
(function () {
  "use strict";
  var F = window.FBB, cur = F.config.currency;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var esc = F.esc;
  var STEPS = ["Book", "Style", "Pages", "Cover", "Reserve"];
  var LAST = STEPS.length - 1;
  var COVER_COLOURS = ["red", "orange", "sun", "leaf", "sky", "grape", "pink", "ink"];
  var EXAMPLES = {
    letters: { A: ["Amara", "Auntie Rose"], B: ["Baby Leo"], C: ["Cousins"], D: ["Daddy"], G: ["Grandpa Joe", "Granny Mae"], H: ["Home"], M: ["Mummy"], U: ["Uncle Tom"] },
    numbers: ["Daddy", "Grannies", "Cousins", "Wheels on our car", "Ducks at the park", "Teddies", "Days in the week", "Candles on the cake", "Toes", "Fingers"],
    colours: ["Grandpa's red car", "Our orange door", "Sam's yellow boots", "Mummy's green bike", "The blue sea", "Purple grapes", "Granny's pink hat", "Teddy", "Our cat", "Snow"],
    emotions: ["Amara", "Leo", "Daddy", "Granny", "Sam", "Daddy", "Amara", "Leo", "Mummy", "Grandpa"],
    people: [["Granny Mae", "lives in Dublin"], ["Uncle Tom", "lives in Madrid"], ["Auntie Rose", "lives next door"]],
    sayings: [["Love you to the moon", "says Mummy"], ["One more story?", "says Amara"], ["Night night, sleep tight", "says Grandpa"]]
  };

  function params() {
    var q = {}, s = location.search.replace(/^\?/, "");
    s.split("&").forEach(function (kv) { if (!kv) return; var p = kv.split("="); q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); });
    var h = location.hash.replace("#", ""); if (h && F.books[h]) q.book = q.book || h;
    return q;
  }

  function buildPages(bookKey, withExamples) {
    var b = F.books[bookKey], kind = b.builder.kind, slots = b.builder.slots, pages = [];
    var LC = F.letterColours;
    function items(n, texts) { var a = []; for (var i = 0; i < n; i++) a.push({ text: (texts && texts[i]) || "", photo: "", example: !!(texts && texts[i]) }); return a; }
    if (kind === "letters") {
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function (L, i) {
        pages.push({ key: L, heading: L + L.toLowerCase(), color: LC[i % LC.length], items: items(slots, withExamples && EXAMPLES.letters[L]), prompt: b.builder.prompt + " " + L });
      });
    } else if (kind === "numbers") {
      for (var n = 1; n <= 10; n++) pages.push({ key: String(n), heading: String(n), color: LC[(n - 1) % LC.length], items: items(1, withExamples && [n + " " + EXAMPLES.numbers[n - 1]]), prompt: "What do we count on page " + n + "?" });
    } else if (kind === "colours") {
      F.colourWords.forEach(function (cw, i) { pages.push({ key: cw[0], heading: cw[0], color: cw[1] === "cloud" || cw[1] === "ink" ? "ink" : cw[1], items: items(slots, withExamples && i < 4 && [EXAMPLES.colours[i]]), prompt: "Something " + cw[0].toLowerCase() + " in your family's world" }); });
    } else if (kind === "emotions") {
      F.emotionWords.forEach(function (w, i) { pages.push({ key: w, heading: w, color: LC[i % LC.length], items: items(1, withExamples && i < 4 && [EXAMPLES.emotions[i] + " is " + w.toLowerCase()]), prompt: "Who is feeling " + w.toLowerCase() + "?" }); });
    } else {
      var ex = EXAMPLES[kind], count = kind === "people" ? 12 : 10;
      for (var j = 0; j < count; j++) {
        var e = withExamples && ex[j];
        pages.push({ key: String(j + 1), heading: e ? e[0] : "", editable: true, color: LC[j % LC.length], items: items(1, e && [e[1]]), example: !!e, prompt: b.builder.prompt });
      }
    }
    return pages;
  }

  // ---------- State ----------
  var q = params();
  var state = {
    step: 0, book: F.books[q.book] ? q.book : "abc", edition: q.edition || "", style: "splash",
    language: "English", language2: "Español", bilingual: false, giftbox: false, copies: 0,
    current: 0, child: "Amara", dedication: "For Amara, with love from all of us.", pages: null, done: false,
    cover: { color: "", frontPhoto: "", backMode: "photo", backPhoto: "", backMessage: "Made with love for Amara" }
  };
  function storeKey() { return "fbb-draft-" + state.book; }
  function save() {
    try {
      var slim = JSON.parse(JSON.stringify(state)); (slim.pages || []).forEach(function (p) { p.items.forEach(function (it) { it.photo = ""; }); });
      slim.cover.frontPhoto = ""; slim.cover.backPhoto = "";
      localStorage.setItem(storeKey(), JSON.stringify(slim));
    } catch (e) { /* storage unavailable: the draft just won't be remembered */ }
  }
  function load(bookKey) {
    try { var s = JSON.parse(localStorage.getItem("fbb-draft-" + bookKey) || "null"); if (s && s.pages) return s; } catch (e) { }
    return null;
  }
  function setBook(k, keepEdition) {
    var saved = load(k);
    state.book = k;
    state.pages = saved ? saved.pages : buildPages(k, true);
    state.current = 0;
    var eds = F.books[k].editions.filter(function (e) { return !e.isCopy; });
    if (!keepEdition || !eds.some(function (e) { return e.id === state.edition; })) state.edition = (eds.filter(function (e) { return e.badge; })[0] || eds[0]).id;
  }
  setBook(state.book, true);

  // ---------- Price ----------
  function priceLines() {
    var b = F.books[state.book], ed = b.editions.filter(function (e) { return e.id === state.edition; })[0];
    var copy = b.editions.filter(function (e) { return e.isCopy; })[0];
    var lines = [[b.name + " (" + ed.name + ")", ed.price]];
    if (state.bilingual) lines.push(["Bilingual edition", F.addons.bilingual.price]);
    if (state.giftbox) lines.push(["Gift box", F.addons.giftbox.price]);
    if (state.copies && copy) lines.push([state.copies + " extra cop" + (state.copies > 1 ? "ies" : "y"), state.copies * copy.price]);
    var total = lines.reduce(function (s, l) { return s + l[1]; }, 0);
    return { lines: lines, total: total, copyPrice: copy ? copy.price : 0 };
  }

  function filledCount() { return state.pages.filter(pageFilled).length; }
  function pageFilled(p) { return p.items.some(function (it) { return it.photo || (it.text && !it.example); }) || (p.editable && p.heading && !p.example && p.items.some(function (it) { return it.photo; })); }

  // ---------- Render: stepper ----------
  function renderStepper() {
    $("#stepper").innerHTML = STEPS.map(function (s, i) {
      return '<li><button type="button" data-step="' + i + '"' + (i === state.step ? ' aria-current="step"' : "") + (i < state.step ? ' class="done"' : "") + ">" + (i + 1) + ". " + esc(s) + "</button></li>";
    }).join("");
  }

  // ---------- Render: panels ----------
  function panelBook() {
    var b = F.books[state.book];
    var books = F.order.map(function (k) {
      var x = F.books[k];
      return '<button type="button" class="choice" data-book="' + k + '" aria-pressed="' + (k === state.book) + '" style="--cc:var(--' + x.color + ')"><span class="cg">' + F.glyph(x.glyph) + "</span><strong>" + esc(x.name) + "</strong><span>" + esc(x.tagline) + '</span><span class="p">From ' + cur + F.minPrice(x) + "</span></button>";
    }).join("");
    var eds = b.editions.filter(function (e) { return !e.isCopy; }).map(function (e) {
      return '<button type="button" class="choice" data-edition="' + e.id + '" aria-pressed="' + (e.id === state.edition) + '"><strong>' + esc(e.name) + "</strong><span>" + esc(e.pages) + " &middot; " + esc(e.detail) + '</span><span class="p">' + cur + e.price + "</span></button>";
    }).join("");
    var pl = priceLines();
    var langs = F.languages.map(function (l) { return "<option" + (l === state.language ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("");
    var langs2 = F.languages.map(function (l) { return "<option" + (l === state.language2 ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("");
    return '<section class="panel"><h2>Which book are you making?</h2><div class="choice-grid">' + books + "</div>" +
      "<h3>Edition</h3><div class=\"choice-grid\">" + eds + "</div>" +
      '<div class="row2"><div class="field"><label for="c-lang">Language</label><select id="c-lang" data-k="language">' + langs + "</select></div>" +
      '<div class="field"' + (state.bilingual ? "" : " hidden") + '><label for="c-lang2">Second language</label><select id="c-lang2" data-k="language2">' + langs2 + "</select></div></div>" +
      '<label class="check"><input type="checkbox" id="c-bi" data-k="bilingual"' + (state.bilingual ? " checked" : "") + "><span>" + esc(F.addons.bilingual.name) + "</span><strong>+" + cur + F.addons.bilingual.price + "</strong></label>" +
      '<label class="check"><input type="checkbox" id="c-gift" data-k="giftbox"' + (state.giftbox ? " checked" : "") + "><span>" + esc(F.addons.giftbox.name) + "</span><strong>+" + cur + F.addons.giftbox.price + "</strong></label>" +
      '<div class="check" style="cursor:default"><span>Extra copies for grandparents and godparents (' + cur + pl.copyPrice + ' each)</span><span class="qty"><button type="button" data-copies="-1" aria-label="One fewer copy">&minus;</button><output id="c-copies">' + state.copies + '</output><button type="button" data-copies="1" aria-label="One more copy">+</button></span></div>' +
      navButtons(false, "Next: choose a style") + "</section>";
  }

  function panelStyle() {
    var cards = F.styles.map(function (s, i) {
      return '<button type="button" class="choice" data-style="' + s.id + '" aria-pressed="' + (s.id === state.style) + '">' + F.portrait(["grandpa", "girl", "dad", "granny"][i], s.id, ["sky", "red", "leaf", "grape"][i], "st" + i) + "<strong>" + esc(s.name) + "</strong><span>" + esc(s.line) + "</span></button>";
    }).join("");
    var p = state.pages[0];
    return '<section class="panel"><h2>Choose an art style</h2><p class="lede">Every photo in your book is drawn in the same style. You can change it before you approve the final proof.</p><div class="choice-grid">' + cards + '</div><div style="max-width:420px">' + F.bookPage(previewModel(p)) + "</div>" + navButtons(true, "Next: add your pages") + "</section>";
  }

  function previewModel(p) {
    var b = F.books[state.book], kind = b.builder.kind;
    var items = p.items.filter(function (it) { return it.photo || it.text; }).map(function (it, i) {
      if (it.photo) return { photo: it.photo, t: it.text };
      if (it.example) return { c: F.guessChar(kind === "people" || kind === "sayings" ? p.heading : it.text, i + p.key.charCodeAt(0)), t: it.text };
      return { empty: true, t: it.text };
    });
    if (!items.length) items = [{ empty: true, t: "" }];
    var heading = p.heading || (p.editable ? (kind === "people" ? "Name" : "Your saying") : "");
    if (kind === "sayings" && p.heading) heading = "“" + p.heading + "”";
    return { heading: heading, color: p.color, items: items, style: state.style };
  }

  function panelPages() {
    var b = F.books[state.book], kind = b.builder.kind, p = state.pages[state.current];
    var strip = state.pages.map(function (pg, i) {
      var label = pg.editable ? String(i + 1) : pg.key;
      return '<button type="button" data-page="' + i + '" aria-current="' + (i === state.current) + '"' + (pageFilled(pg) ? ' class="filled"' : "") + ' aria-label="Page ' + esc(pg.heading || label) + '">' + esc(label.length > 3 ? label.slice(0, 3) : label) + "</button>";
    }).join("");
    var head = "";
    if (p.editable) {
      head = '<div class="field"><label for="c-head">' + (kind === "people" ? "Their name" : "The saying") + '</label><input type="text" id="c-head" data-head value="' + esc(p.heading) + '" placeholder="' + (kind === "people" ? "e.g. Granny Mae" : "e.g. Love you to the moon") + '"></div>';
    }
    var slots = p.items.map(function (it, i) {
      var thumb = it.photo ? '<img src="' + it.photo + '" alt="">' : "+";
      var ph = kind === "letters" ? "e.g. " + (EXAMPLES.letters[p.key] ? EXAMPLES.letters[p.key][0] : p.key + "…") : kind === "people" ? "e.g. lives in Dublin" : kind === "sayings" ? "e.g. says Mummy" : p.prompt;
      return '<div class="slot' + (it.photo ? " has-photo" : "") + '"><div class="slot-thumb" aria-hidden="true">' + thumb + '</div><div class="slot-fields"><input type="text" id="c-t' + i + '" data-text="' + i + '" value="' + esc(it.text) + '" placeholder="' + esc(ph) + '" aria-label="' + esc(p.prompt) + " " + (i + 1) + '">' +
        '<div class="slot-actions"><label class="upload">' + (it.photo ? "Change photo" : "Add photo") + '<input type="file" accept="image/*" data-photo="' + i + '" aria-label="Photo for ' + esc(p.heading || "this page") + " " + (i + 1) + '"></label>' +
        (it.photo ? '<button type="button" class="linkish" data-remove="' + i + '">Remove photo</button>' : "") + (it.example ? '<span class="chip">Example</span>' : "") + "</div></div></div>";
    }).join("");
    var nav = '<div class="slot-actions"><button type="button" class="btn ghost btn-sm" data-move="-1"' + (state.current === 0 ? " disabled" : "") + '>&larr; Previous page</button><button type="button" class="btn btn-sm" data-move="1"' + (state.current === state.pages.length - 1 ? " disabled" : "") + ">Next page &rarr;</button></div>";
    return '<section class="panel"><h2>Add your names and photos</h2>' +
      '<p class="notice">The example names are there to show how pages look. Type over them, or <button type="button" class="linkish" data-clear>clear all examples</button>. Photos stay on this device until you reserve your book.</p>' +
      '<div class="pages-ui"><div class="page-strip" role="group" aria-label="Pages">' + strip + "</div>" +
      '<div class="editor"><div class="editor-head"><h3>' + esc(p.editable ? "Page " + p.key : "Page " + p.heading) + '</h3><span class="hint">' + esc(p.prompt) + "</span></div>" + head + slots + nav + "</div>" +
      '<div id="live">' + F.bookPage(previewModel(p)) + '<p class="hint" style="margin-top:12px">Preview. Your photos are turned into ' + esc(styleName()) + " cartoons when we make your book.</p></div></div>" +
      navButtons(true, "Next: design the cover") + "</section>";
  }

  function coverColour() { return state.cover.color || F.books[state.book].color; }

  /* coverHTML("front" | "back") -> a board book cover, front or back */
  function coverHTML(side) {
    var col = coverColour(), cv = state.cover, accent = col === "sun" ? "red" : "sun";
    var cls = "bcover " + side + (col === "sun" ? " light" : "");
    if (side === "front") {
      var art = cv.frontPhoto ? F.photoPortrait(cv.frontPhoto, state.style, accent, "front") : F.portrait("girl", state.style, accent, "cover");
      return '<div class="' + cls + '" style="--cc:var(--' + col + ')"><span class="k">' + esc(F.books[state.book].name) + "</span>" + art + '<span class="t">' + esc(coverTitle()) + "</span></div>";
    }
    var body = cv.backMode === "photo"
      ? (cv.backPhoto ? F.photoPortrait(cv.backPhoto, state.style, accent, "back") : F.portrait("granny", state.style, accent, "back"))
      : '<span class="pattern" aria-hidden="true"></span>';
    return '<div class="' + cls + (cv.backMode === "pattern" ? " patterned" : "") + '" style="--cc:var(--' + col + ')">' + body +
      (cv.backMessage ? '<span class="msg">' + esc(cv.backMessage) + "</span>" : "") +
      '<span class="brand"><span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Family Board Books<small>familyboardbooks.com</small></span></div>';
  }

  function coverUpload(side, label) {
    var has = state.cover[side + "Photo"];
    return '<div class="slot-actions"><label class="upload">' + (has ? "Change photo" : label) + '<input type="file" accept="image/*" data-cover-photo="' + side + '" aria-label="' + esc(label) + '"></label>' +
      (has ? '<button type="button" class="linkish" data-cover-clear="' + side + '">Use our illustration instead</button>' : "") + "</div>";
  }

  function panelCover() {
    var cv = state.cover, col = coverColour();
    var swatches = COVER_COLOURS.map(function (c) {
      return '<button type="button" class="swatch" data-cover-color="' + c + '" style="--sw:var(--' + c + ')" aria-pressed="' + (c === col) + '" aria-label="' + c + ' cover"></button>';
    }).join("");
    return '<section class="panel"><h2>Design the cover</h2><p class="lede">Choose a colour and pictures for the front and back. Cover changes are free.</p>' +
      '<div class="cover-ui"><div class="cover-pair" id="cover-pair"><figure>' + coverHTML("front") + "<figcaption>Front</figcaption></figure><figure>" + coverHTML("back") + "<figcaption>Back</figcaption></figure></div>" +
      '<div class="cover-form">' +
      '<div class="field"><label for="c-child">Child\'s name for the cover</label><input type="text" id="c-child" data-k="child" value="' + esc(state.child) + '"></div>' +
      '<div class="field"><span class="flabel">Cover colour</span><div class="swatches" role="group" aria-label="Cover colour">' + swatches + "</div></div>" +
      '<div class="field"><span class="flabel">Front picture</span><p class="hint">A family photo works well. We turn it into a cartoon like the other pages.</p>' + coverUpload("front", "Add front photo") + "</div>" +
      '<div class="field"><span class="flabel">Back cover</span><div class="seg" role="group" aria-label="Back cover design"><button type="button" data-back-mode="photo" aria-pressed="' + (cv.backMode === "photo") + '">Photo and message</button><button type="button" data-back-mode="pattern" aria-pressed="' + (cv.backMode === "pattern") + '">Pattern and message</button></div>' +
      (cv.backMode === "photo" ? coverUpload("back", "Add back photo") : "") + "</div>" +
      '<div class="field"><label for="c-backmsg">Message on the back</label><input type="text" id="c-backmsg" data-cover-msg maxlength="80" value="' + esc(cv.backMessage) + '" placeholder="e.g. Made with love by Granny and Grandpa, Christmas 2026"></div>' +
      '<div class="field"><label for="c-ded">Dedication page (inside the front cover)</label><textarea id="c-ded" data-k="dedication">' + esc(state.dedication) + "</textarea></div>" +
      "</div></div>" + navButtons(true, "Next: reserve your book") + "</section>";
  }

  function refreshCover() {
    var pair = $("#cover-pair");
    if (pair) pair.innerHTML = "<figure>" + coverHTML("front") + "<figcaption>Front</figcaption></figure><figure>" + coverHTML("back") + "<figcaption>Back</figcaption></figure>";
    renderSummary(); save();
  }

  function panelReserve() {
    if (state.done) {
      return '<section class="panel"><div class="success"><h2>Your book is reserved</h2><p>We\'ll email you to upload your photos securely and approve your cartoon proof when ordering opens. Founding families get ' + F.config.foundingDiscount + "% off.</p><p><a class=\"btn\" href=\"index.html\">Back to all books</a></p></div></section>";
    }
    var b = F.books[state.book];
    return '<section class="panel"><h2>Reserve your book</h2>' +
      '<p class="notice">Ordering opens soon. Reserve your book now: no payment is taken today, and you\'ll get ' + F.config.foundingDiscount + "% off as a founding family.</p>" +
      '<form class="form" id="reserve" novalidate><div class="row2"><div class="field"><label for="r-name">Your name</label><input type="text" id="r-name" name="name" autocomplete="name"></div>' +
      '<div class="field"><label for="r-email">Email</label><input type="email" id="r-email" name="email" autocomplete="email" placeholder="name@example.com" required></div></div>' +
      '<label class="check"><input type="checkbox" id="r-ok" name="consent"><span>I have permission to use the photos of everyone in my book.</span></label>' +
      '<p class="form-msg" role="status"></p><div class="panel-nav"><button type="button" class="btn ghost" data-nav="-1">Back</button><button type="submit" class="btn red">Reserve my ' + esc(b.short === "ABC" ? "ABC" : b.short.toLowerCase()) + " book</button></div></form></section>";
  }

  function navButtons(back, nextLabel) {
    return '<div class="panel-nav">' + (back ? '<button type="button" class="btn ghost" data-nav="-1">Back</button>' : "<span></span>") + '<button type="button" class="btn" data-nav="1">' + esc(nextLabel) + "</button></div>";
  }

  function styleName() { return F.styles.filter(function (s) { return s.id === state.style; })[0].name; }
  function coverTitle() {
    var b = F.books[state.book], n = (state.child || "").trim();
    return n ? n + (/s$/i.test(n) ? "'" : "'s") + " " + b.name : b.name;
  }

  function renderSummary() {
    var b = F.books[state.book], pl = priceLines(), filled = filledCount(), total = state.pages.length;
    $("#summary").innerHTML = '<h3>Your book</h3><div class="sum-pair">' + coverHTML("front") + coverHTML("back") + '</div><p class="hint">' + esc(styleName()) + " style &middot; " + esc(b.name) + "</p>" +
      '<div class="sum-lines">' + pl.lines.map(function (l) { return "<div><span>" + esc(l[0]) + "</span><span>" + cur + l[1] + "</span></div>"; }).join("") +
      '<div class="total"><span>Total</span><span>' + cur + pl.total + "</span></div></div>" +
      '<p class="hint">Founding families get ' + F.config.foundingDiscount + "% off. Shipping is added at checkout. " + esc(state.bilingual ? state.language + " and " + state.language2 : state.language) + ".</p>" +
      '<div><div class="hint" style="margin-bottom:6px">' + filled + " of " + total + ' pages filled in</div><div class="progress"><i style="width:' + Math.round(filled / total * 100) + '%"></i></div></div>';
  }

  function render(focusSel) {
    renderStepper();
    var fns = [panelBook, panelStyle, panelPages, panelCover, panelReserve];
    $("#panels").innerHTML = fns[state.step]();
    renderSummary();
    if (focusSel) { var el = $(focusSel); if (el) el.focus(); }
    save();
  }

  function refreshLive() {
    var live = $("#live"); if (!live) return;
    live.firstElementChild.outerHTML = F.bookPage(previewModel(state.pages[state.current]));
    var btn = $('.page-strip [data-page="' + state.current + '"]');
    if (btn) btn.classList.toggle("filled", pageFilled(state.pages[state.current]));
    renderSummary(); save();
  }

  // ---------- Events ----------
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t || !t.closest(".creator")) return;
    if (t.dataset.step != null) { state.step = Number(t.dataset.step); render(); scrollTop(); }
    else if (t.dataset.nav) { state.step = Math.max(0, Math.min(LAST, state.step + Number(t.dataset.nav))); render(); scrollTop(); }
    else if (t.dataset.coverColor) { state.cover.color = t.dataset.coverColor; render('[data-cover-color="' + t.dataset.coverColor + '"]'); }
    else if (t.dataset.backMode) { state.cover.backMode = t.dataset.backMode; render('[data-back-mode="' + t.dataset.backMode + '"]'); }
    else if (t.dataset.coverClear) { state.cover[t.dataset.coverClear + "Photo"] = ""; render(); }
    else if (t.dataset.book) { setBook(t.dataset.book); render('[data-book="' + t.dataset.book + '"]'); }
    else if (t.dataset.edition) { state.edition = t.dataset.edition; render('[data-edition="' + t.dataset.edition + '"]'); }
    else if (t.dataset.style) { state.style = t.dataset.style; render('[data-style="' + t.dataset.style + '"]'); }
    else if (t.dataset.copies) { state.copies = Math.max(0, Math.min(10, state.copies + Number(t.dataset.copies))); render('[data-copies="' + t.dataset.copies + '"]'); }
    else if (t.dataset.page) { state.current = Number(t.dataset.page); render('[data-page="' + state.current + '"]'); }
    else if (t.dataset.move) { state.current = Math.max(0, Math.min(state.pages.length - 1, state.current + Number(t.dataset.move))); render('[data-move="' + t.dataset.move + '"]'); }
    else if (t.dataset.remove) { var it = state.pages[state.current].items[Number(t.dataset.remove)]; it.photo = ""; render(); }
    else if (t.hasAttribute("data-clear")) {
      state.pages.forEach(function (p) { if (p.example) { p.heading = ""; p.example = false; } p.items.forEach(function (it) { if (it.example) { it.text = ""; it.example = false; } }); });
      render();
    }
  });

  document.addEventListener("input", function (e) {
    var t = e.target; if (!t.closest(".creator")) return;
    var p = state.pages[state.current];
    if (t.dataset.text != null) { var it = p.items[Number(t.dataset.text)]; it.text = t.value; it.example = false; refreshLive(); }
    else if (t.hasAttribute("data-head")) { p.heading = t.value; p.example = false; refreshLive(); }
    else if (t.dataset.k === "child" || t.dataset.k === "dedication") { state[t.dataset.k] = t.value; refreshCover(); }
    else if (t.hasAttribute("data-cover-msg")) { state.cover.backMessage = t.value; refreshCover(); }
  });

  document.addEventListener("change", function (e) {
    var t = e.target; if (!t.closest(".creator")) return;
    if (t.dataset.coverPhoto && t.files && t.files[0]) {
      state.cover[t.dataset.coverPhoto + "Photo"] = URL.createObjectURL(t.files[0]);
      render();
    } else if (t.dataset.photo != null && t.files && t.files[0]) {
      var it = state.pages[state.current].items[Number(t.dataset.photo)];
      it.photo = URL.createObjectURL(t.files[0]);
      it.file = t.files[0];
      if (it.example) { it.text = ""; it.example = false; }
      render();
    } else if (t.dataset.k === "language" || t.dataset.k === "language2") { state[t.dataset.k] = t.value; renderSummary(); save(); }
    else if (t.dataset.k === "bilingual" || t.dataset.k === "giftbox") { state[t.dataset.k] = t.checked; render("#" + t.id); }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.id !== "reserve") return;
    e.preventDefault();
    var form = e.target, msg = $(".form-msg", form), email = $("#r-email").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = "Please enter an email address like name@example.com."; $("#r-email").focus(); return; }
    if (!$("#r-ok").checked) { msg.textContent = "Please confirm you have permission to use these photos."; return; }
    var b = F.books[state.book], pl = priceLines();
    var payload = {
      form: "reservation", name: $("#r-name").value.trim(), email: email, book: b.name, edition: state.edition, style: state.style,
      language: state.bilingual ? state.language + " + " + state.language2 : state.language, giftbox: state.giftbox, copies: state.copies,
      total: cur + pl.total, cover: coverTitle(), dedication: state.dedication,
      coverColour: coverColour(), frontCover: state.cover.frontPhoto ? "own photo" : "our illustration",
      backCover: state.cover.backMode === "photo" ? (state.cover.backPhoto ? "own photo" : "our illustration") : "pattern",
      backMessage: state.cover.backMessage,
      pages: state.pages.map(function (p) { return (p.heading || "") + ": " + p.items.map(function (it) { return it.text + (it.photo ? " [photo]" : ""); }).filter(Boolean).join(", "); }).join(" | ")
    };
    F.send(payload).then(function (sent) {
      if (!sent) { msg.textContent = "Reservations aren't connected yet, so nothing was sent (preview)."; return; }
      state.done = true; render(); scrollTop();
    });
  });

  function scrollTop() { var el = $(".creator"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }

  /* Later: send each uploaded photo to the cartoon API and swap it for the result.
     FBB.makeCartoons = function (pages, style) { ... } */

  render();
})();
