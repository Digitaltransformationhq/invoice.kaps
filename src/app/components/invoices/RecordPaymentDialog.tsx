import { useEffect, useMemo, useState } from 'react';
import { X, IndianRupee, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { selectForUser, insertForUser, updateForUser } from '../../../lib/auditorData';
import { AppSelect } from '../common/AppSelect';

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card', 'Other'];

// Indian financial year for the receipt number (April → March, "2025-26").
const getFinancialYear = (dateValue?: string) => {
  const date = new Date(dateValue || new Date());
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

const todayIso = () => {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
};

const formatCurrency = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export interface PaymentInvoice {
  dbId: string;
  id: string; // invoice_number
  amount: number; // total_amount
  paidAmount: number;
  customerId?: string | null;
}

interface PaymentEntry {
  receiptNumber: string;
  date: string;
  amount: number;
  mode: string;
}

interface RecordPaymentDialogProps {
  isOpen: boolean;
  invoice: PaymentInvoice;
  onClose: () => void;
  // Called after a payment is recorded so the list can update in place.
  onRecorded: (result: { paidAmount: number; status: string }) => void;
}

export function RecordPaymentDialog({ isOpen, invoice, onClose, onRecorded }: RecordPaymentDialogProps) {
  const { user } = useAuth();

  const [history, setHistory] = useState<PaymentEntry[]>([]);
  const [receiptCount, setReceiptCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [reference, setReference] = useState('');

  // Balance is derived from the invoice's paid_amount, which the parent keeps
  // current — plus any payments made earlier in this same dialog session.
  const balance = Math.max(0, invoice.amount - invoice.paidAmount);

  // Load every company receipt once: its allocations give this invoice's payment
  // history, and the count feeds the next receipt number. Uses selectForUser so
  // the same call works for owners (direct query) and auditors (RPC) alike.
  useEffect(() => {
    if (!isOpen || !user?.company_id) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const { data } = await selectForUser<any[]>(user, 'receipts', 'receipts', () =>
        Promise.resolve(
          supabase
            .from('receipts')
            .select('receipt_number, receipt_date, amount, payment_mode, receipt_allocations(invoice_id, amount)')
            .eq('company_id', user.company_id)
        )
      );
      if (cancelled) return;

      const receipts = data || [];
      setReceiptCount(receipts.length);

      const entries: PaymentEntry[] = [];
      for (const r of receipts) {
        const allocations = Array.isArray(r.receipt_allocations) ? r.receipt_allocations : [];
        for (const alloc of allocations) {
          if (alloc?.invoice_id === invoice.dbId) {
            entries.push({
              receiptNumber: r.receipt_number || '',
              date: r.receipt_date || '',
              amount: Number(alloc.amount) || 0,
              mode: r.payment_mode || '',
            });
          }
        }
      }
      entries.sort((a, b) => (a.date < b.date ? 1 : -1));
      setHistory(entries);
      setIsLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.company_id, invoice.dbId]);

  // Default the amount field to the outstanding balance (one tap = pay in full).
  useEffect(() => {
    if (isOpen) setAmount(balance > 0 ? String(balance.toFixed(2)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, invoice.dbId]);

  const nextReceiptNumber = useMemo(
    () => `RCP-${getFinancialYear(paymentDate)}-${String(receiptCount + 1).padStart(3, '0')}`,
    [paymentDate, receiptCount],
  );

  if (!isOpen) return null;

  const recordPayment = async () => {
    if (!user?.company_id) {
      toast.error('Company profile is not ready. Please refresh and try again.');
      return;
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error('Enter the amount received.');
      return;
    }
    // Guard against recording more than is owed. A tiny epsilon absorbs rounding.
    if (amountNum > balance + 0.01) {
      toast.error(`Amount exceeds the balance due (₹${formatCurrency(balance)}).`);
      return;
    }

    setIsSaving(true);
    try {
      const receiptRecord = {
        company_id: user.company_id,
        customer_id: invoice.customerId || null,
        receipt_number: nextReceiptNumber,
        receipt_date: paymentDate,
        amount: amountNum,
        payment_mode: paymentMode,
        reference_number: reference.trim() || null,
        notes: `Payment against invoice ${invoice.id}`,
        status: 'cleared',
      };

      const { data: receipt, error: receiptError } = await insertForUser<any>(
        user,
        'receipts',
        'receipts',
        () =>
          Promise.resolve(
            supabase.from('receipts').insert(receiptRecord).select('id, receipt_number').single()
          ),
        receiptRecord,
        nextReceiptNumber,
      );
      if (receiptError || !receipt) {
        throw receiptError || new Error('Could not save the payment.');
      }

      const allocationRecord = {
        receipt_id: receipt.id,
        invoice_id: invoice.dbId,
        amount: amountNum,
      };
      const { error: allocError } = await insertForUser(
        user,
        'receipts',
        'receipt_allocations',
        () => Promise.resolve(supabase.from('receipt_allocations').insert(allocationRecord)),
        allocationRecord,
        nextReceiptNumber,
      );
      if (allocError) throw allocError;

      const newPaid = invoice.paidAmount + amountNum;
      const newStatus = newPaid >= invoice.amount - 0.01 ? 'paid' : 'pending';

      // Route through updateForUser (not a raw update) so the auditor RPC's
      // invoices-update branch applies paid_amount + status. A raw update would
      // hit RLS with no company context for auditors and silently fail.
      const invoiceValues = { paid_amount: newPaid, status: newStatus };
      const { error: invoiceError } = await updateForUser(
        user,
        'invoices',
        'invoices',
        () => Promise.resolve(supabase.from('invoices').update(invoiceValues).eq('id', invoice.dbId)),
        invoiceValues,
        { id: invoice.dbId },
        invoice.id,
      );
      if (invoiceError) throw invoiceError;

      // Reflect the new payment locally without a reload.
      setHistory((current) => [
        { receiptNumber: nextReceiptNumber, date: paymentDate, amount: amountNum, mode: paymentMode },
        ...current,
      ]);
      setReceiptCount((c) => c + 1);
      setReference('');

      onRecorded({ paidAmount: newPaid, status: newStatus });

      toast.success(
        newStatus === 'paid'
          ? `${invoice.id} fully paid.`
          : `₹${formatCurrency(amountNum)} recorded — ₹${formatCurrency(Math.max(0, invoice.amount - newPaid))} remaining.`,
      );

      if (newStatus === 'paid') onClose();
    } catch (error: any) {
      toast.error(error?.message || 'Could not record the payment.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-card rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col border border-violet-200 dark:border-violet-400/20">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-violet-100 dark:border-violet-400/15">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-foreground">{balance <= 0 ? 'Payment History' : 'Record Payment'}</h2>
            <p className="text-[12px] text-muted-foreground truncate">Invoice {invoice.id}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {/* Balance summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-violet-100 dark:border-violet-400/15 bg-violet-50/40 dark:bg-violet-500/[0.05] p-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Total</div>
              <div className="text-[15px] font-bold text-foreground tabular-nums mt-0.5">₹{formatCurrency(invoice.amount)}</div>
            </div>
            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Paid</div>
              <div className="text-[15px] font-bold text-success tabular-nums mt-0.5">₹{formatCurrency(invoice.paidAmount)}</div>
            </div>
            <div className="rounded-lg border border-warning/25 bg-warning/5 p-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Balance</div>
              <div className="text-[15px] font-bold text-warning tabular-nums mt-0.5">₹{formatCurrency(balance)}</div>
            </div>
          </div>

          {balance <= 0 ? (
            <div className="rounded-lg border border-success/25 bg-success/5 p-4 text-center text-[13px] font-medium text-success">
              This invoice is fully paid.
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Amount Received</label>
                <div className="relative">
                  <IndianRupee className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${inputClass} pl-9 tabular-nums`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAmount(String(balance.toFixed(2)))}
                  className="mt-1.5 text-[11.5px] font-medium text-violet-600 dark:text-violet-300 hover:underline"
                >
                  Pay full balance (₹{formatCurrency(balance)})
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Date Received</label>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Payment Mode</label>
                  <AppSelect value={paymentMode} onChange={setPaymentMode} options={PAYMENT_MODES} className={`${inputClass} flex items-center`} />
                </div>
              </div>

              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Reference (optional)</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UTR / UPI ref / cheque no."
                  className={inputClass}
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                Recorded as receipt <span className="font-mono">{nextReceiptNumber}</span>.
              </p>
            </div>
          )}

          {/* Payment history */}
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Payment History</div>
            {isLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : history.length === 0 ? (
              <div className="text-[13px] text-muted-foreground italic py-2">No payments recorded yet.</div>
            ) : (
              <div className="divide-y divide-violet-100 dark:divide-violet-400/10 border border-violet-100 dark:border-violet-400/15 rounded-lg">
                {history.map((entry, idx) => (
                  <div key={`${entry.receiptNumber}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{formatDate(entry.date)}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {entry.mode}{entry.receiptNumber ? ` · ${entry.receiptNumber}` : ''}
                      </div>
                    </div>
                    <div className="font-semibold text-foreground tabular-nums shrink-0">₹{formatCurrency(entry.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-violet-100 dark:border-violet-400/15">
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-full text-[13px] font-medium text-foreground border border-violet-200 dark:border-violet-400/25 bg-card hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
          >
            Close
          </button>
          {balance > 0 && (
            <button
              onClick={recordPayment}
              disabled={isSaving}
              className="h-10 px-5 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSaving ? 'Recording…' : 'Record Payment'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
