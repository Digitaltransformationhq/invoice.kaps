import { useLayoutEffect, type RefObject } from 'react';

/**
 * Scale each preview copy so a full-width page fits the modal on any screen.
 *
 * A copy is authored at its real paper width — 210mm for a sheet, 80mm for a
 * receipt roll — because that is what `generateInvoicePdfBlob` rasterises and
 * what the print stylesheet pins. On a phone the modal is nowhere near 210mm
 * wide, so the copy has to be scaled down to be shown at all.
 *
 * This used to be a ladder of hardcoded `zoom` steps in `styles/index.css`,
 * keyed on viewport-width breakpoints (0.4 under 380px, 0.48 to 480px, and so
 * on). Those steps guessed at the space available instead of measuring it, and
 * the guess was wrong: the number they need is the width of the scroll area
 * INSIDE the modal, which is the viewport less the overlay's padding, the
 * shell's border and the print area's own padding — and, since the overlay
 * started honouring `env(safe-area-inset-*)`, less the notch insets too. On a
 * 393pt iPhone the 0.48 step rendered a 381px page into a 361px box. The
 * ~20px that didn't fit hung off the LEFT, because the page is centred with
 * `mx-auto` and a centred overflowing box in a scroll container puts half its
 * overflow at negative scroll offsets, where nothing can reach it. That is why
 * the first character of every line was shaved off.
 *
 * So measure. `zoom: available / paperWidth` makes the copy render at exactly
 * the available width: `width: auto` resolves against the parent divided by
 * the zoom factor, and `max-width: 210mm` scales with it, so the two meet.
 * Capped at 1 — a roll is narrower than most phones and must not be blown up.
 *
 * Runs in a layout effect, before paint, so nothing is ever shown unscaled.
 */

const PX_PER_MM = 96 / 25.4;

/** Must match PAGE_CLASS / PAGE_CLASS_ROLL in components/invoices/templates/types.ts. */
const SHEET_WIDTH_PX = 210 * PX_PER_MM;
const ROLL_WIDTH_PX = 80 * PX_PER_MM;

/**
 * Below this a sheet is too small to proofread, and scrolling to read it beats
 * squinting at it. Only reachable on a viewport under ~250px.
 */
const MIN_SCALE = 0.3;

function innerWidth(el: HTMLElement) {
  const style = getComputedStyle(el);
  // `clientWidth` counts padding, and the padding is what must be fitted
  // inside. It already excludes a scrollbar, if the platform draws one.
  return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

function fit(area: HTMLElement) {
  // Two independent measurements, and the smaller wins. Neither is redundant.
  //
  // The print area is the box the copy actually sits in, so on a desktop —
  // where the shell stops at max-w-5xl well short of the window — it is the
  // only one that knows the real figure.
  //
  // But it is a flex item several levels down, and a descendant that refuses
  // to shrink can widen it; measuring it alone means measuring a box the copy
  // has already stretched, which reads back as "there is plenty of room" and
  // settles at roughly full size — the copy then renders ~2.2x too large and
  // spills off the left. The overlay cannot lie the same way: it is
  // `position: fixed` with `inset: 0`, so its width comes from the insets and
  // no content can push it wider than the viewport.
  //
  // Subtract the print area's own padding from the overlay figure too, since
  // the copy has to fit inside that as well. The shell in between contributes
  // no horizontal border or padding of its own.
  const outer = area.closest<HTMLElement>('.invoice-preview-modal');
  const areaPadding = area.clientWidth - innerWidth(area);
  const available = Math.min(
    innerWidth(area),
    outer ? innerWidth(outer) - areaPadding : Infinity,
  );
  if (available <= 0) return; // Not laid out yet, or the modal is closed.

  for (const page of Array.from(
    area.querySelectorAll<HTMLElement>('.invoice-print-page'),
  )) {
    const paperWidth = page.classList.contains('invoice-print-roll')
      ? ROLL_WIDTH_PX
      : SHEET_WIDTH_PX;

    // Scale against what the copy actually needs, not what the paper nominally
    // is. Not every format fits its sheet: a line-item table won't lay out
    // narrower than its own min-content, and formats with more columns or
    // longer headers (Classic GST) demand more than 210mm while others
    // (Compact) sit inside it. Assuming the paper width scaled the sheet to fit
    // and let the table hang off the edge of it, which is why one format came
    // out clean on a phone and another came out shaved down its left side.
    //
    // Measured two ways at zoom 1 and unclamped, because neither property is
    // airtight on its own: `scrollWidth` reports what spilled past the sheet,
    // but its behaviour on an `overflow: visible` box is a corner of the CSSOM
    // spec, while `min-content` gives the narrowest width the layout tolerates
    // but reads short for prose, which it collapses to its longest word. The
    // widest of the two and the paper itself is the honest answer, and if
    // either reads low the result is simply today's behaviour, not a
    // regression.
    page.style.zoom = '1';
    page.style.maxWidth = 'none';
    page.style.width = `${paperWidth}px`;
    const spilled = page.scrollWidth;
    page.style.width = 'min-content';
    const minContent = page.getBoundingClientRect().width;
    const natural = Math.max(paperWidth, spilled, minContent);

    // Hold the copy at that width so its background covers everything drawn on
    // it; `max-width: 210mm` would otherwise pull the sheet back to A4 and
    // leave the wide table overflowing onto the modal behind it.
    page.style.width = `${natural}px`;

    const exact = available / natural;
    const scale = Math.min(1, Math.max(MIN_SCALE, exact));
    // Whole percent, so a resize of a pixel or two can't churn the layout.
    const zoom = String(Math.floor(scale * 100) / 100);
    // Writing an unchanged value would still be a style mutation, and the
    // observer below fires on the copy's height as well as the modal's width.
    if (page.style.zoom !== zoom) page.style.zoom = zoom;

    // Below the readability floor the copy is deliberately wider than the box,
    // so it has to be scrolled. The page centres itself with `mx-auto`, and a
    // centred box that overflows puts half of that overflow at negative scroll
    // offsets, which nothing can reach — the bug this hook exists to fix, one
    // level down. Pin it to the left edge instead, so scrolling reaches all of
    // it. (Only possible on a viewport under ~270px; no iPhone is that narrow.)
    page.style.marginInline = exact < MIN_SCALE ? '0' : '';
  }
}

export function usePreviewFit(areaRef: RefObject<HTMLElement>, deps: unknown[] = []) {
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    fit(area);

    // Catches rotation and the iOS URL bar collapsing.
    const resize = new ResizeObserver(() => fit(area));
    resize.observe(area);

    // Catches the copies themselves changing — a format switch, a different
    // number of copies, or content that only arrives once a fetch settles. The
    // resize observer cannot stand in for this: the print area is a flex child
    // with its own scrollbar, so its box does not move when what's inside it
    // is replaced, and a copy that mounted after the first measurement would
    // simply never be scaled. Deliberately no `attributes` — this writes
    // inline styles on those same nodes and would otherwise retrigger itself.
    const mutations = new MutationObserver(() => fit(area));
    mutations.observe(area, { childList: true, subtree: true });

    // `printFit` strips every inline zoom on afterprint — it owns the property
    // while a print is in flight and can't tell its own value from this one.
    // Put the preview back together once it has let go.
    const refit = () => fit(area);
    window.addEventListener('afterprint', refit);

    return () => {
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('afterprint', refit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaRef, ...deps]);
}
