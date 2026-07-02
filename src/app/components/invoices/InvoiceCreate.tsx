import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Plus, Trash2, Save, Eye, Calculator, CheckCircle, ChevronDown, ChevronUp, X, Package, Mail, MessageCircle } from 'lucide-react';
import { InvoicePreview } from './InvoicePreview';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { insertForUser, selectForUser, updateForUser, deleteForUser } from '../../../lib/auditorData';
import { extractPanFromGstin, getGstinStateName, normalizeGstin, normalizeIndianState } from '../../../lib/gstin';

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
  state: string;
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
  const [newItemName, setNewItemName] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isSavingCatalogItem, setIsSavingCatalogItem] = useState(false);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [invoiceCreated, setInvoiceCreated] = useState(false);
  const [sellerState, setSellerState] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
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
    state: '',
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
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const isEditMode = Boolean(editId);
  const [editStatus, setEditStatus] = useState<string>('pending');
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [hasLoadedEdit, setHasLoadedEdit] = useState(false);

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
    state: customer.state || getGstinStateName(customer.gstin) || '',
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
        .select('id, name, customer_type, gstin, pan, contact_name, email, phone, city, state, address')
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
    setCatalogLoaded(true);
  };

  useEffect(() => {
    loadCustomers();
    loadCatalogItems();
  }, [user?.company_id]);

  useEffect(() => {
    const loadSellerState = async () => {
      if (!user?.company_id) {
        setSellerState(getGstinStateName(user?.company_gstin) || '');
        return;
      }

      const { data, error } = await supabase
        .from('companies')
        .select('state, gstin')
        .eq('id', user.company_id)
        .single();

      if (!error) {
        setSellerState(data?.state || getGstinStateName(data?.gstin) || getGstinStateName(user?.company_gstin) || '');
      }
    };

    loadSellerState();
  }, [user?.company_id, user?.company_gstin]);

  const loadInvoiceForEdit = async (id: string) => {
    const { data: invoiceRows, error } = await selectForUser<any[]>(user, 'invoices', 'invoices', () =>
      supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .limit(1)
    );

    if (error || !invoiceRows || invoiceRows.length === 0) {
      toast.error('Could not load the invoice to edit.');
      return;
    }

    const invoice = invoiceRows[0];

    const { data: itemRows, error: itemsError } = await selectForUser<any[]>(user, 'invoices', 'invoice_items', () =>
      supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', id)
        .order('sort_order', { ascending: true })
    );

    if (itemsError) {
      toast.error('Could not load the invoice line items.');
    }

    setSelectedCustomer(invoice.customer_id || '');
    setInvoiceNumber(invoice.invoice_number || '');
    setIsManualInvoiceNumber(true);
    if (invoice.invoice_date) setInvoiceDate(invoice.invoice_date);
    setPlaceOfSupply(invoice.place_of_supply || 'Auto from customer');
    setReverseCharge(Boolean(invoice.reverse_charge));
    setPoNumber(invoice.po_number || '');
    setPoDate(invoice.po_date || '');
    setVehicleNo(invoice.vehicle_number || '');
    setTransportMode(invoice.transport_mode || '');
    setRemarks(invoice.remarks || '');
    setEditStatus(invoice.status || 'pending');

    const mappedItems: LineItem[] = (itemRows || []).map((row, index) => {
      const catalog = catalogItems.find((c) => c.id === row.item_id);
      const qty = Number(row.quantity) || 0;
      const rate = Number(row.rate) || 0;
      const discount = Number(row.discount_percent) || 0;
      const gst = Number(row.gst_rate) || 0;
      const baseAmount = qty * rate;
      const afterDiscount = baseAmount - (baseAmount * discount / 100);
      const amount = afterDiscount + (afterDiscount * gst / 100);

      return {
        id: row.id ? String(row.id) : String(index + 1),
        itemId: row.item_id || '',
        type: catalog?.type,
        item: row.item_name || catalog?.name || '',
        description: row.description || '',
        hsn: row.hsn || '',
        qty,
        unit: row.unit || 'Nos',
        rate,
        discount,
        gst,
        amount,
      };
    });

    if (mappedItems.length > 0) {
      setLineItems(mappedItems);
      setExpandedItemId(mappedItems[0].id);
    }
  };

  // Populate the form when editing an existing invoice. Waits for the catalog
  // so each line can recover its product/service type, and runs only once.
  useEffect(() => {
    if (!isEditMode || hasLoadedEdit || !catalogLoaded || !user?.company_id) return;
    setHasLoadedEdit(true);
    loadInvoiceForEdit(editId as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, hasLoadedEdit, catalogLoaded, user?.company_id]);

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
        const qty = Number(updated.qty) || 0;
        const rate = Number(updated.rate) || 0;
        const discount = Number(updated.discount) || 0;
        const gst = Number(updated.gst) || 0;
        const baseAmount = qty * rate;
        const afterDiscount = baseAmount - (baseAmount * discount / 100);
        const gstAmount = afterDiscount * gst / 100;
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

  // Free-text item entry: type any name (or pick a catalog suggestion). If the
  // typed name exactly matches a catalog item, auto-fill its HSN/rate/GST;
  // otherwise keep it as a one-off line with no catalog link.
  const handleItemNameChange = (lineItemId: string, value: string) => {
    const match = catalogItems.find(
      (catalogItem) => catalogItem.name.trim().toLowerCase() === value.trim().toLowerCase()
    );

    if (match) {
      applyCatalogItemToLine(lineItemId, match);
      return;
    }

    setLineItems(lineItems.map((lineItem) => (
      lineItem.id === lineItemId
        ? { ...lineItem, item: value, itemId: '', type: undefined }
        : lineItem
    )));
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
  // Line item numeric fields are held as raw strings while editing (so the
  // field can be cleared); coerce to numbers for the preview, which calls
  // .toFixed()/formatting on them.
  const previewLineItems = lineItems.map((item) => ({
    ...item,
    qty: Number(item.qty) || 0,
    rate: Number(item.rate) || 0,
    discount: Number(item.discount) || 0,
    gst: Number(item.gst) || 0,
    amount: Number(item.amount) || 0,
  }));
  const selectedCustomerDetails = customers.find((customer) => customer.id === selectedCustomer) || null;
  const selectedCustomerType = selectedCustomerDetails?.customerType || 'B2B';
  const supplyState = placeOfSupply === 'Auto from customer'
    ? selectedCustomerDetails?.state || getGstinStateName(selectedCustomerDetails?.gstin) || ''
    : placeOfSupply;
  const isInterStateSupply = Boolean(
    sellerState &&
    supplyState &&
    normalizeIndianState(sellerState) !== normalizeIndianState(supplyState)
  );
  const cgst = isInterStateSupply ? 0 : totalGST / 2;
  const sgst = isInterStateSupply ? 0 : totalGST / 2;
  const igst = isInterStateSupply ? totalGST : 0;
  const hasProductItems = lineItems.some((item) => item.type === 'product');
  const hasServiceItems = lineItems.some((item) => item.type === 'service');
  const derivedBillType = hasProductItems && hasServiceItems
    ? 'goods+service'
    : hasProductItems
      ? 'only goods'
      : hasServiceItems
        ? 'only service'
        : 'goods+service';

  const getInvoiceShareMessage = () => (
    `Invoice ${invoiceNumber} for ${selectedCustomerDetails?.companyName || 'your company'} has been created. Total amount: Rs. ${totalAmount.toFixed(2)}.`
  );

  const handleWhatsAppInvoice = () => {
    const phone = selectedCustomerDetails?.phone.replace(/\D/g, '') || '';
    const message = encodeURIComponent(getInvoiceShareMessage());
    const whatsappUrl = phone
      ? `https://wa.me/${phone}?text=${message}`
      : `https://wa.me/?text=${message}`;

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleMailInvoice = () => {
    if (!selectedCustomerDetails?.email) {
      toast.error('Customer email is not available');
      return;
    }

    const subject = encodeURIComponent(`Invoice ${invoiceNumber}`);
    const body = encodeURIComponent(getInvoiceShareMessage());
    window.location.href = `mailto:${selectedCustomerDetails.email}?subject=${subject}&body=${body}`;
  };

  const getFinancialYear = () => {
    const date = new Date(invoiceDate || new Date());
    const year = date.getFullYear();
    const startYear = date.getMonth() >= 3 ? year : year - 1;
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
  };

  // Read the invoice-defaults toggle + configured prefix/start number from
  // company settings (stored in the DB so it syncs across devices).
  const getInvoiceDefaults = async (): Promise<{ enabled: boolean; prefix: string; nextNumber: number }> => {
    try {
      const { data, error } = await supabase.rpc('get_company_settings', {
        p_auditor_id: user?.role === 'auditor' ? user.id : null,
      });
      if (error || !data?.success) {
        return { enabled: true, prefix: 'INV', nextNumber: 1 };
      }
      const s = data.settings || {};
      return {
        enabled: s.invoice_defaults_enabled !== false,
        prefix: (s.invoice_prefix || 'INV').toString().trim() || 'INV',
        nextNumber: Number(s.invoice_next_number) || 1,
      };
    } catch {
      return { enabled: true, prefix: 'INV', nextNumber: 1 };
    }
  };

  // The number a brand-new invoice would get, based on the current settings.
  const computeAutoInvoiceNumber = async () => {
    const defaults = await getInvoiceDefaults();

    // Count existing invoices for this company.
    let existingCount = 0;
    if (user?.role === 'auditor') {
      const { data, error } = await selectForUser<any[]>(user, 'invoices', 'invoices', () =>
        supabase
          .from('invoices')
          .select('id')
          .eq('company_id', user?.company_id)
      );
      if (error) throw error;
      existingCount = (data || []).length;
    } else {
      const { count, error } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', user?.company_id);
      if (error) throw error;
      existingCount = count || 0;
    }

    // Invoice Defaults off → plain sequence starting from 1.
    if (!defaults.enabled) {
      return String(existingCount + 1);
    }

    // Invoice Defaults on → configured prefix + (starting number offset by
    // however many invoices already exist).
    return `${defaults.prefix}-${existingCount + defaults.nextNumber}`;
  };

  const getNextInvoiceNumber = async () => {
    if (isManualInvoiceNumber && invoiceNumber.trim()) {
      return invoiceNumber.trim();
    }
    return computeAutoInvoiceNumber();
  };

  // Show a live preview of the auto-generated number (reflecting the current
  // Invoice Defaults) in the field and the preview, for new invoices.
  useEffect(() => {
    if (editId || isManualInvoiceNumber || !user?.company_id) return;
    let cancelled = false;
    computeAutoInvoiceNumber()
      .then((number) => {
        if (!cancelled) setInvoiceNumber(number);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, isManualInvoiceNumber, user?.company_id]);

  const saveInvoice = async (status: string) => {
    if (!user?.company_id) {
      toast.error('Company profile is not ready. Please refresh and try again.');
      return null;
    }

    if (lineItems.length === 0) {
      toast.error('Add at least one line item.');
      return null;
    }

    if (lineItems.some((item) => !item.itemId && !item.item.trim())) {
      toast.error('Enter or select an item for every invoice line.');
      return null;
    }

    setIsSavingInvoice(true);

    try {
      const nextInvoiceNumber = await getNextInvoiceNumber();

      const invoiceRecord = {
          company_id: user.company_id,
          customer_id: selectedCustomer || null,
          invoice_number: nextInvoiceNumber,
          invoice_date: invoiceDate,
          customer_type: selectedCustomerType,
          bill_type: derivedBillType,
          place_of_supply: supplyState || null,
          reverse_charge: reverseCharge,
          po_number: poNumber.trim() || null,
          po_date: poDate || null,
          vehicle_number: vehicleNo.trim() || null,
          transport_mode: transportMode.trim() || null,
          remarks: remarks.trim() || null,
          subtotal,
          cgst,
          sgst,
          igst,
          total_tax: totalGST,
          total_amount: totalAmount,
          paid_amount: 0,
          status,
          created_by: user.id,
        };

      let invoice: any;

      if (isEditMode && editId) {
        // Keep the original creator; only update the editable fields.
        const { created_by, ...updateRecord } = invoiceRecord;
        const { data, error: invoiceError } = await updateForUser<any>(user, 'invoices', 'invoices', () =>
          supabase
            .from('invoices')
            .update(updateRecord)
            .eq('id', editId)
            .select('id, invoice_number')
            .single(),
          updateRecord,
          { id: editId },
          nextInvoiceNumber
        );

        if (invoiceError) {
          throw invoiceError;
        }
        invoice = data;

        // Replace the line items wholesale so removed/added rows are reflected.
        const { error: deleteError } = await deleteForUser(user, 'invoices', 'invoice_items', () =>
          supabase
            .from('invoice_items')
            .delete()
            .eq('invoice_id', editId),
          { invoice_id: editId },
          nextInvoiceNumber
        );

        if (deleteError) {
          throw deleteError;
        }
      } else {
        const { data, error: invoiceError } = await insertForUser<any>(user, 'invoices', 'invoices', () =>
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
        invoice = data;
      }

      const invoiceItems = lineItems.map((item, index) => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const discount = Number(item.discount) || 0;
        const gst = Number(item.gst) || 0;
        const baseAmount = qty * rate;
        const taxableAmount = baseAmount - (baseAmount * discount / 100);
        const taxAmount = taxableAmount * gst / 100;

        return {
          invoice_id: invoice.id,
          item_id: item.itemId || null,
          item_name: item.item || item.description || 'Line item',
          description: item.description || null,
          hsn: item.hsn || null,
          quantity: qty,
          unit: item.unit,
          rate,
          discount_percent: discount,
          gst_rate: gst,
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
      toast.success(isEditMode ? 'Invoice updated' : (status === 'draft' ? 'Invoice draft saved' : 'Invoice created'));
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
    const invoice = await saveInvoice(isEditMode ? editStatus : 'pending');
    if (!invoice) return;

    if (isEditMode) {
      navigate('/app/invoices');
      return;
    }

    setInvoiceCreated(true);
    setShowSuccessModal(true);
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
        state: newCustomer.state.trim() || getGstinStateName(newCustomer.gstin) || null,
        address: newCustomer.address.trim(),
      };

    const { data, error } = await insertForUser<any>(user, 'customers', 'customers', () =>
      supabase
        .from('customers')
        .insert(record)
        .select('id, name, customer_type, gstin, pan, contact_name, email, phone, city, state, address')
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
      state: '',
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
    setNewItemName('');
    toast.success('Item saved');
  };

  return (
    <div className="pb-8 bg-muted/30 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 md:px-8 py-4 md:py-6 sticky top-0 z-10">
        <div className="flex items-center">
          <div className="flex items-center gap-4">
            <Link
              to="/app/invoices"
              className="p-2 hover:bg-muted rounded transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-foreground">{isEditMode ? 'Edit Tax Invoice' : 'New Tax Invoice'}</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                FY 2026-27 - {isInterStateSupply ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8">
        {/* STEPS 1 + 2 — Customer & Invoice Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Customer */}
          <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">1</div>
              <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Customer</h3>
            </div>
            <div className="space-y-3.5">
              <select
                value={selectedCustomer}
                onChange={(e) => handleCustomerChange(e.target.value)}
                disabled={isLoadingCustomers}
                className="kaps-compact-select w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              >
                <option value="">{isLoadingCustomers ? 'Loading customers…' : 'Select customer…'}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.companyName} — {customer.gstin}
                  </option>
                ))}
                <option value="add-new" className="text-violet-600 font-medium">+ Add new customer</option>
              </select>

              <div className="min-h-[230px]">
              {selectedCustomerDetails ? (
                <div className="rounded-lg border border-violet-200 dark:border-violet-400/25 bg-violet-50/50 dark:bg-violet-500/[0.05] p-4">
                  {/* Top row: company name + GSTIN chip + customer type */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-semibold text-foreground leading-tight">{selectedCustomerDetails.companyName}</div>
                      {selectedCustomerDetails.gstin && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-100 dark:bg-violet-500/15 text-[12px] font-mono font-semibold text-violet-700 dark:text-violet-200">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">GSTIN</span>
                          {selectedCustomerDetails.gstin}
                        </div>
                      )}
                    </div>
                    {selectedCustomerDetails.customerType && (
                      <span className="shrink-0 px-2.5 py-1 rounded-md bg-card border border-violet-200 dark:border-violet-400/30 text-[10.5px] font-bold tracking-wider uppercase text-violet-600 dark:text-violet-300">
                        {selectedCustomerDetails.customerType}
                      </span>
                    )}
                  </div>

                  {/* Address row */}
                  {(selectedCustomerDetails.address || selectedCustomerDetails.city || selectedCustomerDetails.state) && (
                    <div className="mt-3.5 pt-3.5 border-t border-violet-200/70 dark:border-violet-400/15">
                      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Address</div>
                      <div className="text-[13.5px] text-foreground leading-snug">
                        {[selectedCustomerDetails.address, selectedCustomerDetails.city, selectedCustomerDetails.state].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  )}

                  {/* Contact row — 3-col grid so name / phone / email each get their own labeled slot */}
                  {(selectedCustomerDetails.contactName || selectedCustomerDetails.email || selectedCustomerDetails.phone) && (
                    <div className="mt-3.5 pt-3.5 border-t border-violet-200/70 dark:border-violet-400/15 grid grid-cols-1 sm:grid-cols-[auto_auto_minmax(0,1fr)] gap-x-6 gap-y-2.5">
                      {selectedCustomerDetails.contactName && (
                        <div className="min-w-0">
                          <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Contact</div>
                          <div className="text-[13.5px] text-foreground truncate">{selectedCustomerDetails.contactName}</div>
                        </div>
                      )}
                      {selectedCustomerDetails.phone && (
                        <div className="min-w-0">
                          <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Phone</div>
                          <div className="text-[13.5px] text-foreground tabular-nums truncate">{selectedCustomerDetails.phone}</div>
                        </div>
                      )}
                      {selectedCustomerDetails.email && (
                        <div className="min-w-0">
                          <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Email</div>
                          <div className="text-[13.5px] text-foreground break-all" title={selectedCustomerDetails.email}>{selectedCustomerDetails.email}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[12.5px] text-muted-foreground px-1">Pick an existing customer or add a new one — their GSTIN drives the tax calculation below.</p>
              )}
              </div>
            </div>
          </div>

          {/* 2. Invoice Details */}
          <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">2</div>
              <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Invoice Details</h3>
            </div>
            <div className="space-y-5">
              {/* Invoice Number with inline Manual toggle */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[14px] font-semibold text-foreground">Invoice Number</label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">
                    <input
                      type="checkbox"
                      checked={isManualInvoiceNumber}
                      onChange={(e) => setIsManualInvoiceNumber(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-violet-500"
                    />
                    Manual override
                  </label>
                </div>
                {!isManualInvoiceNumber ? (
                  <div className="inline-flex items-center gap-2.5 w-full px-3.5 h-11 bg-violet-50/50 dark:bg-violet-500/[0.06] border border-violet-200 dark:border-violet-400/25 rounded-lg text-[14px]">
                    <span className="h-2 w-2 rounded-full bg-violet-400 shrink-0" />
                    <span className={`flex-1 truncate font-mono ${invoiceNumber ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {invoiceNumber || 'Auto-generated when you save'}
                    </span>
                    <span className="text-[10.5px] uppercase tracking-wider font-semibold text-violet-600 dark:text-violet-300 shrink-0">Auto</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV/2026/0143"
                    className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition font-mono"
                  />
                )}
              </div>

              {/* Document Date + Place of Supply */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[14px] font-semibold text-foreground mb-2">Document Date</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-semibold text-foreground mb-2">Place of Supply</label>
                  <select
                    value={placeOfSupply}
                    onChange={(e) => setPlaceOfSupply(e.target.value)}
                    className="kaps-compact-select w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                  >
                    <option>Auto from customer</option>
                    <option>Maharashtra</option>
                    <option>Karnataka</option>
                    <option>Tamil Nadu</option>
                    <option>Gujarat</option>
                  </select>
                </div>
              </div>

              {/* Reverse charge — extra top padding nudges this block down */}
              <div className="pt-3">
                <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-violet-200 dark:border-violet-400/25 bg-violet-50/40 dark:bg-violet-500/[0.04] p-3.5 hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.06] transition-colors">
                  <input
                    type="checkbox"
                    checked={reverseCharge}
                    onChange={(e) => setReverseCharge(e.target.checked)}
                    className="w-4 h-4 rounded accent-violet-500 mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-foreground leading-tight">Reverse charge applicable</div>
                    <div className="text-[12.5px] text-muted-foreground mt-1 leading-snug">Recipient pays GST instead of supplier (RCM). Used for notified goods and unregistered suppliers.</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Line Items */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
          <div className="px-4 md:px-6 py-4 flex items-center justify-between border-b border-violet-100 dark:border-violet-400/15">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">3</div>
              <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Items & Services</h3>
            </div>
            <button
              onClick={addLineItem}
              className="inline-flex items-center gap-1.5 h-9 px-3 md:px-4 text-[12.5px] font-medium border border-violet-300 dark:border-violet-400/30 bg-card text-foreground rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
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
                        <ItemCombobox
                          value={item.item}
                          options={catalogItems}
                          onType={(value) => handleItemNameChange(item.id, value)}
                          onSelect={(catalogItem) => applyCatalogItemToLine(item.id, catalogItem)}
                          onAddNew={(typed) => {
                            setLineItemIdForNewItem(item.id);
                            setNewItemName(typed);
                            setShowAddItemModal(true);
                          }}
                          disabled={isLoadingItems}
                          placeholder={isLoadingItems ? 'Loading items...' : 'Type or select an item...'}
                          inputClassName="w-full pl-4 pr-9 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
                        <textarea
                          rows={2}
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          placeholder="Description"
                          className="w-full px-4 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition resize-none"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-5 align-top">
                      <input
                        type="text"
                        value={item.hsn}
                        onChange={(e) => updateLineItem(item.id, 'hsn', e.target.value)}
                        placeholder=""
                        className="w-full min-w-[120px] px-3 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                    </td>
                    <td className="px-3 py-5 align-top">
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full min-w-[80px] px-3 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                    </td>
                    <td className="px-3 py-5 align-top">
                      <select
                        value={item.unit}
                        onChange={(e) => updateLineItem(item.id, 'unit', e.target.value)}
                        className="kaps-compact-select w-full min-w-[84px] px-3 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
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
                        onChange={(e) => updateLineItem(item.id, 'rate', e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full min-w-[100px] px-3 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                    </td>
                    <td className="px-3 py-5 align-top">
                      <input
                        type="number"
                        value={item.discount}
                        onChange={(e) => updateLineItem(item.id, 'discount', e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full min-w-[80px] px-3 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                    </td>
                    <td className="px-3 py-5 align-top">
                      <select
                        value={item.gst}
                        onChange={(e) => updateLineItem(item.id, 'gst', parseFloat(e.target.value))}
                        className="kaps-compact-select w-full min-w-[64px] px-3 py-2.5 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
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
                        <ItemCombobox
                          value={item.item}
                          options={catalogItems}
                          onType={(value) => handleItemNameChange(item.id, value)}
                          onSelect={(catalogItem) => applyCatalogItemToLine(item.id, catalogItem)}
                          onAddNew={(typed) => {
                            setLineItemIdForNewItem(item.id);
                            setNewItemName(typed);
                            setShowAddItemModal(true);
                          }}
                          disabled={isLoadingItems}
                          placeholder={isLoadingItems ? 'Loading items...' : 'Type or select an item...'}
                          inputClassName="w-full pl-4 pr-9 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                        />
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
                          className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition resize-none"
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
                          className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
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
                            onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Unit
                          </label>
                          <select
                            value={item.unit}
                            onChange={(e) => updateLineItem(item.id, 'unit', e.target.value)}
                            className="kaps-compact-select w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
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
                            onChange={(e) => updateLineItem(item.id, 'rate', e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Discount %
                          </label>
                          <input
                            type="number"
                            value={item.discount}
                            onChange={(e) => updateLineItem(item.id, 'discount', e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
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
                          className="kaps-compact-select w-full px-4 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
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

        {/* 4. References & Transport — optional, grouped so the main flow stays clean */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">4</div>
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">
              References & Transport
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">Optional</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-foreground mb-1.5">PO Number</label>
              <input
                type="text"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="—"
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-foreground mb-1.5">PO Date</label>
              <input
                type="date"
                value={poDate}
                onChange={(e) => setPoDate(e.target.value)}
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-foreground mb-1.5">Vehicle Number</label>
              <input
                type="text"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="—"
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-foreground mb-1.5">Transport Mode</label>
              <input
                type="text"
                value={transportMode}
                onChange={(e) => setTransportMode(e.target.value)}
                placeholder="Road / Rail / Air"
                className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
              />
            </div>
          </div>
        </div>

        {/* 5. Notes & Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          {/* Notes */}
          <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
            <div className="flex items-center gap-2 mb-3.5">
              <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">5</div>
              <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Notes</h3>
            </div>
            <textarea
              rows={6}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add any additional notes or remarks for this invoice…"
              className="w-full px-3.5 py-3 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition resize-none"
            />
          </div>

          {/* Summary */}
          <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
            <div className="flex items-center gap-2 mb-3.5">
              <div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">6</div>
              <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Summary</h3>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[14px]">
                <span className="text-muted-foreground">Sub-total (taxable)</span>
                <span className="font-semibold text-foreground tabular-nums">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-[14px]">
                <span className="text-muted-foreground">{isInterStateSupply ? 'IGST @ 18%' : 'CGST @ 9%'}</span>
                <span className="font-medium text-foreground tabular-nums">₹{(isInterStateSupply ? igst : cgst).toFixed(2)}</span>
              </div>
              {!isInterStateSupply && (
                <div className="flex items-center justify-between text-[14px]">
                  <span className="text-muted-foreground">SGST @ 9%</span>
                  <span className="font-medium text-foreground tabular-nums">₹{sgst.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-3.5 mt-2 border-t border-violet-200 dark:border-violet-400/20">
                <div className="flex items-end justify-between gap-3">
                  <span className="text-[12px] uppercase tracking-wider font-semibold text-muted-foreground">Total</span>
                  <span className="text-[28px] sm:text-[32px] font-bold text-violet-600 dark:text-violet-300 tabular-nums leading-none">₹{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky-feeling action bar */}
        <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl px-4 md:px-6 py-3.5 shadow-[0_1px_2px_rgba(139,92,246,0.06)] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-[13px] text-muted-foreground min-w-0 md:flex-1 md:pr-2">
            {invoiceCreated ? 'Invoice created — review and send to your customer.' : isEditMode ? 'Review the details above, then update the invoice.' : 'Review the details above, then create the invoice.'}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-2.5 md:justify-end md:shrink-0">
            <button
              onClick={handleSaveDraft}
              disabled={isSavingInvoice}
              className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full border border-violet-200 dark:border-violet-400/25 bg-card text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-[14px] font-medium disabled:opacity-50 whitespace-nowrap sm:flex-1 md:flex-initial md:shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              {isSavingInvoice ? 'Saving…' : 'Save as Draft'}
            </button>
            {!invoiceCreated && (
              <button
                onClick={() => setShowPreview(true)}
                className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full border border-violet-200 dark:border-violet-400/25 bg-card text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-[14px] font-medium whitespace-nowrap sm:flex-1 md:flex-initial md:shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
            )}
            <button
              onClick={invoiceCreated ? () => setShowPreview(true) : handleCreateInvoice}
              disabled={isSavingInvoice}
              className="inline-flex items-center justify-center h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap sm:flex-1 md:flex-initial md:shrink-0"
            >
              {isSavingInvoice ? 'Saving…' : invoiceCreated ? 'View Invoice' : isEditMode ? 'Update Invoice →' : 'Create Invoice →'}
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Preview Modal */}
      <InvoicePreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title={invoiceCreated ? 'Invoice Details' : 'Invoice Preview'}
        lineItems={previewLineItems}
        invoiceNumber={invoiceNumber}
        invoiceDate={invoiceDate}
        customer={selectedCustomerDetails}
        customerType={selectedCustomerType}
        billType={derivedBillType}
        placeOfSupply={placeOfSupply}
        sellerState={sellerState}
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
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <button
              onClick={() => setShowSuccessModal(false)}
              className="absolute right-3 top-3 p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
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
                    setShowPreview(true);
                  }}
                  className="w-full px-4 py-2.5 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                >
                  View and Download
                </button>
                <button
                  onClick={() => {
                    handleWhatsAppInvoice();
                  }}
                  className="w-full px-4 py-2.5 border border-border rounded hover:bg-muted transition-colors"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp the Invoice
                  </span>
                </button>
                <button
                  onClick={() => {
                    handleMailInvoice();
                  }}
                  className="w-full px-4 py-2.5 border border-border rounded hover:bg-muted transition-colors"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <Mail className="w-4 h-4" />
                    Mail Invoice
                  </span>
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
          initialName={newItemName}
          onClose={() => {
            setShowAddItemModal(false);
            setLineItemIdForNewItem(null);
            setNewItemName('');
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
                    state: '',
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
                        setNewCustomer({ ...newCustomer, gstin, pan: extractPanFromGstin(gstin), state: getGstinStateName(gstin) });
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
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        State <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={newCustomer.state}
                        onChange={(e) => setNewCustomer({ ...newCustomer, state: e.target.value })}
                        placeholder="e.g., Maharashtra"
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
                    state: '',
                    address: ''
                  });
                }}
                className="px-6 py-2.5 border border-border rounded-lg hover:bg-muted transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomer}
                disabled={isSavingCustomer || !newCustomer.companyName || !newCustomer.gstin || !newCustomer.contactName || !newCustomer.email || !newCustomer.phone || !newCustomer.city || !newCustomer.state || !newCustomer.address}
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
  initialName = '',
  onClose,
  onSave
}: {
  isSaving: boolean;
  initialName?: string;
  onClose: () => void;
  onSave: (item: CatalogItem) => void;
}) {
  const [formData, setFormData] = useState<CatalogItem>({
    id: '',
    name: initialName,
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

interface ItemComboboxProps {
  value: string;
  options: CatalogItem[];
  onType: (value: string) => void;
  onSelect: (item: CatalogItem) => void;
  onAddNew?: (typedValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
}

// A dropdown that's also typeable: shows the styled catalog list (like the old
// <select>) but lets you type any item name. Filtered as you type; the panel is
// portalled to <body> so the scrollable items table can't clip it.
function ItemCombobox({ value, options, onType, onSelect, onAddNew, disabled, placeholder, inputClassName }: ItemComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const query = value.trim().toLowerCase();
  const filtered = query ? options.filter((o) => o.name.toLowerCase().includes(query)) : options;
  // Offer "Add to items" unless the typed name is already a catalog item.
  const exactMatch = query !== '' && options.some((o) => o.name.trim().toLowerCase() === query);
  const canAddNew = Boolean(onAddNew) && !exactMatch;

  const updateRect = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  const openMenu = () => {
    updateRect();
    setHighlight(-1);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const reposition = () => updateRect();
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', onDocDown);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('mousedown', onDocDown);
    };
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openMenu();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter' && open && highlight >= 0 && filtered[highlight]) {
      e.preventDefault();
      onSelect(filtered[highlight]);
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onType(e.target.value);
          setHighlight(-1);
          if (!open) openMenu();
          else updateRect();
        }}
        onFocus={openMenu}
        onKeyDown={handleKeyDown}
        className={inputClassName}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) {
            setOpen(false);
          } else {
            inputRef.current?.focus();
            openMenu();
          }
        }}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-700 dark:text-slate-200"
      >
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 60 }}
          className="max-h-60 overflow-auto rounded-lg border border-violet-200 dark:border-violet-400/30 bg-white dark:bg-[#0d0d2a] shadow-xl py-1"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matches — keep “{value}” as a custom item
            </div>
          ) : (
            filtered.map((option, index) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(option);
                  setOpen(false);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={`block w-full text-left px-3 py-2 text-sm text-foreground transition-colors ${
                  index === highlight ? 'bg-violet-50 dark:bg-violet-500/10' : 'hover:bg-violet-50 dark:hover:bg-violet-500/10'
                }`}
              >
                {option.name}
              </button>
            ))
          )}

          {canAddNew && (
            <div className="sticky bottom-0 border-t border-violet-100 dark:border-violet-400/15 bg-white dark:bg-[#0d0d2a]">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAddNew?.(value);
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10"
              >
                <Plus className="w-4 h-4 shrink-0" />
                {value.trim() ? `Add “${value.trim()}” to items` : 'Add new item to catalog'}
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
