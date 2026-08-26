// Client-side invoice PDF generation + native sharing.
//
// WhatsApp click-to-chat links (wa.me) can only carry pre-filled TEXT — there
// is no way to attach a file. To actually send the invoice PDF we rasterise the
// on-screen invoice document into a PDF and hand it to the OS share sheet via
// the Web Share API (navigator.share with files) — on mobile AND desktop
// (Chrome/Edge on Windows support file sharing) the user picks WhatsApp and the
// real PDF attaches. jspdf/html2canvas are heavy, so they are imported lazily
// only when a share/download is triggered.

export function canSharePdfFile(): boolean {
  try {
    if (typeof navigator === 'undefined' || !navigator.canShare) return false;
    const probe = new File([new Blob(['test'], { type: 'application/pdf' })], 'probe.pdf', {
      type: 'application/pdf',
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * The stationery a document prints on.
 *
 * Most formats are A4 sheets. A thermal-roll receipt is not: it is a fixed-width
 * strip of continuous paper with no page height at all — the printer just feeds
 * until the document ends. `heightMm: 'auto'` says exactly that, and the page is
 * cut to whatever the content measures.
 */
export interface InvoicePaper {
  widthMm: number;
  /** Fixed sheet height, or 'auto' to grow the page to fit the content. */
  heightMm: number | 'auto';
  marginMm: number;
  /**
   * Apply the `print-compact` padding scale while rasterising. The rules behind
   * it are tuned to A4 in millimetres, so a narrow roll — where 2mm is a far
   * bigger share of the width — is rendered at its own screen padding instead.
   */
  compact: boolean;
}

export const A4_PAPER: InvoicePaper = { widthMm: 210, heightMm: 297, marginMm: 8, compact: true };

/** 80mm thermal till roll, the size retail counters print receipts on. */
export const ROLL_80MM_PAPER: InvoicePaper = { widthMm: 80, heightMm: 'auto', marginMm: 3, compact: false };

const MM_PER_INCH = 25.4;
const CSS_DPI = 96;

/**
 * Rasterise each "page" element into a PDF, one copy per page.
 *
 * Each copy is cloned into an off-screen holder forced to the paper's pixel
 * width, so the export always matches the full desktop layout regardless of the
 * device's screen width — otherwise a phone captures the document at its narrow
 * on-screen size and the result comes out distorted.
 */
export async function generateInvoicePdfBlob(
  pages: HTMLElement[],
  paper: InvoicePaper = A4_PAPER,
): Promise<Blob> {
  // html2canvas-pro (not the original html2canvas) because this app uses
  // Tailwind v4, whose CSS uses oklch()/color-mix() colours that the original
  // html2canvas can't parse — it throws and no PDF is produced.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const renderWidthPx = Math.round((paper.widthMm / MM_PER_INCH) * CSS_DPI); // 794px at A4

  // Rasterise everything BEFORE opening the PDF: on continuous paper the page
  // size is derived from the content, so it isn't known until the copy is drawn.
  const shots: Array<{ data: string; wPx: number; hPx: number }> = [];

  for (const page of pages) {
    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${renderWidthPx}px;background:#ffffff;z-index:-1;`;
    const clone = page.cloneNode(true) as HTMLElement;
    clone.style.width = `${renderWidthPx}px`;
    clone.style.maxWidth = 'none';
    clone.style.margin = '0';
    // Render with the paper padding scale rather than the screen one. Without
    // this the copy rasterises tall and narrow, and fitting it to the sheet
    // below shrinks it to ~80% width with wide empty margins. The rules are
    // keyed on a class (not `@media print`) precisely so they can be applied
    // here.
    if (paper.compact) clone.classList.add('print-compact');
    // `printFit` may have left an inline fit-to-sheet zoom on the source page,
    // and `usePreviewFit` leaves a scale transform plus the negative margins
    // that collapse its layout box. cloneNode copies all of it, and
    // html2canvas honours a transform — a preview scaled to 0.4 for a phone
    // would rasterise at 0.4 and the PDF would come out a quarter-size image
    // in the corner of the sheet. This render does its own fitting at the full
    // paper width, so both have to go. The negative margins are already
    // covered by the `margin = '0'` above.
    clone.style.zoom = '1';
    clone.style.transform = 'none';
    holder.appendChild(clone);
    document.body.appendChild(holder);

    try {
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: renderWidthPx,
        windowWidth: renderWidthPx,
        logging: false,
      });
      shots.push({
        data: canvas.toDataURL('image/jpeg', 0.95),
        wPx: canvas.width,
        hPx: canvas.height,
      });
    } finally {
      document.body.removeChild(holder);
    }
  }

  if (!shots.length) {
    throw new Error('Nothing to render');
  }

  const contentWmm = paper.widthMm - paper.marginMm * 2;

  // On continuous paper each copy gets its own page height. A sheet keeps the
  // fixed size and the copy is fitted inside it, preserving aspect ratio.
  const sizeOf = (shot: { wPx: number; hPx: number }) => {
    if (paper.heightMm !== 'auto') {
      const maxH = paper.heightMm - paper.marginMm * 2;
      let w = contentWmm;
      let h = (shot.hPx * w) / shot.wPx;
      if (h > maxH) {
        h = maxH;
        w = (shot.wPx * h) / shot.hPx;
      }
      return { pageW: paper.widthMm, pageH: paper.heightMm, w, h };
    }
    const w = contentWmm;
    const h = (shot.hPx * w) / shot.wPx;
    // jsPDF flips a page whose height is under its width when the orientation
    // is portrait, which would lay a very short receipt on its side.
    const pageH = Math.max(h + paper.marginMm * 2, paper.widthMm + 1);
    return { pageW: paper.widthMm, pageH, w, h };
  };

  const first = sizeOf(shots[0]);
  const pdf = new jsPDF({
    unit: 'mm',
    format: [first.pageW, first.pageH],
    orientation: 'portrait',
  });

  shots.forEach((shot, index) => {
    const { pageW, pageH, w, h } = sizeOf(shot);
    if (index > 0) pdf.addPage([pageW, pageH], 'portrait');
    pdf.addImage(shot.data, 'JPEG', (pageW - w) / 2, paper.marginMm, w, h);
  });

  return pdf.output('blob');
}

// Print by handing the browser a PDF that is already fitted to A4, instead of
// calling window.print() on the live DOM.
//
// The DOM path needs Chrome to paginate an absolutely-positioned, visibility-
// hacked subtree against `@page` while honouring a `zoom` scale — and it kept
// breaking each copy onto a second sheet. A pre-fitted PDF removes pagination
// from the equation: the page count is decided by jsPDF, not the print engine.
//
// Chrome/Edge print a PDF in a hidden iframe happily. Anything that can't
// (notably Firefox, which won't print a cross-document PDF frame) falls back to
// opening the PDF in a tab so the user can print it from the viewer.
export async function printPdfBlob(blob: Blob): Promise<'printed' | 'opened'> {
  const url = URL.createObjectURL(blob);

  const printed = await new Promise<boolean>((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    // If the frame never loads or the viewer refuses to print, don't leave the
    // user staring at nothing — fall through to the tab.
    const timer = window.setTimeout(() => resolve(false), 4000);

    frame.onload = () => {
      try {
        const win = frame.contentWindow;
        if (!win) throw new Error('no frame window');
        win.focus();
        win.print();
        window.clearTimeout(timer);
        resolve(true);
      } catch {
        window.clearTimeout(timer);
        resolve(false);
      }
    };
    frame.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };

    frame.src = url;
    document.body.appendChild(frame);

    // The iframe must outlive this call — removing it cancels the print dialog.
    // Chrome keeps the dialog tied to the frame, so it's cleaned up on unload.
    window.addEventListener(
      'beforeunload',
      () => {
        frame.remove();
        URL.revokeObjectURL(url);
      },
      { once: true }
    );
  });

  if (printed) return 'printed';

  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'opened';
}

// Share the PDF via the native share sheet; fall back to a plain download when
// file sharing is unavailable (most desktop browsers). Returns how it was
// handled so callers can decide on follow-up UI.
export async function sharePdf(
  blob: Blob,
  fileName: string,
  shareText?: string,
  shareTitle?: string
): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const file = new File([blob], fileName, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle, text: shareText });
      return 'shared';
    } catch (err) {
      // User dismissed the share sheet — treat as done, don't also download.
      if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
      // Any other failure falls through to the download path below.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
