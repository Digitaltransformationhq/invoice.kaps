import { X, Download, Send, Printer, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { getGstinStateName, normalizeIndianState } from '../../../lib/gstin';
import { sendInvoiceEmail } from '../../../lib/emailInvoice';

interface LineItem {
  id: string;
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

interface CreditNotePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  lineItems: LineItem[];
  noteNumber: string;
  noteDate: string;
  noteType: 'credit' | 'debit';
  reason: string;
  originalInvoice: string;
  customer?: Customer | null;
}

export function CreditNotePreview({
  isOpen,
  onClose,
  lineItems,
  noteNumber,
  noteDate,
  noteType,
  reason,
  originalInvoice,
  customer,
}: CreditNotePreviewProps) {
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
    companyDetails.phone ? `Phone: ${companyDetails.phone}` : '',
    companyDetails.email ? `Email: ${companyDetails.email}` : '',
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

  const supplyState = buyerState;
  const isInterStateSupply = Boolean(
    companyState &&
    supplyState &&
    normalizeIndianState(companyState) !== normalizeIndianState(supplyState),
  );

  const placeOfSupplyLabel = supplyState
    ? `${supplyState}${buyerCity ? ` (${buyerCity})` : ''}`
    : '-';

  // Totals
  const subtotal = lineItems.reduce((sum, item) => {
    const baseAmount = item.qty * item.rate;
    return sum + baseAmount - (baseAmount * item.discount / 100);
  }, 0);

  const totalTax = lineItems.reduce((sum, item) => {
    const baseAmount = item.qty * item.rate;
    const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
    return sum + (afterDiscount * item.gst / 100);
  }, 0);

  const cgstTotal = isInterStateSupply ? 0 : totalTax / 2;
  const sgstTotal = isInterStateSupply ? 0 : totalTax / 2;
  const igstTotal = isInterStateSupply ? totalTax : 0;
  const grandTotal = subtotal + totalTax;

  const displayNoteNumber = noteNumber || 'Auto-generated on save';

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

  const handleSendNote = async () => {
    if (!buyerEmail) {
      toast.error('Customer email is not available.');
      return;
    }
    if (isSendingMail) return;

    setIsSendingMail(true);
    const sendingToast = toast.loading(`Sending ${noteType} note to ${buyerEmail}…`);

    const result = await sendInvoiceEmail({
      to: buyerEmail,
      invoiceNumber: displayNoteNumber,
      customerName: buyerName,
      amount: grandTotal.toFixed(2),
      fromName: companyName,
      replyTo: companyDetails.email || undefined,
    });

    toast.dismiss(sendingToast);
    setIsSendingMail(false);

    if (result.success) {
      toast.success(`${noteType === 'credit' ? 'Credit' : 'Debit'} note ${displayNoteNumber} sent to ${buyerEmail}`);
    } else {
      toast.error(result.error || 'Could not send the note email.');
    }
  };

  return (
    <div className="invoice-preview-modal fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="invoice-preview-shell bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="invoice-preview-actions flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {noteType === 'credit' ? 'Credit' : 'Debit'} Note Preview
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded hover:bg-muted transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Download PDF</span>
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded hover:bg-muted transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span className="text-sm">Print</span>
            </button>
            <button
              onClick={handleSendNote}
              disabled={isSendingMail}
              className="inline-flex items-center gap-2 px-3 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {isSendingMail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="text-sm">{isSendingMail ? 'Sending…' : 'Send Note'}</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Note Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white border-2 border-foreground mx-auto max-w-[210mm]" style={{ fontFamily: 'Arial, sans-serif' }}>
            {/* Header */}
            <div className="text-right px-4 pt-2 text-xs">
              <div className="font-semibold">ORIGINAL FOR BUYER</div>
            </div>

            <div className={`text-center py-2 border-b-2 border-foreground ${noteType === 'credit' ? 'bg-success/5' : 'bg-warning/5'}`}>
              <h1 className={`text-xl font-bold ${noteType === 'credit' ? 'text-success' : 'text-warning'}`}>
                {noteType === 'credit' ? 'CREDIT NOTE' : 'DEBIT NOTE'}
              </h1>
            </div>

            {/* Company & Note Details */}
            <div className="grid grid-cols-2 border-b-2 border-foreground">
              <div className="p-4 border-r-2 border-foreground">
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
                        <div className="font-semibold mt-1">GSTIN: {companyGstin}</div>
                      )}
                      {companyPan && (
                        <div>PAN: {companyPan}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <table className="w-full text-xs">
                  <tbody>
                    <tr>
                      <td className="py-1 font-semibold w-1/2">NOTE NO.</td>
                      <td className="py-1">{displayNoteNumber}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">DATED</td>
                      <td className="py-1">{formatDate(noteDate)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">ORIGINAL INVOICE</td>
                      <td className="py-1">{originalInvoice || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">PLACE OF SUPPLY</td>
                      <td className="py-1">{placeOfSupplyLabel}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">SUPPLY TYPE</td>
                      <td className="py-1">{isInterStateSupply ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reason */}
            {reason && (
              <div className="p-4 border-b-2 border-foreground bg-muted/20">
                <div className="text-xs font-semibold mb-1">REASON:</div>
                <div className="text-xs whitespace-pre-line">{reason}</div>
              </div>
            )}

            {/* Bill To & Ship To */}
            <div className="grid grid-cols-2 border-b-2 border-foreground">
              <div className="p-4 border-r-2 border-foreground">
                <div className="text-xs font-semibold mb-2">BILL TO</div>
                <div className="text-xs leading-relaxed">
                  <div className="font-bold uppercase">{buyerName}</div>
                  {buyerAddress && <div>{buyerAddress}</div>}
                  {(buyerCity || buyerState) && (
                    <div>{[buyerCity, buyerState].filter(Boolean).join(', ')}</div>
                  )}
                  {buyerState && (
                    <div className="mt-1">State: {buyerState}</div>
                  )}
                  {buyerGstin && (
                    <div className="font-semibold">GSTIN: {buyerGstin}</div>
                  )}
                  {buyerContact && <div className="mt-1">Contact: {buyerContact}</div>}
                  {buyerPhone && <div>Phone: {buyerPhone}</div>}
                  {buyerEmail && <div>Email: {buyerEmail}</div>}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs font-semibold mb-2">SHIP TO</div>
                <div className="text-xs leading-relaxed">
                  <div className="font-bold uppercase">{buyerName}</div>
                  {buyerAddress && <div>{buyerAddress}</div>}
                  {(buyerCity || buyerState) && (
                    <div>{[buyerCity, buyerState].filter(Boolean).join(', ')}</div>
                  )}
                  {buyerState && (
                    <div className="mt-1">State: {buyerState}</div>
                  )}
                  {buyerGstin && (
                    <div className="font-semibold">GSTIN: {buyerGstin}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <table className="w-full text-xs border-b-2 border-foreground">
              <thead>
                <tr className="border-b-2 border-foreground bg-muted/30">
                  <th className="p-2 text-left border-r border-foreground w-8">Sr.</th>
                  <th className="p-2 text-left border-r border-foreground">Description of Goods/Services</th>
                  <th className="p-2 text-left border-r border-foreground w-20">HSN/SAC</th>
                  <th className="p-2 text-right border-r border-foreground w-12">Qty</th>
                  <th className="p-2 text-left border-r border-foreground w-12">Unit</th>
                  <th className="p-2 text-right border-r border-foreground w-20">Rate</th>
                  <th className="p-2 text-right border-r border-foreground w-24">Taxable</th>
                  {isInterStateSupply ? (
                    <th className="p-2 text-right border-r border-foreground w-24">IGST</th>
                  ) : (
                    <>
                      <th className="p-2 text-right border-r border-foreground w-20">CGST</th>
                      <th className="p-2 text-right border-r border-foreground w-20">SGST</th>
                    </>
                  )}
                  <th className="p-2 text-right w-24">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={isInterStateSupply ? 9 : 10} className="p-4 text-center text-muted-foreground">
                      No line items.
                    </td>
                  </tr>
                ) : lineItems.map((item, index) => {
                  const baseAmount = item.qty * item.rate;
                  const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
                  const taxOnLine = afterDiscount * item.gst / 100;
                  const cgst = isInterStateSupply ? 0 : taxOnLine / 2;
                  const sgst = isInterStateSupply ? 0 : taxOnLine / 2;
                  const igst = isInterStateSupply ? taxOnLine : 0;

                  return (
                    <tr key={item.id} className="border-b border-foreground">
                      <td className="p-2 border-r border-foreground">{index + 1}</td>
                      <td className="p-2 border-r border-foreground">
                        <div className="font-semibold">{item.item}</div>
                        {item.description && <div className="text-[10px] opacity-80">{item.description}</div>}
                      </td>
                      <td className="p-2 border-r border-foreground">{item.hsn}</td>
                      <td className="p-2 text-right border-r border-foreground tabular-nums">{item.qty.toFixed(2)}</td>
                      <td className="p-2 border-r border-foreground">{item.unit}</td>
                      <td className="p-2 text-right border-r border-foreground tabular-nums">{formatCurrency(item.rate)}</td>
                      <td className="p-2 text-right border-r border-foreground tabular-nums">{formatCurrency(afterDiscount)}</td>
                      {isInterStateSupply ? (
                        <td className="p-2 text-right border-r border-foreground tabular-nums">
                          <div>{formatCurrency(igst)}</div>
                          <div className="text-[10px] opacity-70">{item.gst}%</div>
                        </td>
                      ) : (
                        <>
                          <td className="p-2 text-right border-r border-foreground tabular-nums">
                            <div>{formatCurrency(cgst)}</div>
                            <div className="text-[10px] opacity-70">{(item.gst / 2).toFixed(1)}%</div>
                          </td>
                          <td className="p-2 text-right border-r border-foreground tabular-nums">
                            <div>{formatCurrency(sgst)}</div>
                            <div className="text-[10px] opacity-70">{(item.gst / 2).toFixed(1)}%</div>
                          </td>
                        </>
                      )}
                      <td className="p-2 text-right tabular-nums">{formatCurrency(item.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div className="border-b-2 border-foreground">
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-foreground">
                    <td className="p-2 font-semibold">Sub-Total (Taxable)</td>
                    <td className="p-2 text-right font-semibold tabular-nums">₹{formatCurrency(subtotal)}</td>
                  </tr>
                  {isInterStateSupply ? (
                    <tr className="border-b-2 border-foreground">
                      <td className="p-2">Add: IGST</td>
                      <td className="p-2 text-right tabular-nums">₹{formatCurrency(igstTotal)}</td>
                    </tr>
                  ) : (
                    <>
                      <tr className="border-b border-foreground">
                        <td className="p-2">Add: CGST</td>
                        <td className="p-2 text-right tabular-nums">₹{formatCurrency(cgstTotal)}</td>
                      </tr>
                      <tr className="border-b-2 border-foreground">
                        <td className="p-2">Add: SGST</td>
                        <td className="p-2 text-right tabular-nums">₹{formatCurrency(sgstTotal)}</td>
                      </tr>
                    </>
                  )}
                  <tr className={`border-b-2 border-foreground ${noteType === 'credit' ? 'bg-success/10' : 'bg-warning/10'}`}>
                    <td className="p-2 font-bold">GRAND TOTAL ({noteType === 'credit' ? 'CREDIT' : 'DEBIT'})</td>
                    <td className={`p-2 text-right font-bold tabular-nums ${noteType === 'credit' ? 'text-success' : 'text-warning'}`}>
                      {noteType === 'credit' ? '−' : '+'}₹{formatCurrency(grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Amount in Words */}
            <div className="border-b-2 border-foreground p-3 text-xs">
              <span className="font-semibold">Amount in Words:</span> {numberToWords(grandTotal)}
              <div className="text-right mt-2">E. & O.E.</div>
            </div>

            {/* Bank Details & Declaration */}
            <div className="grid grid-cols-2">
              <div className="p-4 border-r-2 border-foreground text-xs">
                <div className="font-semibold mb-2">BANK DETAILS</div>
                <div className="leading-relaxed">
                  {companyDetails.bankName ? (
                    <>
                      <div>Bank: {companyDetails.bankName}</div>
                      {companyDetails.bankAccountNumber && <div>A/c No.: {companyDetails.bankAccountNumber}</div>}
                      {companyDetails.bankIfsc && <div>IFSC: {companyDetails.bankIfsc}</div>}
                      {companyDetails.bankBranch && <div>Branch: {companyDetails.bankBranch}</div>}
                    </>
                  ) : (
                    <div className="italic text-muted-foreground">Add bank details in Company Settings to display here.</div>
                  )}
                  <div className="mt-3 italic text-[10px]">Company GSTIN: {companyGstin}</div>
                  {buyerGstin && <div className="italic text-[10px]">Buyer GSTIN: {buyerGstin}</div>}
                </div>
              </div>
              <div className="p-4 text-xs">
                <div className="font-semibold mb-2">DECLARATION</div>
                <p className="leading-relaxed mb-6">
                  We declare that this {noteType === 'credit' ? 'credit' : 'debit'} note shows the actual adjustments
                  and that all particulars are true and correct.
                </p>
                <div className="mt-6 text-right">
                  <div className="mb-2 uppercase">For {companyName}</div>
                  <div className="h-12 flex items-end justify-end gap-2">
                    {companyDetails.esignImage && (
                      <img src={companyDetails.esignImage} alt="Signature" className="h-12 object-contain" />
                    )}
                    {companyDetails.stampImage && (
                      <img src={companyDetails.stampImage} alt="Stamp" className="h-12 object-contain" />
                    )}
                  </div>
                  <div className="border-t border-foreground inline-block px-8 pt-1">Authorised Signatory</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
