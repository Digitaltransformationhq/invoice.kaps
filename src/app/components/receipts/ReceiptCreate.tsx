import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Save, Send, Eye, IndianRupee, Banknote, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { ReceiptPreview } from './ReceiptPreview';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { insertForUser, selectForUser } from '../../../lib/auditorData';

interface CustomerRow {
  id: string;
  name: string;
  customerType: string;
  gstin: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  total_amount: number;
  paid_amount: number;
  status: string;
}

const PAYMENT_MODES = ['Bank Transfer', 'UPI', 'Cheque', 'Cash', 'Card', 'Other'] as const;
type PaymentMode = typeof PAYMENT_MODES[number];

const getFinancialYear = (dateValue?: string) => {
  const date = new Date(dateValue || new Date());
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

const todayIso = () => new Date().toISOString().split('T')[0];

export function ReceiptCreate() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [showPreview, setShowPreview] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptDate, setReceiptDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Bank Transfer');
  const [amount, setAmount] = useState(0);
  const [refNumber, setRefNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'cleared' | 'pending'>('cleared');

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load customers + recent invoices
  useEffect(() => {
    if (!user?.company_id) return;

    const load = async () => {
      setIsLoadingCustomers(true);
      const [customersRes, invoicesRes] = await Promise.all([
        selectForUser<any[]>(user, 'customers', 'customers', () =>
          Promise.resolve(
            supabase
              .from('customers')
              .select('id, name, customer_type, gstin, contact_name, email, phone, address, city, state')
              .eq('company_id', user.company_id)
              .eq('is_active', true)
              .order('name', { ascending: true })
          )
        ),
        selectForUser<any[]>(user, 'invoices', 'invoices', () =>
          Promise.resolve(
            supabase
              .from('invoices')
              .select('id, invoice_number, customer_id, total_amount, paid_amount, status, customers(name)')
              .eq('company_id', user.company_id)
              .order('invoice_date', { ascending: false })
              .limit(200)
          )
        ),
      ]);

      if (customersRes.error) {
        toast.error(`Could not load customers: ${customersRes.error.message}`);
      } else {
        setCustomers((customersRes.data || []).map((c: any) => ({
          id: c.id,
          name: c.name || '',
          customerType: c.customer_type || '',
          gstin: c.gstin || '',
          contactName: c.contact_name || '',
          email: c.email || '',
          phone: c.phone || '',
          address: c.address || '',
          city: c.city || '',
          state: c.state || '',
        })));
      }

      if (!invoicesRes.error) {
        setInvoices((invoicesRes.data || []).map((inv: any) => {
          const cust = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
          return {
            id: inv.id,
            invoice_number: inv.invoice_number,
            customer_id: inv.customer_id,
            customer_name: cust?.name || '',
            total_amount: Number(inv.total_amount || 0),
            paid_amount: Number(inv.paid_amount || 0),
            status: inv.status || '',
          };
        }));
      }

      setIsLoadingCustomers(false);
    };

    load();
  }, [user?.company_id]);

  // Auto-suggest receipt number whenever date/company changes
  useEffect(() => {
    if (!user?.company_id) return;
    const suggest = async () => {
      const { count, error } = await supabase
        .from('receipts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', user.company_id);
      if (error) return;
      setReceiptNumber(`RCP-${getFinancialYear(receiptDate)}-${String((count || 0) + 1).padStart(3, '0')}`);
    };
    suggest();
  }, [user?.company_id]);

  // Default status: Cheque → pending, others → cleared
  useEffect(() => {
    setStatus(paymentMode === 'Cheque' ? 'pending' : 'cleared');
  }, [paymentMode]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  const filteredInvoices = useMemo(() => {
    if (!selectedCustomerId) return invoices;
    return invoices.filter((inv) => inv.customer_id === selectedCustomerId);
  }, [invoices, selectedCustomerId]);

  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId) || null;
  const invoiceDue = selectedInvoice
    ? Math.max(0, selectedInvoice.total_amount - selectedInvoice.paid_amount)
    : 0;

  const refPlaceholder = (() => {
    switch (paymentMode) {
      case 'Bank Transfer': return 'UTR / Transaction ID';
      case 'UPI': return 'UPI Transaction ID';
      case 'Cheque': return 'Cheque number';
      case 'Card': return 'Last 4 digits';
      case 'Cash': return 'No reference needed';
      default: return 'Reference Number';
    }
  })();

  const refHelpText = (() => {
    switch (paymentMode) {
      case 'Bank Transfer': return 'Enter UTR/Transaction ID';
      case 'UPI': return 'Enter UPI Transaction ID';
      case 'Cheque': return 'Cheque defaults to Pending until cleared.';
      case 'Card': return 'Enter last 4 digits of card';
      case 'Cash': return 'Cash receipt — reference is optional.';
      default: return 'Enter any reference number if applicable';
    }
  })();

  const saveReceipt = async (draft: boolean): Promise<boolean> => {
    if (!user?.company_id) {
      toast.error('Company profile is not ready. Please refresh and try again.');
      return false;
    }
    if (!receiptNumber.trim()) {
      toast.error('Receipt number is required.');
      return false;
    }
    if (!selectedCustomerId) {
      toast.error('Select the customer this payment is from.');
      return false;
    }
    if (!amount || amount <= 0) {
      toast.error('Enter the amount received.');
      return false;
    }

    setIsSaving(true);

    try {
      const receiptRecord = {
        company_id: user.company_id,
        customer_id: selectedCustomerId,
        receipt_number: receiptNumber.trim(),
        receipt_date: receiptDate,
        amount,
        payment_mode: paymentMode,
        reference_number: refNumber.trim() || null,
        notes: notes.trim() || null,
        status,
      };

      const { data: receipt, error: receiptError } = await insertForUser<any>(
        user,
        'receipts',
        'receipts',
        () =>
          Promise.resolve(
            supabase
              .from('receipts')
              .insert(receiptRecord)
              .select('id, receipt_number')
              .single()
          ),
        receiptRecord,
        receiptNumber.trim(),
      );

      if (receiptError || !receipt) {
        throw receiptError || new Error('Could not save the receipt.');
      }

      // Optional invoice allocation
      if (selectedInvoiceId) {
        const allocationRecord = {
          receipt_id: receipt.id,
          invoice_id: selectedInvoiceId,
          amount,
        };
        const { error: allocError } = await insertForUser(
          user,
          'receipts',
          'receipt_allocations',
          () => Promise.resolve(supabase.from('receipt_allocations').insert(allocationRecord)),
          allocationRecord,
          receiptNumber.trim(),
        );
        if (allocError) throw allocError;

        // Bump paid_amount + status on the invoice — only when payment is cleared
        if (status === 'cleared' && selectedInvoice) {
          const newPaidAmount = selectedInvoice.paid_amount + amount;
          const newStatus = newPaidAmount >= selectedInvoice.total_amount ? 'paid' : 'pending';
          await supabase
            .from('invoices')
            .update({ paid_amount: newPaidAmount, status: newStatus })
            .eq('id', selectedInvoice.id);
        }
      }

      toast.success(
        draft
          ? `Receipt ${receiptNumber} saved as draft.`
          : `Receipt ${receiptNumber} created.`,
      );
      navigate('/app/receipts');
      return true;
    } catch (error: any) {
      toast.error(error?.message || 'Could not save the receipt.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = () => saveReceipt(true);
  const handleCreateAndSend = () => saveReceipt(false);

  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to="/app/receipts"
            className="p-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300">
              Payment Receipt
            </div>
            <h1 className="text-[22px] sm:text-[24px] font-semibold text-foreground tracking-tight leading-tight truncate">
              Create Receipt
            </h1>
          </div>
        </div>
      </div>

      {/* STEPS 1 + 2 — Customer & Receipt Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Customer */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">1</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Customer</h3>
          </div>
          <div className="space-y-3.5">
            <select
              value={selectedCustomerId}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                setSelectedInvoiceId(''); // reset invoice when customer changes
              }}
              disabled={isLoadingCustomers}
              className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
            >
              <option value="">{isLoadingCustomers ? 'Loading customers…' : 'Select customer…'}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.gstin ? ` — ${c.gstin}` : ''}
                </option>
              ))}
            </select>

            <div className="min-h-[230px]">
              {selectedCustomer ? (
                <div className="rounded-lg border border-violet-200 dark:border-violet-400/25 bg-violet-50/50 dark:bg-violet-500/[0.05] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-semibold text-foreground leading-tight">{selectedCustomer.name}</div>
                      {selectedCustomer.gstin && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-100 dark:bg-violet-500/15 text-[12px] font-mono font-semibold text-violet-700 dark:text-violet-200">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">GSTIN</span>
                          {selectedCustomer.gstin}
                        </div>
                      )}
                    </div>
                    {selectedCustomer.customerType && (
                      <span className="shrink-0 px-2.5 py-1 rounded-md bg-card border border-violet-200 dark:border-violet-400/30 text-[10.5px] font-bold tracking-wider uppercase text-violet-600 dark:text-violet-300">
                        {selectedCustomer.customerType}
                      </span>
                    )}
                  </div>

                  {(selectedCustomer.address || selectedCustomer.city || selectedCustomer.state) && (
                    <div className="mt-3.5 pt-3.5 border-t border-violet-200/70 dark:border-violet-400/15">
                      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Address</div>
                      <div className="text-[13.5px] text-foreground leading-snug">
                        {[selectedCustomer.address, selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  )}

                  {(selectedCustomer.contactName || selectedCustomer.email || selectedCustomer.phone) && (
                    <div className="mt-3.5 pt-3.5 border-t border-violet-200/70 dark:border-violet-400/15 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2.5">
                      {selectedCustomer.contactName && (
                        <div className="min-w-0">
                          <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Contact</div>
                          <div className="text-[13.5px] text-foreground truncate">{selectedCustomer.contactName}</div>
                        </div>
                      )}
                      {selectedCustomer.phone && (
                        <div className="min-w-0">
                          <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Phone</div>
                          <div className="text-[13.5px] text-foreground tabular-nums truncate">{selectedCustomer.phone}</div>
                        </div>
                      )}
                      {selectedCustomer.email && (
                        <div className="min-w-0">
                          <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Email</div>
                          <div className="text-[13.5px] text-foreground truncate" title={selectedCustomer.email}>{selectedCustomer.email}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[12.5px] text-muted-foreground px-1">
                  Pick the customer who sent this payment. Their outstanding invoices appear in step 3.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 2. Receipt Details */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">2</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Receipt Details</h3>
          </div>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Receipt Number</label>
                <input
                  type="text"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Receipt Date</label>
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
            </div>

            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Payment Status</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStatus('cleared')}
                  className={`px-4 py-3 border-2 rounded-lg transition-all text-left ${
                    status === 'cleared'
                      ? 'border-success bg-success/5 text-success shadow-[0_2px_8px_-4px_rgba(34,197,94,0.4)]'
                      : 'border-violet-200 dark:border-violet-400/25 hover:border-success/50 text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <div className="font-semibold text-[13.5px]">Cleared</div>
                  </div>
                  <div className="text-[11px] opacity-80">Payment received and confirmed</div>
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('pending')}
                  className={`px-4 py-3 border-2 rounded-lg transition-all text-left ${
                    status === 'pending'
                      ? 'border-warning bg-warning/5 text-warning shadow-[0_2px_8px_-4px_rgba(245,158,11,0.4)]'
                      : 'border-violet-200 dark:border-violet-400/25 hover:border-warning/50 text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Clock className="w-3.5 h-3.5" />
                    <div className="font-semibold text-[13.5px]">Pending</div>
                  </div>
                  <div className="text-[11px] opacity-80">Awaiting confirmation</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 3 — Linked Invoice */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">3</div>
          <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Linked Invoice <span className="text-muted-foreground font-normal text-[13px]">(optional)</span></h3>
        </div>
        <select
          value={selectedInvoiceId}
          onChange={(e) => {
            setSelectedInvoiceId(e.target.value);
            const inv = invoices.find((i) => i.id === e.target.value);
            if (inv) {
              const due = Math.max(0, inv.total_amount - inv.paid_amount);
              if (due > 0) setAmount(due);
            }
          }}
          className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
        >
          <option value="">{selectedCustomerId ? 'Not linked to any invoice (advance payment)' : 'Pick a customer first to filter invoices'}</option>
          {filteredInvoices.map((inv) => {
            const due = Math.max(0, inv.total_amount - inv.paid_amount);
            return (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number} — ₹{inv.total_amount.toLocaleString('en-IN')} ({inv.status}, due ₹{due.toLocaleString('en-IN')})
              </option>
            );
          })}
        </select>
        {selectedInvoice && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-400/25 text-[12.5px]">
            <span className="text-muted-foreground">Outstanding due on {selectedInvoice.invoice_number}:</span>
            <span className="font-semibold text-violet-700 dark:text-violet-300 tabular-nums">₹{invoiceDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
        <p className="mt-2 text-[11.5px] text-muted-foreground px-1">
          Link this receipt to an invoice to auto-credit the paid amount. Leave blank for an advance payment.
        </p>
      </div>

      {/* STEP 4 — Payment Details */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">4</div>
          <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Payment Details</h3>
        </div>
        <div className="space-y-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Payment Mode</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {PAYMENT_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`px-3 py-3 border-2 rounded-lg transition-all text-center ${
                    paymentMode === mode
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 shadow-[0_2px_8px_-4px_rgba(139,92,246,0.4)]'
                      : 'border-violet-200 dark:border-violet-400/25 hover:border-violet-400 dark:hover:border-violet-400/50 text-foreground'
                  }`}
                >
                  <div className="text-[13px] font-semibold">{mode}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                Amount Received <span className="text-destructive normal-case tracking-normal">*</span>
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
                  className="w-full pl-11 pr-3 h-12 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[18px] font-semibold tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Reference Number</label>
              <input
                type="text"
                value={refNumber}
                onChange={(e) => setRefNumber(e.target.value)}
                placeholder={refPlaceholder}
                className="w-full px-3.5 h-12 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              />
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">{refHelpText}</p>
            </div>
          </div>
        </div>
      </div>

      {/* STEPS 5 + 6 — Notes & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 5. Notes */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">5</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Notes</h3>
          </div>
          <textarea
            rows={8}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={paymentMode === 'Cheque' ? 'e.g. Cheque from State Bank of India, dated 12 May 2026, branch BKC.' : 'Add any additional notes about this payment…'}
            className="w-full px-3.5 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition resize-none"
          />
          <p className="mt-2 text-[11.5px] text-muted-foreground px-1">Visible on the saved receipt and in the preview.</p>
        </div>

        {/* 6. Summary */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">6</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight flex items-center gap-2">
              Receipt Summary
              <Banknote className="w-4 h-4 text-success" />
            </h3>
          </div>

          <div className="p-4 bg-success/5 border border-success/20 rounded-lg">
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Amount Received</div>
            <div className="text-[28px] font-semibold tabular-nums text-success">
              ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="space-y-3 pt-4 mt-4 border-t border-violet-100 dark:border-violet-400/15">
            <div className="flex items-center justify-between text-[13.5px]">
              <span className="text-muted-foreground">Payment Mode</span>
              <span className="font-medium text-foreground">{paymentMode}</span>
            </div>
            <div className="flex items-center justify-between text-[13.5px]">
              <span className="text-muted-foreground">Receipt Date</span>
              <span className="font-medium text-foreground tabular-nums">
                {new Date(receiptDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            {selectedInvoice && (
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="text-muted-foreground">Linked Invoice</span>
                <span className="font-medium text-foreground font-mono">{selectedInvoice.invoice_number}</span>
              </div>
            )}
            {refNumber && (
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-medium text-foreground font-mono">{refNumber}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-[13.5px]">
              <span className="text-muted-foreground">Status</span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${status === 'cleared' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
          </div>

          <div className="mt-5 px-4 py-3 rounded-lg bg-violet-50 dark:bg-violet-500/10">
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-violet-600 dark:text-violet-300 mb-0.5">Tips</div>
            <ul className="text-[11.5px] text-muted-foreground leading-snug space-y-0.5">
              <li>• Always get reference number for digital payments.</li>
              <li>• Link the receipt to an invoice to auto-bump its paid amount.</li>
              <li>• Cheque receipts default to Pending — switch to Cleared once the cheque clears.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Sticky-feeling action bar */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl px-4 md:px-6 py-3.5 shadow-[0_1px_2px_rgba(139,92,246,0.06)] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-[13px] text-muted-foreground min-w-0 md:flex-1 md:pr-2">
          Review the details above, then save or send this receipt.
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-2.5 md:justify-end md:shrink-0">
          <button
            onClick={() => setShowPreview(true)}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full border border-violet-200 dark:border-violet-400/25 bg-card text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-[14px] font-medium disabled:opacity-50 whitespace-nowrap sm:flex-1 md:flex-initial md:shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full border border-violet-200 dark:border-violet-400/25 bg-card text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-[14px] font-medium disabled:opacity-50 whitespace-nowrap sm:flex-1 md:flex-initial md:shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={handleCreateAndSend}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap sm:flex-1 md:flex-initial md:shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {isSaving ? 'Saving…' : 'Create & Send'}
          </button>
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
        invoice={selectedInvoice?.invoice_number || ''}
        customer={selectedCustomer ? {
          id: selectedCustomer.id,
          companyName: selectedCustomer.name,
          gstin: selectedCustomer.gstin,
          contactName: selectedCustomer.contactName,
          email: selectedCustomer.email,
          phone: selectedCustomer.phone,
          address: selectedCustomer.address,
          city: selectedCustomer.city,
          state: selectedCustomer.state,
        } : null}
      />
    </div>
  );
}
