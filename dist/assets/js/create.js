/* Family Board Books: the step-by-step book creator.
   Photos stay in the visitor's browser for now; the cartoon API plugs in later (see makeCartoons). */
(function () {
  "use strict";
  var F = window.FBB, cur = F.regionInfo().currency;
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
    tray: [], picking: null, drawing: null, language: "English", language2: "", bilingual: false, giftbox: false, copies: 0,
    current: 0, child: "Amara", dedication: "For Amara, with love from all of us.", pages: null, done: false,
    cover: { color: "", frontPhoto: "", backMode: "photo", backPhoto: "", backMessage: "Made with love for Amara" }
  };
  function storeKey() { return "fbb-draft-" + state.book; }
  function save() {
    try {
      var slim = JSON.parse(JSON.stringify(state, function (k, v) { return /^(file|frontFile|backFile|busy|toonErr|frontBusy|backBusy|frontErr|backErr|tray|picking|drawing)$/.test(k) ? undefined : v; }));
      (slim.pages || []).forEach(function (p) { p.items.forEach(function (it) { it.photo = ""; it.toon = ""; }); });
      slim.cover.frontPhoto = ""; slim.cover.backPhoto = ""; slim.cover.frontToon = ""; slim.cover.backToon = ""; slim.toonInfo = null;
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
    var A = F.amount, lines = [[b.name + " (" + ed.name + ")", A(ed.price)]];
    if (state.bilingual) lines.push(["Bilingual edition", A(F.addons.bilingual.price)]);
    if (state.giftbox) lines.push(["Gift box", A(F.addons.giftbox.price)]);
    if (state.copies && copy) lines.push([state.copies + " extra cop" + (state.copies > 1 ? "ies" : "y"), state.copies * A(copy.price)]);
    var total = lines.reduce(function (s, l) { return s + l[1]; }, 0);
    return { lines: lines, total: total, copyPrice: copy ? A(copy.price) : 0 };
  }

  function filledCount() { return state.pages.filter(pageFilled).length; }
  function pageFilled(p) { return p.items.some(function (it) { return it.photo || it.toon || (it.text && !it.example); }) || (p.editable && p.heading && !p.example && p.items.some(function (it) { return it.photo; })); }

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
      return '<button type="button" class="choice" data-book="' + k + '" aria-pressed="' + (k === state.book) + '" style="--cc:var(--' + x.color + ')"><span class="cg">' + F.glyph(x.glyph) + "</span><strong>" + esc(x.name) + "</strong><span>" + esc(x.tagline) + '</span><span class="p">From ' + F.money(F.minPrice(x)) + "</span></button>";
    }).join("");
    var eds = b.editions.filter(function (e) { return !e.isCopy; }).map(function (e) {
      return '<button type="button" class="choice" data-edition="' + e.id + '" aria-pressed="' + (e.id === state.edition) + '"><strong>' + esc(e.name) + "</strong><span>" + esc(e.pages) + " &middot; " + esc(e.detail) + '</span><span class="p">' + F.money(e.price) + "</span></button>";
    }).join("");
    var pl = priceLines();
    var langs = F.languages.map(function (l) { return "<option" + (l === state.language ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("");
    var langs2 = '<option value=""' + (state.language2 ? "" : " selected") + ">No second language</option>" +
      F.languages.filter(function (l) { return l !== state.language; }).map(function (l) { return "<option" + (l === state.language2 ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("");
    return '<section class="panel"><h2>Which book are you making?</h2><div class="choice-grid">' + books + "</div>" +
      "<h3>Edition</h3><div class=\"choice-grid\">" + eds + "</div>" +
      '<div class="row2"><div class="field"><label for="c-lang">Language</label><select id="c-lang" data-k="language">' + langs + "</select></div>" +
      '<div class="field"><label for="c-lang2">Second language <span class="hint">(optional, +' + F.money(F.addons.bilingual.price) + ")</span></label><select id=\"c-lang2\" data-k=\"language2\">" + langs2 + "</select></div></div>" +
      (state.bilingual ? '<p class="hint">Every page shows both ' + esc(state.language) + " and " + esc(state.language2) + ".</p>" : "") +
      '<label class="check"><input type="checkbox" id="c-gift" data-k="giftbox"' + (state.giftbox ? " checked" : "") + "><span>" + esc(F.addons.giftbox.name) + "</span><strong>+" + F.money(F.addons.giftbox.price) + "</strong></label>" +
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
    var items = p.items.filter(function (it) { return it.photo || it.toon || it.text; }).map(function (it, i) {
      if (it.toon) return { cartoon: it.toon, t: it.text };
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
      var thumb = it.toon ? '<img class="toon-thumb" src="' + it.toon + '" alt="">' : it.photo ? '<img src="' + it.photo + '" alt="">' : "+";
      var ph = kind === "letters" ? "e.g. " + (EXAMPLES.letters[p.key] ? EXAMPLES.letters[p.key][0] : p.key + "…") : kind === "people" ? "e.g. lives in Dublin" : kind === "sayings" ? "e.g. says Mummy" : p.prompt;
      return '<div class="slot' + (it.photo ? " has-photo" : "") + '"><div class="slot-thumb" aria-hidden="true">' + thumb + '</div><div class="slot-fields"><input type="text" id="c-t' + i + '" data-text="' + i + '" value="' + esc(it.text) + '" placeholder="' + esc(ph) + '" aria-label="' + esc(p.prompt) + " " + (i + 1) + '">' +
        '<div class="slot-actions"><label class="upload">' + (it.photo ? "Change photo" : "Add photo") + '<input type="file" accept="image/*" data-photo="' + i + '" aria-label="Photo for ' + esc(p.heading || "this page") + " " + (i + 1) + '"></label>' +
        (!it.photo && !it.toon && state.tray.length ? '<button type="button" class="linkish" data-pick-open="' + i + '">Choose from your photos (' + state.tray.length + ")</button>" : "") +
        (it.photo || it.toon ? '<button type="button" class="linkish" data-remove="' + i + '">Remove photo</button>' : "") + (it.example ? '<span class="chip">Example</span>' : "") + "</div>" +
        (state.picking === i && !it.photo && state.tray.length ? '<div class="tray tray-pick" role="group" aria-label="Your photos">' + state.tray.map(function (t, ti) { return '<button type="button" data-pick="' + i + ":" + ti + '"><img src="' + t.url + '" alt="Use photo ' + (ti + 1) + '"></button>'; }).join("") + "</div>" : "") +
        toonControls(it, i) + "</div></div>";
    }).join("");
    var nav = '<div class="slot-actions"><button type="button" class="btn ghost btn-sm" data-move="-1"' + (state.current === 0 ? " disabled" : "") + '>&larr; Previous page</button><button type="button" class="btn btn-sm" data-move="1"' + (state.current === state.pages.length - 1 ? " disabled" : "") + ">Next page &rarr;</button></div>";
    return '<section class="panel"><h2>Add your names and photos</h2>' +
      '<p class="notice">The example names are there to show how pages look. Type over them, or <button type="button" class="linkish" data-clear>clear all examples</button>. ' + (F.toons.enabled() ? "Photos stay on this device unless you make a free cartoon preview or order your book." : "Photos stay on this device until you reserve your book.") + "</p>" + trayBox() + previewBox() +
      '<div class="pages-ui"><div class="page-strip" role="group" aria-label="Pages">' + strip + "</div>" +
      '<div class="editor"><div class="editor-head"><h3>' + esc(p.editable ? "Page " + p.key : "Page " + p.heading) + '</h3><span class="hint">' + esc(p.prompt) + "</span></div>" + head + slots + nav + "</div>" +
      '<div id="live">' + F.bookPage(previewModel(p)) + '<p class="hint" style="margin-top:12px">' + (p.items.some(function (it) { return it.toon; }) ? "Your cartoon in the " + esc(styleName()) + " style." : "Preview. Your photos are turned into " + esc(styleName()) + " cartoons" + (F.toons.enabled() ? ": try it free on two pages." : " when we make your book.")) + "</p></div></div>" +
      navButtons(true, "Next: design the cover") + "</section>";
  }

  // ---------- Add all photos at once ----------
  // Photos chosen in one go wait in a tray. Customers can fill empty pages in order, or pick a photo for each spot.
  function trayBox() {
    var empty = emptySpots().length;
    return '<div class="tray-box"><div class="tray-head"><div><h3>Add all your photos at once</h3><p class="hint">Choose lots of photos together, then put them on your pages.</p></div>' +
      '<label class="upload">Choose photos<input type="file" accept="image/*" multiple data-tray aria-label="Choose several photos"></label></div>' +
      (state.tray.length ? '<div class="tray" role="list" aria-label="Photos waiting to be placed">' + state.tray.map(function (t, ti) { return '<span role="listitem"><img src="' + t.url + '" alt="Photo ' + (ti + 1) + '"><button type="button" data-tray-remove="' + ti + '" aria-label="Remove photo ' + (ti + 1) + '">&times;</button></span>'; }).join("") + "</div>" +
        '<div class="slot-actions"><button type="button" class="btn btn-sm" data-tray-fill' + (empty ? "" : " disabled") + ">Fill empty pages in order</button><span class=\"hint\">" + state.tray.length + " photo" + (state.tray.length === 1 ? "" : "s") + " waiting. Or open a page and choose &ldquo;Choose from your photos&rdquo;.</span></div>" : "") +
      "</div>";
  }
  // Empty spots, first picture on every page before second pictures, so 12 photos cover A to L.
  function emptySpots() {
    var out = [], most = Math.max.apply(null, state.pages.map(function (p) { return p.items.length; }));
    for (var ii = 0; ii < most; ii++) state.pages.forEach(function (p, pi) { var it = p.items[ii]; if (it && !it.photo && !it.toon) out.push([pi, ii]); });
    return out;
  }
  function placeFromTray(pi, ii, ti) {
    var t = state.tray[ti], it = state.pages[pi].items[ii]; if (!t || !it) return;
    it.photo = t.url; it.file = t.file; it.toon = ""; it.up = false; it.toonErr = "";
    if (it.example) { it.text = ""; it.example = false; }
    state.tray.splice(ti, 1);
  }

  // ---------- Free cartoon preview ----------
  function toonInfo() { return state.toonInfo || { freeLeft: Number(F.config.freeCartoons || 6), redosLeft: null, paid: false }; }
  function previewBox() {
    if (!F.toons.enabled()) return "";
    var info = toonInfo(), left = info.paid ? null : info.freeLeft;
    var line = info.paid ? "Your book is ordered: every photo will be drawn on your proof page."
      : left > 0 ? "Add photos to up to two pages and we'll draw them as " + esc(styleName()) + " cartoons, so you can see your book before you pay. " + left + " free cartoon" + (left === 1 ? "" : "s") + " left."
      : "You've used your free preview. Order your book and we'll draw every page.";
    return '<div class="preview-box"><h3>Free preview: see your cartoons before you pay</h3><p>' + line + "</p>" +
      '<label class="check"><input type="checkbox" id="pv-ok"' + (state.toonConsent ? " checked" : "") + "><span>I have permission to use the photos of everyone shown. Previews are deleted after 14 days if you don't order.</span></label>" +
      (state.drawErr && !state.toonConsent ? '<span class="toon-status" role="alert">Please tick the permission box first.</span>' : "") +
      drawAllControl(info) + "</div>";
  }
  // Pictures with a photo but no cartoon yet, in page order.
  function waitingSpots() {
    var out = [];
    state.pages.forEach(function (p, pi) { p.items.forEach(function (it, ii) { if (it.photo && !it.toon && !it.busy) out.push([pi, ii]); }); });
    return out;
  }
  function drawAllControl(info) {
    if (state.drawing) return '<p class="toon-status busy" role="status">' + (state.drawing.total ? "Drawing your cartoons: " + state.drawing.done + " of " + state.drawing.total + " ready. You can keep working while we draw." : "Getting ready…") + "</p>";
    var waiting = waitingSpots().length, can = info.paid ? waiting : Math.min(waiting, Math.max(0, info.freeLeft));
    if (!can) return "";
    return '<div class="slot-actions"><button type="button" class="btn btn-sm btn-toon" data-draw-all>Draw ' + (can === 1 ? "my cartoon" : "all " + can + " cartoons") + " now</button><span class=\"hint\">Or draw them one by one on each page.</span></div>";
  }
  function drawAll() {
    var box = $("#pv-ok");
    if (box && !box.checked) { state.drawErr = true; render(); return; }
    state.toonConsent = true; state.drawErr = false;
    state.drawing = { done: 0, total: 0 }; render();
    // Ask our service how many free cartoons are really left before starting.
    F.toons.draft(state.book, state.style, true).then(function (d) { return F.toons.status(d); })
      .then(function (j) { applyInfo(j); }, function () {})
      .then(function () { startDrawAll(); });
  }
  function startDrawAll() {
    var info = toonInfo(), spots = waitingSpots();
    if (!info.paid) spots = spots.slice(0, Math.max(0, info.freeLeft));
    if (!spots.length) { state.drawing = null; render(); return; }
    state.drawing = { done: 0, total: spots.length };
    spots.forEach(function (sp) { var it = state.pages[sp[0]].items[sp[1]]; it.busy = true; it.toonErr = ""; });
    render();
    F.toons.pool(spots.map(function (sp) { return function () { return toonJob(sp[0], sp[1]); }; }), {
      concurrency: 3,
      onProgress: function (n) { if (state.drawing) state.drawing.done = n; afterToon(); }
    }).then(function () { state.drawing = null; afterToon(); });
  }
  function toonControls(it, i) {
    if (!F.toons.enabled() || (!it.photo && !it.toon)) return "";
    var info = toonInfo();
    if (it.busy) return '<span class="toon-status busy" role="status">Drawing your cartoon… about 20 seconds</span>';
    var out = "";
    if (it.toonErr) out += '<span class="toon-status" role="alert">' + esc(it.toonErr) + "</span>";
    if (it.toon) {
      if (it.photo && (info.paid || info.redosLeft == null || info.redosLeft > 0)) out += '<button type="button" class="linkish" data-toon="' + i + '">Draw it again</button>';
      return '<div class="slot-actions"><span class="toon-status">Cartoon ready</span>' + out + "</div>";
    }
    if (!info.paid && info.freeLeft <= 0) return '<div class="slot-actions"><span class="toon-status">Drawn after you order</span>' + out + "</div>";
    return '<div class="slot-actions"><button type="button" class="btn btn-sm btn-toon" data-toon="' + i + '">Draw as cartoon (free)</button>' + out + "</div>";
  }
  function applyInfo(j) { if (j) state.toonInfo = { freeLeft: j.freeLeft, redosLeft: j.redosLeft, paid: j.paid }; }
  function makeToon(pi, ii) {
    var it = state.pages[pi].items[ii], box = $("#pv-ok");
    if (box && !box.checked) { it.toonErr = "Please tick the permission box above first."; render(); return; }
    state.toonConsent = true; it.busy = true; it.toonErr = ""; render();
    toonJob(pi, ii).catch(function () {});
  }
  // One picture: upload (once), draw, fetch the cartoon. Rejects on failure so the queue can retry it.
  function toonJob(pi, ii) {
    var it = state.pages[pi].items[ii], slot = "p" + pi + "-" + ii, d;
    it.busy = true;
    return F.toons.draft(state.book, state.style, true).then(function (dd) {
      d = dd;
      return it.up || !it.file ? null : F.toons.upload(d, slot, it.file).then(function () { it.up = true; });
    }).then(function () { return F.toons.make(d, slot, state.style); })
      .then(function (j) { applyInfo(j); return F.toons.image(d, slot); })
      .then(function (url) { it.toon = url; it.busy = false; it.toonErr = ""; afterToon(); })
      .catch(function (e) {
        it.busy = false; it.toonErr = e.message;
        if (e.status === 402) state.toonInfo = Object.assign({}, toonInfo(), { freeLeft: 0, redosLeft: 0 });
        if (e.status === 403) { F.toons.forget(state.book); it.up = false; }
        if (e.status === 404) it.up = false;  // photo missing on our side: upload again next time
        afterToon();
        throw e;
      });
  }
  function afterToon() { if (state.step === 2) render(); else save(); }

  // Bring back cartoons made earlier in this browser.
  function restoreToons() {
    if (!F.toons.enabled()) return;
    var book = state.book, d = F.toons.saved(book); if (!d) return;
    F.toons.status(d).then(function (j) {
      if (state.book !== book) return;
      applyInfo(j);
      var jobs = (j.cartoons || []).map(function (slot) {
        var m = /^p(\d+)-(\d+)$/.exec(slot); if (!m) return null;
        var it = state.pages[+m[1]] && state.pages[+m[1]].items[+m[2]]; if (!it) return null;
        return F.toons.image(d, slot).then(function (url) { it.toon = url; it.up = true; });
      }).filter(Boolean);
      ["front", "back"].forEach(function (side) {
        var slot = "cover-" + side;
        if ((j.photos || []).indexOf(slot) >= 0) state.cover[side + "Up"] = true;
        if ((j.cartoons || []).indexOf(slot) >= 0) jobs.push(F.toons.image(d, slot).then(function (url) { state.cover[side + "Toon"] = url; state.cover[side + "Up"] = true; }));
      });
      (j.photos || []).forEach(function (slot) { var m = /^p(\d+)-(\d+)$/.exec(slot); var it = m && state.pages[+m[1]] && state.pages[+m[1]].items[+m[2]]; if (it) it.up = true; });
      return Promise.all(jobs).then(function () { render(); });
    }).catch(function (e) { if (e.status === 403 || e.status === 404) F.toons.forget(book); });
  }

  // Upload every photo, store the page texts and return the draft for checkout.
  function uploadAll(msg) {
    var jobs = [];
    state.pages.forEach(function (p, pi) { p.items.forEach(function (it, ii) { if (it.file && !it.up) jobs.push({ slot: "p" + pi + "-" + ii, file: it.file, done: function () { it.up = true; } }); }); });
    ["front", "back"].forEach(function (side) {
      var f = state.cover[side + "File"];
      if (f && !state.cover[side + "Up"] && !(side === "back" && state.cover.backMode !== "photo")) jobs.push({ slot: "cover-" + side, file: f, done: function () { state.cover[side + "Up"] = true; } });
    });
    return F.toons.draft(state.book, state.style, true).then(function (d) {
      msg.textContent = jobs.length ? "Uploading your photos securely (0 of " + jobs.length + ")…" : "Saving your book…";
      return F.toons.pool(jobs.map(function (job) { return function () { return F.toons.upload(d, job.slot, job.file).then(job.done); }; }), {
        concurrency: 3,
        onProgress: function (n, total) { msg.textContent = "Uploading your photos securely (" + n + " of " + total + ")…"; }
      }).then(function (res) {
        var failed = res.filter(function (r) { return !r.ok; }).length;
        if (failed) throw new Error(failed + " photo" + (failed === 1 ? "" : "s") + " didn't upload. Please check your connection and try again: the ones already uploaded won't be sent twice.");
      }).then(function () {
        var kind = F.books[state.book].builder.kind;
        return F.toons.update(d, {
          style: state.style, keep: !!($("#r-keep") && $("#r-keep").checked),
          pages: state.pages.map(function (p, pi) {
            return { heading: p.example ? "" : p.heading || "", color: p.color, kind: kind,
              items: p.items.map(function (it, ii) { return { t: it.example ? "" : it.text || "", slot: it.file || it.up ? "p" + pi + "-" + ii : null }; }) };
          }),
          cover: { title: coverTitle(), color: coverColour(), backMode: state.cover.backMode, backMessage: state.cover.backMessage,
            front: !!(state.cover.frontFile || state.cover.frontUp), back: !!(state.cover.backFile || state.cover.backUp) && state.cover.backMode === "photo",
            frontCartoon: state.cover.frontPic !== "photo", backCartoon: state.cover.backPic !== "photo" }
        });
      }).then(function () { return d; });
    });
  }

  function coverColour() { return state.cover.color || F.books[state.book].color; }

  /* coverHTML("front" | "back") -> a board book cover, front or back */
  // Cover pictures: drawn as a cartoon (default) or printed as the original photo.
  function coverArt(side, accent, fallback) {
    var cv = state.cover, photo = cv[side + "Photo"], toon = cv[side + "Toon"];
    if (cv[side + "Pic"] === "photo" && photo) return '<img class="portrait toon cover-photo" src="' + photo + '" alt="Your photo">';
    if (toon) return '<img class="portrait toon" src="' + toon + '" alt="Cartoon portrait">';
    if (photo) return F.photoPortrait(photo, state.style, accent, side);
    return F.portrait(fallback, state.style, accent, side === "front" ? "cover" : "back");
  }
  function coverChoice(side) {
    var cv = state.cover; if (!cv[side + "Photo"] && !cv[side + "Toon"]) return "";
    var mode = cv[side + "Pic"] === "photo" ? "photo" : "cartoon";
    var out = '<div class="seg" role="group" aria-label="' + (side === "front" ? "Front" : "Back") + ' picture"><button type="button" data-cover-mode="' + side + ':cartoon" aria-pressed="' + (mode === "cartoon") + '">Turn into a cartoon</button><button type="button" data-cover-mode="' + side + ':photo" aria-pressed="' + (mode === "photo") + '">Keep as a photo</button></div>';
    if (mode === "cartoon" && F.toons.enabled()) {
      var info = toonInfo();
      if (cv[side + "Busy"]) out += '<span class="toon-status busy" role="status">Drawing your cartoon… about 20 seconds</span>';
      else {
        if (cv[side + "Err"]) out += '<span class="toon-status" role="alert">' + esc(cv[side + "Err"]) + "</span>";
        if (cv[side + "Toon"]) out += '<div class="slot-actions"><span class="toon-status">Cartoon ready</span>' + (cv[side + "Photo"] && (info.paid || info.redosLeft == null || info.redosLeft > 0) ? '<button type="button" class="linkish" data-cover-toon="' + side + '">Draw it again</button>' : "") + "</div>";
        else if (!info.paid && info.freeLeft <= 0) out += '<span class="toon-status">Drawn after you order</span>';
        else out += (state.toonConsent ? "" : '<label class="check"><input type="checkbox" id="pv-ok"><span>I have permission to use the photos of everyone shown.</span></label>') +
          '<div class="slot-actions"><button type="button" class="btn btn-sm btn-toon" data-cover-toon="' + side + '">See it as a cartoon (free)</button></div>';
      }
    } else if (mode === "photo") out += '<p class="hint">We\'ll print your photo as it is, without turning it into a cartoon.</p>';
    return out;
  }
  function makeCoverToon(side) {
    var cv = state.cover, slot = "cover-" + side, box = $("#pv-ok");
    if (!state.toonConsent && (!box || !box.checked)) { cv[side + "Err"] = "Please tick the permission box first."; render(); return; }
    state.toonConsent = true; cv[side + "Busy"] = true; cv[side + "Err"] = ""; render();
    var d;
    F.toons.draft(state.book, state.style, true).then(function (dd) {
      d = dd;
      return cv[side + "Up"] || !cv[side + "File"] ? null : F.toons.upload(d, slot, cv[side + "File"]).then(function () { cv[side + "Up"] = true; });
    }).then(function () { return F.toons.make(d, slot, state.style); })
      .then(function (j) { applyInfo(j); return F.toons.image(d, slot); })
      .then(function (url) { cv[side + "Toon"] = url; cv[side + "Busy"] = false; if (state.step === 3) render(); else save(); })
      .catch(function (e) {
        cv[side + "Busy"] = false; cv[side + "Err"] = e.message;
        if (e.status === 402) state.toonInfo = Object.assign({}, toonInfo(), { freeLeft: 0, redosLeft: 0 });
        if (e.status === 403 || e.status === 404) { F.toons.forget(state.book); cv[side + "Up"] = false; }
        if (state.step === 3) render(); else save();
      });
  }

  function coverHTML(side) {
    var col = coverColour(), cv = state.cover, accent = col === "sun" ? "red" : "sun";
    var cls = "bcover " + side + (col === "sun" ? " light" : "");
    if (side === "front") {
      var art = coverArt("front", accent, "girl");
      return '<div class="' + cls + '" style="--cc:var(--' + col + ')"><span class="k">' + esc(F.books[state.book].name) + "</span>" + art + '<span class="t">' + esc(coverTitle()) + "</span></div>";
    }
    var body = cv.backMode === "photo"
      ? coverArt("back", accent, "granny")
      : '<span class="pattern" aria-hidden="true"></span>';
    return '<div class="' + cls + (cv.backMode === "pattern" ? " patterned" : "") + '" style="--cc:var(--' + col + ')">' + body +
      (cv.backMessage ? '<span class="msg">' + esc(cv.backMessage) + "</span>" : "") +
      '<span class="brand"><span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Family Board Books<small>familyboardbooks.com</small></span></div>';
  }

  function coverUpload(side, label) {
    var has = state.cover[side + "Photo"] || state.cover[side + "Toon"];
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
      '<div class="field"><span class="flabel">Front picture</span><p class="hint">A family photo works well. Turn it into a cartoon like the other pages, or keep it as a photo.</p>' + coverUpload("front", "Add front photo") + coverChoice("front") + "</div>" +
      '<div class="field"><span class="flabel">Back cover</span><div class="seg" role="group" aria-label="Back cover design"><button type="button" data-back-mode="photo" aria-pressed="' + (cv.backMode === "photo") + '">Photo and message</button><button type="button" data-back-mode="pattern" aria-pressed="' + (cv.backMode === "pattern") + '">Pattern and message</button></div>' +
      (cv.backMode === "photo" ? coverUpload("back", "Add back photo") + coverChoice("back") : "") + "</div>" +
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
    if (F.shop && F.shop.enabled()) {
      return '<section class="panel"><h2>Order your book</h2>' +
        '<p class="notice">' + (F.toons.enabled() ? "Your photos upload securely when you continue, then you\'ll go to our secure checkout to pay. After you order, you\'ll get a private link to see every page as a cartoon, ask for changes and approve your book before we print." : "Next you\'ll go to our secure checkout to pay. After you order, we\'ll email you a private link to upload your photos, then send you a cartoon proof of every page to approve before we print.") + "</p>" +
        '<form class="form" id="checkout" novalidate>' +
        '<label class="check"><input type="checkbox" id="r-ok" name="consent"><span>I have permission to use the photos of everyone in my book.</span></label>' +
        '<label class="check"><input type="checkbox" id="r-keep" name="keepFiles"><span><strong>Keep my cartoons and print file in my account</strong> so I can reorder or make another book later. Optional. If you leave this unticked, we delete them 30 days after delivery. Your original photos are always deleted once your book is printed.</span></label>' +
        '<p class="form-msg" role="status"></p><div class="panel-nav"><button type="button" class="btn ghost" data-nav="-1">Back</button><button type="submit" class="btn red">Continue to secure checkout</button></div></form></section>';
    }
    return '<section class="panel"><h2>Reserve your book</h2>' +
      '<p class="notice">Ordering opens soon. Reserve your book now: no payment is taken today, and you\'ll get ' + F.config.foundingDiscount + "% off as a founding family.</p>" +
      '<form class="form" id="reserve" novalidate><div class="row2"><div class="field"><label for="r-name">Your name</label><input type="text" id="r-name" name="name" autocomplete="name"></div>' +
      '<div class="field"><label for="r-email">Email</label><input type="email" id="r-email" name="email" autocomplete="email" placeholder="name@example.com" required></div></div>' +
      '<label class="check"><input type="checkbox" id="r-ok" name="consent"><span>I have permission to use the photos of everyone in my book.</span></label>' +
      '<label class="check"><input type="checkbox" id="r-keep" name="keepFiles"><span><strong>Keep my cartoons and print file in my account</strong> so I can reorder or make another book later. Optional. If you leave this unticked, we delete them 30 days after delivery. Your original photos are always deleted once your book is printed.</span></label>' +
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
    else if (t.dataset.coverClear) {
      var cs = t.dataset.coverClear, cd = F.toons.enabled() && F.toons.saved(state.book);
      if (state.cover[cs + "Up"] && cd) F.toons.removePhoto(cd, "cover-" + cs).catch(function () {});
      state.cover[cs + "Photo"] = ""; state.cover[cs + "File"] = null; state.cover[cs + "Toon"] = ""; state.cover[cs + "Up"] = false; state.cover[cs + "Err"] = ""; render();
    }
    else if (t.dataset.coverMode) { var cm = t.dataset.coverMode.split(":"); state.cover[cm[0] + "Pic"] = cm[1]; render('[data-cover-mode="' + t.dataset.coverMode + '"]'); }
    else if (t.dataset.coverToon) { makeCoverToon(t.dataset.coverToon); }
    else if (t.dataset.book) { setBook(t.dataset.book); state.toonInfo = null; render('[data-book="' + t.dataset.book + '"]'); restoreToons(); }
    else if (t.dataset.edition) { state.edition = t.dataset.edition; render('[data-edition="' + t.dataset.edition + '"]'); }
    else if (t.dataset.style) { state.style = t.dataset.style; render('[data-style="' + t.dataset.style + '"]'); }
    else if (t.dataset.copies) { state.copies = Math.max(0, Math.min(10, state.copies + Number(t.dataset.copies))); render('[data-copies="' + t.dataset.copies + '"]'); }
    else if (t.dataset.page) { state.current = Number(t.dataset.page); render('[data-page="' + state.current + '"]'); }
    else if (t.dataset.move) { state.current = Math.max(0, Math.min(state.pages.length - 1, state.current + Number(t.dataset.move))); render('[data-move="' + t.dataset.move + '"]'); }
    else if (t.dataset.remove) {
      var ri = Number(t.dataset.remove), it = state.pages[state.current].items[ri], rd = F.toons.enabled() && F.toons.saved(state.book);
      if (it.up && rd) F.toons.removePhoto(rd, "p" + state.current + "-" + ri).catch(function () {});
      it.photo = ""; it.file = null; it.toon = ""; it.up = false; it.toonErr = ""; render();
    }
    else if (t.dataset.toon != null) { makeToon(state.current, Number(t.dataset.toon)); }
    else if (t.hasAttribute("data-draw-all")) { drawAll(); }
    else if (t.dataset.pickOpen != null) { state.picking = state.picking === Number(t.dataset.pickOpen) ? null : Number(t.dataset.pickOpen); render(); }
    else if (t.dataset.pick) { var pk = t.dataset.pick.split(":"); placeFromTray(state.current, Number(pk[0]), Number(pk[1])); state.picking = null; render(); }
    else if (t.dataset.trayRemove != null) { var tr = state.tray.splice(Number(t.dataset.trayRemove), 1)[0]; if (tr) URL.revokeObjectURL(tr.url); render(); }
    else if (t.hasAttribute("data-tray-fill")) {
      var spots = emptySpots(), n = 0;
      while (state.tray.length && n < spots.length) { placeFromTray(spots[n][0], spots[n][1], 0); n++; }
      state.current = spots.length ? spots[0][0] : state.current;
      render();
    }
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
      state.cover[t.dataset.coverPhoto + "File"] = t.files[0];
      ["Toon", "Up", "Err"].forEach(function (k) { state.cover[t.dataset.coverPhoto + k] = k === "Up" ? false : ""; });
      render();
    } else if (t.hasAttribute("data-tray") && t.files && t.files.length) {
      Array.prototype.forEach.call(t.files, function (f) { if (/^image\//.test(f.type) || /\.(heic|jpe?g|png|webp)$/i.test(f.name)) state.tray.push({ file: f, url: URL.createObjectURL(f) }); });
      t.value = ""; render();
    } else if (t.dataset.photo != null && t.files && t.files[0]) {
      var it = state.pages[state.current].items[Number(t.dataset.photo)];
      it.photo = URL.createObjectURL(t.files[0]);
      it.file = t.files[0]; it.toon = ""; it.up = false; it.toonErr = "";
      if (it.example) { it.text = ""; it.example = false; }
      render();
    } else if (t.dataset.k === "language" || t.dataset.k === "language2") {
      state[t.dataset.k] = t.value;
      if (state.language2 === state.language) state.language2 = "";
      state.bilingual = !!state.language2;
      render("#" + t.id);
    }
    else if (t.id === "pv-ok") { state.toonConsent = t.checked; save(); }
    else if (t.dataset.k === "giftbox") { state.giftbox = t.checked; render("#" + t.id); }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.id !== "checkout") return;
    e.preventDefault();
    var form = e.target, msg = $(".form-msg", form), btn = $("button[type=submit]", form);
    if (!$("#r-ok").checked) { msg.textContent = "Please confirm you have permission to use these photos."; return; }
    var order = {
      book: state.book, edition: state.edition, copies: state.copies, bilingual: state.bilingual, giftbox: state.giftbox,
      details: {
        "Cover title": coverTitle(), "Art style": styleName(),
        "Language": state.bilingual ? state.language + " + " + state.language2 : state.language,
        "Cover pictures": (state.cover.frontPic === "photo" ? "front as photo" : "front as cartoon") + (state.cover.backMode === "photo" ? (state.cover.backPic === "photo" ? ", back as photo" : ", back as cartoon") : ", back pattern"),
        "Cover colour": coverColour(), "Back cover": state.cover.backMode === "photo" ? "Photo and message" : "Pattern and message",
        "Back message": state.cover.backMessage,
        "Keep files in account": $("#r-keep").checked ? "Yes" : "No"
      },
      hidden: { "_Dedication": state.dedication }
    };
    state.pages.forEach(function (p, i) {
      var words = p.items.map(function (it) { return it.text; }).filter(Boolean).join(", ");
      var head = p.heading || ("Page " + (i + 1));
      if (words || (p.editable && p.heading)) order.hidden["_Page " + String(i + 1).padStart(2, "0") + " " + head] = words || head;
    });
    btn.disabled = true; msg.textContent = "Taking you to checkout…";
    (F.toons.enabled() ? uploadAll(msg).then(function (d) {
      order.cartAttributes = { _draft: d.id, "Your book link": F.toons.proofLink(d) };
    }) : Promise.resolve()).then(function () {
      msg.textContent = "Taking you to checkout…";
      return F.shop.checkout(order);
    }).then(function (url) { location.href = url; }).catch(function (err) {
      btn.disabled = false;
      msg.textContent = "Sorry, checkout didn't open (" + err.message + "). Please try again, or email hello@familyboardbooks.com.";
    });
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
      keepFiles: $("#r-keep").checked ? "yes, keep in account" : "no, delete 30 days after delivery",
      total: cur + pl.total, cover: coverTitle(), dedication: state.dedication,
      coverColour: coverColour(), frontCover: state.cover.frontPhoto ? "own photo" : "our illustration",
      backCover: state.cover.backMode === "photo" ? (state.cover.backPhoto ? "own photo" : "our illustration") : "pattern",
      backMessage: state.cover.backMessage,
      pages: state.pages.map(function (p) { return (p.heading || "") + ": " + p.items.map(function (it) { return it.text + (it.photo ? " [photo]" : ""); }).filter(Boolean).join(", "); }).join(" | ")
    };
    F.send(payload).then(function (sent) {
      if (!sent) { msg.textContent = "Sorry, that didn't go through. Please try again, or email hello@familyboardbooks.com."; return; }
      state.done = true; render(); scrollTop();
    });
  });

  function scrollTop() { var el = $(".creator"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }

  render();
  restoreToons();
})();
