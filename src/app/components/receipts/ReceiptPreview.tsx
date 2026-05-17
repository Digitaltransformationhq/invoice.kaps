import { X, Download, Send, Printer } from 'lucide-react';

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
  invoice
}: ReceiptPreviewProps) {
  if (!isOpen) return null;

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
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Receipt Preview</h2>
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
              <span className="text-sm">Send Receipt</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white border-2 border-foreground mx-auto max-w-[210mm]" style={{ fontFamily: 'Arial, sans-serif' }}>
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
                  <div className="w-16 h-16 bg-primary/10 border border-border rounded flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-muted-foreground">LOGO</span>
                  </div>
                  <div>
                    <h2 className="font-bold text-sm mb-1">MY COMPANY PVT LTD</h2>
                    <div className="text-xs leading-relaxed">
                      <div>123 Business Street</div>
                      <div>Near City Center</div>
                      <div>Mumbai, Maharashtra - 400001</div>
                      <div className="font-semibold mt-2">GSTIN: 27AAAAA0000A1Z5</div>
                      <div className="mt-2">Phone: +91 98765 43210</div>
                      <div>Email: accounts@company.com</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="py-2 font-semibold">Receipt No.</td>
                      <td className="py-2">{receiptNumber}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold">Date</td>
                      <td className="py-2">{new Date(receiptDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
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
                <div className="font-bold text-base">CUSTOMER COMPANY NAME</div>
                <div className="mt-2">123 Customer Address</div>
                <div>Area, Landmark</div>
                <div>City, State, 400001</div>
                <div className="mt-2">GSTIN: 24AAAAA0000A1Z9</div>
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
                      {notes && <div className="text-xs text-muted-foreground mt-1">{notes}</div>}
                    </td>
                    <td className="p-4 text-right text-lg font-semibold">
                      ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  <span className="text-3xl font-bold text-success">
                    ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                      <span className="font-medium">
                        {new Date(receiptDate).toLocaleDateString('en-GB')}
                      </span>
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
                    <div>My Company Pvt Ltd</div>
                    <div>GSTIN: 27AAAAA0000A1Z5</div>
                    <div>PAN: AAAAA1234A</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">
                    For any queries, please contact:
                  </div>
                  <div className="text-xs mt-1">
                    <div>Phone: +91 98765 43210</div>
                    <div>Email: accounts@company.com</div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="font-semibold mb-6">For My Company Pvt Ltd</div>
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
