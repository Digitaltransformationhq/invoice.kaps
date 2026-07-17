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

// Rasterise each invoice "page" element into an A4 PDF (one copy per page).
export async function generateInvoicePdfBlob(pages: HTMLElement[]): Promise<Blob> {
  // html2canvas-pro (not the original html2canvas) because this app uses
  // Tailwind v4, whose CSS uses oklch()/color-mix() colours that the original
  // html2canvas can't parse — it throws and no PDF is produced.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWmm = pdf.internal.pageSize.getWidth();  // 210
  const pageHmm = pdf.internal.pageSize.getHeight(); // 297

  // Render each copy in an off-screen clone forced to a fixed A4 pixel width, so
  // the export always matches the full (desktop) invoice layout regardless of
  // the device's screen width — otherwise a phone captures the invoice at its
  // narrow on-screen size and the result looks distorted.
  const A4_WIDTH_PX = 794; // 210mm @ 96dpi

  for (let i = 0; i < pages.length; i++) {
    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;background:#ffffff;z-index:-1;`;
    const clone = pages[i].cloneNode(true) as HTMLElement;
    clone.style.width = `${A4_WIDTH_PX}px`;
    clone.style.maxWidth = 'none';
    clone.style.margin = '0';
    // Render with the paper padding scale rather than the screen one. Without
    // this the copy rasterises tall and narrow, and fitting it to A4 below
    // shrinks it to ~80% width with wide empty margins. The rules are keyed on
    // a class (not `@media print`) precisely so they can be applied here.
    clone.classList.add('print-compact');
    // `printFit` may have left an inline fit-to-sheet zoom on the source page,
    // which cloneNode copies. This render does its own fitting, so drop it.
    clone.style.zoom = '1';
    holder.appendChild(clone);
    document.body.appendChild(holder);

    try {
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: A4_WIDTH_PX,
        windowWidth: A4_WIDTH_PX,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      // Leave a margin around the invoice (matching the padding shown in the
      // app) and fit the copy inside it, preserving aspect ratio (no stretch).
      const margin = 8; // mm
      const maxW = pageWmm - margin * 2;
      const maxH = pageHmm - margin * 2;
      let w = maxW;
      let h = (canvas.height * w) / canvas.width;
      if (h > maxH) {
        h = maxH;
        w = (canvas.width * h) / canvas.height;
      }

      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', (pageWmm - w) / 2, margin, w, h);
    } finally {
      document.body.removeChild(holder);
    }
  }

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
