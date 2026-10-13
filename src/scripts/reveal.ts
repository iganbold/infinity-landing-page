/** Adds `.in` to [data-reveal] elements as they scroll into view. */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  },
  { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
);
document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

export {};
