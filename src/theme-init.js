/**
 * Theme initialiser — loaded before Bootstrap CSS to prevent FOUC.
 * External file so CSP script-src 'self' permits execution (no inline).
 */
(function () {
  try {
    var saved = localStorage.getItem("theme");
    var os = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-bs-theme", saved || os);
  } catch (e) {
    document.documentElement.setAttribute("data-bs-theme", "light");
  }
})();
