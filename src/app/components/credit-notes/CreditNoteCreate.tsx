import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Save, Send, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { CreditNotePreview } from './CreditNotePreview';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { insertForUser, selectForUser } from '../../../lib/auditorData';
import { AppSelect } from '../common/AppSelect';
import { useTaxpayerType } from '../../../lib/useTaxpayerType';

const CN_UNIT_OPTIONS = ['Nos', 'Hrs', 'Days', 'Kgs', 'Pcs'];
const CN_GST_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' },
];

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
}

const getFinancialYear = (dateValue?: string) => {
  const date = new Date(dateValue || new Date());
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

const todayIso = () => new Date().toISOString().split('T')[0];

export function CreditNoteCreate() {
  const { user } = useAuth();
  const { isComposition } = useTaxpayerType();
  const navigate = useNavigate();

  const [showPreview, setShowPreview] = useState(false);
  const [noteType, setNoteType] = useState<'credit' | 'debit'>('credit');
  const [noteNumber, setNoteNumber] = useState('');
  const [noteDate, setNoteDate] = useState(todayIso());
  const [originalInvoice, setOriginalInvoice] = useState('');
  const [reason, setReason] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string>('1');

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: '1',
      item: '',
      description: '',
      hsn: '',
      qty: 1,
      unit: 'Nos',
      rate: 0,
      discount: 0,
      gst: 18,
      amount: 0
    }
  ]);

  // Load customers + recent invoices for this company
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
              .select('id, invoice_number, customer_id, customers(name)')
              .eq('company_id', user.company_id)
              .order('invoice_date', { ascending: false })
              .limit(100)
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
          };
        }));
      }

      setIsLoadingCustomers(false);
    };

    load();
  }, [user?.company_id]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  // Auto-suggest the next note number whenever the type changes or the date FY changes
  useEffect(() => {
    if (!user?.company_id) return;

    const suggest = async () => {
      const prefix = noteType === 'credit' ? 'CN' : 'DN';
      const table = noteType === 'credit' ? 'credit_notes' : 'debit_notes';
      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('company_id', user.company_id);

      if (error) return;
      setNoteNumber(`${prefix}-${getFinancialYear(noteDate)}-${String((count || 0) + 1).padStart(3, '0')}`);
    };

    suggest();
  }, [user?.company_id, noteType]);

  // Filter invoices by the chosen customer (if any)
  const filteredInvoices = useMemo(() => {
    if (!selectedCustomerId) return invoices;
    return invoices.filter((inv) => inv.customer_id === selectedCustomerId);
  }, [invoices, selectedCustomerId]);

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: Date.now().toString(),
        item: '',
        description: '',
        hsn: '',
        qty: 1,
        unit: 'Nos',
        rate: 0,
        discount: 0,
        gst: 18,
        amount: 0
      }
    ]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(lineItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        const baseAmount = updated.qty * updated.rate;
        const afterDiscount = baseAmount - (baseAmount * updated.discount / 100);
        const gstAmount = afterDiscount * updated.gst / 100;
        updated.amount = afterDiscount + gstAmount;
        return updated;
      }
      return item;
    }));
  };

  const subtotal = lineItems.reduce((sum, item) => {
    return sum + (item.qty * item.rate) - ((item.qty * item.rate) * item.discount / 100);
  }, 0);

  const totalGST = isComposition ? 0 : lineItems.reduce((sum, item) => {
    const baseAmount = item.qty * item.rate;
    const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
    return sum + (afterDiscount * item.gst / 100);
  }, 0);

  const totalAmount = subtotal + totalGST;

  const saveNote = async (status: 'draft' | 'issued') => {
    if (!user?.company_id) {
      toast.error('Company profile is not ready. Please refresh and try again.');
      return;
    }
    if (!noteNumber.trim()) {
      toast.error('Note number is required.');
      return;
    }
    if (!selectedCustomerId) {
      toast.error('Select a customer for this note.');
      return;
    }
    if (lineItems.length === 0 || lineItems.every((i) => !i.item.trim() && !i.description.trim())) {
      toast.error('Add at least one line item with a description.');
      return;
    }

    setIsSaving(true);

    try {
      const matchingInvoice = invoices.find((inv) => inv.invoice_number === originalInvoice);
      const combinedReason = [reason.trim(), additionalNotes.trim()].filter(Boolean).join('\n\n');

      const noteTable = noteType === 'credit' ? 'credit_notes' : 'debit_notes';
      const itemsTable = noteType === 'credit' ? 'credit_note_items' : 'debit_note_items';
      const fkColumn = noteType === 'credit' ? 'credit_note_id' : 'debit_note_id';

      const noteRecord = {
        company_id: user.company_id,
        customer_id: selectedCustomerId || null,
        invoice_id: matchingInvoice?.id || null,
        note_number: noteNumber.trim(),
        note_date: noteDate,
        reason: combinedReason || null,
        subtotal,
        total_tax: totalGST,
        total_amount: totalAmount,
        status,
      };

      const { data: note, error: noteError } = await insertForUser<any>(
        user,
        'credit_notes',
        noteTable,
        () =>
          Promise.resolve(
            supabase
              .from(noteTable)
              .insert(noteRecord)
              .select('id, note_number')
              .single()
          ),
        noteRecord,
        noteNumber.trim(),
      );

      if (noteError || !note) {
        throw noteError || new Error('Could not save the note.');
      }

      const itemRows = lineItems.map((item) => {
        const gst = isComposition ? 0 : item.gst;
        const baseAmount = item.qty * item.rate;
        const taxableAmount = baseAmount - (baseAmount * item.discount / 100);
        const taxAmount = taxableAmount * gst / 100;
        return {
          [fkColumn]: note.id,
          item_name: item.item || item.description || 'Line item',
          description: item.description || null,
          hsn: item.hsn || null,
          quantity: item.qty,
          unit: item.unit || null,
          rate: item.rate,
          gst_rate: gst,
          taxable_amount: taxableAmount,
          tax_amount: taxAmount,
          total_amount: taxableAmount + taxAmount,
        };
      });

      const { error: itemsError } = await insertForUser(
        user,
        'credit_notes',
        itemsTable,
        () => Promise.resolve(supabase.from(itemsTable).insert(itemRows)),
        itemRows,
        noteNumber.trim(),
      );

      if (itemsError) throw itemsError;

      toast.success(
        status === 'draft'
          ? `${noteType === 'credit' ? 'Credit' : 'Debit'} note saved as draft.`
          : `${noteType === 'credit' ? 'Credit' : 'Debit'} note ${noteNumber} created.`,
      );
      navigate('/app/credit-notes');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save the note.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = () => saveNote('draft');
  const handleCreateAndSend = () => saveNote('issued');

  const accentClass = noteType === 'credit' ? 'text-success' : 'text-warning';
  const accentBgClass = noteType === 'credit' ? 'bg-success/10' : 'bg-warning/10';

  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to="/app/credit-notes"
            className="p-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300">
              {noteType === 'credit' ? 'Credit Note' : 'Debit Note'}
            </div>
            <h1 className="text-[22px] sm:text-[24px] font-semibold text-foreground tracking-tight leading-tight truncate">
              Create {noteType === 'credit' ? 'Credit' : 'Debit'} Note
            </h1>
          </div>
        </div>
      </div>

      {/* STEPS 1 + 2 — Customer & Note Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Customer */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">1</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Customer</h3>
          </div>
          <div className="space-y-3.5">
            <AppSelect
              value={selectedCustomerId}
              onChange={setSelectedCustomerId}
              disabled={isLoadingCustomers}
              placeholder={isLoadingCustomers ? 'Loading customers…' : 'Select customer…'}
              options={customers.map((c) => ({ value: c.id, label: `${c.name}${c.gstin ? ` — ${c.gstin}` : ''}` }))}
              className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
            />

            <div className="min-h-[230px]">
              {selectedCustomer ? (
                <div className="rounded-lg border border-violet-200 dark:border-violet-400/25 bg-violet-50/50 dark:bg-violet-500/[0.05] p-4">
                  {/* Top row: company name + GSTIN chip + customer type pill */}
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

                  {/* Address row */}
                  {(selectedCustomer.address || selectedCustomer.city || selectedCustomer.state) && (
                    <div className="mt-3.5 pt-3.5 border-t border-violet-200/70 dark:border-violet-400/15">
                      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Address</div>
                      <div className="text-[13.5px] text-foreground leading-snug">
                        {[selectedCustomer.address, selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  )}

                  {/* Contact row — 3-col grid */}
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
                  Pick the customer whose account this note adjusts. Their original {isComposition ? 'bills of supply' : 'invoices'} appear in step 2.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 2. Note Details */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">2</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Note Details</h3>
          </div>
          <div className="space-y-5">
            {/* Type toggle */}
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Note Type</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setNoteType('credit')}
                  className={`px-4 py-3 border-2 rounded-lg transition-all text-left ${
                    noteType === 'credit'
                      ? 'border-success bg-success/5 text-success shadow-[0_2px_8px_-4px_rgba(34,197,94,0.4)]'
                      : 'border-violet-200 dark:border-violet-400/25 hover:border-success/50 text-foreground'
                  }`}
                >
                  <div className="font-semibold text-[13.5px]">Credit Note</div>
                  <div className="text-[11px] opacity-80 mt-0.5">Returns, refunds, discounts</div>
                </button>
                <button
                  onClick={() => setNoteType('debit')}
                  className={`px-4 py-3 border-2 rounded-lg transition-all text-left ${
                    noteType === 'debit'
                      ? 'border-warning bg-warning/5 text-warning shadow-[0_2px_8px_-4px_rgba(245,158,11,0.4)]'
                      : 'border-violet-200 dark:border-violet-400/25 hover:border-warning/50 text-foreground'
                  }`}
                >
                  <div className="font-semibold text-[13.5px]">Debit Note</div>
                  <div className="text-[11px] opacity-80 mt-0.5">Extra charges, adjustments</div>
                </button>
              </div>
            </div>

            {/* Number + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Note Number</label>
                <input
                  type="text"
                  value={noteNumber}
                  onChange={(e) => setNoteNumber(e.target.value)}
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Note Date</label>
                <input
                  type="date"
                  value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
            </div>

            {/* Original Invoice / Bill of Supply */}
            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                Original {isComposition ? 'Bill of Supply' : 'Invoice'} <span className="text-muted-foreground/70 normal-case tracking-normal font-normal">(optional)</span>
              </label>
              <AppSelect
                value={originalInvoice}
                onChange={setOriginalInvoice}
                options={[
                  { value: '', label: selectedCustomerId ? `Select original ${isComposition ? 'bill of supply' : 'invoice'}…` : `Pick a customer first to filter ${isComposition ? 'bills of supply' : 'invoices'}` },
                  ...filteredInvoices.map((inv) => ({ value: inv.invoice_number, label: `${inv.invoice_number}${inv.customer_name ? ` — ${inv.customer_name}` : ''}` })),
                ]}
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                Reason for {noteType === 'credit' ? 'Credit' : 'Debit'} Note
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={noteType === 'credit'
                  ? 'e.g. Product return, service quality issue, post-sale discount'
                  : 'e.g. Additional charges, price adjustment, short delivery'}
                className="w-full px-3.5 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* STEP 3 — Line Items */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
        <div className="px-5 md:px-8 py-4 md:py-5 border-b border-violet-100 dark:border-violet-400/15 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">3</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Line Items</h3>
          </div>
          <button
            onClick={addLineItem}
            className="inline-flex items-center gap-2 px-4 h-10 text-[13px] font-semibold bg-violet-500 text-white rounded-lg shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)] hover:bg-violet-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-violet-100 dark:bg-violet-500/15">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-12">#</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 min-w-[180px]">Item</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 min-w-[220px]">Description</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-36">HSN/SAC</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-24">Qty</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-28">Unit</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-32">Rate</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-24">Disc%</th>
                {!isComposition && (
                  <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-24">GST%</th>
                )}
                <th className="px-4 py-3 text-right text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-36">Amount</th>
                <th className="px-2 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {lineItems.map((item, index) => (
                <tr key={item.id} className="group bg-violet-50/40 dark:bg-violet-500/[0.03] hover:bg-violet-50 dark:hover:bg-violet-500/[0.06] transition-colors">
                  <td className="px-4 py-3 text-sm text-muted-foreground text-center align-middle tabular-nums">{index + 1}</td>
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="text"
                      value={item.item}
                      onChange={(e) => updateLineItem(item.id, 'item', e.target.value)}
                      placeholder="Product or service"
                      className="w-full px-3 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                      placeholder="Brief description"
                      className="w-full px-3 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="text"
                      value={item.hsn}
                      onChange={(e) => updateLineItem(item.id, 'hsn', e.target.value)}
                      placeholder="998314"
                      className="w-full px-3 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) => updateLineItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <AppSelect
                      value={item.unit}
                      onChange={(v) => updateLineItem(item.id, 'unit', v)}
                      options={item.unit && !CN_UNIT_OPTIONS.includes(item.unit) ? [item.unit, ...CN_UNIT_OPTIONS] : CN_UNIT_OPTIONS}
                      onAddNew={() => {
                        const custom = window.prompt('Enter the unit (e.g. Ltr, Box, Set):')?.trim();
                        if (custom) updateLineItem(item.id, 'unit', custom);
                      }}
                      addLabel="Add unit"
                      className="w-full px-3 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateLineItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full px-3 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="number"
                      value={item.discount}
                      onChange={(e) => updateLineItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full px-3 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                    />
                  </td>
                  {!isComposition && (
                    <td className="px-4 py-3 align-middle">
                      <AppSelect
                        value={String(item.gst)}
                        onChange={(v) => updateLineItem(item.id, 'gst', parseFloat(v))}
                        options={CN_GST_OPTIONS}
                        className="w-full px-3 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm font-medium text-foreground text-right align-middle tabular-nums">
                    ₹{(isComposition ? item.qty * item.rate * (1 - item.discount / 100) : item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-3 align-middle">
                    {lineItems.length > 1 && (
                      <button
                        onClick={() => removeLineItem(item.id)}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden divide-y divide-violet-100 dark:divide-violet-400/10">
          {lineItems.map((item, index) => {
            const isExpanded = expandedItemId === item.id;
            const taxable = item.qty * item.rate * (1 - item.discount / 100);
            return (
              <div key={item.id} className="p-4">
                {/* Collapsed Header */}
                <div
                  onClick={() => setExpandedItemId(isExpanded ? '' : item.id)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">Item #{index + 1}</span>
                      {item.item && (
                        <span className="text-sm text-foreground truncate">- {item.item}</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-violet-600 dark:text-violet-300 mt-1 tabular-nums">
                      ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {lineItems.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLineItem(item.id);
                        }}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="space-y-4 mt-4 pt-4 border-t border-violet-100 dark:border-violet-400/10">
                    {/* Item */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">Item</label>
                      <input
                        type="text"
                        value={item.item}
                        onChange={(e) => updateLineItem(item.id, 'item', e.target.value)}
                        placeholder="Product or service"
                        className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">Description</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                        placeholder="Brief description"
                        className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                    </div>

                    {/* HSN */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">HSN/SAC</label>
                      <input
                        type="text"
                        value={item.hsn}
                        onChange={(e) => updateLineItem(item.id, 'hsn', e.target.value)}
                        placeholder="998314"
                        className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                    </div>

                    {/* Qty and Unit */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Quantity</label>
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => updateLineItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
                          className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Unit</label>
                        <AppSelect
                          value={item.unit}
                          onChange={(v) => updateLineItem(item.id, 'unit', v)}
                          options={item.unit && !CN_UNIT_OPTIONS.includes(item.unit) ? [item.unit, ...CN_UNIT_OPTIONS] : CN_UNIT_OPTIONS}
                          onAddNew={() => {
                            const custom = window.prompt('Enter the unit (e.g. Ltr, Box, Set):')?.trim();
                            if (custom) updateLineItem(item.id, 'unit', custom);
                          }}
                          addLabel="Add unit"
                          className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
                      </div>
                    </div>

                    {/* Rate and Discount */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Rate</label>
                        <input
                          type="number"
                          value={item.rate}
                          onChange={(e) => updateLineItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Discount %</label>
                        <input
                          type="number"
                          value={item.discount}
                          onChange={(e) => updateLineItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
                      </div>
                    </div>

                    {/* GST */}
                    {!isComposition && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">GST %</label>
                        <AppSelect
                          value={String(item.gst)}
                          onChange={(v) => updateLineItem(item.id, 'gst', parseFloat(v))}
                          options={CN_GST_OPTIONS}
                          className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
                      </div>
                    )}

                    {/* Calculated Amounts */}
                    <div className="pt-3 border-t border-violet-100 dark:border-violet-400/10 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Taxable Amount</span>
                        <span className="font-medium text-foreground tabular-nums">
                          ₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground font-semibold">Total Amount</span>
                        <span className="font-semibold text-foreground tabular-nums">
                          ₹{(isComposition ? taxable : item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* STEPS 4 + 5 — Additional Notes + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 4. Additional Notes */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">4</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Additional Notes</h3>
          </div>
          <textarea
            rows={8}
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="Add any internal notes, terms, or extra context for this note…"
            className="w-full px-3.5 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition resize-none"
          />
          <p className="mt-2 text-[11.5px] text-muted-foreground px-1">Stored alongside the reason — visible on the saved note.</p>
        </div>

        {/* 5. Summary */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">5</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Summary</h3>
          </div>
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-[13.5px]">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground tabular-nums">
                ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {!isComposition && (
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="text-muted-foreground">Total GST</span>
                <span className="font-medium text-foreground tabular-nums">
                  ₹{totalGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="pt-3.5 border-t border-violet-100 dark:border-violet-400/15">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">Total Amount</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {noteType === 'credit' ? 'Customer credit' : 'Additional charge'}
                  </div>
                </div>
                <span className={`text-[26px] font-semibold tabular-nums ${accentClass}`}>
                  {noteType === 'credit' ? '−' : '+'}₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className={`mt-5 px-4 py-3 rounded-lg ${accentBgClass}`}>
            <div className={`text-[12.5px] font-semibold ${accentClass} mb-0.5`}>
              {noteType === 'credit' ? 'Credit Note Impact' : 'Debit Note Impact'}
            </div>
            <div className="text-[11.5px] text-muted-foreground leading-snug">
              {noteType === 'credit'
                ? "This amount will be credited to the customer's account."
                : "This amount will be added to the customer's outstanding."}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky-feeling action bar */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl px-4 md:px-6 py-3.5 shadow-[0_1px_2px_rgba(139,92,246,0.06)] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-[13px] text-muted-foreground min-w-0 md:flex-1 md:pr-2">
          Review the details above, then save or send this {noteType === 'credit' ? 'credit' : 'debit'} note.
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-2.5 md:justify-end md:shrink-0">
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full border border-violet-200 dark:border-violet-400/25 bg-card text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-[14px] font-medium disabled:opacity-50 whitespace-nowrap sm:flex-1 md:flex-initial md:shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={() => setShowPreview(true)}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full border border-violet-200 dark:border-violet-400/25 bg-card text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-[14px] font-medium disabled:opacity-50 whitespace-nowrap sm:flex-1 md:flex-initial md:shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
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
      <CreditNotePreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        lineItems={lineItems}
        noteNumber={noteNumber}
        noteDate={noteDate}
        noteType={noteType}
        reason={[reason.trim(), additionalNotes.trim()].filter(Boolean).join('\n\n')}
        originalInvoice={originalInvoice}
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
