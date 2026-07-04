import { X, Download, Send, Printer, Mail, MessageCircle, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { getGstinStateName, normalizeIndianState } from '../../../lib/gstin';
import { sendInvoiceEmail } from '../../../lib/emailInvoice';
import { useTaxpayerType } from '../../../lib/useTaxpayerType';
import { generateInvoicePdfBlob } from '../../../lib/invoicePdf';

interface LineItem {
  id: string;
  type?: 'product' | 'service';
  item: string;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number;
  gst: number;
  amount: number;
}

interface Customer {
  id: string;
  companyName: string;
  gstin: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  state?: string;
  address: string;
}

interface InvoicePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  lineItems: LineItem[];
  invoiceNumber: string;
  invoiceDate: string;
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
  autoOpenSend?: boolean;
}

export function InvoicePreview({
  isOpen,
  onClose,
  title = 'Invoice Preview',
  lineItems,
  invoiceNumber,
  invoiceDate,
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
  autoOpenSend = false,
}: InvoicePreviewProps) {
  const { user } = useAuth();
  const [showSendOptions, setShowSendOptions] = useState(false);
  const [pdfPreparing, setPdfPreparing] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);
  const pdfBlobRef = useRef<Blob | null>(null);
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
    logo: user?.company_logo || '',
    esignImage: '',
    stampImage: '',
  });

  useEffect(() => {
    if (!isOpen || !user?.company_id) return;

    const loadCompanyDetails = async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('company_name, gstin, pan, phone, email, address, city, state, pin_code, bank_name, bank_account_number, bank_ifsc, bank_branch, company_logo, esign_image, stamp_image')
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
          logo: data?.company_logo || user.company_logo || '',
          esignImage: data?.esign_image || '',
          stampImage: data?.stamp_image || '',
        });
      }
    };

    loadCompanyDetails();
  }, [isOpen, sellerState, user?.company_id, user?.company_name, user?.company_gstin, user?.company_logo, user?.email]);

  // When opened straight from the "share" flow (e.g. the create success modal),
  // surface the send sheet immediately.
  useEffect(() => {
    if (isOpen && autoOpenSend) setShowSendOptions(true);
  }, [isOpen, autoOpenSend]);

  // Pre-build the invoice PDF as soon as the send sheet opens, so tapping
  // WhatsApp can call navigator.share() immediately inside the tap. Web Share
  // requires the share() call to stay within the user gesture; html2canvas is
  // too slow to run *after* the tap, which is why sharing was falling back to
  // text. Only the buyer's copy is rendered, to keep it fast.
  useEffect(() => {
    if (!showSendOptions) {
      pdfBlobRef.current = null;
      return;
    }
    const pages = Array.from(
      printAreaRef.current?.querySelectorAll('.invoice-print-page') ?? []
    ) as HTMLElement[];
    if (!pages.length) return;

    let cancelled = false;
    pdfBlobRef.current = null;
    setPdfPreparing(true);
    generateInvoicePdfBlob([pages[0]])
      .then((blob) => {
        if (!cancelled) pdfBlobRef.current = blob;
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPdfPreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showSendOptions]);

  const [isSendingMail, setIsSendingMail] = useState(false);

  if (!isOpen) return null;

  const getBillTypeFromItems = () => {
    const hasProductItems = lineItems.some((item) => item.type === 'product');
    const hasServiceItems = lineItems.some((item) => item.type === 'service');

    if (hasProductItems && hasServiceItems) return 'goods+service';
    if (hasProductItems) return 'only goods';
    if (hasServiceItems) return 'only service';
    return billType || '';
  };

  const getInvoiceCopies = () => {
    const effectiveBillType = getBillTypeFromItems().trim().toLowerCase();

    if (effectiveBillType === 'only service') {
      return [
        'ORIGINAL FOR BUYER',
        'DUPLICATE FOR SUPPLIER',
      ];
    }

    return [
      'ORIGINAL FOR BUYER',
      'DUPLICATE FOR TRANSPORTER',
      'TRIPLICATE FOR SUPPLIER',
    ];
  };

  const displayInvoiceNumber = invoiceNumber || 'Auto-generated on save';
  const formatDate = (value?: string) => {
    if (!value) return '-';
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }
    return parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const formatCurrency = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const companyName = companyDetails.name || user?.company_name || 'Your Company';
  const companyGstin = companyDetails.gstin || user?.company_gstin || '-';
  const companyState = companyDetails.state || sellerState || getGstinStateName(companyGstin) || '';
  const companyEmail = companyDetails.email || user?.email || '';
  const companyPhone = companyDetails.phone || '';
  const companyAddress = [
    companyDetails.address,
    [companyDetails.city, companyState, companyDetails.pinCode].filter(Boolean).join(', '),
  ].filter(Boolean);
  const companyPan = companyDetails.pan || (companyGstin.length >= 12 ? companyGstin.slice(2, 12) : '');
  const companyLogo = companyDetails.logo || user?.company_logo || '';
  const companyEsign = companyDetails.esignImage || '';
  const companyStamp = companyDetails.stampImage || '';
  const buyerName = customer?.companyName || 'Customer not selected';
  const buyerAddress = customer?.address || '-';
  const buyerCity = customer?.city || '-';
  const buyerState = customer?.state || getGstinStateName(customer?.gstin) || '';
  const effectivePlaceOfSupply = placeOfSupply === 'Auto from customer'
    ? buyerState || buyerCity || 'Auto from customer'
    : placeOfSupply || buyerState || buyerCity || '-';
  const buyerGstin = customer?.gstin || '-';
  const buyerContact = customer?.contactName || '';
  const buyerPhone = customer?.phone || '';
  const buyerEmail = customer?.email || '';
  const effectiveBillType = getBillTypeFromItems();
  const invoiceCopies = getInvoiceCopies();
  const supplyState = placeOfSupply === 'Auto from customer'
    ? buyerState
    : placeOfSupply || buyerState;
  const isInterStateSupply = Boolean(
    companyState &&
    supplyState &&
    normalizeIndianState(companyState) !== normalizeIndianState(supplyState)
  );

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => {
    return sum + (item.qty * item.rate) - ((item.qty * item.rate) * item.discount / 100);
  }, 0);

  const totalTax = lineItems.reduce((sum, item) => {
    const baseAmount = item.qty * item.rate;
    const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
    return sum + (afterDiscount * item.gst / 100);
  }, 0);

  const cgstTotal = isInterStateSupply ? 0 : totalTax / 2;
  const sgstTotal = isInterStateSupply ? 0 : totalTax / 2;
  const igstTotal = isInterStateSupply ? totalTax : 0;
  // A composition dealer cannot collect tax, so the total is the taxable value.
  const grandTotal = subtotal + (isComposition ? 0 : totalTax);

  const getInvoiceShareMessage = () => (
    `Invoice ${displayInvoiceNumber} for ${buyerName} is ready. Total amount: Rs. ${grandTotal.toFixed(2)}.`
  );

  const openWhatsappText = () => {
    const phone = buyerPhone.replace(/\D/g, '');
    const message = encodeURIComponent(getInvoiceShareMessage());
    const whatsappUrl = phone
      ? `https://wa.me/${phone}?text=${message}`
      : `https://wa.me/?text=${message}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleWhatsAppInvoice = async () => {
    const fileName = `${displayInvoiceNumber || 'invoice'}.pdf`.replace(/[^\w.-]+/g, '-');
    const blob = pdfBlobRef.current;
    const file = blob ? new File([blob], fileName, { type: 'application/pdf' }) : null;

    // The PDF is pre-built (see the send-sheet effect), so this runs straight
    // inside the tap — required for Web Share to accept it on mobile.
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
    if (!buyerEmail) {
      toast.error('Customer email is not available.');
      return;
    }
    if (isSendingMail) return;

    setIsSendingMail(true);
    const sendingToast = toast.loading(`Sending invoice to ${buyerEmail}…`);

    const result = await sendInvoiceEmail({
      to: buyerEmail,
      invoiceNumber: displayInvoiceNumber,
      customerName: buyerName,
      amount: grandTotal.toFixed(2),
      fromName: companyName,
      replyTo: companyEmail || undefined,
    });

    toast.dismiss(sendingToast);
    setIsSendingMail(false);

    if (result.success) {
      toast.success(`Invoice ${displayInvoiceNumber} sent to ${buyerEmail}`);
      setShowSendOptions(false);
    } else {
      toast.error(result.error || 'Could not send the invoice email.');
    }
  };

  // Convert number to words (simplified version)
  const numberToWords = (num: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    if (num === 0) return 'Zero';

    const convert = (n: number): string => {
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
      if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
      if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
      return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
    };

    return 'Rupees ' + convert(Math.floor(num)) + ' Only';
  };

  return (
    <div className="invoice-preview-modal fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="invoice-preview-shell bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[96vh] sm:max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="invoice-preview-actions flex items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-border">
          <h2 className="hidden sm:block text-lg font-semibold text-foreground shrink-0">{title}</h2>
          <h2 className="sm:hidden text-sm font-semibold text-foreground shrink-0">{title.replace(/^Invoice\s+/, '')}</h2>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 border border-border rounded hover:bg-muted transition-colors"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Download PDF</span>
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 border border-border rounded hover:bg-muted transition-colors"
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
                  disabled={isSendingMail || pdfPreparing}
                  className="w-full inline-flex items-center gap-3 px-4 py-3 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.06] hover:border-violet-400 dark:hover:border-violet-400/45 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                    {pdfPreparing ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.25} />
                    ) : (
                      <MessageCircle className="w-4 h-4" strokeWidth={2.25} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-foreground">{pdfPreparing ? 'Preparing PDF…' : 'WhatsApp the Invoice'}</div>
                    <div className="text-[11.5px] text-muted-foreground">{pdfPreparing ? 'Building the invoice PDF' : 'Share the PDF via WhatsApp'}</div>
                  </div>
                </button>
                <button
                  onClick={handleMailInvoice}
                  disabled={isSendingMail}
                  className="w-full inline-flex items-center gap-3 px-4 py-3 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.06] hover:border-violet-400 dark:hover:border-violet-400/45 transition-colors text-left disabled:opacity-60 disabled:cursor-wait"
                >
                  <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0">
                    {isSendingMail ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.25} />
                    ) : (
                      <Mail className="w-4 h-4" strokeWidth={2.25} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-foreground">{isSendingMail ? 'Sending…' : 'Mail Invoice'}</div>
                    <div className="text-[11.5px] text-muted-foreground">{isSendingMail ? `Delivering to ${buyerEmail}` : 'Sent via Resend to the customer'}</div>
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

        {/* Invoice Content */}
        <div ref={printAreaRef} className="invoice-print-area flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
          {invoiceCopies.map((copyLabel, copyIndex) => (
          <div
            key={copyLabel}
            className={`invoice-print-page bg-white border border-foreground mx-auto max-w-[210mm] ${copyIndex > 0 ? 'mt-8 print:mt-0' : ''}`}
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            {/* Header */}
            <div className="text-right px-4 pt-2 text-xs">
              <div className="font-semibold">{copyLabel}</div>
            </div>

            <div className="text-center py-2 border-b border-foreground">
              <h1 className="text-xl font-bold">{isComposition ? 'BILL OF SUPPLY' : 'TAX INVOICE'}</h1>
            </div>

            {/* Company & Invoice Details */}
            <div className="grid grid-cols-2 border-b border-foreground">
              <div className="p-4 border-r border-foreground">
                <div className="flex gap-4 items-start">
                  <div className={`w-28 h-28 flex items-center justify-center flex-shrink-0 ${companyLogo ? '' : 'bg-primary/10 border border-border rounded'}`}>
                    {companyLogo ? (
                      <img src={companyLogo} alt={`${companyName} logo`} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">LOGO</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-sm mb-1">{companyName}</h2>
                    <div className="text-xs leading-relaxed">
                      {companyAddress.length > 0 ? (
                        companyAddress.map((line) => <div key={line}>{line}</div>)
                      ) : (
                        <div>Registered address: -</div>
                      )}
                      {companyPhone && <div>Phone: {companyPhone}</div>}
                      <div>Email: {companyEmail || '-'}</div>
                      <div className="font-semibold mt-1">GSTIN: {companyGstin}</div>
                      {companyPan && <div>PAN: {companyPan}</div>}
                      <div>State: {companyState || '-'}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <table className="w-full text-xs">
                  <tbody>
                    <tr>
                      <td className="py-1 font-semibold">INVOICE NO.</td>
                      <td className="py-1">{displayInvoiceNumber}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">DATED</td>
                      <td className="py-1">{formatDate(invoiceDate)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">PLACE OF SUPPLY</td>
                      <td className="py-1">{effectivePlaceOfSupply}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">REVERSE CHARGE</td>
                      <td className="py-1">{reverseCharge ? 'YES' : 'NO'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">CUSTOMER TYPE</td>
                      <td className="py-1">{customerType || '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">BILL TYPE</td>
                      <td className="py-1">{effectiveBillType || '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">PO NO. / DATE</td>
                      <td className="py-1">{poNumber || '-'} {poDate ? `/ ${formatDate(poDate)}` : ''}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">TRANSPORT</td>
                      <td className="py-1">{transportMode || '-'} {vehicleNo ? `/ ${vehicleNo}` : ''}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bill To & Ship To */}
            <div className="grid grid-cols-2 border-b border-foreground">
              <div className="p-4 border-r border-foreground">
                <div className="text-xs font-semibold mb-2">BILL TO</div>
                <div className="text-xs leading-relaxed">
                  <div className="font-bold">{buyerName}</div>
                  <div>Address:- {buyerAddress}</div>
                  <div>{buyerCity}</div>
                  {buyerContact && <div>Contact: {buyerContact}</div>}
                  {buyerPhone && <div>Phone: {buyerPhone}</div>}
                  {buyerEmail && <div>Email: {buyerEmail}</div>}
                  <div className="mt-1">Place of Supply: {effectivePlaceOfSupply}</div>
                  <div className="font-semibold">GSTIN: {buyerGstin}</div>
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs font-semibold mb-2">SHIP TO</div>
                <div className="text-xs leading-relaxed">
                  <div className="font-bold">{buyerName}</div>
                  <div>Address:- {buyerAddress}</div>
                  <div>{buyerCity}</div>
                  <div className="mt-1">Place of Supply: {effectivePlaceOfSupply}</div>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <table className="print-grid w-full text-xs border-b border-foreground">
              <thead>
                <tr className="border-b border-foreground bg-muted/30">
                  <th className="p-2 text-left border-r border-foreground w-8">Sr.</th>
                  <th className="p-2 text-left border-r border-foreground">Description of Goods/Services</th>
                  <th className="p-2 text-left border-r border-foreground w-20">HSN/SAC</th>
                  <th className="p-2 text-right border-r border-foreground w-12">Qty</th>
                  <th className="p-2 text-left border-r border-foreground w-12">Unit</th>
                  <th className="p-2 text-right border-r border-foreground w-20">Rate</th>
                  {!isComposition && (
                    <>
                      <th className="p-2 text-right border-r border-foreground w-24">Taxable</th>
                      {isInterStateSupply ? (
                        <th className="p-2 text-right border-r border-foreground w-20">IGST</th>
                      ) : (
                        <>
                          <th className="p-2 text-right border-r border-foreground w-20">CGST</th>
                          <th className="p-2 text-right border-r border-foreground w-20">SGST</th>
                        </>
                      )}
                    </>
                  )}
                  <th className="p-2 text-right w-24">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => {
                  const baseAmount = item.qty * item.rate;
                  const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
                  const tax = afterDiscount * item.gst / 100;
                  const cgst = isInterStateSupply ? 0 : tax / 2;
                  const sgst = isInterStateSupply ? 0 : tax / 2;
                  const igst = isInterStateSupply ? tax : 0;

                  return (
                    <tr key={item.id} className="border-b border-foreground">
                      <td className="p-2 border-r border-foreground">{index + 1}</td>
                      <td className="p-2 border-r border-foreground">
                        <div className="font-semibold">{item.item || '-'}</div>
                        {item.description && <div className="text-[10px] mt-1">{item.description}</div>}
                        {item.discount > 0 && <div className="text-[10px] mt-1">Discount: {item.discount}%</div>}
                      </td>
                      <td className="p-2 border-r border-foreground">{item.hsn || '-'}</td>
                      <td className="p-2 text-right border-r border-foreground">{item.qty.toFixed(2)}</td>
                      <td className="p-2 border-r border-foreground">{item.unit}</td>
                      <td className="p-2 text-right border-r border-foreground">{formatCurrency(item.rate)}</td>
                      {!isComposition && (
                        <>
                          <td className="p-2 text-right border-r border-foreground">{formatCurrency(afterDiscount)}</td>
                          {isInterStateSupply ? (
                            <td className="p-2 text-right border-r border-foreground">{formatCurrency(igst)}</td>
                          ) : (
                            <>
                              <td className="p-2 text-right border-r border-foreground">{formatCurrency(cgst)}</td>
                              <td className="p-2 text-right border-r border-foreground">{formatCurrency(sgst)}</td>
                            </>
                          )}
                        </>
                      )}
                      <td className="p-2 text-right">{formatCurrency(isComposition ? afterDiscount : afterDiscount + tax)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div className="border-b border-foreground">
              <table className="print-rows w-full text-xs">
                <tbody>
                  {!isComposition && (
                    <>
                      <tr className="border-b border-foreground">
                        <td className="p-2 font-semibold">Sub-Total (Taxable)</td>
                        <td className="p-2 text-right font-semibold">₹{formatCurrency(subtotal)}</td>
                      </tr>
                      {isInterStateSupply ? (
                        <tr className="border-b border-foreground">
                          <td className="p-2">Add: IGST</td>
                          <td className="p-2 text-right">₹{formatCurrency(igstTotal)}</td>
                        </tr>
                      ) : (
                        <>
                          <tr className="border-b border-foreground">
                            <td className="p-2">Add: CGST</td>
                            <td className="p-2 text-right">₹{formatCurrency(cgstTotal)}</td>
                          </tr>
                          <tr className="border-b border-foreground">
                            <td className="p-2">Add: SGST</td>
                            <td className="p-2 text-right">₹{formatCurrency(sgstTotal)}</td>
                          </tr>
                        </>
                      )}
                    </>
                  )}
                  <tr className="border-b border-foreground bg-muted/20">
                    <td className="p-2 font-bold">GRAND TOTAL</td>
                    <td className="p-2 text-right font-bold">₹{formatCurrency(grandTotal)}</td>
                  </tr>
                  {isComposition && (
                    <>
                      <tr className="border-b border-foreground">
                        <td className="p-2 font-semibold" colSpan={2}>Tax Amount (in words) : NIL</td>
                      </tr>
                      <tr className="border-b border-foreground">
                        <td className="p-2 font-semibold" colSpan={2}>Composition taxable person. Not eligible to collect tax on supplies.</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Amount in Words */}
            <div className="border-b border-foreground p-3 text-xs">
              <span className="font-semibold">Invoice Amount in Words:</span> {numberToWords(grandTotal)}
              <div className="text-right mt-2">E. & O.E.</div>
            </div>

            {remarks && (
              <div className="border-b border-foreground p-3 text-xs">
                <span className="font-semibold">Remarks / Narration:</span> {remarks}
              </div>
            )}

            {/* Bank Details & Declaration */}
            <div className="grid grid-cols-2">
              <div className="p-4 border-r border-foreground text-xs">
                <div className="font-semibold mb-2">BANK DETAILS</div>
                <div className="leading-relaxed">
                  <div>Bank: {companyDetails.bankName || '-'}</div>
                  <div>A/c No.: {companyDetails.bankAccountNumber || '-'}</div>
                  <div>IFSC: {companyDetails.bankIfsc || '-'}</div>
                  {companyDetails.bankBranch && <div>Branch: {companyDetails.bankBranch}</div>}
                </div>
              </div>
              <div className="p-4 text-xs">
                <div className="font-semibold mb-2">DECLARATION</div>
                <p className="leading-relaxed mb-8">
                  We declare that this invoice shows the actual price of the goods/services described
                  and that all particulars are true and correct.
                </p>
                <div className="mt-6 text-right">
                  <div className="relative ml-auto h-24 w-full max-w-[300px] overflow-hidden">
                    <div className="relative z-10 pr-1">For {companyName}</div>
                    {companyStamp && (
                      <img
                        src={companyStamp}
                        alt={`${companyName} stamp`}
                        className="absolute left-0 -top-2 z-20 max-h-24 max-w-[180px] object-contain opacity-90"
                      />
                    )}
                    {companyEsign && (
                      <img
                        src={companyEsign}
                        alt={`${companyName} signature`}
                        className="absolute right-4 top-1 z-20 max-h-20 max-w-[230px] object-contain"
                      />
                    )}
                    <div className="absolute bottom-0 right-0 z-10 border-t border-foreground inline-block min-w-[184px] px-8 pt-1 text-center">Authorised Signatory</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          ))}
        </div>
      </div>
    </div>
  );
}
