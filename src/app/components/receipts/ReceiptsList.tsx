import { Link } from 'react-router';
import { Plus, Search, Filter, Download, Eye, Edit, MoreVertical, Receipt as ReceiptIcon, Send, Trash2, CheckCircle, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';
import { ReceiptPreview } from './ReceiptPreview';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { deleteForUser, logAuditorAction, selectForUser, updateForUser } from '../../../lib/auditorData';

interface ReceiptCustomer {
  id: string;
  companyName: string;
  gstin: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
}

interface ReceiptAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

interface ReceiptRow {
  dbId: string;
  id: string;
  customer: string;
  customerId: string | null;
  customerDetails: ReceiptCustomer | null;
  invoice: string;
  invoiceId: string | null;
  date: string;
  rawDate: string;
  amount: number;
  paymentMode: string;
  refNumber: string;
  notes: string;
  status: 'cleared' | 'pending';
  allocations: ReceiptAllocation[];
}

const formatReceiptDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function ReceiptsList() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'cleared' | 'pending'>('all');
  const [viewingReceipt, setViewingReceipt] = useState<ReceiptRow | null>(null);
  const [sendingReceipt, setSendingReceipt] = useState<ReceiptRow | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<ReceiptRow | null>(null);
  const [markingReceipt, setMarkingReceipt] = useState<ReceiptRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [selectedReceipts, setSelectedReceipts] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);

  // Close the menu when the user scrolls the page or resizes the window
  // — the fixed-position menu would otherwise drift away from its trigger.
  useEffect(() => {
    if (!moreMenuOpen) return;
    const close = () => setMoreMenuOpen(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [moreMenuOpen]);

  const loadReceipts = async () => {
    if (!user?.company_id) {
      setReceipts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { data, error } = await selectForUser<any[]>(user, 'receipts', 'receipts', () =>
      Promise.resolve(
        supabase
          .from('receipts')
          .select(`
            id,
            receipt_number,
            receipt_date,
            amount,
            payment_mode,
            reference_number,
            notes,
            status,
            customers(id, name, gstin, contact_name, email, phone, address, city, state),
            receipt_allocations(invoice_id, amount, invoices(id, invoice_number))
          `)
          .eq('company_id', user.company_id)
          .order('receipt_date', { ascending: false })
          .order('created_at', { ascending: false })
      )
    );

    if (error) {
      toast.error(`Could not load receipts: ${error.message}`);
      setReceipts([]);
    } else {
      const mapped: ReceiptRow[] = (data || []).map((r: any) => {
        const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
        const allocations: ReceiptAllocation[] = (r.receipt_allocations || []).map((a: any) => {
          const inv = Array.isArray(a.invoices) ? a.invoices[0] : a.invoices;
          return {
            invoiceId: inv?.id || a.invoice_id || '',
            invoiceNumber: inv?.invoice_number || '',
            amount: Number(a.amount || 0),
          };
        });
        const firstAllocation = allocations[0];

        const customerDetails: ReceiptCustomer | null = customer
          ? {
              id: customer.id,
              companyName: customer.name || '',
              gstin: customer.gstin || '',
              contactName: customer.contact_name || '',
              email: customer.email || '',
              phone: customer.phone || '',
              address: customer.address || '',
              city: customer.city || '',
              state: customer.state || '',
            }
          : null;

        return {
          dbId: r.id,
          id: r.receipt_number,
          customer: customer?.name || '—',
          customerId: customer?.id || null,
          customerDetails,
          invoice: firstAllocation?.invoiceNumber || '',
          invoiceId: firstAllocation?.invoiceId || null,
          date: formatReceiptDate(r.receipt_date),
          rawDate: r.receipt_date || '',
          amount: Number(r.amount || 0),
          paymentMode: r.payment_mode || 'Cash',
          refNumber: r.reference_number || '',
          notes: r.notes || '',
          status: (r.status as 'cleared' | 'pending') || 'cleared',
          allocations,
        };
      });
      setReceipts(mapped);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadReceipts();
  }, [user?.company_id]);

  const filteredReceipts = receipts.filter(receipt => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q ||
      receipt.id.toLowerCase().includes(q) ||
      receipt.customer.toLowerCase().includes(q) ||
      receipt.invoice.toLowerCase().includes(q) ||
      receipt.refNumber.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || receipt.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all';

  const visibleSelectedReceipts = filteredReceipts.filter((r) => selectedReceipts.includes(r.dbId));
  const isAllSelected = filteredReceipts.length > 0 && visibleSelectedReceipts.length === filteredReceipts.length;
  const isSomeSelected = visibleSelectedReceipts.length > 0 && visibleSelectedReceipts.length < filteredReceipts.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedReceipts((prev) => Array.from(new Set([...prev, ...filteredReceipts.map((r) => r.dbId)])));
    } else {
      const visibleIds = new Set(filteredReceipts.map((r) => r.dbId));
      setSelectedReceipts((prev) => prev.filter((id) => !visibleIds.has(id)));
    }
  };

  const handleSelectReceipt = (dbId: string, checked: boolean) => {
    if (checked) {
      setSelectedReceipts((prev) => Array.from(new Set([...prev, dbId])));
    } else {
      setSelectedReceipts((prev) => prev.filter((id) => id !== dbId));
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedReceipts.length === 0) return;
    const receiptsToDelete = receipts.filter((r) => selectedReceipts.includes(r.dbId));
    if (receiptsToDelete.length === 0) return;

    setIsBulkDeleting(true);
    try {
      const { error } = await supabase
        .from('receipts')
        .delete()
        .in('id', receiptsToDelete.map((r) => r.dbId));
      if (error) throw error;

      await logAuditorAction(user, 'receipts', 'receipts', 'bulk_delete_receipts', {
        count: receiptsToDelete.length,
      });

      const deletedIds = new Set(receiptsToDelete.map((r) => r.dbId));
      setReceipts((prev) => prev.filter((r) => !deletedIds.has(r.dbId)));
      setSelectedReceipts([]);
      setShowBulkDeleteConfirm(false);
      toast.success(`${receiptsToDelete.length} receipt${receiptsToDelete.length > 1 ? 's' : ''} deleted.`);
    } catch (error) {
      toast.error(error instanceof Error ? `Could not delete receipts: ${error.message}` : 'Could not delete receipts');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const stats = {
    all: receipts.length,
    cleared: receipts.filter(r => r.status === 'cleared').length,
    pending: receipts.filter(r => r.status === 'pending').length,
    totalAmount: receipts.filter(r => r.status === 'cleared').reduce((sum, r) => sum + r.amount, 0),
  };

  const handleMarkCleared = async () => {
    if (!markingReceipt || isMarking) return;
    setIsMarking(true);

    const { error } = await updateForUser(
      user,
      'receipts',
      'receipts',
      () =>
        Promise.resolve(
          supabase
            .from('receipts')
            .update({ status: 'cleared' })
            .eq('id', markingReceipt.dbId)
        ),
      { status: 'cleared' },
      { id: markingReceipt.dbId },
      markingReceipt.id,
    );

    setIsMarking(false);

    if (error) {
      toast.error(`Could not mark cleared: ${error.message}`);
      return;
    }

    await logAuditorAction(user, 'receipts', 'receipts', 'mark_cleared', {
      receiptNumber: markingReceipt.id,
    });

    setReceipts(prev => prev.map(r => r.dbId === markingReceipt.dbId ? { ...r, status: 'cleared' } : r));
    setMarkingReceipt(null);
    toast.success(`Receipt ${markingReceipt.id} marked as cleared.`);
  };

  const handleDelete = async () => {
    if (!deletingReceipt || isDeleting) return;
    setIsDeleting(true);

    const { error } = await deleteForUser(
      user,
      'receipts',
      'receipts',
      () =>
        Promise.resolve(
          supabase
            .from('receipts')
            .delete()
            .eq('id', deletingReceipt.dbId)
        ),
      { id: deletingReceipt.dbId },
      deletingReceipt.id,
    );

    setIsDeleting(false);

    if (error) {
      toast.error(`Could not delete receipt: ${error.message}`);
      return;
    }

    await logAuditorAction(user, 'receipts', 'receipts', 'delete_receipt', {
      receiptNumber: deletingReceipt.id,
    });

    setReceipts(prev => prev.filter(r => r.dbId !== deletingReceipt.dbId));
    setDeletingReceipt(null);
    toast.success(`Receipt ${deletingReceipt.id} deleted.`);
  };

  const handleExport = async () => {
    const list = selectedReceipts.length > 0
      ? receipts.filter((r) => selectedReceipts.includes(r.dbId))
      : filteredReceipts;
    if (list.length === 0) {
      toast.error('Nothing to export — clear filters or add receipts first.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KAPS Invoice';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Receipts');

    sheet.mergeCells('A1:H1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Receipts Report';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF6D28D9' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    const totalAmount = list.reduce((s, r) => s + r.amount, 0);
    const clearedAmount = list.filter(r => r.status === 'cleared').reduce((s, r) => s + r.amount, 0);
    const pendingAmount = list.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0);

    sheet.getCell('A2').value = 'Total Receipts:';
    sheet.getCell('A2').font = { bold: true };
    sheet.getCell('B2').value = list.length;
    sheet.getCell('C2').value = 'Cleared:';
    sheet.getCell('C2').font = { bold: true };
    sheet.getCell('D2').value = `₹${clearedAmount.toLocaleString('en-IN')}`;
    sheet.getCell('D2').font = { color: { argb: 'FF15803D' } };
    sheet.getCell('E2').value = 'Pending:';
    sheet.getCell('E2').font = { bold: true };
    sheet.getCell('F2').value = `₹${pendingAmount.toLocaleString('en-IN')}`;
    sheet.getCell('F2').font = { color: { argb: 'FFB45309' } };
    sheet.getCell('G2').value = 'Grand Total:';
    sheet.getCell('G2').font = { bold: true };
    sheet.getCell('H2').value = `₹${totalAmount.toLocaleString('en-IN')}`;
    sheet.getCell('H2').font = { bold: true, color: { argb: 'FF6D28D9' } };

    sheet.addRow([]).height = 8;

    const headers = ['Receipt No.', 'Date', 'Customer', 'Invoice', 'Payment Mode', 'Ref. Number', 'Status', 'Amount'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
      cell.font = { bold: true, color: { argb: 'FF6D28D9' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFC4B5FD' } },
        left: { style: 'thin', color: { argb: 'FFC4B5FD' } },
        bottom: { style: 'thin', color: { argb: 'FFC4B5FD' } },
        right: { style: 'thin', color: { argb: 'FFC4B5FD' } },
      };
    });

    list.forEach(r => {
      const row = sheet.addRow([
        r.id,
        r.date,
        r.customer,
        r.invoice || '—',
        r.paymentMode,
        r.refNumber || '—',
        r.status.charAt(0).toUpperCase() + r.status.slice(1),
        r.amount,
      ]);
      row.getCell(7).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: r.status === 'cleared' ? 'FFDCFCE7' : 'FFFEF3C7' },
      };
      row.getCell(7).font = {
        color: { argb: r.status === 'cleared' ? 'FF15803D' : 'FFB45309' },
        bold: true,
      };
      row.getCell(7).alignment = { horizontal: 'center' };
      row.getCell(8).numFmt = '₹#,##0.00';
      row.getCell(8).font = { bold: true, color: { argb: 'FF15803D' } };
    });

    sheet.columns.forEach((column) => {
      let maxLength = 12;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const v = cell.value ? cell.value.toString() : '';
        if (v.length > maxLength) maxLength = v.length;
      });
      column.width = Math.min(maxLength + 2, 42);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipts_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${list.length} receipt${list.length === 1 ? '' : 's'} to Excel.`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Receipts</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage payment receipts</p>
        </div>
        <Link
          to="/app/receipts/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Receipt
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="All Receipts"
          value={stats.all}
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        <StatCard
          label="Cleared"
          value={stats.cleared}
          color="success"
          active={statusFilter === 'cleared'}
          onClick={() => setStatusFilter('cleared')}
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          color="warning"
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter('pending')}
        />
        <div className="bg-card border border-violet-300 dark:border-violet-400/30 rounded-xl p-5 shadow-[0_1px_2px_rgba(139,92,246,0.08)]">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Total Received</div>
          <div className="text-[28px] sm:text-[32px] font-semibold tracking-tight tabular-nums text-success">
            ₹{(stats.totalAmount / 100000).toFixed(1)}<span className="text-xs ml-0.5 font-normal">L</span>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-violet-100 dark:border-violet-400/10 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by receipt number, customer, invoice, or ref number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
              <Filter className="w-4 h-4" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'cleared' | 'pending')}
                className="bg-transparent text-sm focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="cleared">Cleared</option>
                <option value="pending">Pending</option>
              </select>
            </label>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
              >
                <span className="text-sm">Clear Filters</span>
              </button>
            )}
            {selectedReceipts.length > 0 && (
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-destructive/30 text-destructive bg-card rounded hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm">Delete Selected ({selectedReceipts.length})</span>
              </button>
            )}
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Export{selectedReceipts.length > 0 ? ` (${selectedReceipts.length})` : ''}</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-violet-100 dark:bg-violet-500/15">
              <tr>
                <th className="pl-6 pr-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = isSomeSelected;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded accent-violet-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Receipt No.</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Payment Mode</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Ref Number</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {isLoading && (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Loading receipts...
                  </td>
                </tr>
              )}
              {!isLoading && filteredReceipts.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No receipts found.
                  </td>
                </tr>
              )}
              {!isLoading && filteredReceipts.map((receipt) => (
                <tr key={receipt.dbId} className="bg-violet-50/60 dark:bg-violet-500/[0.04] hover:bg-violet-100/70 dark:hover:bg-violet-500/[0.10] transition-colors">
                  <td className="pl-6 pr-3 py-4">
                    <input
                      type="checkbox"
                      checked={selectedReceipts.includes(receipt.dbId)}
                      onChange={(e) => handleSelectReceipt(receipt.dbId, e.target.checked)}
                      className="w-4 h-4 rounded accent-violet-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-success/10 rounded flex items-center justify-center flex-shrink-0">
                        <ReceiptIcon className="w-5 h-5 text-success" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{receipt.id}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{receipt.customer}</td>
                  <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{receipt.invoice || '—'}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{receipt.date}</td>
                  <td className="px-6 py-4">
                    <PaymentModeBadge mode={receipt.paymentMode} />
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{receipt.refNumber || '—'}</td>
                  <td className="px-6 py-4 text-left">
                    <span className="text-sm font-medium text-success tabular-nums">
                      ₹{receipt.amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={receipt.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-start gap-2">
                      <button
                        onClick={() => setViewingReceipt(receipt)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <Link
                        to="/app/receipts/new"
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </Link>
                      <button
                        onClick={(e) => {
                          if (moreMenuOpen === receipt.dbId) {
                            setMoreMenuOpen(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuPosition({
                            top: rect.bottom + 4,
                            right: window.innerWidth - rect.right,
                          });
                          setMoreMenuOpen(receipt.dbId);
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
            {selectedReceipts.length > 0 ? (
              <span>{selectedReceipts.length} receipt{selectedReceipts.length > 1 ? 's' : ''} selected</span>
            ) : (
              <span>Showing {filteredReceipts.length} of {receipts.length} receipts</span>
            )}
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded text-sm hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
              Previous
            </button>
            <button className="px-3 py-1.5 bg-violet-500 text-white rounded text-sm font-semibold shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)]">1</button>
            <button className="px-3 py-1.5 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded text-sm hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Action menu — portaled out of the table so it can escape the table's
          overflow-x-auto wrapper. */}
      {moreMenuOpen && menuPosition && (() => {
        const receipt = receipts.find((r) => r.dbId === moreMenuOpen);
        if (!receipt) return null;
        return createPortal(
          <MoreMenu
            receipt={receipt}
            position={menuPosition}
            onClose={() => setMoreMenuOpen(null)}
            onDownload={() => {
              setViewingReceipt(receipt);
              setMoreMenuOpen(null);
            }}
            onSend={() => {
              setSendingReceipt(receipt);
              setMoreMenuOpen(null);
            }}
            onMarkCleared={() => {
              setMarkingReceipt(receipt);
              setMoreMenuOpen(null);
            }}
            onDelete={() => {
              setDeletingReceipt(receipt);
              setMoreMenuOpen(null);
            }}
          />,
          document.body,
        );
      })()}

      {/* View Receipt Preview Modal */}
      {viewingReceipt && (
        <ReceiptPreview
          isOpen={true}
          onClose={() => setViewingReceipt(null)}
          receiptNumber={viewingReceipt.id}
          receiptDate={viewingReceipt.rawDate || viewingReceipt.date}
          amount={viewingReceipt.amount}
          paymentMode={viewingReceipt.paymentMode}
          refNumber={viewingReceipt.refNumber}
          notes={viewingReceipt.notes}
          invoice={viewingReceipt.invoice}
          customer={viewingReceipt.customerDetails}
        />
      )}

      {/* Send Receipt Modal */}
      {sendingReceipt && (
        <SendReceiptModal
          receipt={sendingReceipt}
          onClose={() => setSendingReceipt(null)}
          onSent={() => setSendingReceipt(null)}
        />
      )}

      {/* Mark as Cleared Modal */}
      {markingReceipt && markingReceipt.status === 'pending' && (
        <MarkClearedModal
          receipt={markingReceipt}
          isMarking={isMarking}
          onClose={() => setMarkingReceipt(null)}
          onConfirm={handleMarkCleared}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Delete Selected Receipts</h3>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete {selectedReceipts.length} selected receipt{selectedReceipts.length > 1 ? 's' : ''}? Their invoice allocations are removed too. This action cannot be undone.
              </p>
            </div>
            <div className="p-6 border-t border-violet-100 dark:border-violet-400/15 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={isBulkDeleting}
                className="px-4 py-2 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkDelete}
                disabled={isBulkDeleting}
                className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {isBulkDeleting ? 'Deleting…' : `Delete ${selectedReceipts.length} Receipt${selectedReceipts.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingReceipt && (
        <DeleteConfirmationModal
          receipt={deletingReceipt}
          isDeleting={isDeleting}
          onClose={() => setDeletingReceipt(null)}
          onConfirm={handleDelete}
        />
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
  color?: 'success' | 'warning';
  active?: boolean;
  onClick?: () => void;
}) {
  const colorClasses = {
    success: 'text-success',
    warning: 'text-warning',
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    cleared: 'bg-success/10 text-success border-success/30',
    pending: 'bg-warning/10 text-warning border-warning/30',
  };
  const badgeStyle = styles[status] || 'bg-muted text-muted-foreground border-border';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${badgeStyle}`}>
      {status}
    </span>
  );
}

function PaymentModeBadge({ mode }: { mode: string }) {
  const styles: Record<string, string> = {
    'Bank Transfer': 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-400/40',
    'Cheque': 'bg-warning/10 text-warning border-warning/30',
    'UPI': 'bg-success/10 text-success border-success/30',
    'Cash': 'bg-muted text-muted-foreground border-border',
    'Card': 'bg-accent/10 text-accent border-accent/30',
  };
  const badgeStyle = styles[mode] || 'bg-muted text-muted-foreground border-border';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${badgeStyle}`}>
      {mode}
    </span>
  );
}

function MoreMenu({
  receipt,
  position,
  onClose,
  onDownload,
  onSend,
  onMarkCleared,
  onDelete
}: {
  receipt: ReceiptRow;
  position: { top: number; right: number };
  onClose: () => void;
  onDownload: () => void;
  onSend: () => void;
  onMarkCleared: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: position.top,
        right: position.right,
        zIndex: 60,
      }}
      className="w-48 bg-card border border-violet-200 dark:border-violet-400/25 rounded-lg shadow-lg py-1"
    >
      <button
        onClick={onDownload}
        className="w-full px-4 py-2 text-left text-sm hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        Download PDF
      </button>
      <button
        onClick={onSend}
        className="w-full px-4 py-2 text-left text-sm hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors flex items-center gap-2"
      >
        <Send className="w-4 h-4" />
        Send via Email
      </button>
      {receipt.status === 'pending' && (
        <button
          onClick={onMarkCleared}
          className="w-full px-4 py-2 text-left text-sm hover:bg-success/10 transition-colors flex items-center gap-2 text-success"
        >
          <CheckCircle className="w-4 h-4" />
          Mark as Cleared
        </button>
      )}
      <div className="border-t border-violet-100 dark:border-violet-400/15 my-1"></div>
      <button
        onClick={onDelete}
        className="w-full px-4 py-2 text-left text-sm hover:bg-destructive/10 transition-colors flex items-center gap-2 text-destructive"
      >
        <Trash2 className="w-4 h-4" />
        Delete Receipt
      </button>
    </div>
  );
}

function SendReceiptModal({
  receipt,
  onClose,
  onSent,
}: {
  receipt: ReceiptRow;
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState(receipt.customerDetails?.email || '');
  const [message, setMessage] = useState(
    `Hello,\n\nPlease find Receipt ${receipt.id} for the payment of ₹${receipt.amount.toLocaleString('en-IN')}${receipt.invoice ? ` against Invoice ${receipt.invoice}` : ''}.\n\nThank you.`
  );
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isSending) return;

    setIsSending(true);
    const { sendInvoiceEmail } = await import('../../../lib/emailInvoice');
    const result = await sendInvoiceEmail({
      to: email.trim(),
      invoiceNumber: receipt.id,
      customerName: receipt.customer,
      amount: receipt.amount.toFixed(2),
      htmlBody: message.replace(/\n/g, '<br/>'),
    });
    setIsSending(false);

    if (result.success) {
      toast.success(`Receipt ${receipt.id} sent to ${email}`);
      onSent();
    } else {
      toast.error(result.error || 'Could not send the receipt.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-violet-100 dark:border-violet-400/15">
          <h2 className="text-lg font-semibold text-foreground">Send Receipt</h2>
          <button onClick={onClose} className="p-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Receipt Number</label>
            <input type="text" value={receipt.id} disabled className="w-full px-3 py-2 border border-input bg-muted rounded text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Customer</label>
            <input type="text" value={receipt.customer} disabled className="w-full px-3 py-2 border border-input bg-muted rounded text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Email Address <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter customer email"
              className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Message</label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-violet-100 dark:border-violet-400/15">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 border border-violet-200 dark:border-violet-400/25 bg-card rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500 text-white rounded hover:bg-violet-600 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              <Send className="w-4 h-4" />
              {isSending ? 'Sending...' : 'Send Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MarkClearedModal({
  receipt,
  isMarking,
  onClose,
  onConfirm
}: {
  receipt: ReceiptRow;
  isMarking: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-violet-100 dark:border-violet-400/15">
          <h2 className="text-lg font-semibold text-foreground">Mark as Cleared</h2>
          <button onClick={onClose} className="p-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-success" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground mb-2">
                Mark receipt <span className="font-semibold">{receipt.id}</span> as cleared?
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Customer: {receipt.customer}</p>
                <p>Payment Mode: {receipt.paymentMode}</p>
                <p>Amount: ₹{receipt.amount.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-violet-100 dark:border-violet-400/15">
          <button
            onClick={onClose}
            disabled={isMarking}
            className="px-4 py-2 border border-violet-200 dark:border-violet-400/25 bg-card rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isMarking}
            className="px-4 py-2 bg-success text-white rounded hover:bg-success/90 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {isMarking ? 'Updating...' : 'Mark as Cleared'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmationModal({
  receipt,
  isDeleting,
  onClose,
  onConfirm
}: {
  receipt: ReceiptRow;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-violet-100 dark:border-violet-400/15">
          <h2 className="text-lg font-semibold text-foreground">Delete Receipt</h2>
          <button onClick={onClose} className="p-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground mb-2">
                Are you sure you want to delete <span className="font-semibold">{receipt.id}</span>?
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Customer: {receipt.customer}</p>
                {receipt.invoice && <p>Invoice: {receipt.invoice}</p>}
                <p>Amount: ₹{receipt.amount.toLocaleString()}</p>
                <p className="text-destructive font-medium mt-2">
                  This action cannot be undone. The receipt and any invoice allocations linked to it will be permanently removed.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-violet-100 dark:border-violet-400/15">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 border border-violet-200 dark:border-violet-400/25 bg-card rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {isDeleting ? 'Deleting...' : 'Delete Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}
