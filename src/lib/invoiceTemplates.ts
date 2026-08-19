// The catalogue of invoice formats.
//
// A format is nothing but a layout component (see `templates/types.ts`): it is
// handed a fully-derived `InvoiceDocument` and draws one `.invoice-print-page`
// per copy. Print, Download and WhatsApp/Mail share all go through
// `generateInvoicePdfBlob`, which rasterises whatever those pages contain — so
// adding a format never touches the PDF, sharing or mail paths.
//
// What a format may NOT change is the content. GST fixes what a tax invoice
// must carry (both GSTINs, place of supply, the HSN-wise bifurcation, the copy
// labels, the signatory). Formats differ in layout, density and accent only.

import type { ComponentType } from 'react';
import { A4_PAPER, ROLL_80MM_PAPER } from './invoicePdf';
import type { InvoicePaper } from './invoicePdf';
import { ClassicGst } from '../app/components/invoices/templates/ClassicGst';
import { Compact } from '../app/components/invoices/templates/Compact';
import { Modern } from '../app/components/invoices/templates/Modern';
import { Tally } from '../app/components/invoices/templates/Tally';
import { ThermalRoll } from '../app/components/invoices/templates/ThermalRoll';
import type { InvoiceTemplateProps } from '../app/components/invoices/templates/types';

export interface InvoiceTemplate {
  id: string;
  name: string;
  /** One line, shown next to the name wherever a format is picked. */
  description: string;
  component: ComponentType<InvoiceTemplateProps>;
  /**
   * The stationery this format prints on. Nearly every format is an A4 sheet;
   * the retail receipt is continuous roll stock, and the PDF page has to grow
   * with the content instead of being fitted to a sheet.
   */
  paper: InvoicePaper;
}

/**
 * The format a NEW invoice starts in when the company has no setting stored.
 * The company default in `company_settings.invoice_template` normally wins.
 */
export const DEFAULT_INVOICE_TEMPLATE_ID = 'tally';

/**
 * The format an ALREADY-SAVED invoice with no stored format was issued in.
 *
 * Not the same thing as the default, and the distinction is the whole point:
 * every invoice created before formats existed printed in the one layout the app
 * had — the classic ruled grid. Resolving those to the current default instead
 * would silently restyle every historical invoice the moment the default
 * changes, which is exactly what the per-invoice snapshot exists to prevent.
 */
export const LEGACY_INVOICE_TEMPLATE_ID = 'classic';

export const INVOICE_TEMPLATES: InvoiceTemplate[] = [
  {
    id: 'classic',
    name: 'Classic GST',
    description: 'Fully ruled grid — the traditional layout accountants and transporters expect.',
    component: ClassicGst,
    paper: A4_PAPER,
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Accent header band, panelled blocks and one emphasised total. Best for emailed PDFs.',
    component: Modern,
    paper: A4_PAPER,
  },
  {
    id: 'tally',
    name: 'Tally',
    description: 'Matches the Tally Prime tax invoice print — ruled box, charge lines for tax, INR wording.',
    component: Tally,
    paper: A4_PAPER,
  },
  {
    id: 'retail-receipt',
    name: 'Retail Receipt',
    description: '80mm thermal till roll, as electronics and department stores print at the counter.',
    component: ThermalRoll,
    paper: ROLL_80MM_PAPER,
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Dense ruled layout that keeps long, many-line invoices readable on one sheet.',
    component: Compact,
    paper: A4_PAPER,
  },
];

/**
 * Resolve a stored id to a format, falling back to the default.
 *
 * The fallback is the point: an invoice snapshots the format it was issued
 * with, so a row can outlive the format it names (renamed, retired, or written
 * by a newer build). Returning the default keeps that invoice printable instead
 * of rendering nothing.
 */
export function getInvoiceTemplate(id?: string | null): InvoiceTemplate {
  return (
    INVOICE_TEMPLATES.find((t) => t.id === id) ??
    INVOICE_TEMPLATES.find((t) => t.id === DEFAULT_INVOICE_TEMPLATE_ID) ??
    INVOICE_TEMPLATES[0]
  );
}

/**
 * The format to draw a SAVED invoice in, given whatever its row stores.
 *
 * Use this — not `getInvoiceTemplate` directly — anywhere an existing invoice is
 * rendered. An empty column means the invoice predates formats, so it resolves
 * to the legacy layout rather than to today's default.
 */
export function storedInvoiceTemplateId(stored?: string | null): string {
  return stored?.trim() || LEGACY_INVOICE_TEMPLATE_ID;
}
