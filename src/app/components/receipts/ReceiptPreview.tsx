import { X, Download, Send, Printer, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { getGstinStateName } from '../../../lib/gstin';
import { sendInvoiceEmail } from '../../../lib/emailInvoice';

interface Customer {
  id?: string;
  companyName: string;
  gstin: string;
  contactName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  address?: string;
}

interface ReceiptPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  receiptNumber: string;
  receiptDate: string;
  amount: number;
  paymentMode: string;
  refNumber: string;
  notes: string;
  invoice?: string;
  customer?: Customer | null;
}

export function ReceiptPreview({
  isOpen,
  onClose,
  receiptNumber,
  receiptDate,
  amount,
  paymentMode,
  refNumber,
  notes,
  invoice,
  customer,
}: ReceiptPreviewProps) {
  const { user } = useAuth();

  const [companyDetails, setCompanyDetails] = useState({
    name: user?.company_name || 'Your Company',
    gstin: user?.company_gstin || '-',
    state: getGstinStateName(user?.company_gstin) || '',
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

  const [isSendingMail, setIsSendingMail] = useState(false);

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
          state: data?.state || getGstinStateName(data?.gstin) || getGstinStateName(user.company_gstin) || '',
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
  }, [isOpen, user?.company_id, user?.company_name, user?.company_gstin, user?.company_logo, user?.email]);

  if (!isOpen) return null;

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Company-side
  const companyName = companyDetails.name || 'Your Company';
  const companyGstin = companyDetails.gstin || '-';
  const companyState = companyDetails.state || getGstinStateName(companyGstin) || '';
  const companyPan = companyDetails.pan || (companyGstin.length >= 12 ? companyGstin.slice(2, 12) : '');
  const companyAddressLines = [
    companyDetails.address,
    [companyDetails.city, companyState, companyDetails.pinCode].filter(Boolean).join(', '),
  ].filter(Boolean);

  // Buyer-side
  const buyerName = customer?.companyName || 'Customer not selected';
  const buyerAddress = customer?.address || '';
  const buyerCity = customer?.city || '';
  const buyerState = customer?.state || getGstinStateName(customer?.gstin) || '';
  const buyerGstin = customer?.gstin || '';
  const buyerContact = customer?.contactName || '';
  const buyerPhone = customer?.phone || '';
  const buyerEmail = customer?.email || '';

  const displayReceiptNumber = receiptNumber || 'Auto-generated on save';

  // Number to words
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

  const handleSendReceipt = async () => {
    if (!buyerEmail) {
      toast.error('Customer email is not available.');
      return;
    }
    if (isSendingMail) return;

    setIsSendingMail(true);
    const sendingToast = toast.loading(`Sending receipt to ${buyerEmail}…`);

    const result = await sendInvoiceEmail({
      to: buyerEmail,
      invoiceNumber: displayReceiptNumber,
      customerName: buyerName,
      amount: amount.toFixed(2),
      fromName: companyName,
      replyTo: companyDetails.email || undefined,
    });

    toast.dismiss(sendingToast);
    setIsSendingMail(false);

    if (result.success) {
      toast.success(`Receipt ${displayReceiptNumber} sent to ${buyerEmail}`);
    } else {
      toast.error(result.error || 'Could not send the receipt email.');
    }
  };

  return (
    <div className="invoice-preview-modal fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="invoice-preview-shell bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[96vh] sm:max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="invoice-preview-actions flex items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-border">
          <h2 className="hidden sm:block text-lg font-semibold text-foreground shrink-0">Receipt Preview</h2>
          <h2 className="sm:hidden text-sm font-semibold text-foreground shrink-0">Preview</h2>
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
              onClick={handleSendReceipt}
              disabled={isSendingMail}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-wait"
              title="Send Receipt"
            >
              {isSendingMail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="hidden sm:inline text-sm">{isSendingMail ? 'Sending…' : 'Send Receipt'}</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded transition-colors" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="invoice-print-area flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
          <div className="invoice-print-page bg-white border-2 border-foreground mx-auto max-w-[210mm]" style={{ fontFamily: 'Arial, sans-serif' }}>
            {/* Header */}
            <div className="text-right px-4 pt-2 text-xs">
              <div className="font-semibold">PAYMENT RECEIPT</div>
            </div>

            <div className="text-center py-3 border-b-2 border-foreground bg-success/5">
              <h1 className="text-2xl font-bold text-success">RECEIPT</h1>
            </div>

            {/* Company & Receipt Details */}
            <div className="grid grid-cols-2 border-b-2 border-foreground">
              <div className="p-6 border-r-2 border-foreground">
                <div className="flex gap-3">
                  <div className="w-16 h-16 bg-primary/10 border border-border rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {companyDetails.logo ? (
                      <img src={companyDetails.logo} alt="Company logo" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">LOGO</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-sm mb-1 uppercase">{companyName}</h2>
                    <div className="text-xs leading-relaxed">
                      {companyAddressLines.map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                      {companyGstin && companyGstin !== '-' && (
                        <div className="font-semibold mt-2">GSTIN: {companyGstin}</div>
                      )}
                      {companyPan && <div>PAN: {companyPan}</div>}
                      {companyDetails.phone && <div className="mt-2">Phone: {companyDetails.phone}</div>}
                      {companyDetails.email && <div>Email: {companyDetails.email}</div>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="py-2 font-semibold w-1/2">Receipt No.</td>
                      <td className="py-2 font-mono">{displayReceiptNumber}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold">Date</td>
                      <td className="py-2">{formatDate(receiptDate)}</td>
                    </tr>
                    {invoice && (
                      <tr>
                        <td className="py-2 font-semibold">Invoice Ref.</td>
                        <td className="py-2 font-mono">{invoice}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-2 font-semibold">Payment Mode</td>
                      <td className="py-2">{paymentMode}</td>
                    </tr>
                    {refNumber && (
                      <tr>
                        <td className="py-2 font-semibold">Ref. Number</td>
                        <td className="py-2 font-mono">{refNumber}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Customer Details */}
            <div className="p-6 border-b-2 border-foreground">
              <div className="text-sm font-semibold mb-3">RECEIVED FROM</div>
              <div className="text-sm leading-relaxed">
                <div className="font-bold text-base uppercase">{buyerName}</div>
                {buyerAddress && <div className="mt-2">{buyerAddress}</div>}
                {(buyerCity || buyerState) && (
                  <div>{[buyerCity, buyerState].filter(Boolean).join(', ')}</div>
                )}
                {buyerGstin && <div className="mt-2 font-semibold">GSTIN: {buyerGstin}</div>}
                {buyerContact && <div>Contact: {buyerContact}</div>}
                {buyerPhone && <div>Phone: {buyerPhone}</div>}
                {buyerEmail && <div>Email: {buyerEmail}</div>}
              </div>
            </div>

            {/* Payment Details */}
            <div className="p-6 border-b-2 border-foreground">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-foreground bg-muted/20">
                    <th className="p-3 text-left text-sm font-semibold">Description</th>
                    <th className="p-3 text-right text-sm font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-foreground">
                    <td className="p-4 text-sm">
                      {invoice ? `Payment against Invoice ${invoice}` : 'Advance Payment Received'}
                      {notes && <div className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{notes}</div>}
                    </td>
                    <td className="p-4 text-right text-lg font-semibold tabular-nums">
                      ₹{formatCurrency(amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total Amount */}
            <div className="border-b-2 border-foreground">
              <div className="p-6 bg-success/10">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">TOTAL AMOUNT RECEIVED</span>
                  <span className="text-3xl font-bold text-success tabular-nums">
                    ₹{formatCurrency(amount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Amount in Words */}
            <div className="p-6 border-b-2 border-foreground text-sm">
              <div className="font-semibold mb-2">Amount in Words:</div>
              <div className="italic">{numberToWords(amount)}</div>
            </div>

            {/* Payment Method Details */}
            <div className="p-6 border-b-2 border-foreground">
              <div className="grid grid-cols-2 gap-8">
                <div className="text-sm">
                  <div className="font-semibold mb-2">PAYMENT DETAILS</div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mode:</span>
                      <span className="font-medium">{paymentMode}</span>
                    </div>
                    {refNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reference:</span>
                        <span className="font-medium font-mono">{refNumber}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date:</span>
                      <span className="font-medium">{formatDate(receiptDate)}</span>
                    </div>
                  </div>
                </div>
                <div className="text-sm">
                  <div className="font-semibold mb-2">RECEIVED BY</div>
                  <div className="text-muted-foreground">
                    This is a computer-generated receipt and does not require a physical signature.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-muted/20">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="text-xs font-semibold mb-2">COMPANY DETAILS</div>
                  <div className="text-xs space-y-1">
                    <div className="uppercase">{companyName}</div>
                    {companyGstin && companyGstin !== '-' && <div>GSTIN: {companyGstin}</div>}
                    {companyPan && <div>PAN: {companyPan}</div>}
                    {companyDetails.bankName && (
                      <>
                        <div className="mt-2 font-semibold">Bank:</div>
                        <div>{companyDetails.bankName}</div>
                        {companyDetails.bankAccountNumber && <div>A/c: {companyDetails.bankAccountNumber}</div>}
                        {companyDetails.bankIfsc && <div>IFSC: {companyDetails.bankIfsc}</div>}
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">
                    For any queries, please contact:
                  </div>
                  <div className="text-xs mt-1">
                    {companyDetails.phone && <div>Phone: {companyDetails.phone}</div>}
                    {companyDetails.email && <div>Email: {companyDetails.email}</div>}
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="font-semibold mb-3 uppercase">For {companyName}</div>
                    <div className="h-12 flex items-end justify-end gap-2 mb-1">
                      {companyDetails.esignImage && (
                        <img src={companyDetails.esignImage} alt="Signature" className="h-12 object-contain" />
                      )}
                      {companyDetails.stampImage && (
                        <img src={companyDetails.stampImage} alt="Stamp" className="h-12 object-contain" />
                      )}
                    </div>
                    <div className="text-xs border-t border-foreground inline-block px-8 pt-1">
                      Authorised Signatory
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Note */}
            <div className="p-4 bg-success/5 text-center text-xs text-muted-foreground border-t-2 border-foreground">
              Thank you for your payment. This is a system-generated receipt.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
