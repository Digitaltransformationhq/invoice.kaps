import { Link } from 'react-router';
import { Plus, Search, Filter, Download, Eye, Edit, MoreVertical, Wallet, CheckCircle, Printer, Copy, Trash2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { PaymentVoucherPreview } from './PaymentVoucherPreview';
import ExcelJS from 'exceljs';

const paymentVouchers = [
  { id: 'PV-2026-001', date: '12 May 2026', payee: 'Steel Suppliers Ltd', category: 'Purchase', amount: 125000, paymentMode: 'Bank Transfer', refNumber: 'UTR123456789', status: 'approved', approvedBy: 'John Doe', purpose: 'Raw material purchase for May production', notes: 'Invoice #INV-2026-789 attached' },
  { id: 'PV-2026-002', date: '11 May 2026', payee: 'ABC Logistics', category: 'Transportation', amount: 15000, paymentMode: 'UPI', refNumber: '987654321012', status: 'approved', approvedBy: 'John Doe', purpose: 'Transportation charges for shipment #SHP-501', notes: 'Payment for 3 deliveries' },
  { id: 'PV-2026-003', date: '10 May 2026', payee: 'Office Rent - May 2026', category: 'Rent', amount: 50000, paymentMode: 'Cheque', refNumber: 'CHQ456789', status: 'pending', approvedBy: '', purpose: 'Monthly office rent payment', notes: 'For office space at Business Park' },
  { id: 'PV-2026-004', date: '09 May 2026', payee: 'Electricity Board', category: 'Utilities', amount: 8500, paymentMode: 'Bank Transfer', refNumber: 'UTR987654321', status: 'approved', approvedBy: 'John Doe', purpose: 'Electricity bill for April 2026', notes: 'Consumer #123456789' },
  { id: 'PV-2026-005', date: '08 May 2026', payee: 'Employee Salaries - May', category: 'Salary', amount: 450000, paymentMode: 'Bank Transfer', refNumber: 'BATCH001', status: 'approved', approvedBy: 'John Doe', purpose: 'Monthly salary disbursement for May 2026', notes: 'Batch payment for 15 employees' },
  { id: 'PV-2026-006', date: '07 May 2026', payee: 'Raw Material Vendor', category: 'Purchase', amount: 234000, paymentMode: 'Bank Transfer', refNumber: 'UTR445566778', status: 'approved', approvedBy: 'John Doe', purpose: 'Bulk material purchase order #PO-2026-150', notes: 'Partial payment - 50% advance' },
];

export function PaymentVouchersList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedVoucher, setSelectedVoucher] = useState<typeof paymentVouchers[0] | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const itemsPerPage = 10;

  const filteredVouchers = paymentVouchers.filter(voucher => {
    const matchesSearch = voucher.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         voucher.payee.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         voucher.refNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || voucher.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || voucher.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const stats = {
    total: paymentVouchers.length,
    approved: paymentVouchers.filter(v => v.status === 'approved').length,
    pending: paymentVouchers.filter(v => v.status === 'pending').length,
    totalAmount: paymentVouchers.filter(v => v.status === 'approved').reduce((sum, v) => sum + v.amount, 0),
  };

  const categories = ['All', 'Purchase', 'Salary', 'Rent', 'Utilities', 'Transportation', 'Other'];

  const totalPages = Math.ceil(filteredVouchers.length / itemsPerPage);
  const paginatedVouchers = filteredVouchers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    if (!activeMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !(target as HTMLElement).closest('.action-menu-trigger')
      ) {
        setActiveMenu(null);
      }
    };
    const close = () => setActiveMenu(null);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [activeMenu]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, categoryFilter]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showViewModal) {
        setShowViewModal(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showViewModal]);

  const handleExport = async () => {
    const vouchersToExport = selectedVouchers.length > 0
      ? paymentVouchers.filter((v) => selectedVouchers.includes(v.id))
      : filteredVouchers;
    if (vouchersToExport.length === 0) {
      toast.error('Nothing to export — clear filters or select vouchers first.');
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Payment Vouchers');

    // Add title
    worksheet.mergeCells('A1:I1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Payment Vouchers Report';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF1F4E78' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    // Add summary stats
    worksheet.mergeCells('A2:B2');
    worksheet.getCell('A2').value = 'Total Vouchers:';
    worksheet.getCell('A2').font = { bold: true };
    worksheet.getCell('C2').value = stats.total;

    worksheet.mergeCells('E2:F2');
    worksheet.getCell('E2').value = 'Total Amount Paid:';
    worksheet.getCell('E2').font = { bold: true };
    worksheet.getCell('G2').value = `₹${stats.totalAmount.toLocaleString('en-IN')}`;
    worksheet.getCell('G2').font = { bold: true, color: { argb: 'FFDC3545' } };

    // Add headers with light green background
    const headers = ['Voucher No.', 'Date', 'Payee', 'Category', 'Payment Mode', 'Ref Number', 'Amount', 'Status', 'Approved By'];
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
    vouchersToExport.forEach((voucher) => {
      const row = worksheet.addRow([
        voucher.id,
        voucher.date,
        voucher.payee,
        voucher.category,
        voucher.paymentMode,
        voucher.refNumber,
        voucher.amount,
        voucher.status,
        voucher.approvedBy
      ]);

      // Format amount cell
      row.getCell(7).numFmt = '₹#,##0';
      row.getCell(7).font = { color: { argb: 'FFDC3545' } };

      // Color code status
      const statusCell = row.getCell(8);
      if (voucher.status === 'approved') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
        statusCell.font = { color: { argb: 'FF006100' } };
      } else if (voucher.status === 'pending') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
        statusCell.font = { color: { argb: 'FF9C5700' } };
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
    chartSheet.mergeCells('A1:D1');
    const instructionCell = chartSheet.getCell('A1');
    instructionCell.value = '📊 Chart-Ready Data: Select data ranges below and use Insert > Charts in Excel to create dynamic charts';
    instructionCell.font = { size: 12, bold: true, color: { argb: 'FF1F4E78' } };
    instructionCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    instructionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F3FF' } };
    chartSheet.getRow(1).height = 40;

    // Category breakdown
    chartSheet.getCell('A3').value = 'PAYMENT BY CATEGORY (For Pie Chart)';
    chartSheet.getCell('A3').font = { size: 14, bold: true, color: { argb: 'FF1F4E78' } };

    chartSheet.getCell('A5').value = 'Category';
    chartSheet.getCell('B5').value = 'Amount';
    chartSheet.getCell('C5').value = 'Visual Bar';
    chartSheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    chartSheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };

    // Calculate category totals
    const categoryTotals: Record<string, number> = {};
    vouchersToExport.forEach(voucher => {
      if (!categoryTotals[voucher.category]) {
        categoryTotals[voucher.category] = 0;
      }
      categoryTotals[voucher.category] += voucher.amount;
    });

    const maxCategoryValue = Math.max(...Object.values(categoryTotals));
    const categoryColors = [
      'FF4472C4', 'FFED7D31', 'FFA5A5A5', 'FFFFC000',
      'FF5B9BD5', 'FF70AD47', 'FF9E480E', 'FF636363'
    ];

    Object.entries(categoryTotals).forEach(([category, amount], index) => {
      const row = chartSheet.addRow([category, amount]);
      row.getCell(2).numFmt = '₹#,##0';

      // Add visual bar
      const percentage = (amount / maxCategoryValue) * 100;
      const barCell = row.getCell(3);
      barCell.value = percentage;
      barCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: categoryColors[index % categoryColors.length] } };
      barCell.numFmt = '0"%"';
      barCell.alignment = { horizontal: 'right' };
    });

    const categoryLastRow = 5 + Object.keys(categoryTotals).length;
    chartSheet.getCell(`A${categoryLastRow + 1}`).value = `💡 Select A5:B${categoryLastRow} and insert a Pie or Doughnut Chart`;
    chartSheet.getCell(`A${categoryLastRow + 1}`).font = { italic: true, color: { argb: 'FF0066CC' } };
    chartSheet.mergeCells(`A${categoryLastRow + 1}:C${categoryLastRow + 1}`);

    // Status breakdown
    const statusStartRow = categoryLastRow + 4;
    chartSheet.getCell(`A${statusStartRow}`).value = 'VOUCHER STATUS (For Doughnut Chart)';
    chartSheet.getCell(`A${statusStartRow}`).font = { size: 14, bold: true, color: { argb: 'FF1F4E78' } };

    const statusHeaderRow = statusStartRow + 2;
    chartSheet.getCell(`A${statusHeaderRow}`).value = 'Status';
    chartSheet.getCell(`B${statusHeaderRow}`).value = 'Count';
    chartSheet.getCell(`C${statusHeaderRow}`).value = 'Percentage';
    chartSheet.getRow(statusHeaderRow).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    chartSheet.getRow(statusHeaderRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };

    const approvedRow = chartSheet.addRow(['Approved', stats.approved]);
    approvedRow.getCell(3).value = (stats.approved / stats.total) * 100;
    approvedRow.getCell(3).numFmt = '0"%"';
    approvedRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
    approvedRow.getCell(3).alignment = { horizontal: 'right' };

    const pendingRow = chartSheet.addRow(['Pending', stats.pending]);
    pendingRow.getCell(3).value = (stats.pending / stats.total) * 100;
    pendingRow.getCell(3).numFmt = '0"%"';
    pendingRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
    pendingRow.getCell(3).alignment = { horizontal: 'right' };

    chartSheet.getCell(`A${statusHeaderRow + 3}`).value = `💡 Select A${statusHeaderRow}:B${statusHeaderRow + 2} and insert a Doughnut Chart`;
    chartSheet.getCell(`A${statusHeaderRow + 3}`).font = { italic: true, color: { argb: 'FF0066CC' } };
    chartSheet.mergeCells(`A${statusHeaderRow + 3}:C${statusHeaderRow + 3}`);

    chartSheet.columns = [
      { width: 20 },
      { width: 18 },
      { width: 15 }
    ];

    // Generate and download the file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `payment_vouchers_${new Date().toISOString().split('T')[0]}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${vouchersToExport.length} payment voucher${vouchersToExport.length === 1 ? '' : 's'}`, {
      description: 'Open the Charts sheet in Excel and insert charts from the formatted data'
    });
  };

  const handleView = (voucher: typeof paymentVouchers[0]) => {
    setSelectedVoucher(voucher);
    setShowViewModal(true);
    setActiveMenu(null);
  };

  const handleEdit = (voucher: typeof paymentVouchers[0]) => {
    toast.info(`Editing ${voucher.id}`, {
      description: 'Edit functionality would navigate to edit page'
    });
    setActiveMenu(null);
  };

  const handlePrint = (voucher: typeof paymentVouchers[0]) => {
    window.print();
    toast.success(`Printing ${voucher.id}`);
    setActiveMenu(null);
  };

  const handleDuplicate = (voucher: typeof paymentVouchers[0]) => {
    toast.success(`Duplicated ${voucher.id}`, {
      description: 'New voucher created as draft'
    });
    setActiveMenu(null);
  };

  const handleDelete = (voucher: typeof paymentVouchers[0]) => {
    toast.success(`Deleted ${voucher.id}`, {
      description: 'Payment voucher has been removed'
    });
    setActiveMenu(null);
  };

  const visibleSelectedVouchers = filteredVouchers.filter((v) => selectedVouchers.includes(v.id));
  const isAllSelected = filteredVouchers.length > 0 && visibleSelectedVouchers.length === filteredVouchers.length;
  const isSomeSelected = visibleSelectedVouchers.length > 0 && visibleSelectedVouchers.length < filteredVouchers.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedVouchers((prev) => Array.from(new Set([...prev, ...filteredVouchers.map((v) => v.id)])));
    } else {
      const visibleIds = new Set(filteredVouchers.map((v) => v.id));
      setSelectedVouchers((prev) => prev.filter((id) => !visibleIds.has(id)));
    }
  };

  const handleSelectVoucher = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedVouchers((prev) => Array.from(new Set([...prev, id])));
    } else {
      setSelectedVouchers((prev) => prev.filter((v) => v !== id));
    }
  };

  const confirmBulkDelete = () => {
    if (selectedVouchers.length === 0) return;
    toast.success(`${selectedVouchers.length} voucher${selectedVouchers.length > 1 ? 's' : ''} deleted`);
    setSelectedVouchers([]);
    setShowBulkDeleteConfirm(false);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Payment Vouchers</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage outgoing payments</p>
        </div>
        <Link
          to="/app/payment-vouchers/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Voucher
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="All Vouchers"
          value={stats.total}
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        <StatCard
          label="Approved"
          value={stats.approved}
          color="success"
          active={statusFilter === 'approved'}
          onClick={() => setStatusFilter('approved')}
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          color="warning"
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter('pending')}
        />
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="text-xs text-muted-foreground mb-1">Total Paid</div>
          <div className="text-4xl font-bold text-destructive">
            ₹{(stats.totalAmount / 100000).toFixed(1)}L
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white border border-border rounded-lg">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by voucher number, payee, or reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-border bg-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {categories.map(cat => (
                <option key={cat} value={cat.toLowerCase()}>{cat}</option>
              ))}
            </select>
            {selectedVouchers.length > 0 && (
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-destructive/30 text-destructive bg-white rounded hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm">Delete Selected ({selectedVouchers.length})</span>
              </button>
            )}
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Export{selectedVouchers.length > 0 ? ` (${selectedVouchers.length})` : ''}</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Voucher No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Payee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Payment Mode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Ref Number</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedVouchers.map((voucher) => (
                <tr key={voucher.id} className="hover:bg-muted/30 transition-colors">
                  <td className="pl-6 pr-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedVouchers.includes(voucher.id)}
                      onChange={(e) => handleSelectVoucher(voucher.id, e.target.checked)}
                      className="w-4 h-4 rounded accent-violet-500"
                    />
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-destructive/10 rounded flex items-center justify-center flex-shrink-0">
                        <Wallet className="w-5 h-5 text-destructive" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{voucher.id}</div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-sm text-muted-foreground">{voucher.date}</td>
                  <td className="px-6 py-3 text-sm text-foreground">{voucher.payee}</td>
                  <td className="px-6 py-3">
                    <CategoryBadge category={voucher.category} />
                  </td>
                  <td className="px-6 py-3">
                    <PaymentModeBadge mode={voucher.paymentMode} />
                  </td>
                  <td className="px-6 py-3 text-sm font-mono text-muted-foreground">{voucher.refNumber}</td>
                  <td className="px-6 py-3 text-sm font-medium text-destructive text-right">
                    -₹{voucher.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={voucher.status} approvedBy={voucher.approvedBy} />
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleView(voucher)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleEdit(voucher)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => {
                          if (activeMenu === voucher.id) {
                            setActiveMenu(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuPosition({
                            top: rect.bottom + 4,
                            right: window.innerWidth - rect.right,
                          });
                          setActiveMenu(voucher.id);
                        }}
                        className="action-menu-trigger p-1.5 hover:bg-muted rounded transition-colors"
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
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedVouchers.length > 0 ? (
              <span>{selectedVouchers.length} voucher{selectedVouchers.length > 1 ? 's' : ''} selected</span>
            ) : (
              <span>Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredVouchers.length)} of {filteredVouchers.length} vouchers</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {totalPages <= 5 ? (
              Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    currentPage === page
                      ? 'bg-primary text-white'
                      : 'border border-border hover:bg-muted'
                  }`}
                >
                  {page}
                </button>
              ))
            ) : (
              <>
                {currentPage > 2 && (
                  <>
                    <button
                      onClick={() => setCurrentPage(1)}
                      className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors"
                    >
                      1
                    </button>
                    {currentPage > 3 && <span className="px-2 py-1.5 text-sm">...</span>}
                  </>
                )}
                {[...Array(3)].map((_, i) => {
                  const page = currentPage - 1 + i;
                  if (page < 1 || page > totalPages) return null;
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${
                        currentPage === page
                          ? 'bg-primary text-white'
                          : 'border border-border hover:bg-muted'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                {currentPage < totalPages - 1 && (
                  <>
                    {currentPage < totalPages - 2 && <span className="px-2 py-1.5 text-sm">...</span>}
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </>
            )}
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Action menu — portaled out of the table so it can escape the table's
          overflow-x-auto wrapper. */}
      {activeMenu && menuPosition && (() => {
        const voucher = filteredVouchers.find((v) => v.id === activeMenu);
        if (!voucher) return null;
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
              onClick={() => handlePrint(voucher)}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-left"
            >
              <Printer className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Print</span>
            </button>
            <button
              onClick={() => handleDuplicate(voucher)}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-left"
            >
              <Copy className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Duplicate</span>
            </button>
            <div className="border-t border-violet-100 dark:border-violet-400/15 my-1"></div>
            <button
              onClick={() => handleDelete(voucher)}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-destructive/10 text-destructive transition-colors text-left"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm">Delete</span>
            </button>
          </div>,
          document.body,
        );
      })()}

      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Delete Selected Vouchers</h3>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete {selectedVouchers.length} selected payment voucher{selectedVouchers.length > 1 ? 's' : ''}? This action cannot be undone.
              </p>
            </div>
            <div className="p-6 border-t border-violet-100 dark:border-violet-400/15 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkDelete}
                className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors"
              >
                Delete {selectedVouchers.length} Voucher{selectedVouchers.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {selectedVoucher && (
        <PaymentVoucherPreview
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          voucherNumber={selectedVoucher.id}
          voucherDate={selectedVoucher.date}
          payee={selectedVoucher.payee}
          category={selectedVoucher.category}
          amount={selectedVoucher.amount}
          paymentMode={selectedVoucher.paymentMode}
          refNumber={selectedVoucher.refNumber}
          purpose={selectedVoucher.purpose}
          notes={selectedVoucher.notes}
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
      className={`bg-white border-2 rounded-lg p-6 text-left transition-all hover:shadow-md ${
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

function StatusBadge({ status, approvedBy }: { status: string; approvedBy: string }) {
  const styles: Record<string, string> = {
    approved: 'bg-success/10 text-success border-success/30',
    pending: 'bg-warning/10 text-warning border-warning/30',
    rejected: 'bg-destructive/10 text-destructive border-destructive/30',
  };
  const badgeStyle = styles[status] || 'bg-muted text-muted-foreground border-border';

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${badgeStyle}`}>
        {status === 'approved' && <CheckCircle className="w-3 h-3" />}
        {status}
      </span>
      {approvedBy && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">by {approvedBy}</span>
      )}
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const styles: Record<string, string> = {
    'Purchase': 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-400/40',
    'Salary': 'bg-accent/10 text-accent border-accent/30',
    'Rent': 'bg-warning/10 text-warning border-warning/30',
    'Utilities': 'bg-success/10 text-success border-success/30',
    'Transportation': 'bg-muted text-muted-foreground border-border',
    'Other': 'bg-muted text-muted-foreground border-border',
  };
  const badgeStyle = styles[category] || 'bg-muted text-muted-foreground border-border';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${badgeStyle}`}>
      {category}
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
