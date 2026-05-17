import { X, Download, Send, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

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
  id: string;
  companyName: string;
  gstin: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
}

interface InvoicePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  lineItems: LineItem[];
  invoiceNumber: string;
  invoiceDate: string;
  customer?: Customer | null;
  customerType?: string;
  billType?: string;
  placeOfSupply?: string;
  reverseCharge?: boolean;
  poNumber?: string;
  poDate?: string;
  vehicleNo?: string;
  transportMode?: string;
  remarks?: string;
}

export function InvoicePreview({
  isOpen,
  onClose,
  lineItems,
  invoiceNumber,
  invoiceDate,
  customer,
  customerType,
  billType,
  placeOfSupply,
  reverseCharge = false,
  poNumber,
  poDate,
  vehicleNo,
  transportMode,
  remarks,
}: InvoicePreviewProps) {
  const { user } = useAuth();
  const [companyDetails, setCompanyDetails] = useState({
    name: user?.company_name || 'Your Company',
    gstin: user?.company_gstin || '-',
    email: user?.email || '',
    logo: user?.company_logo || '',
  });

  useEffect(() => {
    if (!isOpen || !user?.company_id) return;

    const loadCompanyDetails = async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('company_name, gstin, email, company_logo')
        .eq('id', user.company_id)
        .single();

      if (!error) {
        setCompanyDetails({
          name: data?.company_name || user.company_name || 'Your Company',
          gstin: data?.gstin || user.company_gstin || '-',
          email: data?.email || user.email || '',
          logo: data?.company_logo || user.company_logo || '',
        });
      }
    };

    loadCompanyDetails();
  }, [isOpen, user?.company_id, user?.company_name, user?.company_gstin, user?.company_logo, user?.email]);

  if (!isOpen) return null;

  const getInvoiceCopies = (type?: string) => {
    const normalizedType = (type || '').trim().toLowerCase();

    if (normalizedType === 'only service') {
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
  const effectivePlaceOfSupply = placeOfSupply === 'Auto from customer'
    ? customer?.city || 'Auto from customer'
    : placeOfSupply || customer?.city || '-';
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
  const companyEmail = companyDetails.email || user?.email || '';
  const companyLogo = companyDetails.logo || user?.company_logo || '';
  const buyerName = customer?.companyName || 'Customer not selected';
  const buyerAddress = customer?.address || '-';
  const buyerCity = customer?.city || '-';
  const buyerGstin = customer?.gstin || '-';
  const buyerContact = customer?.contactName || '';
  const buyerPhone = customer?.phone || '';
  const buyerEmail = customer?.email || '';
  const invoiceCopies = getInvoiceCopies(billType);

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => {
    return sum + (item.qty * item.rate) - ((item.qty * item.rate) * item.discount / 100);
  }, 0);

  const cgstTotal = lineItems.reduce((sum, item) => {
    const baseAmount = item.qty * item.rate;
    const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
    return sum + (afterDiscount * item.gst / 100 / 2);
  }, 0);

  const sgstTotal = cgstTotal; // Same as CGST for intra-state
  const grandTotal = subtotal + cgstTotal + sgstTotal;

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
    <div className="invoice-preview-modal fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="invoice-preview-shell bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="invoice-preview-actions flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Invoice Preview</h2>
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
              onClick={() => alert(`Invoice ${displayInvoiceNumber} is ready to send${buyerEmail ? ` to ${buyerEmail}` : ''}.`)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              <Send className="w-4 h-4" />
              <span className="text-sm">Send Invoice</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Content */}
        <div className="invoice-print-area flex-1 overflow-y-auto p-6">
          {invoiceCopies.map((copyLabel, copyIndex) => (
          <div
            key={copyLabel}
            className={`invoice-print-page bg-white border-2 border-foreground mx-auto max-w-[210mm] ${copyIndex > 0 ? 'mt-8 print:mt-0' : ''}`}
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            {/* Header */}
            <div className="text-right px-4 pt-2 text-xs">
              <div className="font-semibold">{copyLabel}</div>
            </div>

            <div className="text-center py-2 border-b-2 border-foreground">
              <h1 className="text-xl font-bold">TAX INVOICE</h1>
            </div>

            {/* Company & Invoice Details */}
            <div className="grid grid-cols-2 border-b-2 border-foreground">
              <div className="p-4 border-r-2 border-foreground">
                <div className="flex gap-3">
                  <div className="w-16 h-16 bg-primary/10 border border-border rounded flex items-center justify-center flex-shrink-0">
                    {companyLogo ? (
                      <img src={companyLogo} alt={`${companyName} logo`} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">LOGO</span>
                    )}
                  </div>
                  <div>
                    <h2 className="font-bold text-sm mb-1">{companyName}</h2>
                    <div className="text-xs leading-relaxed">
                      <div>{companyEmail || '-'}</div>
                      <div className="font-semibold mt-1">GSTIN: {companyGstin}</div>
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
                      <td className="py-1">{billType || '-'}</td>
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
            <div className="grid grid-cols-2 border-b-2 border-foreground">
              <div className="p-4 border-r-2 border-foreground">
                <div className="text-xs font-semibold mb-2">BILL TO</div>
                <div className="text-xs leading-relaxed">
                  <div className="font-bold">{buyerName}</div>
                  <div>{buyerAddress}</div>
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
                  <div>{buyerAddress}</div>
                  <div>{buyerCity}</div>
                  <div className="mt-1">Place of Supply: {effectivePlaceOfSupply}</div>
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
                  <th className="p-2 text-right border-r border-foreground w-20">CGST</th>
                  <th className="p-2 text-right border-r border-foreground w-20">SGST</th>
                  <th className="p-2 text-right w-24">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => {
                  const baseAmount = item.qty * item.rate;
                  const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
                  const cgst = afterDiscount * item.gst / 100 / 2;
                  const sgst = cgst;

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
                      <td className="p-2 text-right border-r border-foreground">{formatCurrency(afterDiscount)}</td>
                      <td className="p-2 text-right border-r border-foreground">{formatCurrency(cgst)}</td>
                      <td className="p-2 text-right border-r border-foreground">{formatCurrency(sgst)}</td>
                      <td className="p-2 text-right">{formatCurrency(afterDiscount + cgst + sgst)}</td>
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
                    <td className="p-2 text-right font-semibold">₹{formatCurrency(subtotal)}</td>
                  </tr>
                  <tr className="border-b border-foreground">
                    <td className="p-2">Add: CGST</td>
                    <td className="p-2 text-right">₹{formatCurrency(cgstTotal)}</td>
                  </tr>
                  <tr className="border-b-2 border-foreground">
                    <td className="p-2">Add: SGST</td>
                    <td className="p-2 text-right">₹{formatCurrency(sgstTotal)}</td>
                  </tr>
                  <tr className="border-b-2 border-foreground bg-muted/20">
                    <td className="p-2 font-bold">GRAND TOTAL</td>
                    <td className="p-2 text-right font-bold">₹{formatCurrency(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Amount in Words */}
            <div className="border-b-2 border-foreground p-3 text-xs">
              <span className="font-semibold">Invoice Amount in Words:</span> {numberToWords(grandTotal)}
              <div className="text-right mt-2">E. & O.E.</div>
            </div>

            {remarks && (
              <div className="border-b-2 border-foreground p-3 text-xs">
                <span className="font-semibold">Remarks / Narration:</span> {remarks}
              </div>
            )}

            {/* Bank Details & Declaration */}
            <div className="grid grid-cols-2">
              <div className="p-4 border-r-2 border-foreground text-xs">
                <div className="font-semibold mb-2">BANK DETAILS</div>
                <div className="leading-relaxed">
                  <div>Bank: -</div>
                  <div>A/c No.: -</div>
                  <div>IFSC: -</div>
                  <div className="mt-3 italic text-[10px]">Company GSTIN: {companyGstin}</div>
                  <div className="italic text-[10px]">Buyer GSTIN: {buyerGstin}</div>
                </div>
              </div>
              <div className="p-4 text-xs">
                <div className="font-semibold mb-2">DECLARATION</div>
                <p className="leading-relaxed mb-8">
                  We declare that this invoice shows the actual price of the goods/services described
                  and that all particulars are true and correct.
                </p>
                <div className="mt-8 text-right">
                  <div className="mb-8">For {companyName}</div>
                  <div className="border-t border-foreground inline-block px-8 pt-1">Authorised Signatory</div>
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
