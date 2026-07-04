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
      // Fit the whole copy onto one A4 page, preserving aspect ratio (no stretch).
      let w = pageWmm;
      let h = (canvas.height * w) / canvas.width;
      if (h > pageHmm) {
        h = pageHmm;
        w = (canvas.width * h) / canvas.height;
      }

      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', (pageWmm - w) / 2, 0, w, h);
    } finally {
      document.body.removeChild(holder);
    }
  }

  return pdf.output('blob');
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
