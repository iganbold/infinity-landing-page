/**
 * Footer reveal, after granola.ai: at the bottom of the page, scrolling further
 * lifts the page with resistance and uncovers a panel fixed behind it; letting
 * go springs the page back down. Wheel/trackpad and touch. Off under reduced
 * motion. The page element needs an opaque background; the panel sits at
 * z-index -1 under it.
 */
export function footerReveal(page: HTMLElement, panel: HTMLElement, onOpen?: (open: boolean) => void) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

  const max = () => panel.offsetHeight;
  let offset = 0, target = 0, raf = 0, idle = 0, open = false;

  const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;

  const apply = () => {
    page.style.transform = offset > 0.5 ? `translate3d(0, ${-offset}px, 0)` : "";
    const nowOpen = offset > 4;
    if (nowOpen !== open) { open = nowOpen; onOpen?.(open); }
  };
  const animate = () => {
    offset += (target - offset) * 0.18;
    if (Math.abs(target - offset) < 0.3) offset = target;
    apply();
    raf = offset === target ? 0 : requestAnimationFrame(animate);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(animate); };

  /** Pull by d px of input; resistance grows as it nears the panel's height. */
  const pull = (d: number) => {
    const m = max();
    target = Math.max(0, Math.min(m, target + d * (1 - target / m) * 0.6));
    kick();
    clearTimeout(idle);
    idle = window.setTimeout(() => { target = 0; kick(); }, 380);
  };

  const onWheel = (e: WheelEvent) => {
    if (e.deltaY > 0 && atBottom()) pull(e.deltaY);
    else if (e.deltaY < 0 && target > 0) { target = Math.max(0, target + e.deltaY); kick(); }
  };

  let ty = 0, touching = false;
  const onTouchStart = (e: TouchEvent) => { ty = e.touches[0].clientY; touching = true; };
  const onTouchMove = (e: TouchEvent) => {
    if (!touching) return;
    const y = e.touches[0].clientY, d = ty - y;
    ty = y;
    if (d > 0 && atBottom()) pull(d * 1.4);
  };
  const onTouchEnd = () => { touching = false; clearTimeout(idle); target = 0; kick(); };

  addEventListener("wheel", onWheel, { passive: true });
  addEventListener("touchstart", onTouchStart, { passive: true });
  addEventListener("touchmove", onTouchMove, { passive: true });
  addEventListener("touchend", onTouchEnd, { passive: true });
  return () => {
    removeEventListener("wheel", onWheel);
    removeEventListener("touchstart", onTouchStart);
    removeEventListener("touchmove", onTouchMove);
    removeEventListener("touchend", onTouchEnd);
    cancelAnimationFrame(raf);
    clearTimeout(idle);
  };
}
