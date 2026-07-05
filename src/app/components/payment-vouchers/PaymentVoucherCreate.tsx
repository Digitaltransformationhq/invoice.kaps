import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Save, Send, Eye, Wallet, FileText } from 'lucide-react';
import { PaymentVoucherPreview } from './PaymentVoucherPreview';
import { AppSelect } from '../common/AppSelect';

export function PaymentVoucherCreate() {
  const [showPreview, setShowPreview] = useState(false);
  const [voucherNumber, setVoucherNumber] = useState('PV-2026-007');
  const [voucherDate, setVoucherDate] = useState('2026-05-12');
  const [payee, setPayee] = useState('');
  const [category, setCategory] = useState('Purchase');
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');
  const [amount, setAmount] = useState(0);
  const [refNumber, setRefNumber] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/app/payment-vouchers"
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Create Payment Voucher</h1>
            <p className="text-sm text-muted-foreground mt-1">Record outgoing payment to vendor or supplier</p>
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
            Create & Approve
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Voucher Details Card */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Voucher Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Voucher Number
                </label>
                <input
                  type="text"
                  value={voucherNumber}
                  onChange={(e) => setVoucherNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Voucher Date
                </label>
                <input
                  type="date"
                  value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Payee Details */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Payee Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Payee Name / Vendor *
                </label>
                <input
                  type="text"
                  required
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="e.g., Steel Suppliers Ltd, Employee Name, etc."
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Payment Category *
                </label>
                <AppSelect
                  value={category}
                  onChange={setCategory}
                  options={['Purchase', 'Salary', 'Rent', 'Utilities', 'Transportation', 'Professional Fees', 'Maintenance', 'Insurance', 'Other']}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Purpose / Description *
                </label>
                <textarea
                  rows={3}
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Describe what this payment is for"
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
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
                  {['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Card', 'Other'].map((mode) => (
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
                  Amount Paid *
                </label>
                <div className="relative">
                  <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
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
                  Reference / Transaction Number
                </label>
                <input
                  type="text"
                  value={refNumber}
                  onChange={(e) => setRefNumber(e.target.value)}
                  placeholder={
                    paymentMode === 'Bank Transfer' ? 'UTR Number' :
                    paymentMode === 'UPI' ? 'UPI Transaction ID' :
                    paymentMode === 'Cheque' ? 'Cheque Number' :
                    paymentMode === 'Card' ? 'Transaction ID' :
                    'Reference Number'
                  }
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {paymentMode === 'Bank Transfer' && 'Enter UTR/Transaction ID from bank'}
                  {paymentMode === 'UPI' && 'Enter UPI Transaction ID'}
                  {paymentMode === 'Cheque' && 'Enter Cheque Number'}
                  {paymentMode === 'Card' && 'Enter card transaction reference'}
                  {paymentMode === 'Cash' && 'Optional - any internal reference'}
                  {paymentMode === 'Other' && 'Enter reference number if applicable'}
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
                  Additional Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional information about this payment"
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>
          </div>

          {/* Approval Section */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Approval</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Approved By
                </label>
                <input
                  type="text"
                  placeholder="Enter approver name"
                  defaultValue="John Doe"
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-start gap-3 p-4 bg-success/5 border border-success/20 rounded">
                <input type="checkbox" id="approve" className="w-4 h-4 mt-0.5" defaultChecked />
                <div>
                  <label htmlFor="approve" className="text-sm font-medium text-foreground cursor-pointer">
                    Mark as Approved
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    This payment voucher will be marked as approved and ready for processing
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-border rounded-lg p-6 sticky top-24">
            <div className="flex items-center gap-2 mb-6">
              <FileText className="w-5 h-5 text-destructive" />
              <h3 className="font-semibold text-foreground">Voucher Summary</h3>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded">
                <div className="text-xs text-muted-foreground mb-1">Amount to Pay</div>
                <div className="text-3xl font-semibold text-destructive">
                  ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Category</span>
                  <span className="font-medium text-foreground">{category}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Payment Mode</span>
                  <span className="font-medium text-foreground">{paymentMode}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Voucher Date</span>
                  <span className="font-medium text-foreground">
                    {new Date(voucherDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                {payee && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Payee</span>
                    <span className="font-medium text-foreground truncate ml-2">{payee}</span>
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
                <div className="bg-warning/10 p-4 rounded">
                  <div className="text-xs font-medium text-warning mb-2">Important</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Verify payee details before processing</li>
                    <li>• Keep reference number for reconciliation</li>
                    <li>• Ensure proper approval before payment</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <PaymentVoucherPreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        voucherNumber={voucherNumber}
        voucherDate={voucherDate}
        payee={payee}
        category={category}
        amount={amount}
        paymentMode={paymentMode}
        refNumber={refNumber}
        purpose={purpose}
        notes={notes}
      />
    </div>
  );
}
