import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Save, Send, Eye, Calculator, CheckCircle, ChevronDown, ChevronUp, X, Package } from 'lucide-react';
import { InvoicePreview } from './InvoicePreview';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { insertForUser, selectForUser } from '../../../lib/auditorData';
import { extractPanFromGstin, normalizeGstin } from '../../../lib/gstin';

interface LineItem {
  id: string;
  itemId?: string;
  type?: 'product' | 'service';
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
  customerType: string;
  gstin: string;
  pan: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
}

interface CatalogItem {
  id: string;
  name: string;
  type: 'product' | 'service';
  description: string;
  hsn: string;
  unit: string;
  sellingPrice: number;
  purchasePrice: number;
  gst: number;
  stock?: number;
}

export function InvoiceCreate() {
  const { user } = useAuth();
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [lineItemIdForNewItem, setLineItemIdForNewItem] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isSavingCatalogItem, setIsSavingCatalogItem] = useState(false);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('INV-2026-157');
  const [isManualInvoiceNumber, setIsManualInvoiceNumber] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState('2026-05-12');
  const [placeOfSupply, setPlaceOfSupply] = useState('Auto from customer');
  const [reverseCharge, setReverseCharge] = useState(false);
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [transportMode, setTransportMode] = useState('');
  const [remarks, setRemarks] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string>('1');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [newCustomer, setNewCustomer] = useState({
    companyName: '',
    customerType: 'B2B',
    gstin: '',
    pan: '',
    contactName: '',
    email: '',
    phone: '',
    city: '',
    address: ''
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: '1',
      itemId: '',
      item: '',
      description: '',
      hsn: '',
      qty: 1,
      unit: 'JOB',
      rate: 0,
      discount: 0,
      gst: 18,
      amount: 0
    }
  ]);
  const navigate = useNavigate();

  const mapCustomerFromDatabase = (customer: any): Customer => ({
    id: customer.id,
    companyName: customer.name || '',
    customerType: customer.customer_type || 'B2B',
    gstin: customer.gstin || '',
    pan: customer.pan || '',
    contactName: customer.contact_name || '',
    email: customer.email || '',
    phone: customer.phone || '',
    city: customer.city || '',
    address: customer.address || '',
  });

  const mapCatalogItemFromDatabase = (item: any): CatalogItem => ({
    id: item.id,
    name: item.name || '',
    type: item.type || 'product',
    description: item.description || '',
    hsn: item.hsn || '',
    unit: item.unit || 'Nos',
    sellingPrice: Number(item.selling_price || 0),
    purchasePrice: Number(item.purchase_price || 0),
    gst: Number(item.gst_rate || 0),
    stock: item.stock === null || item.stock === undefined ? undefined : Number(item.stock),
  });

  const loadCustomers = async () => {
    if (!user?.company_id) {
      setCustomers([]);
      return;
    }

    setIsLoadingCustomers(true);

    const { data, error } = await selectForUser<any[]>(user, 'customers', 'customers', () =>
      supabase
        .from('customers')
        .select('id, name, customer_type, gstin, pan, contact_name, email, phone, city, address')
        .eq('company_id', user.company_id)
        .eq('is_active', true)
        .order('name', { ascending: true })
    );

    if (error) {
      toast.error(`Could not load customers: ${error.message}`);
    } else {
      setCustomers((data || []).map(mapCustomerFromDatabase));
    }

    setIsLoadingCustomers(false);
  };

  const loadCatalogItems = async () => {
    if (!user?.company_id) {
      setCatalogItems([]);
      return;
    }

    setIsLoadingItems(true);

    const { data, error } = await selectForUser<any[]>(user, 'items', 'items', () =>
      supabase
        .from('items')
        .select('id, name, type, description, hsn, unit, selling_price, purchase_price, gst_rate, stock')
        .eq('company_id', user.company_id)
        .eq('is_active', true)
        .order('name', { ascending: true })
    );

    if (error) {
      toast.error(`Could not load items: ${error.message}`);
      setCatalogItems([]);
    } else {
      setCatalogItems((data || []).map(mapCatalogItemFromDatabase));
    }

    setIsLoadingItems(false);
  };

  useEffect(() => {
    loadCustomers();
    loadCatalogItems();
  }, [user?.company_id]);

  const addLineItem = () => {
    const newId = Date.now().toString();
    setLineItems([
      ...lineItems,
      {
        id: newId,
        itemId: '',
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
    setExpandedItemId(newId);
  };

  const removeLineItem = (id: string) => {
    const filteredItems = lineItems.filter(item => item.id !== id);
    setLineItems(filteredItems);
    if (expandedItemId === id && filteredItems.length > 0) {
      setExpandedItemId(filteredItems[filteredItems.length - 1].id);
    }
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

  const applyCatalogItemToLine = (lineItemId: string, catalogItem: CatalogItem) => {
    setLineItems(lineItems.map((lineItem) => {
      if (lineItem.id !== lineItemId) {
        return lineItem;
      }

      const updated = {
        ...lineItem,
        itemId: catalogItem.id,
        type: catalogItem.type,
        item: catalogItem.name,
        description: catalogItem.description,
        hsn: catalogItem.hsn,
        unit: catalogItem.unit,
        rate: catalogItem.sellingPrice,
        gst: catalogItem.gst,
      };
      const baseAmount = updated.qty * updated.rate;
      const afterDiscount = baseAmount - (baseAmount * updated.discount / 100);
      const gstAmount = afterDiscount * updated.gst / 100;
      updated.amount = afterDiscount + gstAmount;
      return updated;
    }));
  };

  const handleLineItemSelection = (lineItemId: string, value: string) => {
    if (value === 'add-new') {
      setLineItemIdForNewItem(lineItemId);
      setShowAddItemModal(true);
      return;
    }

    if (!value) {
      setLineItems(lineItems.map((lineItem) => (
        lineItem.id === lineItemId
          ? { ...lineItem, itemId: '', type: undefined, item: '' }
          : lineItem
      )));
      return;
    }

    const selectedCatalogItem = catalogItems.find((catalogItem) => catalogItem.id === value);
    if (selectedCatalogItem) {
      applyCatalogItemToLine(lineItemId, selectedCatalogItem);
    }
  };

  const subtotal = lineItems.reduce((sum, item) => {
    return sum + (item.qty * item.rate) - ((item.qty * item.rate) * item.discount / 100);
  }, 0);

  const totalGST = lineItems.reduce((sum, item) => {
    const baseAmount = item.qty * item.rate;
    const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
    return sum + (afterDiscount * item.gst / 100);
  }, 0);

  const totalAmount = subtotal + totalGST;
  const selectedCustomerDetails = customers.find((customer) => customer.id === selectedCustomer) || null;
  const selectedCustomerType = selectedCustomerDetails?.customerType || 'B2B';
  const hasProductItems = lineItems.some((item) => item.type === 'product');
  const hasServiceItems = lineItems.some((item) => item.type === 'service');
  const derivedBillType = hasProductItems && hasServiceItems
    ? 'goods+service'
    : hasProductItems
      ? 'only goods'
      : hasServiceItems
        ? 'only service'
        : 'goods+service';

  const getFinancialYear = () => {
    const date = new Date(invoiceDate || new Date());
    const year = date.getFullYear();
    const startYear = date.getMonth() >= 3 ? year : year - 1;
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
  };

  const getNextInvoiceNumber = async () => {
    if (isManualInvoiceNumber && invoiceNumber.trim()) {
      return invoiceNumber.trim();
    }

    if (user?.role === 'auditor') {
      const { data, error } = await selectForUser<any[]>(user, 'invoices', 'invoices', () =>
        supabase
          .from('invoices')
          .select('id')
          .eq('company_id', user?.company_id)
      );

      if (error) throw error;
      return `INV-${getFinancialYear()}-${String(((data || []).length) + 1).padStart(4, '0')}`;
    }

    const { count, error } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', user?.company_id);

    if (error) throw error;

    return `INV-${getFinancialYear()}-${String((count || 0) + 1).padStart(4, '0')}`;
  };

  const saveInvoice = async (status: 'draft' | 'pending') => {
    if (!user?.company_id) {
      toast.error('Company profile is not ready. Please refresh and try again.');
      return null;
    }

    if (lineItems.length === 0) {
      toast.error('Add at least one line item.');
      return null;
    }

    if (lineItems.some((item) => !item.itemId || !item.type)) {
      toast.error('Select a product or service item for every invoice line.');
      return null;
    }

    setIsSavingInvoice(true);

    try {
      const nextInvoiceNumber = await getNextInvoiceNumber();
      const cgst = totalGST / 2;
      const sgst = totalGST / 2;

      const invoiceRecord = {
          company_id: user.company_id,
          customer_id: selectedCustomer || null,
          invoice_number: nextInvoiceNumber,
          invoice_date: invoiceDate,
          customer_type: selectedCustomerType,
          bill_type: derivedBillType,
          place_of_supply: placeOfSupply === 'Auto from customer' ? selectedCustomerDetails?.city || null : placeOfSupply,
          reverse_charge: reverseCharge,
          po_number: poNumber.trim() || null,
          po_date: poDate || null,
          vehicle_number: vehicleNo.trim() || null,
          transport_mode: transportMode.trim() || null,
          remarks: remarks.trim() || null,
          subtotal,
          cgst,
          sgst,
          igst: 0,
          total_tax: totalGST,
          total_amount: totalAmount,
          paid_amount: 0,
          status,
          created_by: user.id,
        };

      const { data: invoice, error: invoiceError } = await insertForUser<any>(user, 'invoices', 'invoices', () =>
        supabase
          .from('invoices')
          .insert(invoiceRecord)
          .select('id, invoice_number')
          .single(),
        invoiceRecord,
        nextInvoiceNumber
      );

      if (invoiceError) {
        throw invoiceError;
      }

      const invoiceItems = lineItems.map((item, index) => {
        const baseAmount = item.qty * item.rate;
        const taxableAmount = baseAmount - (baseAmount * item.discount / 100);
        const taxAmount = taxableAmount * item.gst / 100;

        return {
          invoice_id: invoice.id,
          item_id: item.itemId || null,
          item_name: item.item || item.description || 'Line item',
          description: item.description || null,
          hsn: item.hsn || null,
          quantity: item.qty,
          unit: item.unit,
          rate: item.rate,
          discount_percent: item.discount,
          gst_rate: item.gst,
          taxable_amount: taxableAmount,
          tax_amount: taxAmount,
          total_amount: taxableAmount + taxAmount,
          sort_order: index,
        };
      });

      const { error: itemsError } = await insertForUser(user, 'invoices', 'invoice_items', () =>
        supabase
          .from('invoice_items')
          .insert(invoiceItems),
        invoiceItems,
        nextInvoiceNumber
      );

      if (itemsError) {
        throw itemsError;
      }

      setInvoiceNumber(invoice.invoice_number);
      toast.success(status === 'draft' ? 'Invoice draft saved' : 'Invoice created');
      return invoice;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save invoice');
      return null;
    } finally {
      setIsSavingInvoice(false);
    }
  };

  const handleSaveDraft = async () => {
    const invoice = await saveInvoice('draft');
    if (invoice) {
      navigate('/app/invoices');
    }
  };

  const handleCreateInvoice = async () => {
    const invoice = await saveInvoice('pending');
    if (invoice) {
      setShowSuccessModal(true);
    }
  };

  const handleCustomerChange = (value: string) => {
    if (value === 'add-new') {
      setShowAddCustomerModal(true);
    } else {
      setSelectedCustomer(value);
    }
  };

  const handleAddCustomer = async () => {
    if (!user?.company_id) {
      toast.error('Company profile is not ready. Please refresh and try again.');
      return;
    }

    setIsSavingCustomer(true);

    const record = {
        company_id: user.company_id,
        name: newCustomer.companyName.trim(),
        customer_type: newCustomer.customerType,
        gstin: newCustomer.gstin.trim().toUpperCase(),
        pan: newCustomer.pan.trim().toUpperCase() || extractPanFromGstin(newCustomer.gstin),
        contact_name: newCustomer.contactName.trim(),
        email: newCustomer.email.trim(),
        phone: newCustomer.phone.trim(),
        city: newCustomer.city.trim(),
        address: newCustomer.address.trim(),
      };

    const { data, error } = await insertForUser<any>(user, 'customers', 'customers', () =>
      supabase
        .from('customers')
        .insert(record)
        .select('id, name, customer_type, gstin, pan, contact_name, email, phone, city, address')
        .single(),
      record,
      record.name
    );

    setIsSavingCustomer(false);

    if (error) {
      toast.error(`Could not save customer: ${error.message}`);
      return;
    }

    const customerToAdd = mapCustomerFromDatabase(data);
    setCustomers((currentCustomers) => [...currentCustomers, customerToAdd].sort((a, b) => a.companyName.localeCompare(b.companyName)));
    setSelectedCustomer(customerToAdd.id);
    setShowAddCustomerModal(false);
    setNewCustomer({
      companyName: '',
      customerType: 'B2B',
      gstin: '',
      pan: '',
      contactName: '',
      email: '',
      phone: '',
      city: '',
      address: ''
    });
    toast.success('Customer saved');
  };

  const handleAddCatalogItem = async (item: CatalogItem) => {
    if (!user?.company_id) {
      toast.error('Company profile is not ready. Please refresh and try again.');
      return;
    }

    setIsSavingCatalogItem(true);

    const record = {
        company_id: user.company_id,
        name: item.name.trim(),
        type: item.type,
        description: item.description.trim() || null,
        hsn: item.hsn.trim() || null,
        unit: item.unit,
        selling_price: item.sellingPrice,
        purchase_price: item.purchasePrice,
        gst_rate: item.gst,
        stock: item.type === 'product' ? item.stock || 0 : null,
      };

    const { data, error } = await insertForUser<any>(user, 'items', 'items', () =>
      supabase
        .from('items')
        .insert(record)
        .select('id, name, type, description, hsn, unit, selling_price, purchase_price, gst_rate, stock')
        .single(),
      record,
      record.name
    );

    setIsSavingCatalogItem(false);

    if (error) {
      toast.error(`Could not save item: ${error.message}`);
      return;
    }

    const catalogItem = mapCatalogItemFromDatabase(data);
    setCatalogItems((currentItems) => [...currentItems, catalogItem].sort((a, b) => a.name.localeCompare(b.name)));

    if (lineItemIdForNewItem) {
      applyCatalogItemToLine(lineItemIdForNewItem, catalogItem);
    }

    setShowAddItemModal(false);
    setLineItemIdForNewItem(null);
    toast.success('Item saved');
  };

  return (
    <div className="pb-8 bg-muted/30 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 md:px-8 py-4 md:py-6 sticky top-0 z-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              to="/app/invoices"
              className="p-2 hover:bg-muted rounded transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-foreground">New Tax Invoice</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">FY 2026-27 - Intra-state (CGST + SGST)</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={isSavingInvoice}
              className="inline-flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 border border-border bg-white rounded hover:bg-muted transition-colors text-sm"
            >
              <Save className="w-4 h-4" />
              {isSavingInvoice ? 'Saving...' : 'Save as Draft'}
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className="inline-flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 border border-border bg-white rounded hover:bg-muted transition-colors text-sm"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
            <button
              onClick={handleCreateInvoice}
              disabled={isSavingInvoice}
              className="inline-flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <Send className="w-4 h-4" />
              {isSavingInvoice ? 'Saving...' : 'Create Invoice'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8">
        {/* Two Column Layout - Bill To and Invoice Meta */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Bill To Section with Dropdowns Above */}
          <div className="space-y-4">
            {/* Bill To Section */}
            <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-4 uppercase tracking-wide">BILL TO</h3>
            <div className="bg-white rounded-lg p-4 md:p-6 space-y-4 md:space-y-5">
              <div>
                <select
                  value={selectedCustomer}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  disabled={isLoadingCustomers}
                  className="w-full px-4 py-3 border border-input bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                >
                  <option value="">{isLoadingCustomers ? 'Loading customers...' : 'Select customer...'}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.companyName} - {customer.gstin}
                    </option>
                  ))}
                  <option value="add-new" className="text-accent font-medium">+ Add Customer</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    PO Number
                  </label>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder=""
                    className="w-full px-4 py-3 border border-input bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    PO Date
                  </label>
                  <input
                    type="date"
                    value={poDate}
                    onChange={(e) => setPoDate(e.target.value)}
                    placeholder="dd-mm-yyyy"
                    className="w-full px-4 py-3 border border-input bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Vehicle No.
                  </label>
                  <input
                    type="text"
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value)}
                    placeholder=""
                    className="w-full px-4 py-3 border border-input bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Transport Mode
                  </label>
                  <input
                    type="text"
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value)}
                    placeholder=""
                    className="w-full px-4 py-3 border border-input bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                  />
                </div>
              </div>
            </div>
            </div>
          </div>

          {/* Invoice Meta Section */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-4 uppercase tracking-wide">INVOICE META</h3>
            <div className="bg-white rounded-lg p-4 md:p-6 space-y-4 md:space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-foreground">
                    Invoice Number
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isManualInvoiceNumber}
                      onChange={(e) => setIsManualInvoiceNumber(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-muted-foreground">Manual</span>
                  </label>
                </div>
                {!isManualInvoiceNumber ? (
                  <div className="px-4 py-3 bg-muted/30 border border-input rounded-lg text-sm text-muted-foreground">
                    Auto-generated on save
                  </div>
                ) : (
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full px-4 py-3 border border-input bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                  />
                )}
                <p className="text-xs text-muted-foreground mt-1.5">
                  Auto from default series. Toggle Manual to override.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Document Date
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-4 py-3 border border-input bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Place of Supply
                </label>
                <select
                  value={placeOfSupply}
                  onChange={(e) => setPlaceOfSupply(e.target.value)}
                  className="w-full px-4 py-3 border border-input bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                >
                  <option>Auto from customer</option>
                  <option>Maharashtra</option>
                  <option>Karnataka</option>
                  <option>Tamil Nadu</option>
                  <option>Gujarat</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Override only when needed
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="reverse-charge"
                  checked={reverseCharge}
                  onChange={(e) => setReverseCharge(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="reverse-charge" className="text-sm font-medium text-foreground cursor-pointer">
                  Reverse charge applicable
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Section */}
        <div className="bg-white rounded-lg">
          <div className="px-4 md:px-8 py-4 md:py-5 flex items-center justify-between border-b border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">LINE ITEMS</h3>
            <button
              onClick={addLineItem}
              className="inline-flex items-center gap-2 px-3 md:px-4 py-2 text-sm border border-border bg-white rounded-lg hover:bg-muted transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Line</span>
            </button>
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/20">
                <tr>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-foreground w-12">#</th>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-foreground min-w-[280px]">Item / Description</th>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-foreground w-40">HSN/SAC</th>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-foreground w-32">Qty</th>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-foreground w-36">Unit</th>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-foreground w-36">Rate</th>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-foreground w-28">Disc%</th>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-foreground w-28">GST%</th>
                  <th className="px-3 py-4 text-right text-xs font-semibold text-foreground w-32">Taxable</th>
                  <th className="px-3 py-4 text-right text-xs font-semibold text-foreground w-32">Total</th>
                  <th className="px-3 py-4 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => (
                  <tr key={item.id} className="group border-b border-border last:border-b-0">
                    <td className="px-3 py-5 text-sm text-muted-foreground text-center align-top">{index + 1}</td>
                    <td className="px-3 py-5 align-top">
                      <div className="space-y-3">
                        <select
                          value={item.itemId || ''}
                          onChange={(e) => handleLineItemSelection(item.id, e.target.value)}
                          disabled={isLoadingItems}
                          className="w-full px-4 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        >
                          <option value="">{isLoadingItems ? 'Loading items...' : 'Select item...'}</option>
                          {catalogItems.map((catalogItem) => (
                            <option key={catalogItem.id} value={catalogItem.id}>
                              {catalogItem.name}
                            </option>
                          ))}
                          <option value="add-new" className="text-accent font-medium">+ Add Item</option>
                        </select>
                        <textarea
                          rows={2}
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          placeholder="Description"
                          className="w-full px-4 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-5 align-top">
                      <input
                        type="text"
                        value={item.hsn}
                        onChange={(e) => updateLineItem(item.id, 'hsn', e.target.value)}
                        placeholder=""
                        className="w-full min-w-[120px] px-3 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </td>
                    <td className="px-3 py-5 align-top">
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateLineItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
                        className="w-full min-w-[80px] px-3 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </td>
                    <td className="px-3 py-5 align-top">
                      <select
                        value={item.unit}
                        onChange={(e) => updateLineItem(item.id, 'unit', e.target.value)}
                        className="w-full min-w-[100px] px-3 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      >
                        <option>JOB</option>
                        <option>Hrs</option>
                        <option>Nos</option>
                        <option>Kgs</option>
                        <option>Mtr</option>
                        <option>Bags</option>
                        <option>Others</option>
                      </select>
                    </td>
                    <td className="px-3 py-5 align-top">
                      <input
                        type="number"
                        value={item.rate}
                        onChange={(e) => updateLineItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full min-w-[100px] px-3 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </td>
                    <td className="px-3 py-5 align-top">
                      <input
                        type="number"
                        value={item.discount}
                        onChange={(e) => updateLineItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full min-w-[80px] px-3 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </td>
                    <td className="px-3 py-5 align-top">
                      <select
                        value={item.gst}
                        onChange={(e) => updateLineItem(item.id, 'gst', parseFloat(e.target.value))}
                        className="w-full min-w-[80px] px-3 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      >
                        <option value="0">0</option>
                        <option value="5">5</option>
                        <option value="12">12</option>
                        <option value="18">18</option>
                        <option value="28">28</option>
                      </select>
                    </td>
                    <td className="px-3 py-5 text-sm font-medium text-foreground text-right align-top">
                      ₹{subtotal > 0 ? (item.qty * item.rate * (1 - item.discount / 100)).toFixed(2) : '0.00'}
                    </td>
                    <td className="px-3 py-5 text-sm font-semibold text-foreground text-right align-top">
                      ₹{item.amount > 0 ? item.amount.toFixed(2) : '0.00'}
                    </td>
                    <td className="px-3 py-5 align-top">
                      {lineItems.length > 1 && (
                        <button
                          onClick={() => removeLineItem(item.id)}
                          className="p-2 text-destructive hover:bg-destructive/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
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
          <div className="lg:hidden divide-y divide-border">
            {lineItems.map((item, index) => {
              const isExpanded = expandedItemId === item.id;
              return (
                <div key={item.id} className="p-4">
                  {/* Collapsed Header - Always Visible */}
                  <div
                    onClick={() => setExpandedItemId(isExpanded ? '' : item.id)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-muted-foreground">Item #{index + 1}</span>
                        {item.item && (
                          <span className="text-sm text-foreground">- {item.item}</span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-accent mt-1">
                        ₹{item.amount > 0 ? item.amount.toFixed(2) : '0.00'}
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
                    <div className="space-y-4 mt-4 pt-4 border-t border-border">
                      {/* Item Selection */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Item
                        </label>
                        <select
                          value={item.itemId || ''}
                          onChange={(e) => handleLineItemSelection(item.id, e.target.value)}
                          disabled={isLoadingItems}
                          className="w-full px-4 py-3 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        >
                          <option value="">{isLoadingItems ? 'Loading items...' : 'Select item...'}</option>
                          {catalogItems.map((catalogItem) => (
                            <option key={catalogItem.id} value={catalogItem.id}>
                              {catalogItem.name}
                            </option>
                          ))}
                          <option value="add-new" className="text-accent font-medium">+ Add Item</option>
                        </select>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Description
                        </label>
                        <textarea
                          rows={2}
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          placeholder="Enter description"
                          className="w-full px-4 py-3 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
                        />
                      </div>

                      {/* HSN */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          HSN/SAC
                        </label>
                        <input
                          type="text"
                          value={item.hsn}
                          onChange={(e) => updateLineItem(item.id, 'hsn', e.target.value)}
                          placeholder=""
                          className="w-full px-4 py-3 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>

                      {/* Qty and Unit */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Quantity
                          </label>
                          <input
                            type="number"
                            value={item.qty}
                            onChange={(e) => updateLineItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
                            className="w-full px-4 py-3 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Unit
                          </label>
                          <select
                            value={item.unit}
                            onChange={(e) => updateLineItem(item.id, 'unit', e.target.value)}
                            className="w-full px-4 py-3 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                          >
                            <option>JOB</option>
                            <option>Hrs</option>
                            <option>Nos</option>
                            <option>Kgs</option>
                            <option>Mtr</option>
                            <option>Bags</option>
                            <option>Others</option>
                          </select>
                        </div>
                      </div>

                      {/* Rate and Discount */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Rate
                          </label>
                          <input
                            type="number"
                            value={item.rate}
                            onChange={(e) => updateLineItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full px-4 py-3 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Discount %
                          </label>
                          <input
                            type="number"
                            value={item.discount}
                            onChange={(e) => updateLineItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full px-4 py-3 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                          />
                        </div>
                      </div>

                      {/* GST */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          GST %
                        </label>
                        <select
                          value={item.gst}
                          onChange={(e) => updateLineItem(item.id, 'gst', parseFloat(e.target.value))}
                          className="w-full px-4 py-3 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        >
                          <option value="0">0</option>
                          <option value="5">5</option>
                          <option value="12">12</option>
                          <option value="18">18</option>
                          <option value="28">28</option>
                        </select>
                      </div>

                      {/* Calculated Amounts */}
                      <div className="pt-3 border-t border-border space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Taxable Amount</span>
                          <span className="font-medium text-foreground">
                            ₹{subtotal > 0 ? (item.qty * item.rate * (1 - item.discount / 100)).toFixed(2) : '0.00'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground font-semibold">Total Amount</span>
                          <span className="font-semibold text-foreground">
                            ₹{item.amount > 0 ? item.amount.toFixed(2) : '0.00'}
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

        {/* Bottom Section - Remarks and Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          <div className="bg-white rounded-lg p-4 md:p-6">
            <label className="block text-sm font-medium text-foreground mb-3">
              Remarks / Narration
            </label>
            <textarea
              rows={5}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add any additional notes or remarks for this invoice..."
              className="w-full px-4 py-3 border border-input bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none text-sm"
            />
          </div>

          <div className="bg-white rounded-lg p-4 md:p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">Sub-Total (Taxable)</span>
                <span className="font-semibold text-foreground text-base">
                  ₹{subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">CGST @ 9%</span>
                <span className="font-medium text-foreground">
                  ₹{(totalGST / 2).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">SGST @ 9%</span>
                <span className="font-medium text-foreground">
                  ₹{(totalGST / 2).toFixed(2)}
                </span>
              </div>
              <div className="pt-4 border-t-2 border-border">
                <div className="flex items-center justify-between py-2">
                  <span className="font-semibold text-foreground text-lg">Total</span>
                  <span className="text-3xl font-bold text-primary">
                    ₹{totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Preview Modal */}
      <InvoicePreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        lineItems={lineItems}
        invoiceNumber={invoiceNumber}
        invoiceDate={invoiceDate}
        customer={selectedCustomerDetails}
        customerType={selectedCustomerType}
        billType={derivedBillType}
        placeOfSupply={placeOfSupply}
        reverseCharge={reverseCharge}
        poNumber={poNumber}
        poDate={poDate}
        vehicleNo={vehicleNo}
        transportMode={transportMode}
        remarks={remarks}
      />

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-4 md:p-6 text-center">
              <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Invoice Created Successfully!</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Invoice {invoiceNumber} has been created and is ready to send.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    navigate('/app/invoices');
                  }}
                  className="w-full px-4 py-2.5 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                >
                  View Invoice List
                </button>
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    setShowPreview(true);
                  }}
                  className="w-full px-4 py-2.5 border border-border rounded hover:bg-muted transition-colors"
                >
                  Preview & Download
                </button>
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    // Reset form for new invoice
                    setLineItems([{
                      id: Date.now().toString(),
                      itemId: '',
                      item: '',
                      description: '',
                      hsn: '',
                      qty: 1,
                      unit: 'JOB',
                      rate: 0,
                      discount: 0,
                      gst: 18,
                      amount: 0
                    }]);
                    setSelectedCustomer('');
                    setPoNumber('');
                    setPoDate('');
                    setVehicleNo('');
                    setTransportMode('');
                    setRemarks('');
                  }}
                  className="w-full px-4 py-2.5 border border-border rounded hover:bg-muted transition-colors"
                >
                  Create Another Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItemModal && (
        <InvoiceItemModal
          isSaving={isSavingCatalogItem}
          onClose={() => {
            setShowAddItemModal(false);
            setLineItemIdForNewItem(null);
          }}
          onSave={handleAddCatalogItem}
        />
      )}

      {/* Add Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-xl font-semibold text-foreground">Add New Customer</h3>
              <button
                onClick={() => {
                  setShowAddCustomerModal(false);
                  setSelectedCustomer('');
                  setNewCustomer({
                    companyName: '',
                    customerType: 'B2B',
                    gstin: '',
                    pan: '',
                    contactName: '',
                    email: '',
                    phone: '',
                    city: '',
                    address: ''
                  });
                }}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Company Details */}
              <div>
                <h4 className="font-semibold text-foreground mb-4">Company Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Company Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={newCustomer.companyName}
                      onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
                      placeholder="e.g., TechCorp Solutions"
                      className="w-full px-4 py-2.5 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      GSTIN <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={newCustomer.gstin}
                      onChange={(e) => {
                        const gstin = normalizeGstin(e.target.value);
                        setNewCustomer({ ...newCustomer, gstin, pan: extractPanFromGstin(gstin) });
                      }}
                      placeholder="e.g., 27AAAAA0000A1Z5"
                      maxLength={15}
                      className="w-full px-4 py-2.5 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      PAN Number
                    </label>
                    <input
                      type="text"
                      value={newCustomer.pan}
                      onChange={(e) => setNewCustomer({ ...newCustomer, pan: e.target.value.toUpperCase().slice(0, 10) })}
                      placeholder="Auto from GSTIN"
                      maxLength={10}
                      className="w-full px-4 py-2.5 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Customer Type <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={newCustomer.customerType}
                      onChange={(e) => setNewCustomer({ ...newCustomer, customerType: e.target.value })}
                      className="w-full px-4 py-2.5 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                    >
                      <option value="B2B">B2B</option>
                      <option value="B2C">B2C</option>
                      <option value="SEZ">SEZ</option>
                      <option value="Export">Export</option>
                      <option value="Composition">Composition</option>
                      <option value="Nil Rated">Nil Rated</option>
                      <option value="Exempt Supply">Exempt Supply</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Contact Person */}
              <div>
                <h4 className="font-semibold text-foreground mb-4">Contact Person</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Contact Name <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={newCustomer.contactName}
                        onChange={(e) => setNewCustomer({ ...newCustomer, contactName: e.target.value })}
                        placeholder="e.g., Rajesh Kumar"
                        className="w-full px-4 py-2.5 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Email <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                        placeholder="e.g., contact@company.com"
                        className="w-full px-4 py-2.5 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Phone <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="tel"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                        placeholder="e.g., +91 98765 43210"
                        className="w-full px-4 py-2.5 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        City <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={newCustomer.city}
                        onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                        placeholder="e.g., Mumbai"
                        className="w-full px-4 py-2.5 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Address <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={newCustomer.address}
                      onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                      placeholder="Enter complete address"
                      className="w-full px-4 py-2.5 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddCustomerModal(false);
                  setSelectedCustomer('');
                  setNewCustomer({
                    companyName: '',
                    customerType: 'B2B',
                    gstin: '',
                    pan: '',
                    contactName: '',
                    email: '',
                    phone: '',
                    city: '',
                    address: ''
                  });
                }}
                className="px-6 py-2.5 border border-border rounded-lg hover:bg-muted transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomer}
                disabled={isSavingCustomer || !newCustomer.companyName || !newCustomer.gstin || !newCustomer.contactName || !newCustomer.email || !newCustomer.phone || !newCustomer.city || !newCustomer.address}
                className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {isSavingCustomer ? 'Saving...' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceItemModal({
  isSaving,
  onClose,
  onSave
}: {
  isSaving: boolean;
  onClose: () => void;
  onSave: (item: CatalogItem) => void;
}) {
  const [formData, setFormData] = useState<CatalogItem>({
    id: '',
    name: '',
    type: 'product',
    description: '',
    hsn: '',
    unit: 'Nos',
    sellingPrice: 0,
    purchasePrice: 0,
    gst: 18,
    stock: 0
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Add New Item</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Item Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'product' })}
                  className={`px-4 py-3 border-2 rounded-lg transition-colors ${
                    formData.type === 'product'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Package className="w-5 h-5 mx-auto mb-1" />
                  <div className="text-sm font-medium">Product</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'service', stock: undefined })}
                  className={`px-4 py-3 border-2 rounded-lg transition-colors ${
                    formData.type === 'service'
                      ? 'border-accent bg-accent/5 text-accent'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <Package className="w-5 h-5 mx-auto mb-1" />
                  <div className="text-sm font-medium">Service</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Item Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter item name"
                className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Description
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the item"
                className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  HSN/SAC Code *
                </label>
                <input
                  type="text"
                  required
                  value={formData.hsn}
                  onChange={(e) => setFormData({ ...formData, hsn: e.target.value })}
                  placeholder="Enter HSN/SAC code"
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Unit *
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option>Nos</option>
                  <option>JOB</option>
                  <option>HRS</option>
                  <option>Days</option>
                  <option>Kgs</option>
                  <option>MTR</option>
                  <option>SQFT</option>
                  <option>BAG</option>
                  <option>BOX</option>
                  <option>Pcs</option>
                  <option>Others</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {formData.type === 'product' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Opening Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock || 0}
                    onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
