import { X, Download, Send, Printer, Mail, MessageCircle, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { getGstinStateName, normalizeIndianState } from '../../../lib/gstin';
import { useTaxpayerType } from '../../../lib/useTaxpayerType';
import { generateInvoicePdfBlob, printPdfBlob } from '../../../lib/invoicePdf';
import { buildInvoiceDocument } from '../../../lib/invoiceDocument';
import { DEFAULT_INVOICE_TEMPLATE_ID, INVOICE_TEMPLATES, getInvoiceTemplate } from '../../../lib/invoiceTemplates';

import type { InvoiceCustomer as Customer, InvoiceLineItem as LineItem } from '../../../lib/invoiceDocument';

interface InvoicePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  lineItems: LineItem[];
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  customer?: Customer | null;
  customerType?: string;
  billType?: string;
  placeOfSupply?: string;
  sellerState?: string;
  reverseCharge?: boolean;
  poNumber?: string;
  poDate?: string;
  vehicleNo?: string;
  transportMode?: string;
  remarks?: string;
  // The terms this invoice was issued with — snapshotted on the invoice row,
  // not read live from company settings. See supabase/sql/supabase_invoice_terms.sql.
  terms?: string;
  /**
   * Which format to draw. An invoice carries the format it was issued with, so
   * a reprint years later looks like the copy the customer holds; unset (or
   * unknown) falls back to the default format.
   */
  templateId?: string;
  autoOpenSend?: boolean;
}

export function InvoicePreview({
  isOpen,
  onClose,
  title = 'Invoice Preview',
  lineItems,
  invoiceNumber,
  invoiceDate,
  dueDate,
  customer,
  customerType,
  billType,
  placeOfSupply,
  sellerState,
  reverseCharge = false,
  poNumber,
  poDate,
  vehicleNo,
  transportMode,
  remarks,
  terms,
  templateId,
  autoOpenSend = false,
}: InvoicePreviewProps) {
  const { user } = useAuth();
  const [showSendOptions, setShowSendOptions] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  // Which format is on screen. Seeded from the invoice's own format; the picker
  // in the header changes only this view, never the stored invoice.
  const [activeTemplateId, setActiveTemplateId] = useState(templateId || DEFAULT_INVOICE_TEMPLATE_ID);
  const printAreaRef = useRef<HTMLDivElement>(null);
  const pdfBlobRef = useRef<Blob | null>(null);
  const pdfPromiseRef = useRef<Promise<Blob> | null>(null);
  // Composition dealers issue a "Bill of Supply" with no tax breakup.
  const { isComposition } = useTaxpayerType();
  const [companyDetails, setCompanyDetails] = useState({
    name: user?.company_name || 'Your Company',
    gstin: user?.company_gstin || '-',
    state: sellerState || getGstinStateName(user?.company_gstin) || '',
    email: user?.email || '',
    phone: '',
    address: '',
    city: '',
    pinCode: '',
    pan: '',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankBranch: '',
    bankAccountType: '',
    logo: user?.company_logo || '',
    esignImage: '',
    stampImage: '',
  });

  useEffect(() => {
    if (!isOpen || !user?.company_id) return;

    const loadCompanyDetails = async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('company_name, gstin, pan, phone, email, address, city, state, pin_code, bank_name, bank_account_number, bank_ifsc, bank_branch, bank_account_type, company_logo, esign_image, stamp_image')
        .eq('id', user.company_id)
        .single();

      if (!error) {
        setCompanyDetails({
          name: data?.company_name || user.company_name || 'Your Company',
          gstin: data?.gstin || user.company_gstin || '-',
          state: data?.state || sellerState || getGstinStateName(data?.gstin) || getGstinStateName(user.company_gstin) || '',
          email: data?.email || user.email || '',
          phone: data?.phone || '',
          address: data?.address || '',
          city: data?.city || '',
          pinCode: data?.pin_code || '',
          pan: data?.pan || '',
          bankName: data?.bank_name || '',
          bankAccountNumber: data?.bank_account_number || '',
          bankIfsc: data?.bank_ifsc || '',
          bankBranch: data?.bank_branch || '',
          bankAccountType: data?.bank_account_type || '',
          logo: data?.company_logo || user.company_logo || '',
          esignImage: data?.esign_image || '',
          stampImage: data?.stamp_image || '',
        });
      }
    };

    loadCompanyDetails();
  }, [isOpen, sellerState, user?.company_id, user?.company_name, user?.company_gstin, user?.company_logo, user?.email]);

  useEffect(() => {
    setActiveTemplateId(templateId || DEFAULT_INVOICE_TEMPLATE_ID);
  }, [templateId, invoiceNumber]);

  // When opened straight from the "share" flow (e.g. the create success modal),
  // surface the send sheet immediately.
  useEffect(() => {
    if (isOpen && autoOpenSend) setShowSendOptions(true);
  }, [isOpen, autoOpenSend]);

  // Start building the invoice PDF quietly in the background the moment the send
  // sheet opens — no blocking spinner, the button stays tappable. By the time
  // the user taps WhatsApp it's usually ready, so sharing is instant; if they
  // tap early, the handler awaits this same in-flight promise.
  useEffect(() => {
    if (!showSendOptions) {
      pdfBlobRef.current = null;
      pdfPromiseRef.current = null;
      return;
    }
    const pages = Array.from(
      printAreaRef.current?.querySelectorAll('.invoice-print-page') ?? []
    ) as HTMLElement[];
    if (!pages.length) return;

    let cancelled = false;
    pdfBlobRef.current = null;
    const promise = generateInvoicePdfBlob(pages, getInvoiceTemplate(activeTemplateId).paper);
    pdfPromiseRef.current = promise;
    promise
      .then((blob) => {
        if (!cancelled) pdfBlobRef.current = blob;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // Switching format re-renders the pages, so any blob built from the previous
    // one is stale — rebuild rather than sharing a PDF of a layout nobody sees.
  }, [showSendOptions, activeTemplateId]);

  if (!isOpen) return null;

  // Everything the printed document needs, derived once here and handed to
  // whichever format draws it. Formats never compute tax or totals themselves —
  // see lib/invoiceDocument.ts — so they can't disagree about what is due.
  const companyGstin = companyDetails.gstin || user?.company_gstin || '-';
  const companyState =
    companyDetails.state || sellerState || getGstinStateName(companyGstin) || '';
  const resolvedBuyerState = customer?.state || getGstinStateName(customer?.gstin) || '';
  const supplyState =
    placeOfSupply === 'Auto from customer' ? resolvedBuyerState : placeOfSupply || resolvedBuyerState;
  const isInterStateSupply = Boolean(
    companyState &&
    supplyState &&
    normalizeIndianState(companyState) !== normalizeIndianState(supplyState)
  );

  const doc = buildInvoiceDocument({
    lineItems,
    invoiceNumber,
    invoiceDate,
    dueDate,
    customer: customer ? { ...customer, state: resolvedBuyerState } : customer,
    customerType,
    billType,
    placeOfSupply,
    reverseCharge,
    poNumber,
    poDate,
    vehicleNo,
    transportMode,
    remarks,
    terms,
    company: {
      ...companyDetails,
      name: companyDetails.name || user?.company_name || 'Your Company',
      gstin: companyGstin,
      email: companyDetails.email || user?.email || '',
      logo: companyDetails.logo || user?.company_logo || '',
    },
    isComposition,
    companyState,
    isInterStateSupply,
  });

  const Template = getInvoiceTemplate(activeTemplateId).component;

  // The share, mail and file-naming handlers below read these directly.
  const displayInvoiceNumber = doc.meta.number;
  const companyName = doc.company.name;
  const buyerName = doc.buyer.name;
  const buyerPhone = doc.buyer.phone;
  const buyerEmail = doc.buyer.email;
  const grandTotal = doc.totals.grandTotal;

  const getInvoiceShareMessage = () => (
    `Invoice ${displayInvoiceNumber} for ${buyerName} is ready. Total amount: Rs. ${grandTotal.toFixed(2)}.`
  );

  const getInvoiceMailBody = () => (
    `Dear ${buyerName},\n\nPlease find attached invoice ${displayInvoiceNumber} for Rs. ${grandTotal.toFixed(2)}.\n\nRegards,\n${companyName}`
  );

  const openWhatsappText = () => {
    const phone = buyerPhone.replace(/\D/g, '');
    const message = encodeURIComponent(getInvoiceShareMessage());
    const whatsappUrl = phone
      ? `https://wa.me/${phone}?text=${message}`
      : `https://wa.me/?text=${message}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const pdfFileName = () => `${displayInvoiceNumber || 'invoice'}.pdf`.replace(/[^\w.-]+/g, '-');

  // The PDF the send sheet pre-builds, or a fresh one. Print and Download go
  // through here rather than window.print() on the live DOM: jsPDF fits each
  // copy to a single A4 page, so nothing depends on the print engine paginating
  // the preview's absolutely-positioned subtree correctly.
  const buildInvoicePdf = async (): Promise<Blob | null> => {
    if (pdfBlobRef.current) return pdfBlobRef.current;
    if (pdfPromiseRef.current) {
      try {
        return await pdfPromiseRef.current;
      } catch {
        return null;
      }
    }
    const pages = Array.from(
      printAreaRef.current?.querySelectorAll('.invoice-print-page') ?? []
    ) as HTMLElement[];
    if (!pages.length) return null;
    try {
      return await generateInvoicePdfBlob(pages, getInvoiceTemplate(activeTemplateId).paper);
    } catch {
      return null;
    }
  };

  const withPdf = async (use: (blob: Blob) => void | Promise<void>, failure: string) => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const blob = await buildInvoicePdf();
      if (!blob) {
        toast.error(failure);
        return;
      }
      await use(blob);
    } finally {
      setIsSharing(false);
    }
  };

  const handlePrint = () =>
    withPdf(
      async (blob) => {
        const how = await printPdfBlob(blob);
        if (how === 'opened') toast.info('Opened the invoice PDF in a new tab — print it from there.');
      },
      'Could not prepare the invoice for printing.'
    );

  const handleDownloadPdf = () =>
    withPdf(
      (blob) => downloadFile(new File([blob], pdfFileName(), { type: 'application/pdf' })),
      'Could not build the invoice PDF.'
    );

  // Return the pre-built invoice PDF as a File (waiting on the in-flight build if
  // the user acted before it finished). Web Share only needs share() to fire
  // within ~5s of the tap, which the background head-start keeps us under.
  const getInvoicePdfFile = async (): Promise<File | null> => {
    let blob = pdfBlobRef.current;
    if (!blob && pdfPromiseRef.current) {
      setIsSharing(true);
      try {
        blob = await pdfPromiseRef.current;
      } catch {
        blob = null;
      }
      setIsSharing(false);
    }
    if (!blob) return null;
    return new File([blob], pdfFileName(), { type: 'application/pdf' });
  };

  const handleWhatsAppInvoice = async () => {
    if (isSharing) return;
    const file = await getInvoicePdfFile();

    if (file && typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Invoice ${displayInvoiceNumber}`,
          text: getInvoiceShareMessage(),
        });
        setShowSendOptions(false);
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          setShowSendOptions(false);
          return; // user dismissed the share sheet
        }
        // any other error → fall through to the text link
      }
    } else {
      // Browser can't attach a file (most desktops) — proper desktop delivery
      // needs the WhatsApp Business API.
      toast.message("This browser can't attach the PDF — sending a text message. Use a phone to share the PDF.");
    }

    openWhatsappText();
    setShowSendOptions(false);
  };

  const handleMailInvoice = async () => {
    if (isSharing) return;
    const subject = `Invoice ${displayInvoiceNumber} from ${companyName}`;
    const body = getInvoiceMailBody();
    const file = await getInvoicePdfFile();

    // Open the mail app with the PDF attached via the share sheet. Works even
    // when the customer has no email on file — the user types/confirms the
    // recipient in their mail app and sends.
    if (file && typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: subject, text: body });
        setShowSendOptions(false);
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          setShowSendOptions(false);
          return; // user dismissed the share sheet
        }
        // any other error → fall through to the mail-composer path
      }
    }

    // Fallback (desktop / no file sharing): download the PDF to attach and open
    // the mail composer with the message prefilled (mailto can't auto-attach).
    if (file) {
      downloadFile(file);
      toast.message('Invoice PDF downloaded — attach it to the email that just opened.');
    }
    const to = buyerEmail || '';
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setShowSendOptions(false);
  };

  return (
    <div className="invoice-preview-modal fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="invoice-preview-shell bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[96vh] sm:max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="invoice-preview-actions flex items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-border">
          <h2 className="hidden sm:block text-lg font-semibold text-foreground shrink-0">{title}</h2>
          <h2 className="sm:hidden text-sm font-semibold text-foreground shrink-0">{title.replace(/^Invoice\s+/, '')}</h2>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {/* Format picker — changes this view only. Which format an invoice
              * is actually issued with is a stored setting, not a preview
              * choice, so nothing here writes back to the invoice. */}
            <select
              value={activeTemplateId}
              onChange={(e) => setActiveTemplateId(e.target.value)}
              className="kaps-compact-select h-9 max-w-[9.5rem] px-2 text-[12px] border border-border rounded bg-card text-foreground"
              title="Invoice format"
              aria-label="Invoice format"
            >
              {INVOICE_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={handleDownloadPdf}
              disabled={isSharing}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 border border-border rounded hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Download PDF</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={isSharing}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 border border-border rounded hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Print"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Print</span>
            </button>
            <button
              onClick={() => setShowSendOptions(true)}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
              title="Send Invoice"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Send Invoice</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded transition-colors" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showSendOptions && (
          <div
            className="fixed inset-0 bg-slate-900/50 dark:bg-black/65 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => setShowSendOptions(false)}
          >
            <div
              className="bg-card rounded-2xl border border-violet-200 dark:border-violet-400/30 max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="relative px-6 pt-6 pb-5 border-b border-violet-100 dark:border-violet-400/15">
                <button
                  onClick={() => setShowSendOptions(false)}
                  className="absolute right-5 top-5 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-violet-500 flex items-center justify-center shrink-0">
                    <Send className="w-4 h-4 text-white" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 pr-8">
                    <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300">Send Invoice</div>
                    <h2 className="text-[16px] font-semibold tracking-tight text-foreground leading-tight truncate">
                      {displayInvoiceNumber} <span className="text-muted-foreground font-normal">to</span> {buyerName}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Send options */}
              <div className="px-6 py-5 space-y-2.5">
                <button
                  onClick={handleWhatsAppInvoice}
                  disabled={isSharing}
                  className="w-full inline-flex items-center gap-3 px-4 py-3 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.06] hover:border-violet-400 dark:hover:border-violet-400/45 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                    {isSharing ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.25} />
                    ) : (
                      <MessageCircle className="w-4 h-4" strokeWidth={2.25} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-foreground">{isSharing ? 'Preparing PDF…' : 'WhatsApp the Invoice'}</div>
                    <div className="text-[11.5px] text-muted-foreground">{isSharing ? 'Building the invoice PDF' : 'Share the PDF via WhatsApp'}</div>
                  </div>
                </button>
                <button
                  onClick={handleMailInvoice}
                  disabled={isSharing}
                  className="w-full inline-flex items-center gap-3 px-4 py-3 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.06] hover:border-violet-400 dark:hover:border-violet-400/45 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-foreground">Mail Invoice</div>
                    <div className="text-[11.5px] text-muted-foreground">Attach the PDF and send from your mail app</div>
                  </div>
                </button>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-violet-100 dark:border-violet-400/15 bg-violet-50/40 dark:bg-violet-500/[0.04] flex items-center justify-end">
                <button
                  onClick={() => setShowSendOptions(false)}
                  className="h-10 px-5 rounded-full text-[13px] font-medium text-foreground border border-violet-200 dark:border-violet-400/25 bg-card hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Invoice Content — one `.invoice-print-page` per copy, drawn by the
          * selected format. `generateInvoicePdfBlob` finds the pages by that
          * class, so the format is the only thing that varies here. */}
        <div ref={printAreaRef} className="invoice-print-area flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
          {doc.copies.map((copyLabel, copyIndex) => (
            <Template
              key={copyLabel}
              doc={doc}
              copyLabel={copyLabel}
              className={copyIndex > 0 ? 'mt-8 print:mt-0' : ''}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
