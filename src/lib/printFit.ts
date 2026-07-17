// Keep every invoice/note/receipt copy on exactly one A4 sheet when printing.
//
// Each copy is a `.invoice-print-page` carrying a fixed set of sections plus a
// variable number of line items, so its height isn't knowable up front: a long
// invoice overflows the sheet and breaks a strip (typically the signature row)
// onto a second page, while `break-inside: avoid` is powerless because a box
// taller than the page fragments regardless.
//
// So measure instead of guess. On `beforeprint` each page is temporarily laid
// out at the true printed width with the print padding applied; if the result
// is taller than the printable box it gets a `zoom` that scales it down to fit.
// Pages that already fit are left at full size. The scale is uniform, so the
// copy shrinks slightly in both axes and stays centred — the same fit-to-page
// tradeoff `generateInvoicePdfBlob` makes for the shared PDF.

const PX_PER_MM = 96 / 25.4;

// Must match `@page { size: A4; margin: 6mm }` in styles/index.css.
const PAGE_MARGIN_MM = 6;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// A hair of slack so sub-pixel rounding in the print layout can't tip a page
// that measured as an exact fit over onto a second sheet.
const SAFETY_MM = 1;

const PRINTABLE_WIDTH_PX = (A4_WIDTH_MM - PAGE_MARGIN_MM * 2) * PX_PER_MM;
const PRINTABLE_HEIGHT_PX = (A4_HEIGHT_MM - PAGE_MARGIN_MM * 2 - SAFETY_MM) * PX_PER_MM;

// Below this the copy would be unreadable; better to let it break than to print
// something nobody can read. Only reachable if a copy is ~2x the sheet, which
// means the document itself needs splitting rather than scaling.
const MIN_SCALE = 0.5;

function printPages(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.invoice-print-page'));
}

function fitPages() {
  for (const page of printPages()) {
    page.classList.add('print-compact');

    // Measure the printed layout, not the preview's: the modal caps the page
    // below A4 and `zoom`s it down on small screens, so its on-screen height
    // says nothing about how tall it lands on paper. Inline styles outrank the
    // (non-important) screen rules that apply that zoom.
    page.style.zoom = '1';
    page.style.width = `${PRINTABLE_WIDTH_PX}px`;
    page.style.maxWidth = 'none';

    const height = page.getBoundingClientRect().height;

    // Hand the width back to the print stylesheet, which pins it to the same
    // 198mm in the units the page box is actually defined in.
    page.style.removeProperty('width');
    page.style.removeProperty('max-width');

    if (height > PRINTABLE_HEIGHT_PX) {
      page.style.zoom = String(Math.max(MIN_SCALE, PRINTABLE_HEIGHT_PX / height));
    } else {
      page.style.removeProperty('zoom');
    }
  }
}

function resetPages() {
  for (const page of printPages()) {
    page.classList.remove('print-compact');
    page.style.removeProperty('zoom');
    page.style.removeProperty('width');
    page.style.removeProperty('max-width');
  }
}

export function installPrintFit() {
  window.addEventListener('beforeprint', fitPages);
  window.addEventListener('afterprint', resetPages);
}
