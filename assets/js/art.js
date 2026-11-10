/* Family Board Books: illustrations drawn in code.
   portrait(), bookPage() and glyph() return SVG/HTML strings. */
window.FBB = window.FBB || {};
(function () {
  "use strict";
  var uid = 0;
  function nextId() { uid += 1; return "fb" + uid; }

  // Colour names map to CSS custom properties, so art follows the theme.
  function c(name) { return "var(--" + name + ")"; }

  var CHARS = {
    grandpa: { skin: "#E8B894", hair: "bald", hairColor: "#ECE9E4", glasses: "sun", shirt: "#2B3A67", age: "old" },
    granny: { skin: "#F1C7A5", hair: "bun", hairColor: "#DAD6D2", glasses: "round", shirt: "#C2416B", age: "old" },
    mum: { skin: "#C98B5E", hair: "long", hairColor: "#2B1B12", shirt: "#1FA855" },
    dad: { skin: "#8D5A3B", hair: "short", hairColor: "#1B120D", beard: true, shirt: "#1A8FD0" },
    girl: { skin: "#D9A27A", hair: "pigtails", hairColor: "#3A2416", shirt: "#E8452A", age: "child" },
    boy: { skin: "#F2CBA8", hair: "short", hairColor: "#C9822F", shirt: "#F5B700", age: "child" },
    baby: { skin: "#E6B48E", hair: "baby", hairColor: "#5A3A22", shirt: "#8FCDEF", age: "baby" },
    auntie: { skin: "#6E4630", hair: "curly", hairColor: "#1A110C", glasses: "round", shirt: "#7E3BCB" },
    uncle: { skin: "#E3B08A", hair: "short", hairColor: "#6B4A2E", glasses: "round", shirt: "#E8452A", beard: true }
  };
  FBB.chars = CHARS;

  // Small deterministic random so drawings look the same on every load.
  function rng(seed) {
    var s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function hash(str) { var h = 7; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100000; return h + 11; }

  function blob(cx, cy, r, jag, n, rand) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var rr = r * (1 - jag / 2 + rand() * jag);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    for (var j = 0; j < n; j++) {
      var p1 = pts[(j + 1) % n], p0 = pts[j];
      var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      d += " Q" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " " + mx.toFixed(1) + " " + my.toFixed(1);
    }
    return d + "Z";
  }

  function splash(colour, seed) {
    var r = rng(seed), out = "";
    out += '<path d="' + blob(96, 104, 74, 0.5, 16, r) + '" fill="' + c("splash-dark") + '" transform="translate(-10 6) rotate(-8 100 100)"/>';
    out += '<path d="' + blob(104, 98, 76, 0.45, 18, r) + '" fill="' + colour + '"/>';
    for (var i = 0; i < 9; i++) {
      var a = r() * Math.PI * 2, d = 82 + r() * 22;
      out += '<circle cx="' + (100 + Math.cos(a) * d).toFixed(1) + '" cy="' + (100 + Math.sin(a) * d).toFixed(1) + '" r="' + (2 + r() * 5).toFixed(1) + '" fill="' + (i % 3 ? colour : c("splash-dark")) + '"/>';
    }
    out += '<path d="M150 150 q4 18 0 30 q-3 6 -6 0 q-3 -12 1 -30z" fill="' + colour + '"/>';
    out += '<path d="M44 140 q-2 14 -10 22 q-5 3 -4 -4 q4 -10 8 -20z" fill="' + c("splash-dark") + '"/>';
    return out;
  }

  function hairBack(k) {
    var col = k.hairColor;
    if (k.hair === "long") return '<path d="M58 96 C52 48 80 40 100 40 C124 40 150 50 142 100 L148 156 L52 156 Z" fill="' + col + '"/>';
    if (k.hair === "curly") {
      var s = "";
      [[62, 70], [70, 50], [88, 40], [110, 38], [130, 48], [140, 68], [146, 92], [56, 94], [60, 118], [142, 118]].forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="17" fill="' + col + '"/>'; });
      return s;
    }
    if (k.hair === "pigtails") return '<circle cx="56" cy="104" r="15" fill="' + col + '"/><circle cx="144" cy="104" r="15" fill="' + col + '"/>';
    if (k.hair === "bun") return '<circle cx="100" cy="46" r="17" fill="' + col + '"/>';
    return "";
  }

  function hairFront(k) {
    var col = k.hairColor;
    switch (k.hair) {
      case "short": return '<path d="M63 92 C60 56 82 46 100 46 C122 46 141 58 137 92 C130 72 114 64 100 64 C84 64 70 72 63 92Z" fill="' + col + '"/>';
      case "long": return '<path d="M64 88 C64 56 84 48 100 48 C120 48 138 58 136 88 C124 74 108 60 98 60 C88 70 76 80 64 88Z" fill="' + col + '"/>';
      case "pigtails": return '<path d="M64 90 C62 56 84 48 100 48 C120 48 140 58 136 90 C126 70 112 62 100 66 C88 62 72 72 64 90Z" fill="' + col + '"/>';
      case "bun": return '<path d="M64 88 C64 58 84 54 100 54 C120 54 138 60 136 88 C126 70 112 66 100 66 C88 66 72 72 64 88Z" fill="' + col + '"/>';
      case "curly": return '<path d="M66 84 C70 60 86 54 100 56 C118 56 132 64 134 84 C122 72 110 68 100 70 C88 68 76 74 66 84Z" fill="' + col + '"/>';
      case "bald": return '<ellipse cx="66" cy="84" rx="8" ry="13" fill="' + col + '"/><ellipse cx="134" cy="84" rx="8" ry="13" fill="' + col + '"/><path d="M78 58 Q100 48 122 58" stroke="' + col + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
      case "baby": return '<path d="M98 52 q10 -10 14 2 q-4 -4 -8 2" stroke="' + col + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    }
    return "";
  }

  function figure(key, opts) {
    var k = CHARS[key] || CHARS.girl;
    var line = opts.outline ? ' stroke="#1E1A33" stroke-width="3" stroke-linejoin="round"' : "";
    var scale = k.age === "child" ? 0.9 : k.age === "baby" ? 0.82 : 1;
    var g = '<g transform="translate(' + (100 - 100 * scale) + ' ' + (200 - 200 * scale) + ') scale(' + scale + ')"' + line + ">";
    g += '<path d="M38 204 C40 156 70 142 100 142 C130 142 160 156 162 204 Z" fill="' + k.shirt + '"/>';
    g += '<rect x="88" y="120" width="24" height="28" rx="9" fill="' + k.skin + '"/>';
    g += hairBack(k);
    g += '<circle cx="64" cy="98" r="8" fill="' + k.skin + '"/><circle cx="136" cy="98" r="8" fill="' + k.skin + '"/>';
    g += '<ellipse cx="100" cy="94" rx="37" ry="40" fill="' + k.skin + '"/>';
    if (k.beard) g += '<path d="M66 100 C68 132 86 138 100 138 C114 138 132 132 134 100 C126 118 116 122 100 122 C84 122 74 118 66 100Z" fill="' + k.hairColor + '"/>';
    g += hairFront(k);
    g += "</g>";
    // Face details without outline stroke.
    var f = '<g transform="translate(' + (100 - 100 * scale) + ' ' + (200 - 200 * scale) + ') scale(' + scale + ')">';
    f += '<circle cx="80" cy="110" r="6" fill="#FF7B7B" opacity=".35"/><circle cx="120" cy="110" r="6" fill="#FF7B7B" opacity=".35"/>';
    if (k.glasses === "sun") {
      f += '<rect x="70" y="86" width="25" height="16" rx="7" fill="#17C3A2" stroke="#1E1A33" stroke-width="3"/><rect x="105" y="86" width="25" height="16" rx="7" fill="#17C3A2" stroke="#1E1A33" stroke-width="3"/><path d="M95 92 h10" stroke="#1E1A33" stroke-width="3"/><path d="M75 90 l8 0" stroke="#fff" stroke-width="2" opacity=".7"/>';
    } else {
      f += '<circle cx="86" cy="96" r="4.2" fill="#1E1A33"/><circle cx="114" cy="96" r="4.2" fill="#1E1A33"/>';
      if (k.glasses === "round") f += '<circle cx="86" cy="96" r="11" fill="none" stroke="#1E1A33" stroke-width="2.5"/><circle cx="114" cy="96" r="11" fill="none" stroke="#1E1A33" stroke-width="2.5"/><path d="M97 96 h6" stroke="#1E1A33" stroke-width="2.5"/>';
    }
    f += '<path d="M89 113 Q100 123 111 113" stroke="#1E1A33" stroke-width="3" fill="none" stroke-linecap="round"/>';
    f += "</g>";
    return g + f;
  }

  /* portrait(charKey, style, colourName, seedText) -> <svg> */
  FBB.portrait = function (key, style, colour, seedText) {
    var id = nextId(), col = c(colour || "red"), seed = hash((seedText || key) + style);
    var bg = "", defs = "", clip = "", outline = false;
    if (style === "watercolour") {
      defs = '<filter id="' + id + 'w" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="' + (seed % 50) + '"/><feDisplacementMap in="SourceGraphic" scale="18"/><feGaussianBlur stdDeviation="2.2"/></filter>';
      bg = '<g filter="url(#' + id + 'w)" opacity=".85"><circle cx="92" cy="100" r="70" fill="' + col + '" opacity=".45"/><circle cx="118" cy="88" r="52" fill="' + col + '" opacity=".35"/><circle cx="84" cy="128" r="40" fill="' + c("sun") + '" opacity=".35"/></g>';
    } else if (style === "comic") {
      defs = '<pattern id="' + id + 'd" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="2.3" fill="#1E1A33" opacity=".22"/></pattern><clipPath id="' + id + 'c"><circle cx="100" cy="100" r="88"/></clipPath>';
      bg = '<circle cx="100" cy="100" r="88" fill="' + col + '"/><circle cx="100" cy="100" r="88" fill="url(#' + id + 'd)"/>';
      clip = ' clip-path="url(#' + id + 'c)"';
      outline = true;
    } else if (style === "storybook") {
      defs = '<clipPath id="' + id + 'c"><rect x="14" y="14" width="172" height="172" rx="34"/></clipPath>';
      bg = '<rect x="14" y="14" width="172" height="172" rx="34" fill="' + col + '" opacity=".22"/>';
      clip = ' clip-path="url(#' + id + 'c)"';
    } else {
      bg = splash(col, seed);
    }
    var over = "";
    if (style === "comic") over = '<circle cx="100" cy="100" r="88" fill="none" stroke="#1E1A33" stroke-width="5"/>';
    if (style === "storybook") over = '<rect x="22" y="22" width="156" height="156" rx="28" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-dasharray="6 6"/>';
    return '<svg class="portrait" viewBox="0 0 200 200" role="img" aria-label="Cartoon portrait" xmlns="http://www.w3.org/2000/svg"><defs>' + defs + "</defs>" + bg + "<g" + clip + ">" + figure(key, { outline: outline }) + "</g>" + over + "</svg>";
  };

  /* photoPortrait: a customer's own photo shown in the chosen style frame. */
  FBB.photoPortrait = function (url, style, colour, seedText) {
    var id = nextId(), col = c(colour || "red"), seed = hash((seedText || "p") + style);
    var back = "", shape = '<circle cx="100" cy="100" r="66"/>', over = "";
    if (style === "comic") { back = '<circle cx="100" cy="100" r="88" fill="' + col + '"/>'; shape = '<circle cx="100" cy="100" r="80"/>'; over = '<circle cx="100" cy="100" r="80" fill="none" stroke="#1E1A33" stroke-width="5"/>'; }
    else if (style === "storybook") { back = '<rect x="14" y="14" width="172" height="172" rx="34" fill="' + col + '" opacity=".22"/>'; shape = '<rect x="26" y="26" width="148" height="148" rx="26"/>'; over = '<rect x="22" y="22" width="156" height="156" rx="28" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-dasharray="6 6"/>'; }
    else if (style === "watercolour") { back = '<circle cx="92" cy="100" r="80" fill="' + col + '" opacity=".35"/><circle cx="118" cy="90" r="60" fill="' + c("sun") + '" opacity=".3"/>'; }
    else { back = splash(col, seed); }
    return '<svg class="portrait" viewBox="0 0 200 200" role="img" aria-label="Your photo" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="' + id + '">' + shape + '</clipPath></defs>' + back + '<image href="' + url + '" x="0" y="0" width="200" height="200" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + id + ')" class="photo-fx"/>' + over + "</svg>";
  };

  FBB.emptyPortrait = function (colour) {
    return '<svg class="portrait empty" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="70" fill="none" stroke="' + c(colour || "red") + '" stroke-width="3" stroke-dasharray="8 8"/><path d="M100 78 v44 M78 100 h44" stroke="' + c(colour || "red") + '" stroke-width="5" stroke-linecap="round"/></svg>';
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }
  FBB.esc = esc;

  /* bookPage({heading, color, items:[{c|photo|empty, t}], style, size}) -> HTML */
  FBB.bookPage = function (p) {
    var style = p.style || "splash", items = p.items || [];
    var long = p.heading && p.heading.length > 3;
    var html = '<div class="bpage n' + Math.max(1, Math.min(items.length, 3)) + (long ? " long" : "") + '" style="--pc:' + c(p.color || "red") + '">';
    html += '<div class="bpage-h">' + esc(p.heading) + "</div>";
    html += '<div class="bpage-items">';
    items.slice(0, 3).forEach(function (it, i) {
      var art = it.cartoon ? '<img class="portrait toon" src="' + it.cartoon + '" alt="Cartoon portrait">'
        : it.photo ? FBB.photoPortrait(it.photo, style, p.color, p.heading + i)
        : it.c ? FBB.portrait(it.c, style, p.color, p.heading + i)
        : FBB.emptyPortrait(p.color);
      html += '<figure class="bpage-item">' + art + (it.t ? "<figcaption>" + esc(it.t) + "</figcaption>" : "") + "</figure>";
    });
    html += "</div></div>";
    return html;
  };

  /* glyph(type, colour) -> HTML for theme cards */
  FBB.glyph = function (g) {
    switch (g) {
      case "dots": return '<span class="g-dots"><i style="background:var(--red)"></i><i style="background:var(--sun)"></i><i style="background:var(--sky)"></i></span>';
      case "face": return '<svg class="g-svg" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="var(--card-ink)"/><circle cx="36" cy="42" r="6" fill="var(--card-bg)"/><circle cx="64" cy="42" r="6" fill="var(--card-bg)"/><path d="M30 60 Q50 80 70 60" stroke="var(--card-bg)" stroke-width="7" fill="none" stroke-linecap="round"/></svg>';
      case "heart": return '<svg class="g-svg" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 84 C20 62 10 46 14 32 C18 18 38 14 50 30 C62 14 82 18 86 32 C90 46 80 62 50 84Z" fill="var(--card-ink)"/></svg>';
      case "quote": return '<span class="g-text g-quote">“”</span>';
      case "sun": return '<svg class="g-svg" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="20" fill="var(--card-ink)"/><g stroke="var(--card-ink)" stroke-width="7" stroke-linecap="round"><path d="M50 12v12M50 76v12M12 50h12M76 50h12M23 23l8 8M69 69l8 8M77 23l-8 8M31 69l-8 8"/></g></svg>';
      default: return '<span class="g-text">' + esc(g) + "</span>";
    }
  };

  /* Pick a stand-in illustration for an example word with no photo yet. */
  FBB.guessChar = function (word, i) {
    var w = (word || "").toLowerCase();
    if (/grandpa|grandad|granddad|abuelo|avi|papi|thatha/.test(w)) return "grandpa";
    if (/granny|grandma|nana|abuela|avia|paati|nonna/.test(w)) return "granny";
    if (/mum|mom|mama|mummy|mamá|mare/.test(w)) return "mum";
    if (/dad|papa|daddy|papá|pare/.test(w)) return "dad";
    if (/baby|bebé|nadó/.test(w)) return "baby";
    if (/aunt|tía|tia/.test(w)) return "auntie";
    if (/uncle|tío|tio/.test(w)) return "uncle";
    return ["girl", "boy", "auntie", "uncle"][i % 4];
  };
})();
