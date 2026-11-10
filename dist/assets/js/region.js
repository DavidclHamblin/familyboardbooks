/* Family Board Books: shipping region (Europe in euros, or the UK in pounds).
   The choice is remembered in this browser and can be set with ?region=uk or ?region=eu. */
(function () {
  "use strict";
  var F = window.FBB, KEY = "fbb-region";

  function pick() {
    var r = null;
    try { r = new URLSearchParams(location.search).get("region"); } catch (e) {}
    if (r && F.regions[r]) { save(r); return r; }
    try { r = localStorage.getItem(KEY); } catch (e) {}
    if (r && F.regions[r]) return r;
    // First visit: UK English browsers start on the UK, everyone else on Europe.
    return /^en-GB/i.test(navigator.language || "") ? "uk" : "eu";
  }
  function save(r) { try { localStorage.setItem(KEY, r); } catch (e) {} }

  F.region = pick();
  F.regionInfo = function () { return F.regions[F.region]; };

  // Every price in the catalogue is stored in euros; UK prices come from the fixed £ table.
  F.amount = function (eur) {
    if (F.region !== "uk") return eur;
    var p = F.gbp[eur];
    return p != null ? p : Math.round(eur * 0.86);
  };
  F.money = function (eur) { return F.regionInfo().currency + F.amount(eur); };

  function apply() {
    document.documentElement.setAttribute("data-region", F.region);
    Array.prototype.forEach.call(document.querySelectorAll(".money[data-eur]"), function (el) {
      el.textContent = F.money(Number(el.getAttribute("data-eur")));
    });
    Array.prototype.forEach.call(document.querySelectorAll("select.region-select"), function (sel) {
      sel.value = F.region;
      sel.addEventListener("change", function () {
        save(sel.value);
        location.reload();
      });
    });
    var info = F.regionInfo(), bar = document.getElementById("region-bar");
    if (bar) {
      bar.hidden = !info.notice;
      bar.textContent = info.notice || "";
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply); else apply();
})();
