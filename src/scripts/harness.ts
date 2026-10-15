/**
 * Organizational Harness: the bento tiles (still previews, fitted to their
 * tiles) open one detail view, a dialog with a panel per tile. The product views in that panel play
 * a short loop of what their mechanism does, only while on screen, holding
 * still under the pointer so they can be read. A tile's own loop is the other
 * way round: still until the pointer is on it. Three kinds of loop, picked by
 * `data-loop`:
 *
 *   seq     steps 0 … data-steps − 1; [data-at=k] is on from step k,
 *           [data-only=k] only at step k, and the root carries data-step
 *   rotate  the last item moves to the top and enters; the rest slide down
 *   spot    one child at a time is lit
 *
 * `data-ms` sets the beat. Under reduced motion every loop holds its rest
 * state (`data-rest` for seq, the first item for spot).
 */

interface Loop {
  tick(): void;
  rest(): void;
}

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function seq(root: HTMLElement): Loop {
  const steps = Number(root.dataset.steps) || 1;
  const at = [...root.querySelectorAll<HTMLElement>("[data-at]")];
  const only = [...root.querySelectorAll<HTMLElement>("[data-only]")];
  let step = 0;
  const paint = () => {
    root.dataset.step = String(step);
    for (const el of at) el.classList.toggle("on", step >= Number(el.dataset.at));
    for (const el of only) el.classList.toggle("on", step === Number(el.dataset.only));
  };
  paint();
  return {
    tick() {
      step = (step + 1) % steps;
      paint();
    },
    rest() {
      step = Number(root.dataset.rest ?? steps - 1);
      paint();
    },
  };
}

function rotate(root: HTMLElement): Loop {
  return {
    tick() {
      const items = [...root.children] as HTMLElement[];
      const last = items.at(-1);
      if (!last || items.length < 2) return;
      // FLIP: note where each row is, move the last to the top, then animate
      // every row from its old place to its new one.
      const before = new Map(items.map((el) => [el, el.getBoundingClientRect().top]));
      root.prepend(last);
      for (const el of items) {
        if (el === last) {
          el.animate([{ opacity: 0, transform: "translateY(-10px)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: EASE });
          continue;
        }
        const dy = before.get(el)! - el.getBoundingClientRect().top;
        if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 600, easing: EASE });
      }
    },
    rest() {},
  };
}

function spot(root: HTMLElement): Loop {
  const items = [...root.children];
  let i = 0;
  const paint = () => items.forEach((el, k) => el.classList.toggle("on", k === i));
  paint();
  return {
    tick() {
      i = (i + 1) % items.length;
      paint();
    },
    rest() {
      i = 0;
      paint();
    },
  };
}

const KINDS = { seq, rotate, spot } as const;

/**
 * The detail view: a tile's button opens the dialog on that tile's panel;
 * previous and next (or the arrow keys) step through the panels in tile order.
 * The native dialog keeps focus inside, closes on Escape and hands focus back
 * to the tile; a click on the backdrop closes it too.
 */
function mountSheet(section: HTMLElement) {
  const sheet = section.querySelector<HTMLDialogElement>("[data-sheet]");
  if (!sheet) return;
  const panels = [...sheet.querySelectorAll<HTMLElement>("[data-panel]")];
  const scroller = sheet.querySelector<HTMLElement>("[data-sheet-scroll]");
  const prevName = sheet.querySelector<HTMLElement>("[data-sheet-prev-name]");
  const nextName = sheet.querySelector<HTMLElement>("[data-sheet-next-name]");
  const n = panels.length;
  let cur = 0;

  const show = (i: number) => {
    cur = (i + n) % n;
    panels.forEach((p, k) => (p.hidden = k !== cur));
    const title = panels[cur].querySelector("h3");
    if (title) sheet.setAttribute("aria-labelledby", title.id);
    if (prevName) prevName.textContent = panels[(cur - 1 + n) % n].dataset.title ?? "";
    if (nextName) nextName.textContent = panels[(cur + 1) % n].dataset.title ?? "";
    if (scroller) scroller.scrollTop = 0;
  };

  section.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((btn) =>
    btn.addEventListener("click", () => {
      show(Math.max(0, panels.findIndex((p) => p.dataset.panel === btn.dataset.open)));
      sheet.showModal();
    }),
  );
  sheet.querySelector("[data-sheet-close]")?.addEventListener("click", () => sheet.close());
  sheet.querySelector("[data-sheet-prev]")?.addEventListener("click", () => show(cur - 1));
  sheet.querySelector("[data-sheet-next]")?.addEventListener("click", () => show(cur + 1));
  // The dialog box is filled edge to edge, so a click whose target is the
  // dialog itself landed on the backdrop.
  sheet.addEventListener("click", (e) => e.target === sheet && sheet.close());
  sheet.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") show(cur + 1);
    else if (e.key === "ArrowLeft") show(cur - 1);
  });
}

/**
 * Previews: each tile's graphic is drawn at a fixed natural size; zoom it down
 * (never up) until it fits inside its tile's padding. Runs again only when a
 * tile changes size, so nothing moves while the page is read.
 */
function fitPreviews(section: HTMLElement) {
  const fit = (box: HTMLElement) => {
    const el = box.querySelector<HTMLElement>("[data-fit]");
    if (!el) return;
    el.style.zoom = "";
    const cs = getComputedStyle(box);
    const w = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const s = Math.min(1, w / el.offsetWidth, h / el.offsetHeight);
    if (s < 1) el.style.zoom = s.toFixed(3);
  };
  const ro = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target as HTMLElement)));
  section.querySelectorAll<HTMLElement>("[data-fit]").forEach((el) => ro.observe(el.parentElement!));
}

export function mountHarness(section: HTMLElement) {
  mountSheet(section);
  fitPreviews(section);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const runs = [...section.querySelectorAll<HTMLElement>("[data-loop]")].map((root) => ({
    root,
    loop: KINDS[root.dataset.loop as keyof typeof KINDS](root),
    ms: Number(root.dataset.ms) || 2400,
    timer: 0,
    held: false,
  }));

  if (still) {
    for (const r of runs) r.loop.rest();
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const r = runs.find((x) => x.root === e.target);
        if (!r) continue;
        clearInterval(r.timer);
        r.timer = e.isIntersecting ? window.setInterval(() => r.held || r.loop.tick(), r.ms) : 0;
      }
    },
    { threshold: 0.35 },
  );

  for (const r of runs) {
    // Tiles hold their rest state and play only under the pointer (or with
    // focus inside), so a screenful of tiles costs nothing while it's read.
    const tile = r.root.closest<HTMLElement>("[data-tile]");
    if (tile) {
      r.loop.rest();
      const play = () => {
        if (r.timer) return;
        r.loop.tick();
        r.timer = window.setInterval(() => r.loop.tick(), r.ms);
      };
      const stop = () => {
        clearInterval(r.timer);
        r.timer = 0;
      };
      tile.addEventListener("pointerenter", play);
      tile.addEventListener("pointerleave", stop);
      tile.addEventListener("focusin", play);
      tile.addEventListener("focusout", stop);
      continue;
    }
    io.observe(r.root);
    // Hold on the picture in the detail view (the pointer rests on the open
    // panel almost all the time).
    const hold = r.root.closest<HTMLElement>("[data-hold]") ?? r.root;
    hold.addEventListener("pointerenter", () => (r.held = true));
    hold.addEventListener("pointerleave", () => (r.held = false));
  }
}
