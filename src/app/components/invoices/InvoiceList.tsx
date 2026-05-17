import { Link, useNavigate } from 'react-router';
import { Plus, Search, Filter, Download, Send, Eye, Edit, MoreVertical, Trash2, Copy, CheckCircle, XCircle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { InvoicePreview } from './InvoicePreview';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { deleteForUser, logAuditorAction, selectForUser, updateForUser } from '../../../lib/auditorData';

interface InvoiceRow {
  dbId: string;
  id: string;
  customer: string;
  customerDetails: any;
  date: string;
  rawDate: string;
  dueDate: string;
  amount: number;
  status: string;
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
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
        address: customer.address || '',
      } : null,
      date: formatDate(invoice.invoice_date),
      rawDate: invoice.invoice_date || '',
      dueDate: formatDate(invoice.due_date),
      amount: Number(invoice.total_amount || 0),
      status: invoice.status || 'draft',
      customerType: invoice.customer_type || '',
      billType: invoice.bill_type || '',
      placeOfSupply: invoice.place_of_supply || '',
      reverseCharge: Boolean(invoice.reverse_charge),
      poNumber: invoice.po_number || '',
      poDate: invoice.po_date || '',
      vehicleNo: invoice.vehicle_number || '',
      transportMode: invoice.transport_mode || '',
      remarks: invoice.remarks || '',
      lineItems: (invoice.invoice_items || []).map((item: any) => ({
        id: item.id,
        item: item.item_name || '',
        description: item.description || '',
        hsn: item.hsn || '',
        qty: Number(item.quantity || 0),
        unit: item.unit || 'Nos',
        rate: Number(item.rate || 0),
        discount: Number(item.discount_percent || 0),
        gst: Number(item.gst_rate || 0),
        amount: Number(item.total_amount || 0),
      })),
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
        status,
        customer_type,
        bill_type,
        place_of_supply,
        reverse_charge,
        po_number,
        po_date,
        vehicle_number,
        transport_mode,
        remarks,
        customers(id, name, gstin, contact_name, email, phone, city, address),
        invoice_items(id, item_name, description, hsn, quantity, unit, rate, discount_percent, gst_rate, total_amount, sort_order)
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
    const matchesSearch = invoice.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         invoice.customer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    all: invoices.length,
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

  const handleView = (invoice: any) => {
    logAuditorAction(user, 'invoices', 'invoices', 'view_invoice', { invoiceNumber: invoice.id });
    setSelectedInvoice(invoice);
    setShowPreview(true);
  };

  const handleEdit = (invoiceId: string) => {
    navigate('/app/invoices/new');
  };

  const handleSend = (invoice: any) => {
    setSelectedInvoice(invoice);
    setShowSendModal(true);
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
      return;
    }

    setInvoices((currentInvoices) => currentInvoices.filter((item) => item.id !== invoiceToDelete));
    toast.success('Invoice deleted');
    setShowDeleteConfirm(false);
    setInvoiceToDelete(null);
  };

  const handleMarkPaid = async (invoice: InvoiceRow) => {
    const values = { status: 'paid', paid_amount: invoice.amount };
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
      toast.error(`Could not mark invoice as paid: ${error.message}`);
      return;
    }

    setInvoices((currentInvoices) => currentInvoices.map((item) => (
      item.id === invoice.id ? { ...item, status: 'paid' } : item
    )));
    toast.success(`${invoice.id} marked as paid`);
    setOpenMenuId(null);
  };

  const handleExport = async () => {
    logAuditorAction(user, 'invoices', 'invoices', 'export_invoices', { count: filteredInvoices.length });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Invoices');

    // Add title
    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Tax Invoices Report';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF1F4E78' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    // Add summary stats
    const totalAmount = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const paidAmount = filteredInvoices.filter(i => i.status === 'paid').reduce((sum, inv) => sum + inv.amount, 0);
    const pendingAmount = filteredInvoices.filter(i => i.status !== 'paid').reduce((sum, inv) => sum + inv.amount, 0);

    worksheet.mergeCells('A2:B2');
    worksheet.getCell('A2').value = 'Total Invoices:';
    worksheet.getCell('A2').font = { bold: true };
    worksheet.getCell('C2').value = stats.all;

    worksheet.getCell('D2').value = 'Total Amount:';
    worksheet.getCell('D2').font = { bold: true };
    worksheet.getCell('E2').value = `₹${totalAmount.toLocaleString('en-IN')}`;
    worksheet.getCell('E2').font = { bold: true, color: { argb: 'FF1F4E78' } };

    // Add headers with light green background
    const headers = ['Invoice ID', 'Customer', 'Date', 'Due Date', 'Amount', 'Status'];
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
    filteredInvoices.forEach((invoice) => {
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
      ['Paid', stats.paid, paidAmount],
      ['Pending', stats.pending, filteredInvoices.filter(i => i.status === 'pending').reduce((sum, inv) => sum + inv.amount, 0)],
      ['Overdue', stats.overdue, filteredInvoices.filter(i => i.status === 'overdue').reduce((sum, inv) => sum + inv.amount, 0)]
    ];

    const maxAmount = Math.max(...statusData.map(d => d[2] as number));
    const totalCount = statusData.reduce((sum, d) => sum + (d[1] as number), 0);

    statusData.forEach((row, index) => {
      const dataRow = chartSheet.addRow(row);
      dataRow.getCell(3).numFmt = '₹#,##0';

      // Add percentage
      const countPercent = ((row[1] as number) / totalCount) * 100;
      dataRow.getCell(4).value = countPercent;
      dataRow.getCell(4).numFmt = '0.0"%"';

      // Add visual bar for amount
      const amountPercent = ((row[2] as number) / maxAmount) * 100;
      const visualCell = dataRow.getCell(5);
      visualCell.value = amountPercent;
      visualCell.numFmt = '0"%"';
      visualCell.alignment = { horizontal: 'right' };

      // Color code by status
      if (row[0] === 'Paid') {
        visualCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
      } else if (row[0] === 'Pending') {
        visualCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
      } else {
        visualCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      }
    });

    chartSheet.getCell('A9').value = '💡 For Count Chart: Select A5:B8 and insert a Doughnut Chart';
    chartSheet.getCell('A9').font = { italic: true, color: { argb: 'FF0066CC' } };
    chartSheet.mergeCells('A9:E9');

    chartSheet.getCell('A10').value = '💡 For Amount Chart: Select A5:A8 and C5:C8 (hold Ctrl), then insert a Bar Chart';
    chartSheet.getCell('A10').font = { italic: true, color: { argb: 'FF0066CC' } };
    chartSheet.mergeCells('A10:E10');

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

    toast.success(`Exported ${filteredInvoices.length} invoices`, {
      description: 'Open the Charts sheet in Excel and insert charts from the formatted data'
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInvoices(filteredInvoices.map(inv => inv.id));
    } else {
      setSelectedInvoices([]);
    }
  };

  const handleSelectInvoice = (invoiceId: string, checked: boolean) => {
    if (checked) {
      setSelectedInvoices([...selectedInvoices, invoiceId]);
    } else {
      setSelectedInvoices(selectedInvoices.filter(id => id !== invoiceId));
    }
  };

  const isAllSelected = filteredInvoices.length > 0 && selectedInvoices.length === filteredInvoices.length;
  const isSomeSelected = selectedInvoices.length > 0 && selectedInvoices.length < filteredInvoices.length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and track all your invoices</p>
        </div>
        <Link
          to="/app/invoices/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="All Invoices"
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
      <div className="bg-white border border-border rounded-lg">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by invoice number or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
              <Filter className="w-4 h-4" />
              <span className="text-sm">Filter</span>
            </button>
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
            <thead className="bg-muted/50 border-b border-border">
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
                    className="w-4 h-4 rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Due Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
                <tr key={invoice.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedInvoices.includes(invoice.id)}
                      onChange={(e) => handleSelectInvoice(invoice.id, e.target.checked)}
                      className="w-4 h-4 rounded"
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
                  <td className="px-6 py-4 text-right">
                    <div className="text-sm font-medium text-foreground">
                      ₹{invoice.amount.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleView(invoice)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleEdit(invoice.id)}
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
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === invoice.id ? null : invoice.id)}
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="More"
                        >
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>

                        {/* Dropdown Menu */}
                        {openMenuId === invoice.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 top-full mt-1 w-48 bg-white border border-border rounded-lg shadow-lg z-50"
                          >
                            <div className="py-1">
                              <button
                                onClick={() => handleDownload(invoice)}
                                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted transition-colors text-left"
                              >
                                <Download className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-foreground">Download PDF</span>
                              </button>
                              <button
                                onClick={() => handleDuplicate(invoice)}
                                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted transition-colors text-left"
                              >
                                <Copy className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-foreground">Duplicate</span>
                              </button>
                              {invoice.status !== 'paid' && (
                                <button
                                  onClick={() => handleMarkPaid(invoice)}
                                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted transition-colors text-left"
                                >
                                  <CheckCircle className="w-4 h-4 text-success" />
                                  <span className="text-sm text-foreground">Mark as Paid</span>
                                </button>
                              )}
                              <div className="border-t border-border my-1"></div>
                              <button
                                onClick={() => handleDelete(invoice.id)}
                                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-destructive/10 transition-colors text-left"
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                                <span className="text-sm text-destructive">Delete</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedInvoices.length > 0 ? (
              <span>{selectedInvoices.length} invoice{selectedInvoices.length > 1 ? 's' : ''} selected</span>
            ) : (
              <span>Showing {filteredInvoices.length} of {invoices.length} invoices</span>
            )}
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors">
              Previous
            </button>
            <button className="px-3 py-1.5 bg-primary text-white rounded text-sm">1</button>
            <button className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors">2</button>
            <button className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors">3</button>
            <button className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {selectedInvoice && (
        <InvoicePreview
          isOpen={showPreview}
          onClose={() => {
            setShowPreview(false);
            setSelectedInvoice(null);
          }}
          lineItems={selectedInvoice.lineItems}
          invoiceNumber={selectedInvoice.id}
          invoiceDate={selectedInvoice.rawDate}
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
        />
      )}

      {/* Send Invoice Modal */}
      {showSendModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Send Invoice</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Send {selectedInvoice.id} to {selectedInvoice.customer}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  defaultValue="customer@example.com"
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Message (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Add a personal message..."
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="attach-pdf" defaultChecked className="w-4 h-4" />
                <label htmlFor="attach-pdf" className="text-sm text-foreground">
                  Attach PDF copy
                </label>
              </div>
            </div>
            <div className="p-6 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowSendModal(false);
                  setSelectedInvoice(null);
                }}
                className="px-4 py-2 border border-border rounded hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert(`Invoice sent to customer!`);
                  setShowSendModal(false);
                  setSelectedInvoice(null);
                }}
                className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
              >
                Send Invoice
              </button>
            </div>
          </div>
        </div>
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
                className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors"
              >
                Delete Invoice
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
      className={`bg-white border-2 rounded-lg p-4 text-left transition-all hover:shadow-md ${
        active ? 'border-accent' : 'border-border'
      }`}
    >
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-4xl font-bold ${color ? colorClasses[color] : 'text-foreground'}`}>
        {value}
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    paid: 'bg-success/10 text-success',
    pending: 'bg-warning/10 text-warning',
    overdue: 'bg-destructive/10 text-destructive',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${styles[status as keyof typeof styles]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
