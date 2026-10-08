// Start — Footer, smooth "Return to Top" //
const toTop = document.querySelector(".footer__gototop a");

toTop.addEventListener("click", (e) => {
  e.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
});
// End — Footer, smooth "Return to Top" //

// Start — PDF.js shared setup //
/* Both the pop-out viewer and the inline slide deck render through pdf.js, so the worker is configured once here regardless of which (if either) is present on a given template page.

   Guarded: pages with no PDF content (e.g., sec-col subpages) do not load the pdf.js <script>, so pdfjsLib is undefined there. Without this guard the line throws a ReferenceError and halts the rest of this file — including "Return to Top". */
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}
// End — PDF.js shared setup //

// Start — Pop-out PDF / Markdown viewer (native <dialog> + pdf.js) //
/* Guarded: only runs on template pages that include a #viewer dialog, since base-dot.js is shared across every sec-ep subpage. */
const viewer = document.getElementById("viewer");

if (viewer) {
  const pagesEl = document.getElementById("viewer-pages");
  const vCap = document.getElementById("viewer-caption");
  const copyBtn = document.getElementById("viewer-copy");
  let openToken = 0; // invalidates page rendering if viewer closes mid-load
  let mdRaw = ""; // raw Markdown for the copy button

  const resetCopy = () => {
    mdRaw = "";
    if (copyBtn) copyBtn.hidden = true;
  };

  const openPdf = async (url, caption) => {
    const token = ++openToken;
    resetCopy();
    vCap.textContent = caption || "Document";
    pagesEl.innerHTML = "<p class='viewer-status'>Loading&hellip;</p>";
    viewer.showModal();

    try {
      const doc = await pdfjsLib.getDocument(url).promise;
      if (token !== openToken) return; // viewer was closed/reopened
      pagesEl.innerHTML = "";

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        if (token !== openToken) return;

        /* Fit page to the viewer width; render at device pixel
         ratio so text stays sharp on high-DPI screens. */
        const containerWidth = pagesEl.clientWidth - 48;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / baseViewport.width;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = viewport.width / dpr + "px";

        pagesEl.appendChild(canvas);
        await page.render({
          canvasContext: canvas.getContext("2d"),
          viewport,
        }).promise;
      }
    } catch (err) {
      if (token !== openToken) return;
      pagesEl.innerHTML =
        "<p class='viewer-status'>This document could not be opened.<br>Check that the PDF exists at the linked path.</p>";
      console.error("PDF viewer:", err);
    }
  };

  /* Markdown highlighting. Styles are inline so bd-style.css stays untouched; colors are from the Azure palette and each passes WCAG AA (4.5:1) on #F2F7FF. */
  const MD_PRE_STYLE =
    "width: 100%; max-width: 900px; margin: 0; padding: 24px 28px; box-sizing: border-box; background: #F2F7FF; color: #1A1A1A; font-family: var(--font-mono); font-size: 0.875rem; line-height: 1.7; tab-size: 4; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 12px; box-shadow: 0 4px 16px rgba(14, 27, 61, 0.15); user-select: text;";
  const span = (style, text) => `<span style="${style}">${text}</span>`;
  const escapeHtml = (str) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const highlightInline = (text) =>
    text
      .replace(/`([^`]+)`/g, (m) =>
        span("color: #0D285E; background: #DBE5FA; border-radius: 4px; padding: 0 3px;", m))
      .replace(/\*\*([^*]+)\*\*/g, (m) => span("color: #0D285E; font-weight: 700;", m))
      .replace(/(^|[^*\w])(\*[^*\s][^*]*\*|_[^_\s][^_]*_)(?!\w)/g, (m, pre, em) =>
        pre + span("color: #59616F; font-style: italic;", em));

  const highlightMarkdown = (md) =>
    md
      .split("\n")
      .map((line) => {
        const esc = escapeHtml(line);
        const heading = esc.match(/^(#{1,6})(\s+)(.*)$/);
        if (heading) {
          return (
            span("color: #1E5FE0;", heading[1]) +
            heading[2] +
            span("color: #1646A6; font-weight: 700;", heading[3])
          );
        }
        const list = esc.match(/^(\s*)([-*+]|\d+\.)(\s+)(.*)$/);
        if (list) {
          return (
            list[1] + span("color: #1E5FE0;", list[2]) + list[3] + highlightInline(list[4])
          );
        }
        return highlightInline(esc);
      })
      .join("\n");

  const openMarkdown = async (url, caption) => {
    const token = ++openToken;
    resetCopy();
    vCap.textContent = caption || "Document";
    pagesEl.innerHTML = "<p class='viewer-status'>Loading&hellip;</p>";
    viewer.showModal();

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (token !== openToken) return; // viewer was closed/reopened

      /* A plain <pre> (no contenteditable): selectable and copyable, not editable */
      const pre = document.createElement("pre");
      pre.style.cssText = MD_PRE_STYLE;
      const code = document.createElement("code");
      code.innerHTML = highlightMarkdown(text.replace(/\s+$/, ""));
      pre.appendChild(code);

      pagesEl.innerHTML = "";
      pagesEl.appendChild(pre);
      mdRaw = text;
      if (copyBtn) copyBtn.hidden = false;
    } catch (err) {
      if (token !== openToken) return;
      pagesEl.innerHTML =
        "<p class='viewer-status'>This document could not be opened.<br>Check that the Markdown file exists at the linked path.</p>";
      console.error("Markdown viewer:", err);
    }
  };

  /* Intercept card clicks. Without JavaScript, the href still works as a plain link to the PDF/Markdown file (graceful fallback). */
  document.querySelectorAll('.card:not([target="_blank"])').forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      const href = card.getAttribute("href");
      if (/\.md$/i.test(href)) openMarkdown(href, card.dataset.caption);
      else openPdf(href, card.dataset.caption);
    });
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(mdRaw);
        copyBtn.textContent = "[ copied ]";
      } catch (err) {
        copyBtn.textContent = "[ select text to copy ]";
        console.error("Copy failed:", err);
      }
      setTimeout(() => (copyBtn.textContent = "[ copy ]"), 1800);
    });
  }

  document
    .getElementById("viewer-close")
    .addEventListener("click", () => viewer.close());

  /* Click on the backdrop (outside the pages) closes the viewer */
  viewer.addEventListener("click", (e) => {
    if (e.target === viewer) viewer.close();
  });

  /* Clear rendered pages on close to free memory */
  viewer.addEventListener("close", () => {
    openToken++;
    pagesEl.innerHTML = "";
    resetCopy();
  });
}
// End — Pop-out PDF / Markdown viewer //

// Start — Inline slide deck (canvas render, no native toolbar) //
// Guarded: only runs on template pages that include a #deck-embed, since base-dot.js is shared across every sec-ep subpage. //
const deckEmbed = document.getElementById("deck-embed");

if (deckEmbed) {
  const deckCanvas = document.getElementById("deck-canvas");
  const deckFrame = deckCanvas.parentElement;
  const deckPrevBtn = document.getElementById("deck-prev");
  const deckNextBtn = document.getElementById("deck-next");
  const deckPageIndicator = document.getElementById("deck-page-indicator");

  const deck = { doc: null, pageNum: 1, rendering: false, resizeTimer: null };

  const renderDeckPage = async (num) => {
    if (!deck.doc || deck.rendering) return;
    deck.rendering = true;

    const page = await deck.doc.getPage(num);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      deckFrame.clientWidth / baseViewport.width,
      deckFrame.clientHeight / baseViewport.height,
    );
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * dpr });

    deckCanvas.width = viewport.width;
    deckCanvas.height = viewport.height;
    deckCanvas.style.width = viewport.width / dpr + "px";
    deckCanvas.style.height = viewport.height / dpr + "px";

    await page.render({
      canvasContext: deckCanvas.getContext("2d"),
      viewport,
    }).promise;

    deck.pageNum = num;
    deckPageIndicator.textContent = num + " / " + deck.doc.numPages;
    deckPrevBtn.disabled = num <= 1;
    deckNextBtn.disabled = num >= deck.doc.numPages;
    deck.rendering = false;
  };

  const initDeck = async () => {
    try {
      deck.doc = await pdfjsLib.getDocument(deckEmbed.dataset.src).promise;
      await renderDeckPage(1);
    } catch (err) {
      deckPageIndicator.textContent = "";
      console.error("Slide deck embed:", err);
    }
  };

  deckPrevBtn.addEventListener("click", () => {
    if (deck.pageNum > 1) renderDeckPage(deck.pageNum - 1);
  });
  deckNextBtn.addEventListener("click", () => {
    if (deck.doc && deck.pageNum < deck.doc.numPages) {
      renderDeckPage(deck.pageNum + 1);
    }
  });

  /* Re-render the current page at the new frame size on resize
   (debounced) so the slide stays sharp across breakpoints. */
  window.addEventListener("resize", () => {
    clearTimeout(deck.resizeTimer);
    deck.resizeTimer = setTimeout(() => renderDeckPage(deck.pageNum), 150);
  });

  initDeck();
}
/* End — Inline slide deck */
