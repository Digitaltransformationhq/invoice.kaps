import { Link, useNavigate } from 'react-router';
import { Plus, Search, Filter, Download, Send, Eye, Edit, MoreVertical, Trash2, Copy, CheckCircle, XCircle, Mail, MessageCircle, X, Loader2, FileCheck, IndianRupee } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { InvoicePreview } from './InvoicePreview';
import { RecordPaymentDialog, PaymentInvoice } from './RecordPaymentDialog';
import { toast } from 'sonner';
import { sendInvoiceEmail } from '../../../lib/emailInvoice';
import ExcelJS from 'exceljs';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { deleteForUser, logAuditorAction, selectForUser, updateForUser } from '../../../lib/auditorData';
import { useTaxpayerType } from '../../../lib/useTaxpayerType';

interface InvoiceRow {
  dbId: string;
  id: string;
  customer: string;
  customerDetails: any;
  date: string;
  rawDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  customerId?: string | null;
  status: string;
  isManualNumber?: boolean;
  customerType?: string;
  billType?: string;
  placeOfSupply?: string;
  reverseCharge?: boolean;
  poNumber?: string;
  poDate?: string;
  vehicleNo?: string;
  transportMode?: string;
  remarks?: string;
  lineItems: any[];
}

export function InvoiceList() {
  const { user } = useAuth();
  const { isComposition } = useTaxpayerType();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<PaymentInvoice | null>(null);
  const [previewAutoSend, setPreviewAutoSend] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return value;
    return parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const mapInvoiceFromDatabase = (invoice: any): InvoiceRow => {
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;

    const lineItems = (invoice.invoice_items || []).map((item: any) => {
      const catalogItem = Array.isArray(item.items) ? item.items[0] : item.items;

      return {
        id: item.id,
        type: catalogItem?.type,
        item: item.item_name || '',
        description: item.description || '',
        hsn: item.hsn || '',
        qty: Number(item.quantity || 0),
        unit: item.unit || 'Nos',
        rate: Number(item.rate || 0),
        discount: Number(item.discount_percent || 0),
        gst: Number(item.gst_rate || 0),
        amount: Number(item.total_amount || 0),
      };
    });
    const hasProductItems = lineItems.some((item: any) => item.type === 'product');
    const hasServiceItems = lineItems.some((item: any) => item.type === 'service');
    const derivedBillType = hasProductItems && hasServiceItems
      ? 'goods+service'
      : hasProductItems
        ? 'only goods'
        : hasServiceItems
          ? 'only service'
          : invoice.bill_type || '';

    return {
      dbId: invoice.id,
      id: invoice.invoice_number,
      customer: customer?.name || 'Customer not selected',
      customerDetails: customer ? {
        id: customer.id || '',
        companyName: customer.name || '',
        gstin: customer.gstin || '',
        contactName: customer.contact_name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        city: customer.city || '',
        state: customer.state || '',
        address: customer.address || '',
      } : null,
      date: formatDate(invoice.invoice_date),
      rawDate: invoice.invoice_date || '',
      dueDate: formatDate(invoice.due_date),
      rawDueDate: invoice.due_date || '',
      amount: Number(invoice.total_amount || 0),
      paidAmount: Number(invoice.paid_amount || 0),
      customerId: customer?.id || invoice.customer_id || null,
      status: invoice.status || 'draft',
      isManualNumber: Boolean(invoice.is_manual_number),
      customerType: invoice.customer_type || customer?.customer_type || '',
      billType: derivedBillType,
      placeOfSupply: invoice.place_of_supply || '',
      reverseCharge: Boolean(invoice.reverse_charge),
      poNumber: invoice.po_number || '',
      poDate: invoice.po_date || '',
      vehicleNo: invoice.vehicle_number || '',
      transportMode: invoice.transport_mode || '',
      remarks: invoice.remarks || '',
      terms: invoice.terms || '',
      lineItems,
    };
  };

  const loadInvoices = async () => {
    if (!user?.company_id) {
      setInvoices([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { data, error } = await selectForUser<any[]>(user, 'invoices', 'invoices', () =>
      supabase
        .from('invoices')
        .select(`
        id,
        invoice_number,
        invoice_date,
        due_date,
        total_amount,
        paid_amount,
        customer_id,
        status,
        is_manual_number,
        customer_type,
        bill_type,
        place_of_supply,
        reverse_charge,
        po_number,
        po_date,
        vehicle_number,
        transport_mode,
        remarks,
        terms,
        customers(id, name, customer_type, gstin, contact_name, email, phone, city, state, address),
        invoice_items(id, item_name, description, hsn, quantity, unit, rate, discount_percent, gst_rate, total_amount, sort_order, items(type))
      `)
        .eq('company_id', user.company_id)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false })
    );

    if (error) {
      toast.error(`Could not load invoices: ${error.message}`);
      setInvoices([]);
    } else {
      setInvoices((data || []).map(mapInvoiceFromDatabase));
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadInvoices();
  }, [user?.company_id]);

  const filteredInvoices = invoices.filter(invoice => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const matchesSearch = !normalizedSearch ||
      invoice.id.toLowerCase().includes(normalizedSearch) ||
      invoice.customer.toLowerCase().includes(normalizedSearch) ||
      invoice.status.toLowerCase().includes(normalizedSearch) ||
      invoice.customerDetails?.gstin?.toLowerCase().includes(normalizedSearch) ||
      invoice.customerDetails?.phone?.toLowerCase().includes(normalizedSearch) ||
      invoice.customerDetails?.email?.toLowerCase().includes(normalizedSearch);
    const matchesStatus =
      statusFilter === 'all' ? true :
      statusFilter === 'manual' ? Boolean(invoice.isManualNumber) :
      invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const visibleSelectedInvoices = filteredInvoices.filter((invoice) => selectedInvoices.includes(invoice.id));

  const stats = {
    all: invoices.length,
    draft: invoices.filter(i => i.status === 'draft').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    pending: invoices.filter(i => i.status === 'pending').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
  };

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on scroll or resize so it doesn't drift away from its trigger
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [openMenuId]);

  const handleView = (invoice: any) => {
    logAuditorAction(user, 'invoices', 'invoices', 'view_invoice', { invoiceNumber: invoice.id });
    setSelectedInvoice(invoice);
    setShowPreview(true);
  };

  const handleEdit = (invoiceId: string) => {
    navigate(`/app/invoices/new?id=${invoiceId}`);
  };

  // "Send" opens the invoice document with its share sheet ready, so WhatsApp
  // shares the actual PDF (and Mail goes out) through the shared InvoicePreview
  // flow — the same one used after creating an invoice.
  const handleSend = (invoice: any) => {
    setSelectedInvoice(invoice);
    setPreviewAutoSend(true);
    setShowPreview(true);
    setOpenMenuId(null);
  };

  const handleDownload = (invoice: any) => {
    alert(`Downloading ${invoice.id} as PDF...`);
    setOpenMenuId(null);
  };

  const handleDuplicate = (invoice: any) => {
    alert(`Creating duplicate of ${invoice.id}...`);
    setOpenMenuId(null);
  };

  const handleDelete = (invoiceId: string) => {
    setInvoiceToDelete(invoiceId);
    setShowDeleteConfirm(true);
    setOpenMenuId(null);
  };

  const confirmDelete = async () => {
    const invoice = invoices.find((item) => item.id === invoiceToDelete);
    if (!invoice) return;

    setIsDeleting(true);
    const { error } = await deleteForUser(user, 'invoices', 'invoices', () =>
      supabase
        .from('invoices')
        .delete()
        .eq('id', invoice.dbId),
      { id: invoice.dbId },
      invoice.id
    );

    if (error) {
      toast.error(`Could not delete invoice: ${error.message}`);
      setIsDeleting(false);
      return;
    }

    setInvoices((currentInvoices) => currentInvoices.filter((item) => item.id !== invoiceToDelete));
    setSelectedInvoices((currentSelected) => currentSelected.filter((id) => id !== invoiceToDelete));
    toast.success('Invoice deleted');
    setShowDeleteConfirm(false);
    setInvoiceToDelete(null);
    setIsDeleting(false);
  };

  const confirmBulkDelete = async () => {
    if (selectedInvoices.length === 0) return;

    const invoicesToDelete = invoices.filter((invoice) => selectedInvoices.includes(invoice.id));
    if (invoicesToDelete.length === 0) return;

    setIsDeleting(true);

    try {
      if (user?.role === 'auditor') {
        for (const invoice of invoicesToDelete) {
          const { error } = await deleteForUser(user, 'invoices', 'invoices', () =>
            supabase
              .from('invoices')
              .delete()
              .eq('id', invoice.dbId),
            { id: invoice.dbId },
            invoice.id
          );

          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from('invoices')
          .delete()
          .in('id', invoicesToDelete.map((invoice) => invoice.dbId));

        if (error) throw error;
      }

      const deletedInvoiceIds = new Set(invoicesToDelete.map((invoice) => invoice.id));
      setInvoices((currentInvoices) => currentInvoices.filter((invoice) => !deletedInvoiceIds.has(invoice.id)));
      setSelectedInvoices([]);
      setShowBulkDeleteConfirm(false);
      toast.success(`${invoicesToDelete.length} invoice${invoicesToDelete.length > 1 ? 's' : ''} deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? `Could not delete invoices: ${error.message}` : 'Could not delete invoices');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateInvoice = async (invoice: InvoiceRow) => {
    const values = { status: 'pending' };
    const { error } = await updateForUser(user, 'invoices', 'invoices', () =>
      supabase
        .from('invoices')
        .update(values)
        .eq('id', invoice.dbId),
      values,
      { id: invoice.dbId },
      invoice.id
    );

    if (error) {
      toast.error(`Could not create invoice: ${error.message}`);
      return;
    }

    setInvoices((currentInvoices) => currentInvoices.map((item) => (
      item.id === invoice.id ? { ...item, status: 'pending' } : item
    )));
    toast.success(`${invoice.id} created`);
    setOpenMenuId(null);
  };

  const handleExport = async () => {
    if (selectedInvoices.length === 0) {
      toast.error('Select the invoice records you want to export');
      return;
    }

    const invoicesToExport = invoices.filter((invoice) => selectedInvoices.includes(invoice.id));

    const exportStats = {
      all: invoicesToExport.length,
      draft: invoicesToExport.filter(i => i.status === 'draft').length,
      paid: invoicesToExport.filter(i => i.status === 'paid').length,
      pending: invoicesToExport.filter(i => i.status === 'pending').length,
      overdue: invoicesToExport.filter(i => i.status === 'overdue').length,
    };

    logAuditorAction(user, 'invoices', 'invoices', 'export_invoices', { count: invoicesToExport.length });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Invoice Summary');

    // Add title
    worksheet.mergeCells('A1:AH1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = isComposition ? 'Bills of Supply Report' : 'Tax Invoices Report';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF1F4E78' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    // Add summary stats
    const totalAmount = invoicesToExport.reduce((sum, inv) => sum + inv.amount, 0);
    const paidAmount = invoicesToExport.filter(i => i.status === 'paid').reduce((sum, inv) => sum + inv.amount, 0);
    const pendingAmount = invoicesToExport.filter(i => i.status !== 'paid').reduce((sum, inv) => sum + inv.amount, 0);

    worksheet.mergeCells('A2:B2');
    worksheet.getCell('A2').value = 'Total Invoices:';
    worksheet.getCell('A2').font = { bold: true };
    worksheet.getCell('C2').value = exportStats.all;

    worksheet.getCell('D2').value = 'Total Amount:';
    worksheet.getCell('D2').font = { bold: true };
    worksheet.getCell('E2').value = `₹${totalAmount.toLocaleString('en-IN')}`;
    worksheet.getCell('E2').font = { bold: true, color: { argb: 'FF1F4E78' } };

    // Add headers with light green background
    const headers = [
      'Invoice ID',
      'Status',
      'Invoice Date',
      'Due Date',
      'Customer Name',
      'Customer Type',
      'Customer GSTIN',
      'Customer Contact',
      'Customer Email',
      'Customer Phone',
      'Customer City',
      'Customer State',
      'Customer Address',
      'Bill Type',
      'Place of Supply',
      'Reverse Charge',
      'PO Number',
      'PO Date',
      'Vehicle No.',
      'Transport Mode',
      'Remarks',
      'Item Type',
      'Item Name',
      'Item Description',
      'HSN/SAC',
      'Quantity',
      'Unit',
      'Rate',
      'Discount %',
      'Taxable Amount',
      'GST %',
      'GST Amount',
      'Line Total',
      'Invoice Total',
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF90EE90' } // Light green
      };
      cell.font = { bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add data rows
    invoicesToExport.forEach((invoice) => {
      const row = worksheet.addRow([
        invoice.id,
        invoice.customer,
        invoice.date,
        invoice.dueDate,
        invoice.amount,
        invoice.status.toUpperCase()
      ]);

      // Format amount cell
      row.getCell(5).numFmt = '₹#,##0';
      row.getCell(5).font = { bold: true };

      // Color code status
      const statusCell = row.getCell(6);
      if (invoice.status === 'paid') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
        statusCell.font = { color: { argb: 'FF006100' }, bold: true };
      } else if (invoice.status === 'pending') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
        statusCell.font = { color: { argb: 'FF9C5700' }, bold: true };
      } else if (invoice.status === 'overdue') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
        statusCell.font = { color: { argb: 'FF9C0006' }, bold: true };
      }
    });

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength + 2, 30);
    });

    const detailSheet = workbook.addWorksheet('Invoice Details');
    detailSheet.columns = [
      { header: 'Invoice ID', key: 'invoiceId', width: 18 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Invoice Date', key: 'invoiceDate', width: 16 },
      { header: 'Due Date', key: 'dueDate', width: 16 },
      { header: 'Customer Name', key: 'customerName', width: 28 },
      { header: 'Customer Type', key: 'customerType', width: 16 },
      { header: 'Customer GSTIN', key: 'customerGstin', width: 20 },
      { header: 'Contact Name', key: 'contactName', width: 22 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'City', key: 'city', width: 16 },
      { header: 'State', key: 'state', width: 18 },
      { header: 'Address', key: 'address', width: 36 },
      { header: 'Bill Type', key: 'billType', width: 18 },
      { header: 'Place of Supply', key: 'placeOfSupply', width: 20 },
      { header: 'Reverse Charge', key: 'reverseCharge', width: 16 },
      { header: 'PO Number', key: 'poNumber', width: 16 },
      { header: 'PO Date', key: 'poDate', width: 16 },
      { header: 'Vehicle No.', key: 'vehicleNo', width: 16 },
      { header: 'Transport Mode', key: 'transportMode', width: 18 },
      { header: 'Remarks', key: 'remarks', width: 34 },
      { header: 'Item Type', key: 'itemType', width: 14 },
      { header: 'Item Name', key: 'itemName', width: 28 },
      { header: 'Item Description', key: 'itemDescription', width: 36 },
      { header: 'HSN/SAC', key: 'hsn', width: 14 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Rate', key: 'rate', width: 14 },
      { header: 'Discount %', key: 'discount', width: 12 },
      { header: 'Taxable Amount', key: 'taxableAmount', width: 18 },
      { header: 'GST %', key: 'gst', width: 10 },
      { header: 'GST Amount', key: 'gstAmount', width: 16 },
      { header: 'Line Total', key: 'lineTotal', width: 16 },
      { header: 'Invoice Total', key: 'invoiceTotal', width: 18 },
    ];

    detailSheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };
      cell.font = { bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    const getLineCalculations = (item: any) => {
      const grossAmount = Number(item.qty || 0) * Number(item.rate || 0);
      const discountAmount = grossAmount * (Number(item.discount || 0) / 100);
      const taxableAmount = grossAmount - discountAmount;
      const gstAmount = taxableAmount * (Number(item.gst || 0) / 100);
      const lineTotal = Number(item.amount || taxableAmount + gstAmount);

      return { taxableAmount, gstAmount, lineTotal };
    };

    invoicesToExport.forEach((invoice) => {
      const items = invoice.lineItems.length > 0
        ? invoice.lineItems
        : [{ type: '', item: '', description: '', hsn: '', qty: '', unit: '', rate: '', discount: '', gst: '', amount: '' }];

      items.forEach((item: any) => {
        const { taxableAmount, gstAmount, lineTotal } = getLineCalculations(item);
        const row = detailSheet.addRow({
          invoiceId: invoice.id,
          status: invoice.status.toUpperCase(),
          invoiceDate: invoice.date,
          dueDate: invoice.dueDate,
          customerName: invoice.customer,
          customerType: invoice.customerType || '',
          customerGstin: invoice.customerDetails?.gstin || '',
          contactName: invoice.customerDetails?.contactName || '',
          email: invoice.customerDetails?.email || '',
          phone: invoice.customerDetails?.phone || '',
          city: invoice.customerDetails?.city || '',
          state: invoice.customerDetails?.state || '',
          address: invoice.customerDetails?.address || '',
          billType: invoice.billType || '',
          placeOfSupply: invoice.placeOfSupply || '',
          reverseCharge: invoice.reverseCharge ? 'Yes' : 'No',
          poNumber: invoice.poNumber || '',
          poDate: invoice.poDate ? formatDate(invoice.poDate) : '',
          vehicleNo: invoice.vehicleNo || '',
          transportMode: invoice.transportMode || '',
          remarks: invoice.remarks || '',
          itemType: item.type || '',
          itemName: item.item || '',
          itemDescription: item.description || '',
          hsn: item.hsn || '',
          quantity: item.qty || '',
          unit: item.unit || '',
          rate: item.rate || '',
          discount: item.discount || '',
          taxableAmount,
          gst: item.gst || '',
          gstAmount,
          lineTotal,
          invoiceTotal: invoice.amount,
        });

        [28, 30, 32, 33, 34].forEach((cellNumber) => {
          row.getCell(cellNumber).numFmt = '₹#,##0.00';
        });
        row.getCell(34).font = { bold: true };
      });
    });

    detailSheet.autoFilter = {
      from: 'A1',
      to: 'AH1',
    };

    // Add a chart sheet with chart-ready data
    const chartSheet = workbook.addWorksheet('Charts');

    // Instructions
    chartSheet.mergeCells('A1:E1');
    const instructionCell = chartSheet.getCell('A1');
    instructionCell.value = '📊 Chart-Ready Data: Select data ranges below and use Insert > Charts in Excel to create dynamic charts';
    instructionCell.font = { size: 12, bold: true, color: { argb: 'FF1F4E78' } };
    instructionCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    instructionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F3FF' } };
    chartSheet.getRow(1).height = 40;

    // Status breakdown
    chartSheet.getCell('A3').value = 'INVOICE STATUS BREAKDOWN';
    chartSheet.getCell('A3').font = { size: 14, bold: true, color: { argb: 'FF1F4E78' } };

    chartSheet.getCell('A5').value = 'Status';
    chartSheet.getCell('B5').value = 'Count';
    chartSheet.getCell('C5').value = 'Amount';
    chartSheet.getCell('D5').value = 'Count %';
    chartSheet.getCell('E5').value = 'Amount Visual';
    chartSheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    chartSheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };

    const statusData = [
      ['Paid', exportStats.paid, paidAmount],
      ['Pending', exportStats.pending, invoicesToExport.filter(i => i.status === 'pending').reduce((sum, inv) => sum + inv.amount, 0)],
      ['Overdue', exportStats.overdue, invoicesToExport.filter(i => i.status === 'overdue').reduce((sum, inv) => sum + inv.amount, 0)],
      ['Draft', exportStats.draft, invoicesToExport.filter(i => i.status === 'draft').reduce((sum, inv) => sum + inv.amount, 0)]
    ];

    const maxAmount = Math.max(...statusData.map(d => d[2] as number));
    const totalCount = Math.max(1, statusData.reduce((sum, d) => sum + (d[1] as number), 0));

    statusData.forEach((row, index) => {
      const dataRow = chartSheet.addRow(row);
      dataRow.getCell(3).numFmt = '₹#,##0';

      // Add percentage
      const countPercent = ((row[1] as number) / totalCount) * 100;
      dataRow.getCell(4).value = countPercent;
      dataRow.getCell(4).numFmt = '0.0"%"';

      // Add visual bar for amount
      const amountPercent = maxAmount > 0 ? ((row[2] as number) / maxAmount) * 100 : 0;
      const visualCell = dataRow.getCell(5);
      visualCell.value = amountPercent;
      visualCell.numFmt = '0"%"';
      visualCell.alignment = { horizontal: 'right' };

      // Color code by status
      if (row[0] === 'Paid') {
        visualCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
      } else if (row[0] === 'Pending') {
        visualCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
      } else if (row[0] === 'Overdue') {
        visualCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      } else {
        visualCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
      }
    });

    chartSheet.getCell('A10').value = '💡 For Count Chart: Select A5:B9 and insert a Doughnut Chart';
    chartSheet.getCell('A10').font = { italic: true, color: { argb: 'FF0066CC' } };
    chartSheet.mergeCells('A10:E10');

    chartSheet.getCell('A11').value = '💡 For Amount Chart: Select A5:A9 and C5:C9 (hold Ctrl), then insert a Bar Chart';
    chartSheet.getCell('A11').font = { italic: true, color: { argb: 'FF0066CC' } };
    chartSheet.mergeCells('A11:E11');

    chartSheet.columns = [
      { width: 20 },
      { width: 12 },
      { width: 20 },
      { width: 12 },
      { width: 15 }
    ];

    // Generate and download the file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `invoices_${new Date().toISOString().split('T')[0]}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${invoicesToExport.length} invoices`, {
      description: 'Open the Charts sheet in Excel and insert charts from the formatted data'
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInvoices((currentSelected) => Array.from(new Set([
        ...currentSelected,
        ...filteredInvoices.map((invoice) => invoice.id),
      ])));
    } else {
      const filteredInvoiceIds = new Set(filteredInvoices.map((invoice) => invoice.id));
      setSelectedInvoices((currentSelected) => currentSelected.filter((id) => !filteredInvoiceIds.has(id)));
    }
  };

  const handleSelectInvoice = (invoiceId: string, checked: boolean) => {
    if (checked) {
      setSelectedInvoices((currentSelected) => Array.from(new Set([...currentSelected, invoiceId])));
    } else {
      setSelectedInvoices((currentSelected) => currentSelected.filter(id => id !== invoiceId));
    }
  };

  const isAllSelected = filteredInvoices.length > 0 && visibleSelectedInvoices.length === filteredInvoices.length;
  const isSomeSelected = visibleSelectedInvoices.length > 0 && visibleSelectedInvoices.length < filteredInvoices.length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{isComposition ? 'Bills of Supply' : 'Invoices'}</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and track all your {isComposition ? 'bills of supply' : 'invoices'}</p>
        </div>
        <Link
          to="/app/invoices/new"
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all"
        >
          <Plus className="w-4 h-4" />
          {isComposition ? 'Create Bill of Supply' : 'Create Invoice'}
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label={isComposition ? 'All Bills' : 'All Invoices'}
          value={stats.all}
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        <StatCard
          label="Paid"
          value={stats.paid}
          color="success"
          active={statusFilter === 'paid'}
          onClick={() => setStatusFilter('paid')}
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          color="warning"
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter('pending')}
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          color="destructive"
          active={statusFilter === 'overdue'}
          onClick={() => setStatusFilter('overdue')}
        />
      </div>

      {/* Table Card */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-violet-100 dark:border-violet-400/10 flex flex-col xl:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search invoice, customer, GSTIN, phone, email, status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-border bg-white rounded">
              <Filter className="w-4 h-4" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="bg-transparent text-sm focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="manual">Manual Invoice Number</option>
              </select>
            </label>
            {(statusFilter !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
              >
                <span className="text-sm">Clear Filters</span>
              </button>
            )}
            {selectedInvoices.length > 0 && (
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-destructive/30 text-destructive bg-white rounded hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm">Delete Selected ({selectedInvoices.length})</span>
              </button>
            )}
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Export</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-violet-100 dark:bg-violet-500/15">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = isSomeSelected;
                      }
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded accent-violet-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Loading invoices...
                  </td>
                </tr>
              )}
              {!isLoading && filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No invoices found.
                  </td>
                </tr>
              )}
              {!isLoading && filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="bg-violet-50/60 dark:bg-violet-500/[0.04] hover:bg-violet-100/70 dark:hover:bg-violet-500/[0.10] transition-colors">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedInvoices.includes(invoice.id)}
                      onChange={(e) => handleSelectInvoice(invoice.id, e.target.checked)}
                      className="w-4 h-4 rounded accent-violet-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-foreground">{invoice.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-foreground">{invoice.customer}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-muted-foreground">{invoice.date}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-muted-foreground">{invoice.dueDate}</div>
                  </td>
                  <td className="px-6 py-4 text-left">
                    <div className="text-sm font-medium text-foreground tabular-nums">
                      ₹{invoice.amount.toLocaleString()}
                    </div>
                    {invoice.paidAmount > 0 && invoice.paidAmount < invoice.amount - 0.01 && invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
                      <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                        Bal ₹{Math.max(0, invoice.amount - invoice.paidAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={displayStatus(invoice.status, invoice.amount, invoice.paidAmount)} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-start gap-2">
                      <button
                        onClick={() => handleView(invoice)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleEdit(invoice.dbId)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleSend(invoice)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Send"
                      >
                        <Send className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => {
                          if (openMenuId === invoice.id) {
                            setOpenMenuId(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuPosition({
                            top: rect.bottom + 4,
                            right: window.innerWidth - rect.right,
                          });
                          setOpenMenuId(invoice.id);
                        }}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="More"
                      >
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-violet-100 dark:border-violet-400/15 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedInvoices.length > 0 ? (
              <span>{selectedInvoices.length} invoice{selectedInvoices.length > 1 ? 's' : ''} selected</span>
            ) : (
              <span>Showing {filteredInvoices.length} of {invoices.length} invoices</span>
            )}
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded text-sm hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
              Previous
            </button>
            <button className="px-3 py-1.5 bg-violet-500 text-white rounded text-sm font-semibold shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)]">1</button>
            <button className="px-3 py-1.5 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded text-sm hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">2</button>
            <button className="px-3 py-1.5 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded text-sm hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">3</button>
            <button className="px-3 py-1.5 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded text-sm hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Action menu — portaled out of the table so it can escape the table's
          overflow-x-auto wrapper. */}
      {openMenuId && menuPosition && (() => {
        const invoice = invoices.find((inv) => inv.id === openMenuId);
        if (!invoice) return null;
        return createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuPosition.top,
              right: menuPosition.right,
              zIndex: 60,
            }}
            className="w-48 bg-card border border-violet-200 dark:border-violet-400/25 rounded-lg shadow-lg py-1"
          >
            <button
              onClick={() => handleDownload(invoice)}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-left"
            >
              <Download className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Download PDF</span>
            </button>
            <button
              onClick={() => handleDuplicate(invoice)}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-left"
            >
              <Copy className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Duplicate</span>
            </button>
            {invoice.status === 'draft' ? (
              <button
                onClick={() => handleCreateInvoice(invoice)}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-left"
              >
                <FileCheck className="w-4 h-4 text-accent" />
                <span className="text-sm text-foreground">{isComposition ? 'Create Bill of Supply' : 'Create Invoice'}</span>
              </button>
            ) : invoice.status !== 'paid' && (
              <button
                onClick={() => {
                  setPaymentInvoice({
                    dbId: invoice.dbId,
                    id: invoice.id,
                    amount: invoice.amount,
                    paidAmount: invoice.paidAmount,
                    customerId: invoice.customerId,
                  });
                  setOpenMenuId(null);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-success/10 transition-colors text-left"
              >
                <IndianRupee className="w-4 h-4 text-success" />
                <span className="text-sm text-foreground">Record Payment</span>
              </button>
            )}
            <div className="border-t border-violet-100 dark:border-violet-400/15 my-1"></div>
            <button
              onClick={() => handleDelete(invoice.id)}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-destructive/10 transition-colors text-left"
            >
              <Trash2 className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">Delete</span>
            </button>
          </div>,
          document.body,
        );
      })()}

      {/* Invoice Preview Modal */}
      {selectedInvoice && (
        <InvoicePreview
          isOpen={showPreview}
          autoOpenSend={previewAutoSend}
          onClose={() => {
            setShowPreview(false);
            setPreviewAutoSend(false);
            setSelectedInvoice(null);
          }}
          title="Invoice Details"
          lineItems={selectedInvoice.lineItems}
          invoiceNumber={selectedInvoice.id}
          invoiceDate={selectedInvoice.rawDate}
          dueDate={selectedInvoice.rawDueDate}
          customer={selectedInvoice.customerDetails}
          customerType={selectedInvoice.customerType}
          billType={selectedInvoice.billType}
          placeOfSupply={selectedInvoice.placeOfSupply}
          reverseCharge={selectedInvoice.reverseCharge}
          poNumber={selectedInvoice.poNumber}
          poDate={selectedInvoice.poDate}
          vehicleNo={selectedInvoice.vehicleNo}
          transportMode={selectedInvoice.transportMode}
          remarks={selectedInvoice.remarks}
          terms={selectedInvoice.terms}
        />
      )}

      {/* Record Payment Dialog */}
      {paymentInvoice && (
        <RecordPaymentDialog
          isOpen={!!paymentInvoice}
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onRecorded={({ paidAmount, status }) => {
            // Reflect the new balance/status on the row, and keep the open
            // dialog's invoice in sync so a follow-up payment sees it too.
            setInvoices((current) =>
              current.map((item) =>
                item.dbId === paymentInvoice.dbId ? { ...item, paidAmount, status } : item,
              ),
            );
            setPaymentInvoice((current) => (current ? { ...current, paidAmount } : current));
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                <XCircle className="w-6 h-6 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Delete Invoice</h3>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete {invoiceToDelete}? This action cannot be undone.
              </p>
            </div>
            <div className="p-6 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setInvoiceToDelete(null);
                }}
                className="px-4 py-2 border border-border rounded hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                <XCircle className="w-6 h-6 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Delete Selected Invoices</h3>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete {selectedInvoices.length} selected invoice{selectedInvoices.length > 1 ? 's' : ''}? This action cannot be undone.
              </p>
            </div>
            <div className="p-6 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 border border-border rounded hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Selected'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  active,
  onClick
}: {
  label: string;
  value: number;
  color?: 'success' | 'warning' | 'destructive';
  active?: boolean;
  onClick?: () => void;
}) {
  const colorClasses = {
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
  };

  return (
    <button
      onClick={onClick}
      className={`bg-card border rounded-xl p-5 text-left transition-all shadow-[0_1px_2px_rgba(139,92,246,0.08)] hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.25)] ${
        active
          ? 'border-violet-500 dark:border-violet-400 ring-2 ring-violet-300/40 dark:ring-violet-400/25'
          : 'border-violet-300 dark:border-violet-400/30 hover:border-violet-400 dark:hover:border-violet-400/50'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{label}</div>
      <div className={`text-[28px] sm:text-[32px] font-semibold tracking-tight tabular-nums ${color ? colorClasses[color] : 'text-foreground'}`}>
        {value}
      </div>
    </button>
  );
}

// Derive the badge shown to the user: an invoice that is 'pending'/'sent'/
// 'overdue' but already has money against it reads as "Partially Paid". This is
// display-only — the stored status stays 'pending' (there is no partial status
// in the schema), so nothing downstream needs to learn a new value.
function displayStatus(status: string, amount: number, paidAmount: number): string {
  if (status === 'paid' || status === 'draft' || status === 'cancelled') return status;
  if (paidAmount > 0 && paidAmount < amount - 0.01) return 'partial';
  return status;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground border-border',
    sent: 'bg-accent/10 text-accent border-accent/30',
    paid: 'bg-success/10 text-success border-success/30',
    partial: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/30',
    pending: 'bg-warning/10 text-warning border-warning/30',
    overdue: 'bg-destructive/10 text-destructive border-destructive/30',
    cancelled: 'bg-muted text-muted-foreground border-border',
  };
  const badgeStyle = styles[status] || styles.draft;
  const label = status === 'partial' ? 'Partially Paid' : status;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${badgeStyle}`}>
      {label}
    </span>
  );
}
