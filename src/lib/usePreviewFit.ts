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

const DEBUG = typeof location !== 'undefined' && /(?:\?|&)fit=debug/.test(location.search);

function fit(area: HTMLElement) {
  // Two independent measurements, and the smaller wins. Neither is redundant.
  //
  // The print area is the box the copy actually sits in, so on a desktop —
  // where the shell stops at max-w-5xl well short of the window — it is the
  // only one that knows the real figure.
  //
  // But it is a flex item several levels down, and a descendant that refuses
  // to shrink can widen it; measuring it alone means measuring a box the copy
  // has already stretched. The overlay cannot lie the same way: it is
  // `position: fixed` with `inset: 0`, so its width comes from the insets and
  // no content can push it wider than the viewport.
  const outer = area.closest<HTMLElement>('.invoice-preview-modal');
  const areaPadding = area.clientWidth - innerWidth(area);
  const available = Math.min(
    innerWidth(area),
    outer ? innerWidth(outer) - areaPadding : Infinity,
  );
  if (available <= 0) return; // Not laid out yet, or the modal is closed.

  const notes: string[] = [];

  for (const page of Array.from(
    area.querySelectorAll<HTMLElement>('.invoice-print-page'),
  )) {
    const paperWidth = page.classList.contains('invoice-print-roll')
      ? ROLL_WIDTH_PX
      : SHEET_WIDTH_PX;

    // Measure clean: no transform, no zoom, no max-width clamp.
    page.style.transform = 'none';
    page.style.removeProperty('zoom');
    page.style.maxWidth = 'none';
    page.style.marginInline = '0';

    // Scale against what the copy actually needs, not what the paper nominally
    // is. Not every format fits its sheet: a line-item table will not lay out
    // narrower than its own min-content, and the formats differ — Compact sits
    // inside 210mm, Classic GST does not.
    //
    // Measured two ways, because neither property is airtight alone:
    // `scrollWidth` reports what spilled past the sheet, but its behaviour on
    // an `overflow: visible` box is a corner of the CSSOM spec, while
    // `min-content` gives the narrowest width the layout tolerates but reads
    // short for prose, which it collapses to its longest word.
    page.style.width = `${paperWidth}px`;
    const spilled = page.scrollWidth;
    page.style.width = 'min-content';
    const minContent = page.getBoundingClientRect().width;
    const natural = Math.max(paperWidth, spilled, minContent);

    page.style.width = `${natural}px`;
    const naturalHeight = page.getBoundingClientRect().height;

    const scale = Math.min(1, Math.max(MIN_SCALE, available / natural));

    // `transform`, not `zoom`. Four attempts at this used `zoom`, and each one
    // still shaved the left edge on a phone: `zoom` re-runs layout, so the copy
    // is re-measured against a containing block that is itself derived from the
    // zoom factor, and any error there leaves the copy a little wider than its
    // box — where `mx-auto` splits the excess across both sides and puts the
    // left half at a negative scroll offset that nothing can reach.
    //
    // A transform cannot do that. It is applied after layout, it re-measures
    // nothing, and `transform-origin: top left` pins the copy's top-left corner
    // to the container's content origin by construction. Whatever the scale
    // turns out to be, the left edge is never the part that goes missing —
    // worst case the right edge overflows, and that direction is reachable by
    // scrolling. The negative margins collapse the layout box the untransformed
    // copy still occupies, so the scroll area matches what is on screen.
    page.style.transformOrigin = 'top left';
    if (scale < 1) {
      page.style.transform = `scale(${scale})`;
      page.style.marginRight = `${-Math.round(natural * (1 - scale))}px`;
      page.style.marginBottom = `${-Math.round(naturalHeight * (1 - scale))}px`;
    } else {
      page.style.transform = 'none';
      page.style.removeProperty('margin-right');
      page.style.removeProperty('margin-bottom');
    }

    // A top-left origin is what keeps a copy that is too wide from losing its
    // left edge, but it also pins a copy that is too NARROW hard against the
    // left with all the slack piled up on the right — which is what an 80mm
    // receipt roll does, since it is capped at scale 1 and never fills a phone.
    //
    // Centre it with a measured margin rather than `auto`. An explicit value
    // can be clamped at zero, so when the copy does fill the box this is 0 and
    // the left-edge guarantee is untouched; `auto` would go back to splitting
    // any overflow across both sides, which is the failure this whole hook has
    // been chasing.
    const slack = Math.max(0, available - natural * scale);
    page.style.marginLeft = `${Math.round(slack / 2)}px`;

    if (DEBUG) {
      notes.push(
        `avail ${Math.round(available)} · area ${Math.round(innerWidth(area))} · ` +
          `outer ${outer ? Math.round(innerWidth(outer)) : '-'} · paper ${Math.round(paperWidth)} · ` +
          `spill ${Math.round(spilled)} · min ${Math.round(minContent)} · ` +
          `natural ${Math.round(natural)} · scale ${scale.toFixed(3)}`,
      );
    }
  }

  if (DEBUG) showDebug(area, notes);
}

/**
 * Opt-in readout for `?fit=debug`, so the numbers behind a bad fit can be read
 * off a phone that has no inspector attached. Renders nothing otherwise.
 */
function showDebug(area: HTMLElement, notes: string[]) {
  let box = area.querySelector<HTMLElement>('[data-fit-debug]');
  if (!box) {
    box = document.createElement('div');
    box.setAttribute('data-fit-debug', '');
    box.style.cssText =
      'position:sticky;top:0;z-index:5;background:#0f172a;color:#fff;font:11px/1.5 monospace;' +
      'padding:6px 8px;border-radius:6px;margin-bottom:8px;word-break:break-all;';
    area.prepend(box);
  }
  box.textContent = `vw ${document.documentElement.clientWidth} | ${notes.join(' || ')}`;
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
