/* Family Board Books: talks to our photo and cartoon service (see /worker).
   Photos are resized in the browser first, which also strips hidden data such as GPS location. */
(function () {
  "use strict";
  var F = window.FBB, API = (testApi() || F.config.api || "").replace(/\/+$/, "");
  // For testing before launch: localStorage "fbb-api" can point this browser at a test service.
  function testApi() { try { return localStorage.getItem("fbb-api"); } catch (e) { return ""; } }
  var T = F.toons = {};

  T.enabled = function () { return !!API; };

  function key(book) { return "fbb-toon-" + book; }
  T.saved = function (book) {
    try { var d = JSON.parse(localStorage.getItem(key(book)) || "null"); return d && d.id && d.token ? d : null; } catch (e) { return null; }
  };
  T.forget = function (book) { try { localStorage.removeItem(key(book)); } catch (e) {} };

  function req(method, path, draft, body, type) {
    var h = {};
    if (draft) h.Authorization = "Bearer " + draft.token;
    if (body !== undefined && !(body instanceof Blob)) { h["Content-Type"] = "application/json"; body = JSON.stringify(body); }
    else if (body instanceof Blob) h["Content-Type"] = type || body.type;
    return fetch(API + path, { method: method, headers: h, body: body }).then(function (r) {
      var isJson = (r.headers.get("Content-Type") || "").indexOf("json") >= 0;
      if (!r.ok) return (isJson ? r.json() : Promise.resolve({})).then(function (j) { var e = new Error(j.error || "Something went wrong. Please try again."); e.status = r.status; throw e; });
      return isJson ? r.json() : r.blob();
    });
  }

  // A draft is one book in progress on our service. The id and secret stay in this browser.
  T.draft = function (book, style, consent) {
    var d = T.saved(book);
    if (d) return Promise.resolve(d);
    return req("POST", "/api/drafts", null, { book: book, style: style, consent: !!consent }).then(function (j) {
      var nd = { id: j.id, token: j.token };
      try { localStorage.setItem(key(book), JSON.stringify(nd)); } catch (e) {}
      return nd;
    });
  };
  T.status = function (d) { return req("GET", "/api/drafts/" + d.id, d); };
  T.update = function (d, data) { return req("PATCH", "/api/drafts/" + d.id, d, data); };
  T.destroy = function (d, book) { return req("DELETE", "/api/drafts/" + d.id, d).then(function (j) { if (book) T.forget(book); return j; }); };

  // Shrink to at most 1600px and re-encode as JPEG: smaller uploads, no EXIF or location data.
  T.prepare = function (file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1600, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("We couldn't read that photo.")); }, "image/jpeg", 0.9);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("We couldn't read that photo. Please try a JPG or PNG.")); };
      img.src = url;
    });
  };
  T.upload = function (d, slot, file) {
    return T.prepare(file).then(function (blob) { return req("PUT", "/api/drafts/" + d.id + "/photos/" + slot, d, blob, "image/jpeg"); });
  };
  T.removePhoto = function (d, slot) { return req("DELETE", "/api/drafts/" + d.id + "/photos/" + slot, d); };
  T.make = function (d, slot, style) { return req("POST", "/api/drafts/" + d.id + "/cartoons/" + slot, d, { style: style }); };
  T.image = function (d, slot) {
    return req("GET", "/api/drafts/" + d.id + "/cartoons/" + slot, d).then(function (b) { return URL.createObjectURL(b); });
  };
  T.proofLink = function (d) { return "https://www.familyboardbooks.com/proof.html?d=" + d.id + "#" + d.token; };
})();
