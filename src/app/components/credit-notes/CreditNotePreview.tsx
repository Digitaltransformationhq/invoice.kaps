import { X, Download, Send, Printer } from 'lucide-react';

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

interface CreditNotePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  lineItems: LineItem[];
  noteNumber: string;
  noteDate: string;
  noteType: 'credit' | 'debit';
  reason: string;
  originalInvoice: string;
}

export function CreditNotePreview({
  isOpen,
  onClose,
  lineItems,
  noteNumber,
  noteDate,
  noteType,
  reason,
  originalInvoice
}: CreditNotePreviewProps) {
  if (!isOpen) return null;

  const subtotal = lineItems.reduce((sum, item) => {
    return sum + (item.qty * item.rate) - ((item.qty * item.rate) * item.discount / 100);
  }, 0);

  const cgstTotal = lineItems.reduce((sum, item) => {
    const baseAmount = item.qty * item.rate;
    const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
    return sum + (afterDiscount * item.gst / 100 / 2);
  }, 0);

  const sgstTotal = cgstTotal;
  const grandTotal = subtotal + cgstTotal + sgstTotal;

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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {noteType === 'credit' ? 'Credit' : 'Debit'} Note Preview
          </h2>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded hover:bg-muted transition-colors">
              <Download className="w-4 h-4" />
              <span className="text-sm">Download PDF</span>
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded hover:bg-muted transition-colors">
              <Printer className="w-4 h-4" />
              <span className="text-sm">Print</span>
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors">
              <Send className="w-4 h-4" />
              <span className="text-sm">Send Note</span>
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
                  <div className="w-16 h-16 bg-primary/10 border border-border rounded flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-muted-foreground">LOGO</span>
                  </div>
                  <div>
                    <h2 className="font-bold text-sm mb-1">MY COMPANY PVT LTD</h2>
                    <div className="text-xs leading-relaxed">
                      <div>123 Business Street</div>
                      <div>Near City Center</div>
                      <div>Mumbai, Maharashtra - 400001</div>
                      <div className="font-semibold mt-1">GSTIN: 27AAAAA0000A1Z5</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <table className="w-full text-xs">
                  <tbody>
                    <tr>
                      <td className="py-1 font-semibold">NOTE NO.</td>
                      <td className="py-1">{noteNumber}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">DATED</td>
                      <td className="py-1">{new Date(noteDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">ORIGINAL INVOICE</td>
                      <td className="py-1">{originalInvoice || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">PLACE OF SUPPLY</td>
                      <td className="py-1">Gujarat (24)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reason */}
            {reason && (
              <div className="p-4 border-b-2 border-foreground bg-muted/20">
                <div className="text-xs font-semibold mb-1">REASON:</div>
                <div className="text-xs">{reason}</div>
              </div>
            )}

            {/* Bill To & Ship To */}
            <div className="grid grid-cols-2 border-b-2 border-foreground">
              <div className="p-4 border-r-2 border-foreground">
                <div className="text-xs font-semibold mb-2">BILL TO</div>
                <div className="text-xs leading-relaxed">
                  <div className="font-bold">CUSTOMER COMPANY NAME</div>
                  <div>123 Customer Address</div>
                  <div>Area, Landmark</div>
                  <div>City, State, 400001</div>
                  <div className="mt-1">State: Gujarat (Code: 24)</div>
                  <div className="font-semibold">GSTIN: 24AAAAA0000A1Z9</div>
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs font-semibold mb-2">SHIP TO</div>
                <div className="text-xs leading-relaxed">
                  <div className="font-bold">CUSTOMER COMPANY NAME</div>
                  <div>123 Customer Address</div>
                  <div>Area, Landmark</div>
                  <div>City, State, 400001</div>
                  <div className="mt-1">State: Gujarat (Code: 24)</div>
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
                      <td className="p-2 border-r border-foreground">{item.item}</td>
                      <td className="p-2 border-r border-foreground">{item.hsn}</td>
                      <td className="p-2 text-right border-r border-foreground">{item.qty.toFixed(2)}</td>
                      <td className="p-2 border-r border-foreground">{item.unit}</td>
                      <td className="p-2 text-right border-r border-foreground">{item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right border-r border-foreground">{afterDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right border-r border-foreground">{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right border-r border-foreground">{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right">{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
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
                    <td className="p-2 text-right font-semibold">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="border-b border-foreground">
                    <td className="p-2">Add: CGST</td>
                    <td className="p-2 text-right">₹{cgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="border-b-2 border-foreground">
                    <td className="p-2">Add: SGST</td>
                    <td className="p-2 text-right">₹{sgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className={`border-b-2 border-foreground ${noteType === 'credit' ? 'bg-success/10' : 'bg-warning/10'}`}>
                    <td className="p-2 font-bold">GRAND TOTAL ({noteType === 'credit' ? 'CREDIT' : 'DEBIT'})</td>
                    <td className={`p-2 text-right font-bold ${noteType === 'credit' ? 'text-success' : 'text-warning'}`}>
                      {noteType === 'credit' ? '-' : '+'}₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                  <div>Bank: State Bank of India</div>
                  <div>A/c No.: 41119711722</div>
                  <div>IFSC: SBIN0011005</div>
                  <div className="mt-3 italic text-[10px]">Company GSTIN: 27AAAAA0000A1Z5</div>
                  <div className="italic text-[10px]">Buyer GSTIN: 24AAAAA0000A1Z9</div>
                </div>
              </div>
              <div className="p-4 text-xs">
                <div className="font-semibold mb-2">DECLARATION</div>
                <p className="leading-relaxed mb-8">
                  We declare that this {noteType === 'credit' ? 'credit' : 'debit'} note shows the actual adjustments
                  and that all particulars are true and correct.
                </p>
                <div className="mt-8 text-right">
                  <div className="mb-8">For My Company Pvt Ltd</div>
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
