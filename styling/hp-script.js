// Start – Navigation //
const burger = document.getElementById("burger");
const menu = document.getElementById("nav-menu");

if (burger && menu) {
  burger.addEventListener("click", () => {
    const open = burger.getAttribute("aria-expanded") === "true";
    burger.setAttribute("aria-expanded", String(!open));
  });

  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) burger.setAttribute("aria-expanded", "false");
  });
}
// End – Navigation //

// Start — Navigation active-section highlighting //
const navLinks = document.querySelectorAll(".nav__link");
const navSections = document.querySelectorAll("main section[id]");

if (navLinks.length && navSections.length) {
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          const active = link.getAttribute("href") === `#${entry.target.id}`;
          link.classList.toggle("is-current", active);
          if (active) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      });
    },
    { rootMargin: "-20% 0px -70% 0px" }, // activates near the top third
  );

  navSections.forEach((section) => spy.observe(section));
}
// End — Navigation active-section highlighting //

// Start — Updates 'Show more / Show less' toggling //
const updatesList = document.getElementById("updates-list");
const updatesMore = document.getElementById("updates-more");
const updatesLess = document.getElementById("updates-less");
const updatesDivider = document.getElementById("updates-divider");

if (updatesList && updatesMore && updatesLess) {
  const rows = updatesList.querySelectorAll(".updates__row");
  const STEP = 4; // rows shown initially and revealed per click
  let visible = STEP;

  const render = () => {
    rows.forEach((row, i) => row.classList.toggle("is-hidden", i >= visible));
    updatesMore.hidden = visible >= rows.length;
    updatesLess.hidden = visible <= STEP;
    updatesDivider.hidden = updatesMore.hidden || updatesLess.hidden;
  };

  updatesMore.addEventListener("click", () => {
    visible = Math.min(visible + STEP, rows.length);
    render();
    // don't strand focus on a button that just disappeared
    if (updatesMore.hidden) updatesLess.focus();
  });

  updatesLess.addEventListener("click", () => {
    // step down to the previous multiple of STEP
    visible = Math.max(STEP, (Math.ceil(visible / STEP) - 1) * STEP);
    render();
    if (updatesLess.hidden) updatesMore.focus();
  });

  render();
}
// End — Updates 'Show more / Show less' toggling //

// Start – Professional timeline //
(function () {
  "use strict";

  const timeline = document.querySelector(".pd-timeline");
  if (!timeline) return;

  const items = timeline.querySelectorAll(".pd-timeline__item");

  // Respect reduced motion and very old browsers: leave the timeline
  // in its no-JS state (everything visible, no travel).
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (reduceMotion || !("IntersectionObserver" in window)) return;

  timeline.classList.add("pd-timeline--js");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target); // reveal once, keep forever
      });
    },
    {
      threshold: 0.2, // ~20% of the item visible before it slides in
      rootMargin: "0px 0px -10% 0px", // trigger slightly inside the viewport
    },
  );

  items.forEach((item) => observer.observe(item));
})();
// End – Professional timeline //

// Start — Footer, smooth "Return to Top" //
const toTop = document.querySelector(".footer__gototop a");

toTop.addEventListener("click", (e) => {
  e.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
});
// End — Footer, smooth "Return to Top" //
