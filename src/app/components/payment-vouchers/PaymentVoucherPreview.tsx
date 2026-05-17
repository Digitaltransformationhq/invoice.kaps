import { X, Download, Printer, Check, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect } from 'react';

interface PaymentVoucherPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  voucherNumber: string;
  voucherDate: string;
  payee: string;
  category: string;
  amount: number;
  paymentMode: string;
  refNumber: string;
  purpose: string;
  notes: string;
}

export function PaymentVoucherPreview({
  isOpen,
  onClose,
  voucherNumber,
  voucherDate,
  payee,
  category,
  amount,
  paymentMode,
  refNumber,
  purpose,
  notes
}: PaymentVoucherPreviewProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
    toast.success('Opening print dialog');
  };

  const handleDownload = () => {
    toast.info('PDF Download', {
      description: 'This would generate and download a PDF of the voucher'
    });
  };

  const handleSend = () => {
    const subject = encodeURIComponent(`Payment Voucher - ${voucherNumber}`);
    const body = encodeURIComponent(
      `Dear ${payee},\n\n` +
      `Please find attached the payment voucher details:\n\n` +
      `Voucher Number: ${voucherNumber}\n` +
      `Date: ${voucherDate}\n` +
      `Amount: ₹${amount.toLocaleString('en-IN')}\n` +
      `Payment Mode: ${paymentMode}\n` +
      `Reference: ${refNumber}\n` +
      `Purpose: ${purpose}\n\n` +
      `Best regards,\n` +
      `My Company Pvt Ltd`
    );

    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    toast.success('Email client opened', {
      description: 'Compose and send the payment voucher'
    });
  };

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
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Payment Voucher Preview</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded hover:bg-muted transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Download PDF</span>
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded hover:bg-muted transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span className="text-sm">Print</span>
            </button>
            <button
              onClick={handleSend}
              className="inline-flex items-center gap-2 px-3 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              <Mail className="w-4 h-4" />
              <span className="text-sm">Send Voucher</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Voucher Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white border-2 border-foreground mx-auto max-w-[210mm]" style={{ fontFamily: 'Arial, sans-serif' }}>
            {/* Header */}
            <div className="text-center py-4 border-b-2 border-foreground bg-destructive/5">
              <h1 className="text-2xl font-bold text-destructive">PAYMENT VOUCHER</h1>
            </div>

            {/* Company & Voucher Details */}
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
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="py-2 font-semibold">Voucher No.</td>
                      <td className="py-2">{voucherNumber}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold">Date</td>
                      <td className="py-2">{new Date(voucherDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold">Category</td>
                      <td className="py-2">{category}</td>
                    </tr>
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

            {/* Payee Details */}
            <div className="p-6 border-b-2 border-foreground">
              <div className="text-sm font-semibold mb-3">PAID TO</div>
              <div className="text-lg font-bold">{payee || 'Not specified'}</div>
            </div>

            {/* Payment Details */}
            <div className="p-6 border-b-2 border-foreground">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-foreground bg-muted/20">
                    <th className="p-3 text-left text-sm font-semibold">Purpose / Description</th>
                    <th className="p-3 text-right text-sm font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-foreground">
                    <td className="p-4 text-sm">
                      <div className="font-medium mb-1">{purpose || 'Payment'}</div>
                      {notes && <div className="text-xs text-muted-foreground mt-2">{notes}</div>}
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
              <div className="p-6 bg-destructive/10">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">TOTAL AMOUNT PAID</span>
                  <span className="text-3xl font-bold text-destructive">
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
              <div className="text-sm font-semibold mb-3">PAYMENT DETAILS</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Payment Mode:</span>
                  <span className="font-medium ml-2">{paymentMode}</span>
                </div>
                {refNumber && (
                  <div>
                    <span className="text-muted-foreground">Reference:</span>
                    <span className="font-medium font-mono ml-2">{refNumber}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Category:</span>
                  <span className="font-medium ml-2">{category}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium ml-2">
                    {new Date(voucherDate).toLocaleDateString('en-GB')}
                  </span>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="p-6">
              <div className="grid grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="h-16 border-b-2 border-foreground mb-2"></div>
                  <div className="text-xs font-semibold">Prepared By</div>
                  <div className="text-xs text-muted-foreground mt-1">Accounts Department</div>
                </div>
                <div className="text-center">
                  <div className="h-16 border-b-2 border-foreground mb-2 flex items-end justify-center">
                    <Check className="w-6 h-6 text-success mb-2" />
                  </div>
                  <div className="text-xs font-semibold">Approved By</div>
                  <div className="text-xs text-muted-foreground mt-1">John Doe</div>
                </div>
                <div className="text-center">
                  <div className="h-16 border-b-2 border-foreground mb-2"></div>
                  <div className="text-xs font-semibold">Received By</div>
                  <div className="text-xs text-muted-foreground mt-1">Payee Signature</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-muted/20 border-t-2 border-foreground">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="font-semibold mb-1">COMPANY DETAILS</div>
                  <div className="text-muted-foreground space-y-0.5">
                    <div>My Company Pvt Ltd</div>
                    <div>GSTIN: 27AAAAA0000A1Z5</div>
                    <div>PAN: AAAAA1234A</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold mb-1">CONTACT</div>
                  <div className="text-muted-foreground space-y-0.5">
                    <div>Phone: +91 98765 43210</div>
                    <div>Email: accounts@company.com</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Note */}
            <div className="p-3 bg-destructive/5 text-center text-xs text-muted-foreground border-t-2 border-foreground">
              This is a computer-generated payment voucher. Please verify all details before processing payment.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
