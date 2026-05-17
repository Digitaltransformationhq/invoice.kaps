import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Save, Send, Eye, IndianRupee, CreditCard, Banknote } from 'lucide-react';
import { ReceiptPreview } from './ReceiptPreview';

export function ReceiptCreate() {
  const [showPreview, setShowPreview] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('RCP-2026-007');
  const [receiptDate, setReceiptDate] = useState('2026-05-12');
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');
  const [amount, setAmount] = useState(0);
  const [refNumber, setRefNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState('');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/app/receipts"
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Create Receipt</h1>
            <p className="text-sm text-muted-foreground mt-1">Record payment received from customer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
            <Save className="w-4 h-4" />
            Save Draft
          </button>
          <button
            onClick={() => setShowPreview(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
          >
            <Send className="w-4 h-4" />
            Create & Send
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Receipt Details Card */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Receipt Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Receipt Number
                </label>
                <input
                  type="text"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Receipt Date
                </label>
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Customer & Invoice Details */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Customer & Invoice Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Select Customer
                </label>
                <select className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring">
                  <option>Select a customer...</option>
                  <option>TechCorp Solutions - 27AAAAA0000A1Z5</option>
                  <option>Retail Innovations - 29BBBBB1111B2Y4</option>
                  <option>Manufacturing Ltd - 24CCCCC2222C3X3</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Invoice (Optional)
                </label>
                <select
                  value={selectedInvoice}
                  onChange={(e) => setSelectedInvoice(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Not linked to any invoice</option>
                  <option value="INV-2026-156">INV-2026-156 - ₹125,000 (Pending)</option>
                  <option value="INV-2026-155">INV-2026-155 - ₹89,500 (Pending)</option>
                  <option value="INV-2026-154">INV-2026-154 - ₹234,000 (Pending)</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Link this receipt to an invoice or leave blank for advance payment
                </p>
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Payment Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Payment Mode
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {['Bank Transfer', 'UPI', 'Cheque', 'Cash', 'Card', 'Other'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={`px-4 py-3 border-2 rounded-lg transition-colors ${
                        paymentMode === mode
                          ? 'border-accent bg-accent/5 text-accent'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <div className="text-sm font-medium">{mode}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Amount Received *
                </label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full pl-11 pr-3 py-3 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring text-lg font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={refNumber}
                  onChange={(e) => setRefNumber(e.target.value)}
                  placeholder={
                    paymentMode === 'Bank Transfer' ? 'UTR Number' :
                    paymentMode === 'UPI' ? 'UPI Transaction ID' :
                    paymentMode === 'Cheque' ? 'Cheque Number' :
                    paymentMode === 'Card' ? 'Last 4 digits' :
                    'Reference Number'
                  }
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {paymentMode === 'Bank Transfer' && 'Enter UTR/Transaction ID'}
                  {paymentMode === 'UPI' && 'Enter UPI Transaction ID'}
                  {paymentMode === 'Cheque' && 'Enter Cheque Number and Bank'}
                  {paymentMode === 'Card' && 'Enter last 4 digits of card'}
                  {paymentMode === 'Cash' && 'Cash receipt - no reference needed'}
                  {paymentMode === 'Other' && 'Enter any reference number if applicable'}
                </p>
              </div>

              {paymentMode === 'Cheque' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., State Bank of India"
                      className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Cheque Date
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional notes about this payment"
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>
          </div>

          {/* Payment Status */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Payment Status</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                className="px-6 py-4 border-2 border-success bg-success/5 text-success rounded-lg"
              >
                <div className="font-semibold mb-1">Cleared</div>
                <div className="text-xs opacity-80">Payment received and confirmed</div>
              </button>
              <button
                type="button"
                className="px-6 py-4 border-2 border-border rounded-lg hover:border-warning/50"
              >
                <div className="font-semibold mb-1">Pending</div>
                <div className="text-xs opacity-80">Awaiting confirmation</div>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar - Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-border rounded-lg p-6 sticky top-24">
            <div className="flex items-center gap-2 mb-6">
              <Banknote className="w-5 h-5 text-success" />
              <h3 className="font-semibold text-foreground">Receipt Summary</h3>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-success/5 border border-success/20 rounded">
                <div className="text-xs text-muted-foreground mb-1">Amount Received</div>
                <div className="text-3xl font-semibold text-success">
                  ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Payment Mode</span>
                  <span className="font-medium text-foreground">{paymentMode}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Receipt Date</span>
                  <span className="font-medium text-foreground">
                    {new Date(receiptDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                {selectedInvoice && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Linked Invoice</span>
                    <span className="font-medium text-foreground">{selectedInvoice}</span>
                  </div>
                )}
                {refNumber && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Reference</span>
                    <span className="font-medium text-foreground font-mono">{refNumber}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border">
                <div className="bg-muted/50 p-4 rounded">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Quick Tips</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Always get reference number for digital payments</li>
                    <li>• Link receipt to invoice for easy tracking</li>
                    <li>• Add notes for future reference</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <ReceiptPreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        receiptNumber={receiptNumber}
        receiptDate={receiptDate}
        amount={amount}
        paymentMode={paymentMode}
        refNumber={refNumber}
        notes={notes}
        invoice={selectedInvoice}
      />
    </div>
  );
}
