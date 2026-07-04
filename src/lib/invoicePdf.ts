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
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 6;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    let w = maxW;
    let h = (canvas.height * w) / canvas.width;
    if (h > maxH) {
      h = maxH;
      w = (canvas.width * h) / canvas.height;
    }

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', (pageW - w) / 2, margin, w, h);
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
