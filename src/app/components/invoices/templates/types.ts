import type { InvoiceDocument } from '../../../../lib/invoiceDocument';

/**
 * Every invoice format is a component with this shape: given the document and
 * which copy is being drawn, render exactly ONE `.invoice-print-page`.
 *
 * That class is load-bearing — `generateInvoicePdfBlob` collects the pages by
 * it, clones each into an off-screen 794px (A4) holder and rasterises it to one
 * PDF page. A format that nests, renames or omits it produces a blank PDF.
 */
export interface InvoiceTemplateProps {
  doc: InvoiceDocument;
  /** e.g. "ORIGINAL FOR BUYER" — printed on the copy. */
  copyLabel: string;
  /** Spacing between copies on screen; pass straight onto the page element. */
  className?: string;
}

/** Shared by all formats: the page element the PDF pipeline looks for. */
export const PAGE_CLASS = 'invoice-print-page bg-white mx-auto max-w-[210mm]';

/**
 * A receipt-roll page. The extra `invoice-print-roll` marker keeps the
 * A4-fitting CSS off it — the screen zoom that shrinks a 210mm sheet into the
 * modal would leave an 80mm strip unreadably small, and the print stylesheet
 * would stretch it to a full sheet.
 */
export const PAGE_CLASS_ROLL = 'invoice-print-page invoice-print-roll bg-white mx-auto max-w-[80mm]';
