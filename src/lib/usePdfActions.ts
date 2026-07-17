// Print / Download PDF for any preview built out of `.invoice-print-page` copies.
//
// Every preview modal must go through here rather than calling window.print()
// on the live DOM. Printing the DOM asks the browser to paginate the preview's
// absolutely-positioned, visibility-hacked subtree against `@page`, which
// reliably broke each copy across two sheets. jsPDF instead fits each copy to a
// single A4 page and decides the page count itself, so the print engine never
// gets a say. See the notes in `invoicePdf.ts`.
//
// This is a hook rather than copy-pasted handlers so the previews can't drift
// apart — a preview that quietly kept window.print() is how the bug survived a
// round of fixes.

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { generateInvoicePdfBlob, printPdfBlob } from './invoicePdf';

export function usePdfActions(getFileName: () => string) {
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const withPdf = useCallback(
    async (use: (blob: Blob) => void | Promise<void>, failure: string) => {
      if (isExporting) return;
      setIsExporting(true);
      try {
        const pages = Array.from(
          printAreaRef.current?.querySelectorAll<HTMLElement>('.invoice-print-page') ?? []
        );
        if (!pages.length) {
          toast.error(failure);
          return;
        }
        const blob = await generateInvoicePdfBlob(pages);
        await use(blob);
      } catch {
        toast.error(failure);
      } finally {
        setIsExporting(false);
      }
    },
    [isExporting]
  );

  const handlePrint = useCallback(
    () =>
      withPdf(async (blob) => {
        const how = await printPdfBlob(blob);
        if (how === 'opened') toast.info('Opened the PDF in a new tab — print it from there.');
      }, 'Could not prepare the document for printing.'),
    [withPdf]
  );

  const handleDownloadPdf = useCallback(
    () =>
      withPdf((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = getFileName().replace(/[^\w.-]+/g, '-');
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }, 'Could not build the PDF.'),
    [withPdf, getFileName]
  );

  return { printAreaRef, isExporting, handlePrint, handleDownloadPdf };
}
