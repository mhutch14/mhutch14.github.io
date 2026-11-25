/* Light / dark / auto switch, shared by every page.
   Load it in <head> (not deferred) so the saved theme applies before the page paints:
     <script src="/assets/theme.js?v=N"></script>
   It sets data-theme="light"|"dark" on <html> (nothing = follow the device),
   and adds a toggle button to the end of .site-nav. */
(function () {
  var KEY = "site-theme";
  var ORDER = ["auto", "light", "dark"];
  var LABEL = { auto: "Auto", light: "Light", dark: "Dark" };
  var ICON = {
    auto: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 1.8v2.1M10 16.1v2.1M1.8 10h2.1M16.1 10h2.1M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5"/></g></svg>',
    dark: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  };

  function get() { try { var v = localStorage.getItem(KEY); return ORDER.indexOf(v) >= 0 ? v : "auto"; } catch (e) { return "auto"; } }
  function apply(mode) {
    var root = document.documentElement;
    if (mode === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
  }
  apply(get());

  function addToggle() {
    var nav = document.querySelector(".site-nav");
    if (!nav || nav.querySelector(".theme-toggle")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    function paint() {
      var m = get(), next = ORDER[(ORDER.indexOf(m) + 1) % ORDER.length];
      btn.innerHTML = ICON[m] + "<span>" + LABEL[m] + "</span>";
      btn.setAttribute("aria-label", "Theme: " + LABEL[m] + ". Switch to " + LABEL[next] + ".");
      btn.title = "Theme: " + LABEL[m] + " (click for " + LABEL[next] + ")";
    }
    btn.addEventListener("click", function () {
      var m = get(), next = ORDER[(ORDER.indexOf(m) + 1) % ORDER.length];
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next); paint();
    });
    paint();
    var links = nav.querySelector(".links");
    (links || nav).appendChild(btn);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addToggle); else addToggle();

  // keep other open tabs in step
  window.addEventListener("storage", function (e) { if (e.key === KEY) apply(get()); });
})();
