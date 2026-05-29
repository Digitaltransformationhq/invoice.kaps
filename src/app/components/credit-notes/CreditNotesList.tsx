import { Link } from 'react-router';
import { Plus, Search, Filter, Download, Eye, Edit, MoreVertical, Send, Trash2, FileText, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';
import { CreditNotePreview } from './CreditNotePreview';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { deleteForUser, logAuditorAction, selectForUser } from '../../../lib/auditorData';

interface CreditNoteLineItem {
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

interface CreditNoteCustomer {
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

interface CreditNoteRow {
  dbId: string;
  id: string;
  type: 'credit' | 'debit';
  customer: string;
  customerId: string | null;
  customerDetails: CreditNoteCustomer | null;
  originalInvoice: string;
  originalInvoiceId: string | null;
  date: string;
  rawDate: string;
  amount: number;
  reason: string;
  status: 'draft' | 'issued' | 'cancelled';
  lineItems: CreditNoteLineItem[];
}

const formatNoteDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function CreditNotesList() {
  const { user } = useAuth();
  const [creditNotes, setCreditNotes] = useState<CreditNoteRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'draft'>('all');
  const [viewingNote, setViewingNote] = useState<any>(null);
  const [sendingNote, setSendingNote] = useState<any>(null);
  const [deletingNote, setDeletingNote] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);

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

  const loadCreditNotes = async () => {
    if (!user?.company_id) {
      setCreditNotes([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const mapNote = (
      note: any,
      type: 'credit' | 'debit',
      itemsKey: 'credit_note_items' | 'debit_note_items',
    ): CreditNoteRow => {
      const customer = Array.isArray(note.customers) ? note.customers[0] : note.customers;
      const invoice = Array.isArray(note.invoices) ? note.invoices[0] : note.invoices;
      const items: CreditNoteLineItem[] = (note[itemsKey] || []).map((it: any) => ({
        id: it.id,
        item: it.item_name || '',
        description: it.description || '',
        hsn: it.hsn || '',
        qty: Number(it.quantity || 0),
        unit: it.unit || 'Nos',
        rate: Number(it.rate || 0),
        discount: 0,
        gst: Number(it.gst_rate || 0),
        amount: Number(it.total_amount || 0),
      }));
      const customerDetails: CreditNoteCustomer | null = customer
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
        dbId: note.id,
        id: note.note_number,
        type,
        customer: customer?.name || '—',
        customerId: customer?.id || null,
        customerDetails,
        originalInvoice: invoice?.invoice_number || '—',
        originalInvoiceId: invoice?.id || null,
        date: formatNoteDate(note.note_date),
        rawDate: note.note_date || '',
        amount: Number(note.total_amount || 0),
        reason: note.reason || '',
        status: (note.status as 'draft' | 'issued' | 'cancelled') || 'draft',
        lineItems: items,
      };
    };

    const [creditRes, debitRes] = await Promise.all([
      selectForUser<any[]>(user, 'credit_notes', 'credit_notes', () =>
        Promise.resolve(
          supabase
            .from('credit_notes')
            .select(`
              id,
              note_number,
              note_date,
              reason,
              total_amount,
              status,
              customers(id, name, gstin, contact_name, email, phone, address, city, state),
              invoices(id, invoice_number),
              credit_note_items(id, item_name, description, hsn, quantity, unit, rate, gst_rate, taxable_amount, tax_amount, total_amount)
            `)
            .eq('company_id', user.company_id)
            .order('note_date', { ascending: false })
            .order('created_at', { ascending: false })
        )
      ),
      selectForUser<any[]>(user, 'credit_notes', 'debit_notes', () =>
        Promise.resolve(
          supabase
            .from('debit_notes')
            .select(`
              id,
              note_number,
              note_date,
              reason,
              total_amount,
              status,
              customers(id, name, gstin, contact_name, email, phone, address, city, state),
              invoices(id, invoice_number),
              debit_note_items(id, item_name, description, hsn, quantity, unit, rate, gst_rate, taxable_amount, tax_amount, total_amount)
            `)
            .eq('company_id', user.company_id)
            .order('note_date', { ascending: false })
            .order('created_at', { ascending: false })
        )
      ),
    ]);

    if (creditRes.error || debitRes.error) {
      const err = creditRes.error || debitRes.error;
      toast.error(`Could not load notes: ${err?.message}`);
      setCreditNotes([]);
    } else {
      const credits = (creditRes.data || []).map((n: any) => mapNote(n, 'credit', 'credit_note_items'));
      const debits = (debitRes.data || []).map((n: any) => mapNote(n, 'debit', 'debit_note_items'));
      const merged = [...credits, ...debits].sort((a, b) => {
        if (!a.rawDate && !b.rawDate) return 0;
        if (!a.rawDate) return 1;
        if (!b.rawDate) return -1;
        return new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime();
      });
      setCreditNotes(merged);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadCreditNotes();
  }, [user?.company_id]);

  const filteredNotes = creditNotes.filter(note => {
    const matchesSearch = note.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.originalInvoice.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || note.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || note.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const hasActiveFilters = searchQuery !== '' || typeFilter !== 'all' || statusFilter !== 'all';

  const visibleSelectedNotes = filteredNotes.filter((note) => selectedNotes.includes(note.dbId));
  const isAllSelected = filteredNotes.length > 0 && visibleSelectedNotes.length === filteredNotes.length;
  const isSomeSelected = visibleSelectedNotes.length > 0 && visibleSelectedNotes.length < filteredNotes.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedNotes((prev) =>
        Array.from(new Set([...prev, ...filteredNotes.map((n) => n.dbId)])),
      );
    } else {
      const visibleIds = new Set(filteredNotes.map((n) => n.dbId));
      setSelectedNotes((prev) => prev.filter((id) => !visibleIds.has(id)));
    }
  };

  const handleSelectNote = (dbId: string, checked: boolean) => {
    if (checked) {
      setSelectedNotes((prev) => Array.from(new Set([...prev, dbId])));
    } else {
      setSelectedNotes((prev) => prev.filter((id) => id !== dbId));
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedNotes.length === 0) return;

    const notesToDelete = creditNotes.filter((n) => selectedNotes.includes(n.dbId));
    if (notesToDelete.length === 0) return;

    setIsBulkDeleting(true);

    try {
      const creditIds = notesToDelete.filter((n) => n.type === 'credit').map((n) => n.dbId);
      const debitIds = notesToDelete.filter((n) => n.type === 'debit').map((n) => n.dbId);

      if (creditIds.length > 0) {
        const { error } = await supabase.from('credit_notes').delete().in('id', creditIds);
        if (error) throw error;
      }
      if (debitIds.length > 0) {
        const { error } = await supabase.from('debit_notes').delete().in('id', debitIds);
        if (error) throw error;
      }

      await logAuditorAction(user, 'credit_notes', 'bulk_delete', 'bulk_delete_notes', {
        count: notesToDelete.length,
        creditCount: creditIds.length,
        debitCount: debitIds.length,
      });

      const deletedIds = new Set(notesToDelete.map((n) => n.dbId));
      setCreditNotes((prev) => prev.filter((n) => !deletedIds.has(n.dbId)));
      setSelectedNotes([]);
      setShowBulkDeleteConfirm(false);
      toast.success(`${notesToDelete.length} note${notesToDelete.length > 1 ? 's' : ''} deleted.`);
    } catch (error) {
      toast.error(error instanceof Error ? `Could not delete notes: ${error.message}` : 'Could not delete notes');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const stats = {
    all: creditNotes.length,
    credit: creditNotes.filter(n => n.type === 'credit').length,
    debit: creditNotes.filter(n => n.type === 'debit').length,
    totalAmount: creditNotes.reduce((sum, n) => sum + (n.type === 'credit' ? -n.amount : n.amount), 0),
  };

  const handleExport = async () => {
    const notesToExport = selectedNotes.length > 0
      ? creditNotes.filter((n) => selectedNotes.includes(n.dbId))
      : filteredNotes;

    if (notesToExport.length === 0) {
      toast.error('Nothing to export — clear filters or add notes first.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KAPS Invoice';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Credit & Debit Notes');

    // Title
    sheet.mergeCells('A1:H1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Credit / Debit Notes Report';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF6D28D9' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    // Summary stats
    const creditCount = notesToExport.filter(n => n.type === 'credit').length;
    const debitCount = notesToExport.filter(n => n.type === 'debit').length;
    const creditAmount = notesToExport
      .filter(n => n.type === 'credit')
      .reduce((sum, n) => sum + n.amount, 0);
    const debitAmount = notesToExport
      .filter(n => n.type === 'debit')
      .reduce((sum, n) => sum + n.amount, 0);
    const netAdjustment = debitAmount - creditAmount;

    sheet.getCell('A2').value = 'Total Notes:';
    sheet.getCell('A2').font = { bold: true };
    sheet.getCell('B2').value = notesToExport.length;

    sheet.getCell('C2').value = 'Credit Notes:';
    sheet.getCell('C2').font = { bold: true };
    sheet.getCell('D2').value = creditCount;
    sheet.getCell('E2').value = `₹${creditAmount.toLocaleString('en-IN')}`;
    sheet.getCell('E2').font = { color: { argb: 'FF15803D' } };

    sheet.getCell('F2').value = 'Debit Notes:';
    sheet.getCell('F2').font = { bold: true };
    sheet.getCell('G2').value = debitCount;
    sheet.getCell('H2').value = `₹${debitAmount.toLocaleString('en-IN')}`;
    sheet.getCell('H2').font = { color: { argb: 'FFB45309' } };

    sheet.getCell('A3').value = 'Net Adjustment:';
    sheet.getCell('A3').font = { bold: true };
    sheet.getCell('B3').value = `₹${Math.abs(netAdjustment).toLocaleString('en-IN')} (${netAdjustment < 0 ? 'Credit' : 'Debit'})`;
    sheet.getCell('B3').font = {
      bold: true,
      color: { argb: netAdjustment < 0 ? 'FF15803D' : 'FFB45309' },
    };

    // Header row
    const headers = [
      'Note Number',
      'Type',
      'Status',
      'Date',
      'Customer',
      'Original Invoice',
      'Reason',
      'Amount',
    ];
    const headerRow = sheet.addRow([]); // spacer row 4
    headerRow.height = 8;
    const realHeaderRow = sheet.addRow(headers); // row 5
    realHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEDE9FE' }, // violet-100
      };
      cell.font = { bold: true, color: { argb: 'FF6D28D9' } }; // violet-700
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFC4B5FD' } },
        left: { style: 'thin', color: { argb: 'FFC4B5FD' } },
        bottom: { style: 'thin', color: { argb: 'FFC4B5FD' } },
        right: { style: 'thin', color: { argb: 'FFC4B5FD' } },
      };
    });

    // Data rows
    notesToExport.forEach((note) => {
      const signedAmount = note.type === 'credit' ? -note.amount : note.amount;
      const row = sheet.addRow([
        note.id,
        note.type === 'credit' ? 'Credit Note' : 'Debit Note',
        note.status.charAt(0).toUpperCase() + note.status.slice(1),
        note.date,
        note.customer,
        note.originalInvoice,
        note.reason,
        signedAmount,
      ]);

      // Amount cell — colour by type, INR format
      const amountCell = row.getCell(8);
      amountCell.numFmt = '₹#,##0;[Red]-₹#,##0';
      amountCell.font = {
        bold: true,
        color: { argb: note.type === 'credit' ? 'FF15803D' : 'FFB45309' },
      };

      // Type cell — pill background
      const typeCell = row.getCell(2);
      typeCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: note.type === 'credit' ? 'FFDCFCE7' : 'FFFEF3C7' },
      };
      typeCell.font = {
        color: { argb: note.type === 'credit' ? 'FF15803D' : 'FFB45309' },
        bold: true,
      };
      typeCell.alignment = { horizontal: 'center' };

      // Status cell — pill background
      const statusCell = row.getCell(3);
      if (note.status === 'issued') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDCFCE7' },
        };
        statusCell.font = { color: { argb: 'FF15803D' }, bold: true };
      } else {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE5E7EB' },
        };
        statusCell.font = { color: { argb: 'FF4B5563' }, bold: true };
      }
      statusCell.alignment = { horizontal: 'center' };
    });

    // Auto-size columns
    sheet.columns.forEach((column) => {
      let maxLength = 12;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const value = cell.value ? cell.value.toString() : '';
        if (value.length > maxLength) maxLength = value.length;
      });
      column.width = Math.min(maxLength + 2, 42);
    });

    // Trigger download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `credit-debit-notes_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${notesToExport.length} note${notesToExport.length === 1 ? '' : 's'} to Excel.`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Credit / Debit Notes</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage credit and debit notes for adjustments</p>
        </div>
        <Link
          to="/app/credit-notes/new"
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Note
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="All Notes"
          value={stats.all}
          active={typeFilter === 'all'}
          onClick={() => setTypeFilter('all')}
        />
        <StatCard
          label="Credit Notes"
          value={stats.credit}
          color="success"
          active={typeFilter === 'credit'}
          onClick={() => setTypeFilter('credit')}
        />
        <StatCard
          label="Debit Notes"
          value={stats.debit}
          color="warning"
          active={typeFilter === 'debit'}
          onClick={() => setTypeFilter('debit')}
        />
        <div className="bg-card border border-violet-300 dark:border-violet-400/30 rounded-xl p-5 shadow-[0_1px_2px_rgba(139,92,246,0.08)]">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Net Adjustment</div>
          <div className={`text-[28px] sm:text-[32px] font-semibold tracking-tight tabular-nums ${stats.totalAmount < 0 ? 'text-success' : 'text-warning'}`}>
            ₹{Math.abs(stats.totalAmount).toLocaleString()}
            <span className="text-xs ml-1 font-normal">({stats.totalAmount < 0 ? 'Credit' : 'Debit'})</span>
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
              placeholder="Search by note number, customer, or original invoice..."
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
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'issued' | 'draft')}
                className="bg-transparent text-sm focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="issued">Issued</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('all');
                  setStatusFilter('all');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
              >
                <span className="text-sm">Clear Filters</span>
              </button>
            )}
            {selectedNotes.length > 0 && (
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-destructive/30 text-destructive bg-card rounded hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm">Delete Selected ({selectedNotes.length})</span>
              </button>
            )}
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Export{selectedNotes.length > 0 ? ` (${selectedNotes.length})` : ''}</span>
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
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Note Number</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Original Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Loading notes...
                  </td>
                </tr>
              )}
              {!isLoading && filteredNotes.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No notes found.
                  </td>
                </tr>
              )}
              {!isLoading && filteredNotes.map((note) => (
                <tr key={note.dbId} className="bg-violet-50/60 dark:bg-violet-500/[0.04] hover:bg-violet-100/70 dark:hover:bg-violet-500/[0.10] transition-colors">
                  <td className="pl-6 pr-3 py-4">
                    <input
                      type="checkbox"
                      checked={selectedNotes.includes(note.dbId)}
                      onChange={(e) => handleSelectNote(note.dbId, e.target.checked)}
                      className="w-4 h-4 rounded accent-violet-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-foreground">{note.id}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-xs">{note.reason}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${
                      note.type === 'credit'
                        ? 'bg-success/10 text-success border-success/30'
                        : 'bg-warning/10 text-warning border-warning/30'
                    }`}>
                      {note.type === 'credit' ? 'Credit Note' : 'Debit Note'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{note.customer}</td>
                  <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{note.originalInvoice}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{note.date}</td>
                  <td className="px-6 py-4 text-left">
                    <span className={`text-sm font-medium tabular-nums ${note.type === 'credit' ? 'text-success' : 'text-warning'}`}>
                      {note.type === 'credit' ? '-' : '+'}₹{note.amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={note.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-start gap-2">
                      <button
                        onClick={() => setViewingNote(note)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <Link
                        to="/app/credit-notes/new"
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </Link>
                      <button
                        onClick={(e) => {
                          if (moreMenuOpen === note.id) {
                            setMoreMenuOpen(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuPosition({
                            top: rect.bottom + 4,
                            right: window.innerWidth - rect.right,
                          });
                          setMoreMenuOpen(note.id);
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
            {selectedNotes.length > 0 ? (
              <span>{selectedNotes.length} note{selectedNotes.length > 1 ? 's' : ''} selected</span>
            ) : (
              <span>Showing {filteredNotes.length} of {creditNotes.length} notes</span>
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
        const note = creditNotes.find((n) => n.id === moreMenuOpen);
        if (!note) return null;
        return createPortal(
          <MoreMenu
            note={note}
            position={menuPosition}
            onClose={() => setMoreMenuOpen(null)}
            onDownload={() => {
              toast.info('Download PDF coming soon.');
              setMoreMenuOpen(null);
            }}
            onSend={() => {
              setSendingNote(note);
              setMoreMenuOpen(null);
            }}
            onDelete={() => {
              setDeletingNote(note);
              setMoreMenuOpen(null);
            }}
          />,
          document.body,
        );
      })()}

      {/* View Note Preview Modal */}
      {viewingNote && (
        <CreditNotePreview
          isOpen={true}
          onClose={() => setViewingNote(null)}
          lineItems={viewingNote.lineItems || []}
          noteNumber={viewingNote.id}
          noteDate={viewingNote.rawDate || viewingNote.date}
          noteType={viewingNote.type}
          reason={viewingNote.reason}
          originalInvoice={viewingNote.originalInvoice}
          customer={viewingNote.customerDetails}
        />
      )}

      {/* Send Note Modal */}
      {sendingNote && (
        <SendNoteModal
          note={sendingNote}
          onClose={() => setSendingNote(null)}
          onSend={(email, message) => {
            alert(`Note ${sendingNote.id} sent to ${email}`);
            setSendingNote(null);
          }}
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
              <h3 className="text-lg font-semibold text-foreground mb-2">Delete Selected Notes</h3>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete {selectedNotes.length} selected note{selectedNotes.length > 1 ? 's' : ''}? This action cannot be undone.
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
                {isBulkDeleting ? 'Deleting…' : `Delete ${selectedNotes.length} Note${selectedNotes.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingNote && (
        <DeleteConfirmationModal
          note={deletingNote}
          isDeleting={isDeleting}
          onClose={() => setDeletingNote(null)}
          onConfirm={async () => {
            if (isDeleting || !deletingNote?.dbId) return;
            setIsDeleting(true);

            const table = deletingNote.type === 'debit' ? 'debit_notes' : 'credit_notes';
            const auditAction = deletingNote.type === 'debit' ? 'delete_debit_note' : 'delete_credit_note';

            const { error } = await deleteForUser(
              user,
              'credit_notes',
              table,
              () =>
                Promise.resolve(
                  supabase
                    .from(table)
                    .delete()
                    .eq('id', deletingNote.dbId)
                ),
              { id: deletingNote.dbId },
              deletingNote.id,
            );

            setIsDeleting(false);

            if (error) {
              toast.error(`Could not delete note: ${error.message}`);
              return;
            }

            await logAuditorAction(user, 'credit_notes', table, auditAction, {
              noteNumber: deletingNote.id,
            });

            setCreditNotes((prev) => prev.filter((n) => n.dbId !== deletingNote.dbId));
            setDeletingNote(null);
            toast.success(`${deletingNote.type === 'credit' ? 'Credit' : 'Debit'} Note ${deletingNote.id} deleted.`);
          }}
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
    issued: 'bg-success/10 text-success border-success/30',
    draft: 'bg-muted text-muted-foreground border-border',
    cancelled: 'bg-muted text-muted-foreground border-border',
  };
  const badgeStyle = styles[status] || styles.draft;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${badgeStyle}`}>
      {status}
    </span>
  );
}

function MoreMenu({
  note,
  position,
  onClose,
  onDownload,
  onSend,
  onDelete
}: {
  note: any;
  position: { top: number; right: number };
  onClose: () => void;
  onDownload: () => void;
  onSend: () => void;
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
      <div className="border-t border-violet-100 dark:border-violet-400/15 my-1"></div>
      <button
        onClick={onDelete}
        className="w-full px-4 py-2 text-left text-sm hover:bg-destructive/10 transition-colors flex items-center gap-2 text-destructive"
      >
        <Trash2 className="w-4 h-4" />
        Delete Note
      </button>
    </div>
  );
}

function SendNoteModal({
  note,
  onClose,
  onSend
}: {
  note: any;
  onClose: () => void;
  onSend: (email: string, message: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(`Please find attached ${note.type === 'credit' ? 'Credit' : 'Debit'} Note ${note.id} for your reference.`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(email, message);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Send {note.type === 'credit' ? 'Credit' : 'Debit'} Note</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Note Number
            </label>
            <input
              type="text"
              value={note.id}
              disabled
              className="w-full px-3 py-2 border border-input bg-muted rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Customer
            </label>
            <input
              type="text"
              value={note.customer}
              disabled
              className="w-full px-3 py-2 border border-input bg-muted rounded text-sm"
            />
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
            <label className="block text-sm font-medium text-foreground mb-2">
              Message
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              <Send className="w-4 h-4" />
              Send Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmationModal({
  note,
  isDeleting,
  onClose,
  onConfirm
}: {
  note: any;
  isDeleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Delete {note.type === 'credit' ? 'Credit' : 'Debit'} Note</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground mb-2">
                Are you sure you want to delete <span className="font-semibold">{note.id}</span>?
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Customer: {note.customer}</p>
                <p>Amount: ₹{note.amount.toLocaleString()}</p>
                <p className="text-destructive font-medium mt-2">
                  This action cannot be undone. All data associated with this note will be permanently removed.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {isDeleting ? 'Deleting...' : 'Delete Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
