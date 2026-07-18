import { useEffect, useRef, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Save, Send, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { DeliveryChallanPreview } from './DeliveryChallanPreview';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { insertForUser, selectForUser } from '../../../lib/auditorData';
import { AppSelect } from '../common/AppSelect';
import { normalizeIndianState, getGstinStateName } from '../../../lib/gstin';
import {
  CHALLAN_PURPOSES,
  challanPurposeMeta,
  suggestChallanNumber,
  getFinancialYear,
  addDays,
  todayIso,
  type ChallanPurpose,
} from '../../../lib/deliveryChallans';

const DC_UNIT_OPTIONS = ['Nos', 'Hrs', 'Days', 'Kgs', 'Pcs'];
const DC_GST_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' },
];
const DC_TRANSPORT_MODES = ['Road', 'Rail', 'Air', 'Ship', 'Hand delivery'];

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

export function DeliveryChallanCreate() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [showPreview, setShowPreview] = useState(false);

  const [purpose, setPurpose] = useState<ChallanPurpose>(CHALLAN_PURPOSES[0].value);
  const meta = challanPurposeMeta(purpose);
  const showTax = meta.isSupplyToConsignee;

  const [challanNumber, setChallanNumber] = useState('');
  const [challanDate, setChallanDate] = useState(todayIso());
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [reason, setReason] = useState('');
  const [isFinalConsignment, setIsFinalConsignment] = useState(false);
  const [notes, setNotes] = useState('');

  // Consignee — editable text fields, optionally prefilled from a customer.
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [consigneeName, setConsigneeName] = useState('');
  const [consigneeGstin, setConsigneeGstin] = useState('');
  const [consigneeAddress, setConsigneeAddress] = useState('');
  const [consigneeState, setConsigneeState] = useState('');

  // Against invoice (lot_supply only) — value is the invoice_number, like CreditNoteCreate.
  const [againstInvoice, setAgainstInvoice] = useState('');

  // Transport
  const [transportMode, setTransportMode] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [ewayBillNumber, setEwayBillNumber] = useState('');

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [companyState, setCompanyState] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string>('1');

  // The user is free to type their own challan number — once they do we stop
  // overwriting it with the auto-suggestion (mirrors invoices' manual-number flag).
  const numberEdited = useRef(false);
  const returnDateEdited = useRef(false);

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
      amount: 0,
    },
  ]);

  // Load customers, recent invoices and the company's own state (for IGST split).
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

      const { data: company } = await supabase
        .from('companies')
        .select('state, gstin')
        .eq('id', user.company_id)
        .single();
      setCompanyState(company?.state || getGstinStateName(company?.gstin) || '');

      setIsLoadingCustomers(false);
    };

    load();
  }, [user?.company_id]);

  // Load the challan numbers already issued this FY, then suggest the next one.
  useEffect(() => {
    if (!user?.company_id) return;

    const suggest = async () => {
      const { data } = await selectForUser<any[]>(user, 'delivery-challans', 'delivery_challans', () =>
        Promise.resolve(
          supabase
            .from('delivery_challans')
            .select('challan_number')
            .eq('company_id', user.company_id)
        )
      );
      if (numberEdited.current) return;
      const existing = (data || []).map((r: any) => r.challan_number).filter(Boolean);
      setChallanNumber(suggestChallanNumber(existing, challanDate));
    };

    suggest();
  }, [user?.company_id, getFinancialYear(challanDate)]);

  // Default the return/deadline date when the purpose tracks a return.
  useEffect(() => {
    if (!meta.tracksReturn) {
      returnDateEdited.current = false;
      setExpectedReturnDate('');
      return;
    }
    if (returnDateEdited.current) return;
    setExpectedReturnDate(addDays(challanDate, meta.returnDays ?? 0));
  }, [purpose, challanDate, meta.tracksReturn, meta.returnDays]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  const applyCustomer = (id: string) => {
    setSelectedCustomerId(id);
    const cust = customers.find((c) => c.id === id);
    if (cust) {
      setConsigneeName(cust.name);
      setConsigneeGstin(cust.gstin);
      setConsigneeAddress([cust.address, cust.city].filter(Boolean).join(', '));
      setConsigneeState(cust.state || getGstinStateName(cust.gstin) || '');
    }
  };

  const filteredInvoices = useMemo(() => {
    if (!selectedCustomerId) return invoices;
    return invoices.filter((inv) => inv.customer_id === selectedCustomerId);
  }, [invoices, selectedCustomerId]);

  const isInterState = Boolean(
    companyState &&
    consigneeState &&
    normalizeIndianState(companyState) !== normalizeIndianState(consigneeState),
  );

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
        amount: 0,
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(lineItems.map((item) => {
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

  const totalTax = showTax
    ? lineItems.reduce((sum, item) => {
        const baseAmount = item.qty * item.rate;
        const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
        return sum + (afterDiscount * item.gst / 100);
      }, 0)
    : 0;

  const cgstTotal = isInterState ? 0 : totalTax / 2;
  const sgstTotal = isInterState ? 0 : totalTax / 2;
  const igstTotal = isInterState ? totalTax : 0;
  const totalAmount = subtotal + totalTax;

  const previewLineItems = lineItems.map((item) => ({
    ...item,
    isProvisional: meta.provisionalQuantity,
  }));

  const saveChallan = async (status: 'draft' | 'issued') => {
    if (!user?.company_id) {
      toast.error('Company profile is not ready. Please refresh and try again.');
      return;
    }
    if (!consigneeName.trim()) {
      toast.error('Consignee name is required.');
      return;
    }
    if (!challanNumber.trim()) {
      toast.error('Challan number is required.');
      return;
    }
    if (meta.requiresInvoice && !againstInvoice) {
      toast.error('Select the invoice this consignment is issued against.');
      return;
    }
    if (lineItems.length === 0 || lineItems.every((i) => !i.item.trim() && !i.description.trim())) {
      toast.error('Add at least one line item with a description.');
      return;
    }

    setIsSaving(true);

    try {
      const matchingInvoice = invoices.find((inv) => inv.invoice_number === againstInvoice);

      const challanRecord = {
        company_id: user.company_id,
        customer_id: selectedCustomerId || null,
        consignee_name: consigneeName.trim(),
        consignee_gstin: consigneeGstin.trim() || null,
        consignee_address: consigneeAddress.trim() || null,
        consignee_state: consigneeState.trim() || null,
        invoice_id: meta.requiresInvoice ? (matchingInvoice?.id || null) : null,
        challan_number: challanNumber.trim(),
        challan_date: challanDate,
        purpose,
        place_of_supply: placeOfSupply.trim() || null,
        is_final_consignment: purpose === 'lot_supply' ? isFinalConsignment : false,
        expected_return_date: meta.tracksReturn ? (expectedReturnDate || null) : null,
        reason: purpose === 'other_than_supply' ? (reason.trim() || null) : null,
        transport_mode: transportMode.trim() || null,
        vehicle_number: vehicleNumber.trim() || null,
        transporter_name: transporterName.trim() || null,
        lr_number: lrNumber.trim() || null,
        eway_bill_number: ewayBillNumber.trim() || null,
        subtotal,
        cgst: cgstTotal,
        sgst: sgstTotal,
        igst: igstTotal,
        total_tax: totalTax,
        total_amount: totalAmount,
        notes: notes.trim() || null,
        status,
        created_by: user.id,
      };

      // Module = the hyphenated permission id; resource = the table branch.
      const { data: challan, error: challanError } = await insertForUser<any>(
        user,
        'delivery-challans',
        'delivery_challans',
        () =>
          Promise.resolve(
            supabase
              .from('delivery_challans')
              .insert(challanRecord)
              .select('id, challan_number')
              .single()
          ),
        challanRecord,
        challanNumber.trim(),
      );

      if (challanError || !challan) {
        throw challanError || new Error('Could not save the challan.');
      }

      const itemRows = lineItems.map((item, index) => {
        const gst = showTax ? item.gst : 0;
        const discount = showTax ? item.discount : 0;
        const baseAmount = item.qty * item.rate;
        const taxableAmount = baseAmount - (baseAmount * discount / 100);
        const taxAmount = taxableAmount * gst / 100;
        return {
          delivery_challan_id: challan.id,
          item_name: item.item || item.description || 'Line item',
          description: item.description || null,
          hsn: item.hsn || null,
          quantity: item.qty,
          is_provisional_quantity: meta.provisionalQuantity,
          unit: item.unit || null,
          rate: item.rate,
          discount_percent: discount,
          gst_rate: gst,
          taxable_amount: taxableAmount,
          tax_amount: taxAmount,
          total_amount: taxableAmount + taxAmount,
          sort_order: index,
        };
      });

      const { error: itemsError } = await insertForUser(
        user,
        'delivery-challans',
        'delivery_challan_items',
        () => Promise.resolve(supabase.from('delivery_challan_items').insert(itemRows)),
        itemRows,
        challanNumber.trim(),
      );

      if (itemsError) throw itemsError;

      toast.success(
        status === 'draft'
          ? 'Delivery challan saved as draft.'
          : `Delivery challan ${challanNumber} created.`,
      );
      navigate('/app/delivery-challans');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save the challan.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = () => saveChallan('draft');
  const handleCreate = () => saveChallan('issued');

  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to="/app/delivery-challans"
            className="p-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300">
              Delivery Challan
            </div>
            <h1 className="text-[22px] sm:text-[24px] font-semibold text-foreground tracking-tight leading-tight truncate">
              Create Delivery Challan
            </h1>
          </div>
        </div>
      </div>

      {/* STEP 1 — Purpose */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">1</div>
          <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Purpose of Movement</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Why are the goods moving?</label>
            <AppSelect
              value={purpose}
              onChange={(v) => setPurpose(v as ChallanPurpose)}
              options={CHALLAN_PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
              className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
            />
          </div>
          <div className="rounded-lg border border-violet-200 dark:border-violet-400/25 bg-violet-50/50 dark:bg-violet-500/[0.05] p-4">
            <div className="text-[13px] text-foreground leading-snug">{meta.hint}</div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-500/15 text-[10.5px] font-bold tracking-wider uppercase text-violet-700 dark:text-violet-200">
                {meta.rule}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold tracking-wider uppercase border ${
                showTax
                  ? 'bg-success/10 text-success border-success/30'
                  : 'bg-muted text-muted-foreground border-border'
              }`}>
                {showTax ? 'GST applies' : 'No GST'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* STEPS 2 + 3 — Consignee & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 2. Consignee */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">2</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Consignee</h3>
          </div>
          <div className="space-y-3.5">
            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                From a customer <span className="text-muted-foreground/70 normal-case tracking-normal font-normal">(optional — fills the fields below)</span>
              </label>
              <AppSelect
                value={selectedCustomerId}
                onChange={applyCustomer}
                disabled={isLoadingCustomers}
                placeholder={isLoadingCustomers ? 'Loading customers…' : 'Select customer…'}
                options={customers.map((c) => ({ value: c.id, label: `${c.name}${c.gstin ? ` — ${c.gstin}` : ''}` }))}
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              />
            </div>

            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                Consignee Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={consigneeName}
                onChange={(e) => setConsigneeName(e.target.value)}
                placeholder="Who receives the goods"
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Consignee GSTIN</label>
                <input
                  type="text"
                  value={consigneeGstin}
                  onChange={(e) => setConsigneeGstin(e.target.value)}
                  placeholder="If registered"
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Consignee State</label>
                <input
                  type="text"
                  value={consigneeState}
                  onChange={(e) => setConsigneeState(e.target.value)}
                  placeholder="e.g. Gujarat"
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Consignee Address</label>
              <textarea
                rows={2}
                value={consigneeAddress}
                onChange={(e) => setConsigneeAddress(e.target.value)}
                placeholder="Where the goods are delivered"
                className="w-full px-3.5 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition resize-none"
              />
            </div>

            {showTax && companyState && consigneeState && (
              <div className="text-[12px] text-muted-foreground px-1">
                {isInterState ? 'Inter-State movement — IGST applies.' : 'Intra-State movement — CGST + SGST apply.'}
              </div>
            )}
          </div>
        </div>

        {/* 3. Details */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">3</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Challan Details</h3>
          </div>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Challan Number</label>
                <input
                  type="text"
                  value={challanNumber}
                  onChange={(e) => {
                    numberEdited.current = true;
                    setChallanNumber(e.target.value);
                  }}
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Challan Date</label>
                <input
                  type="date"
                  value={challanDate}
                  onChange={(e) => setChallanDate(e.target.value)}
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
            </div>

            {/* Against invoice — lot_supply only */}
            {meta.requiresInvoice && (
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  Against Invoice <span className="text-destructive">*</span>
                </label>
                <AppSelect
                  value={againstInvoice}
                  onChange={setAgainstInvoice}
                  options={[
                    { value: '', label: selectedCustomerId ? 'Select the parent invoice…' : 'Pick a customer to filter invoices, or select any' },
                    ...filteredInvoices.map((inv) => ({ value: inv.invoice_number, label: `${inv.invoice_number}${inv.customer_name ? ` — ${inv.customer_name}` : ''}` })),
                  ]}
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
                <p className="mt-1.5 text-[11.5px] text-muted-foreground px-1">
                  Rule 55(5)(a): the complete invoice is raised before the first consignment.
                </p>
              </div>
            )}

            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Place of Supply</label>
              <input
                type="text"
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
                placeholder="e.g. Ahmedabad, Gujarat"
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              />
            </div>

            {/* Return / deadline date */}
            {meta.tracksReturn && (
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{meta.returnLabel}</label>
                <input
                  type="date"
                  value={expectedReturnDate}
                  onChange={(e) => {
                    returnDateEdited.current = true;
                    setExpectedReturnDate(e.target.value);
                  }}
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
            )}

            {/* Reason — other_than_supply only */}
            {purpose === 'other_than_supply' && (
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Reason for Movement</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Branch transfer, repair, exhibition"
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
            )}

            {/* Final consignment — lot_supply only */}
            {purpose === 'lot_supply' && (
              <label className="flex items-start gap-3 px-3.5 py-3 rounded-lg border border-violet-200 dark:border-violet-400/25 bg-violet-50/40 dark:bg-violet-500/[0.04] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFinalConsignment}
                  onChange={(e) => setIsFinalConsignment(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded accent-violet-500"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-foreground">This is the final consignment</span>
                  <span className="block text-[11.5px] text-muted-foreground mt-0.5">
                    The original invoice must travel with the final consignment (Rule 55(5)).
                  </span>
                </span>
              </label>
            )}
          </div>
        </div>
      </div>

      {/* STEP 4 — Line Items */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
        <div className="px-5 md:px-8 py-4 md:py-5 border-b border-violet-100 dark:border-violet-400/15 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">4</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Line Items</h3>
            {meta.provisionalQuantity && (
              <span className="px-2 py-0.5 rounded-md bg-warning/10 text-warning border border-warning/30 text-[10.5px] font-bold tracking-wider uppercase">
                Provisional quantity
              </span>
            )}
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
                {showTax && (
                  <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-24">Disc%</th>
                )}
                {showTax && (
                  <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-24">GST%</th>
                )}
                <th className="px-4 py-3 text-right text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 w-36">{showTax ? 'Amount' : 'Taxable Value'}</th>
                <th className="px-2 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {lineItems.map((item, index) => {
                const taxable = item.qty * item.rate * (1 - item.discount / 100);
                return (
                  <tr key={item.id} className="group bg-violet-50/40 dark:bg-violet-500/[0.03] hover:bg-violet-50 dark:hover:bg-violet-500/[0.06] transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground text-center align-middle tabular-nums">{index + 1}</td>
                    <td className="px-4 py-3 align-middle">
                      <input
                        type="text"
                        value={item.item}
                        onChange={(e) => updateLineItem(item.id, 'item', e.target.value)}
                        placeholder="Goods being moved"
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
                        options={item.unit && !DC_UNIT_OPTIONS.includes(item.unit) ? [item.unit, ...DC_UNIT_OPTIONS] : DC_UNIT_OPTIONS}
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
                    {showTax && (
                      <td className="px-4 py-3 align-middle">
                        <input
                          type="number"
                          value={item.discount}
                          onChange={(e) => updateLineItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-3 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
                      </td>
                    )}
                    {showTax && (
                      <td className="px-4 py-3 align-middle">
                        <AppSelect
                          value={String(item.gst)}
                          onChange={(v) => updateLineItem(item.id, 'gst', parseFloat(v))}
                          options={DC_GST_OPTIONS}
                          className="w-full px-3 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm font-medium text-foreground text-right align-middle tabular-nums">
                      ₹{(showTax ? item.amount : taxable).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                );
              })}
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
                      ₹{(showTax ? item.amount : taxable).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">Item</label>
                      <input
                        type="text"
                        value={item.item}
                        onChange={(e) => updateLineItem(item.id, 'item', e.target.value)}
                        placeholder="Goods being moved"
                        className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                    </div>
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
                          options={item.unit && !DC_UNIT_OPTIONS.includes(item.unit) ? [item.unit, ...DC_UNIT_OPTIONS] : DC_UNIT_OPTIONS}
                          onAddNew={() => {
                            const custom = window.prompt('Enter the unit (e.g. Ltr, Box, Set):')?.trim();
                            if (custom) updateLineItem(item.id, 'unit', custom);
                          }}
                          addLabel="Add unit"
                          className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
                      </div>
                    </div>
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
                      {showTax && (
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
                      )}
                    </div>
                    {showTax && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">GST %</label>
                        <AppSelect
                          value={String(item.gst)}
                          onChange={(v) => updateLineItem(item.id, 'gst', parseFloat(v))}
                          options={DC_GST_OPTIONS}
                          className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
                      </div>
                    )}
                    <div className="pt-3 border-t border-violet-100 dark:border-violet-400/10 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Taxable Value</span>
                        <span className="font-medium text-foreground tabular-nums">
                          ₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      {showTax && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground font-semibold">Total Amount</span>
                          <span className="font-semibold text-foreground tabular-nums">
                            ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* STEPS 5 + 6 — Transport & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 5. Transport */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">5</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Transport Details</h3>
          </div>
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Transport Mode</label>
                <AppSelect
                  value={transportMode}
                  onChange={setTransportMode}
                  placeholder="Select mode…"
                  options={transportMode && !DC_TRANSPORT_MODES.includes(transportMode) ? [transportMode, ...DC_TRANSPORT_MODES] : DC_TRANSPORT_MODES}
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Vehicle Number</label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="GJ01AB1234"
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Transporter Name</label>
              <input
                type="text"
                value={transporterName}
                onChange={(e) => setTransporterName(e.target.value)}
                placeholder="Carrier / transporter"
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">LR Number</label>
                <input
                  type="text"
                  value={lrNumber}
                  onChange={(e) => setLrNumber(e.target.value)}
                  placeholder="Lorry receipt no."
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">E-Way Bill No.</label>
                <input
                  type="text"
                  value={ewayBillNumber}
                  onChange={(e) => setEwayBillNumber(e.target.value)}
                  placeholder="If generated"
                  className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any extra context for this challan…"
                className="w-full px-3.5 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition resize-none"
              />
            </div>
          </div>
        </div>

        {/* 6. Summary */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">6</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Summary</h3>
          </div>
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-[13.5px]">
              <span className="text-muted-foreground">Taxable Value</span>
              <span className="font-medium text-foreground tabular-nums">
                ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {showTax && (isInterState ? (
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="text-muted-foreground">IGST</span>
                <span className="font-medium text-foreground tabular-nums">
                  ₹{igstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-[13.5px]">
                  <span className="text-muted-foreground">CGST</span>
                  <span className="font-medium text-foreground tabular-nums">
                    ₹{cgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[13.5px]">
                  <span className="text-muted-foreground">SGST</span>
                  <span className="font-medium text-foreground tabular-nums">
                    ₹{sgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            ))}
            <div className="pt-3.5 border-t border-violet-100 dark:border-violet-400/15">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">Total Value</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {showTax ? 'Value of goods incl. tax' : 'Value of goods (not a supply)'}
                  </div>
                </div>
                <span className="text-[26px] font-semibold tabular-nums text-violet-600 dark:text-violet-300">
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {!showTax && (
            <div className="mt-5 px-4 py-3 rounded-lg bg-muted">
              <div className="text-[12.5px] font-semibold text-foreground mb-0.5">Not a supply</div>
              <div className="text-[11.5px] text-muted-foreground leading-snug">
                {meta.rule} — no GST is charged on this challan. The taxable value shown is for reference only.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl px-4 md:px-6 py-3.5 shadow-[0_1px_2px_rgba(139,92,246,0.06)] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-[13px] text-muted-foreground min-w-0 md:flex-1 md:pr-2">
          Review the details above, then save or issue this delivery challan.
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
            onClick={handleCreate}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap sm:flex-1 md:flex-initial md:shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {isSaving ? 'Saving…' : 'Create Challan'}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      <DeliveryChallanPreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        purpose={purpose}
        challanNumber={challanNumber}
        challanDate={challanDate}
        lineItems={previewLineItems}
        consignee={{
          name: consigneeName,
          gstin: consigneeGstin,
          address: consigneeAddress,
          state: consigneeState,
        }}
        invoiceNumber={againstInvoice}
        placeOfSupply={placeOfSupply}
        isFinalConsignment={isFinalConsignment}
        expectedReturnDate={expectedReturnDate}
        reason={reason}
        notes={notes}
        transport={{
          mode: transportMode,
          vehicleNumber,
          transporterName,
          lrNumber,
          ewayBillNumber,
        }}
      />
    </div>
  );
}
