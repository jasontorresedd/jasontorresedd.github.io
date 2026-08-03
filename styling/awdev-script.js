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
