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

function fit(area: HTMLElement) {
  const style = getComputedStyle(area);
  // `clientWidth` counts padding, and the padding is what the page must fit
  // inside. It already excludes a scrollbar, if the platform draws one.
  const available =
    area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if (available <= 0) return; // Not laid out yet, or the modal is closed.

  for (const page of Array.from(
    area.querySelectorAll<HTMLElement>('.invoice-print-page'),
  )) {
    const paperWidth = page.classList.contains('invoice-print-roll')
      ? ROLL_WIDTH_PX
      : SHEET_WIDTH_PX;
    const exact = available / paperWidth;
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

    // Catches rotation, the iOS URL bar collapsing, and a format switch that
    // swaps in a copy of a different width.
    const observer = new ResizeObserver(() => fit(area));
    observer.observe(area);

    // `printFit` strips every inline zoom on afterprint — it owns the property
    // while a print is in flight and can't tell its own value from this one.
    // Put the preview back together once it has let go.
    const refit = () => fit(area);
    window.addEventListener('afterprint', refit);

    return () => {
      observer.disconnect();
      window.removeEventListener('afterprint', refit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaRef, ...deps]);
}
