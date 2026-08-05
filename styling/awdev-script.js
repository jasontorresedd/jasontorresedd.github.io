// Start — TL;DR viewer (native <dialog>, mirrors bd-script.js's PDF viewer) //
(function () {
  "use strict";

  const openBtn = document.getElementById("tldr-open");
  const viewer = document.getElementById("tldr-viewer");
  if (!openBtn || !viewer) return;

  const closeBtn = document.getElementById("tldr-close");

  openBtn.addEventListener("click", () => viewer.showModal());
  closeBtn.addEventListener("click", () => viewer.close());

  // Click on the backdrop (outside the card) closes the viewer
  viewer.addEventListener("click", (e) => {
    if (e.target === viewer) viewer.close();
  });
})();
// End — TL;DR viewer //

// Start — Reading progress gauge //
(function () {
  "use strict";

  const perch = document.getElementById("progress-perch");
  const gauge = document.getElementById("reading-progress");
  const fill = document.getElementById("reading-progress-fill");
  const pct = document.getElementById("reading-progress-pct");
  if (!perch || !gauge || !fill || !pct) return;

  const REVEAL_AT = 24; // px scrolled before the gauge fades in

  let ticking = false;

  function update() {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const scrolled = scrollable > 0 ? (doc.scrollTop / scrollable) * 100 : 0;
    const value = Math.min(100, Math.max(0, Math.round(scrolled)));

    fill.style.width = value + "%";
    gauge.setAttribute("aria-valuenow", value);
    pct.textContent = value + "%";
    perch.classList.toggle("is-visible", doc.scrollTop > REVEAL_AT);
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();
// End — Reading progress gauge //
