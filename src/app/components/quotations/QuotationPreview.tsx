import { useEffect, useRef, useState } from 'react';
import { Download, Mail, MessageCircle, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { getGstinStateName, normalizeIndianState } from '../../../lib/gstin';
import { generateInvoicePdfBlob, printPdfBlob, sharePdf } from '../../../lib/invoicePdf';
import { buildInvoiceDocument, formatInvoiceCurrency, formatInvoiceDate } from '../../../lib/invoiceDocument';
import type { InvoiceCompanyDetails, InvoiceLineItem } from '../../../lib/invoiceDocument';
import { INVOICE_TEMPLATES, getInvoiceTemplate } from '../../../lib/invoiceTemplates';
import { useInvoiceTemplate } from '../../../lib/useInvoiceTemplate';
import { usePreviewFit } from '../../../lib/usePreviewFit';
import { isHeadingLine, type QuotationLineItem } from '../../../lib/quotations';

interface CustomerDetails { name?: string; gstin?: string; email?: string; phone?: string; address?: string; city?: string; state?: string; contactName?: string }

interface Props {
  open: boolean;
  onClose: () => void;
  number: string;
  date: string;
  validUntil: string;
  customer: CustomerDetails;
  items: QuotationLineItem[];
  notes?: string;
  terms?: string;
  /** The format this quotation is saved with; empty = company default. */
  templateId?: string | null;
  /** Called when the user picks another format, so the caller can store it. */
  onTemplateChange?: (templateId: string) => void;
}

const EMPTY_COMPANY: InvoiceCompanyDetails = {
  name: '', gstin: '', state: '', email: '', phone: '', address: '', city: '', pinCode: '', pan: '',
  bankName: '', bankAccountNumber: '', bankIfsc: '', bankBranch: '', bankAccountType: '', upiId: '',
  paymentQrImage: '', logo: '', esignImage: '', stampImage: '',
};

/**
 * A quotation drawn in any of the invoice formats.
 *
 * The quotation is turned into the same `InvoiceDocument` an invoice is (with
 * `kind: 'quotation'`, so the title, number label, validity date and
 * declaration read as a quotation), and handed to whichever format is picked.
 * The format is the one saved on the quotation (falling back to the company's
 * default invoice format); picking another reports it through
 * `onTemplateChange` so the caller can store it.
 */
export function QuotationPreview({ open, onClose, number, date, validUntil, customer, items, notes, terms, templateId: storedTemplateId, onTemplateChange }: Props) {
  const { user } = useAuth();
  const areaRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const { templateId: defaultTemplateId } = useInvoiceTemplate();
  const [templateId, setTemplateId] = useState(storedTemplateId || defaultTemplateId);
  const [company, setCompany] = useState<InvoiceCompanyDetails>({
    ...EMPTY_COMPANY,
    name: user?.company_name || 'Your Company',
    gstin: user?.company_gstin || '',
    email: user?.email || '',
    logo: user?.company_logo || '',
  });

  useEffect(() => { setTemplateId(storedTemplateId || defaultTemplateId); }, [storedTemplateId, defaultTemplateId]);

  usePreviewFit(areaRef, [templateId, open]);

  useEffect(() => {
    if (!open || !user?.company_id) return;
    supabase.from('companies')
      .select('company_name, gstin, pan, phone, email, address, city, state, pin_code, bank_name, bank_account_number, bank_ifsc, bank_branch, bank_account_type, upi_id, payment_qr_image, company_logo, esign_image, stamp_image')
      .eq('id', user.company_id).single()
      .then(({ data }) => data && setCompany({
        name: data.company_name || user.company_name || 'Your Company',
        gstin: data.gstin || user.company_gstin || '',
        state: data.state || '',
        email: data.email || user.email || '',
        phone: data.phone || '',
        address: data.address || '',
        city: data.city || '',
        pinCode: data.pin_code || '',
        pan: data.pan || '',
        bankName: data.bank_name || '',
        bankAccountNumber: data.bank_account_number || '',
        bankIfsc: data.bank_ifsc || '',
        bankBranch: data.bank_branch || '',
        bankAccountType: data.bank_account_type || '',
        upiId: data.upi_id || '',
        paymentQrImage: data.payment_qr_image || '',
        logo: data.company_logo || user.company_logo || '',
        esignImage: data.esign_image || '',
        stampImage: data.stamp_image || '',
      }));
  }, [open, user?.company_id, user?.company_name, user?.company_gstin, user?.company_logo, user?.email]);

  if (!open) return null;

  const companyState = company.state || getGstinStateName(company.gstin) || '';
  const buyerState = customer.state || getGstinStateName(customer.gstin) || '';
  const isInterStateSupply = Boolean(
    companyState && buyerState && normalizeIndianState(companyState) !== normalizeIndianState(buyerState),
  );

  const lineItems: InvoiceLineItem[] = items.map((item) => {
    if (isHeadingLine(item)) {
      return {
        id: item.id, isHeading: true, item: item.item, description: item.description || '',
        hsn: '', qty: 0, unit: '', rate: 0, discount: 0, gst: 0, amount: 0,
      };
    }
    const base = Number(item.qty || 0) * Number(item.rate || 0);
    return {
      id: item.id,
      item: item.item,
      description: item.description || '',
      hsn: item.hsn || '',
      qty: Number(item.qty || 0),
      unit: item.unit || '',
      rate: Number(item.rate || 0),
      discount: Number(item.discount || 0),
      gst: Number(item.gst || 0),
      amount: base - (base * Number(item.discount || 0)) / 100,
    };
  });

  const doc = buildInvoiceDocument({
    kind: 'quotation',
    lineItems,
    invoiceNumber: number,
    invoiceDate: date,
    dueDate: validUntil || undefined,
    customer: {
      id: '',
      companyName: customer.name || 'Customer',
      gstin: customer.gstin || '',
      contactName: customer.contactName || '',
      email: customer.email || '',
      phone: customer.phone || '',
      city: customer.city || '',
      state: buyerState,
      address: customer.address || '',
    },
    placeOfSupply: buyerState,
    remarks: notes,
    terms,
    company: { ...company, gstin: company.gstin || '-' },
    // Quotation totals are stored with GST and without rounding; keep the
    // printed figure identical to the one on the quotation list.
    isComposition: false,
    companyState,
    isInterStateSupply,
    roundOff: false,
  });

  const template = getInvoiceTemplate(templateId);
  const Template = template.component;

  const buildPdf = async () => {
    const pages = Array.from(areaRef.current?.querySelectorAll('.invoice-print-page') ?? []) as HTMLElement[];
    if (!pages.length) throw new Error('Preview is not ready');
    return generateInvoicePdfBlob(pages, template.paper);
  };
  const perform = async (fn: (blob: Blob) => Promise<unknown> | unknown) => {
    if (busy) return;
    setBusy(true);
    try { await fn(await buildPdf()); } catch { toast.error('Could not prepare the quotation PDF.'); } finally { setBusy(false); }
  };
  const fileName = `${number || 'quotation'}.pdf`.replace(/[^\w.-]+/g, '-');
  const message = `Quotation ${number} from ${doc.company.name} for Rs. ${formatInvoiceCurrency(doc.totals.grandTotal)}.${validUntil ? ` Valid until ${formatInvoiceDate(validUntil)}.` : ''}`;

  return (
    <div className="invoice-preview-modal fixed inset-0 z-[80] bg-black/60 flex flex-col" role="dialog" aria-modal="true" aria-label="Quotation preview">
      <div className="h-16 bg-background border-b flex items-center justify-between gap-2 px-3 sm:px-6 shrink-0">
        <div className="hidden sm:block min-w-0"><p className="font-semibold">Quotation Preview</p><p className="text-xs text-muted-foreground truncate">{number}</p></div>
        <div className="flex items-center gap-2 ml-auto">
          {/* Format picker — the same formats invoices use. */}
          <select
            value={templateId}
            onChange={(e) => { setTemplateId(e.target.value); onTemplateChange?.(e.target.value); }}
            className="kaps-compact-select h-9 max-w-[9.5rem] px-2 text-[12px] border border-border rounded bg-card text-foreground"
            title="Quotation format"
            aria-label="Quotation format"
          >
            {INVOICE_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button disabled={busy} onClick={() => perform(async blob => { const result = await sharePdf(blob, fileName, message, `Quotation ${number}`); if (result === 'downloaded') toast.success('Quotation downloaded'); })} className="hidden sm:inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"><MessageCircle className="w-4 h-4" /> Share</button>
          <button disabled={busy} onClick={() => perform(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000); })} className="h-9 w-9 inline-flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50" title="Download PDF"><Download className="w-4 h-4" /></button>
          <button disabled={busy} onClick={() => perform(printPdfBlob)} className="h-9 w-9 inline-flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50" title="Print"><Printer className="w-4 h-4" /></button>
          <button onClick={() => { const subject = encodeURIComponent(`Quotation ${number}`); const body = encodeURIComponent(message); window.location.href = `mailto:${customer.email || ''}?subject=${subject}&body=${body}`; }} className="h-9 w-9 inline-flex items-center justify-center rounded-md border hover:bg-muted" title="Email"><Mail className="w-4 h-4" /></button>
          <button onClick={onClose} className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div ref={areaRef} className="invoice-print-area flex-1 overflow-auto p-2 sm:p-8 bg-slate-200">
        {doc.copies.map((copyLabel) => (
          <Template key={copyLabel || 'quotation'} doc={doc} copyLabel={copyLabel} className="shadow-xl" />
        ))}
      </div>
    </div>
  );
}
