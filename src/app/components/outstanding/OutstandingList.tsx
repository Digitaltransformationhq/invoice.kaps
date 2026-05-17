import { useEffect, useState } from 'react';
import { Search, Filter, Download, Phone, Mail, AlertCircle, Clock, TrendingUp, Users, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { logAuditorAction, selectForUser } from '../../../lib/auditorData';

interface OutstandingItem {
  id: string;
  customer: string;
  customerEmail: string;
  customerPhone: string;
  invoiceId: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'current' | 'overdue-30' | 'overdue-60' | 'overdue-90';
  daysPastDue: number;
}

export function OutstandingList() {
  const { user } = useAuth();
  const [outstandingData, setOutstandingData] = useState<OutstandingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'current' | 'overdue-30' | 'overdue-60' | 'overdue-90'>('all');
  const [viewMode, setViewMode] = useState<'invoice' | 'customer'>('invoice');

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return value;
    return parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getAgingStatus = (days: number): OutstandingItem['status'] => {
    if (days > 60) return 'overdue-90';
    if (days > 30) return 'overdue-60';
    if (days > 0) return 'overdue-30';
    return 'current';
  };

  useEffect(() => {
    const loadOutstanding = async () => {
      if (!user?.company_id) {
        setOutstandingData([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const { data, error } = await selectForUser<any[]>(user, 'outstanding', 'invoices', () =>
        supabase
          .from('invoices')
          .select('id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, customers(name, email, phone)')
          .eq('company_id', user.company_id)
          .not('status', 'in', '("paid","cancelled","draft")')
      );

      if (error) {
        toast.error(`Could not load outstanding payments: ${error.message}`);
        setOutstandingData([]);
      } else {
        const today = new Date();
        setOutstandingData((data || [])
          .filter((invoice: any) => Number(invoice.total_amount || 0) > Number(invoice.paid_amount || 0))
          .map((invoice: any) => {
            const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
            const dueDate = invoice.due_date || invoice.invoice_date;
            const due = new Date(dueDate);
            const daysPastDue = Number.isNaN(due.getTime())
              ? 0
              : Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));

            return {
              id: invoice.id,
              customer: customer?.name || 'Customer not selected',
              customerEmail: customer?.email || '',
              customerPhone: customer?.phone || '',
              invoiceId: invoice.invoice_number,
              invoiceDate: formatDate(invoice.invoice_date),
              dueDate: formatDate(dueDate),
              amount: Number(invoice.total_amount || 0),
              paidAmount: Number(invoice.paid_amount || 0),
              status: getAgingStatus(daysPastDue),
              daysPastDue,
            };
          }));
      }

      setIsLoading(false);
    };

    loadOutstanding();
  }, [user?.company_id]);

  const filteredData = outstandingData.filter(item => {
    const matchesSearch = item.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.invoiceId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate customer-wise outstanding
  const customerOutstanding = Object.values(
    outstandingData.reduce((acc, item) => {
      if (!acc[item.customer]) {
        acc[item.customer] = {
          customer: item.customer,
          customerEmail: item.customerEmail,
          customerPhone: item.customerPhone,
          totalOutstanding: 0,
          invoiceCount: 0,
          oldestDue: item.daysPastDue,
        };
      }
      acc[item.customer].totalOutstanding += (item.amount - item.paidAmount);
      acc[item.customer].invoiceCount += 1;
      acc[item.customer].oldestDue = Math.max(acc[item.customer].oldestDue, item.daysPastDue);
      return acc;
    }, {} as Record<string, any>)
  );

  const stats = {
    total: outstandingData.reduce((sum, item) => sum + (item.amount - item.paidAmount), 0),
    current: outstandingData.filter(i => i.status === 'current').reduce((sum, item) => sum + (item.amount - item.paidAmount), 0),
    overdue30: outstandingData.filter(i => i.status === 'overdue-30').reduce((sum, item) => sum + (item.amount - item.paidAmount), 0),
    overdue60: outstandingData.filter(i => i.status === 'overdue-60').reduce((sum, item) => sum + (item.amount - item.paidAmount), 0),
    overdue90: outstandingData.filter(i => i.status === 'overdue-90').reduce((sum, item) => sum + (item.amount - item.paidAmount), 0),
    invoiceCount: outstandingData.length,
    customerCount: new Set(outstandingData.map(i => i.customer)).size,
  };

  const handleExport = async () => {
    logAuditorAction(user, 'outstanding', 'invoices', 'export_outstanding', { count: filteredData.length });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Outstanding Payments');

    // Add title
    worksheet.mergeCells('A1:K1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Outstanding Payments Report';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF1F4E78' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    // Add summary stats
    worksheet.mergeCells('A2:B2');
    worksheet.getCell('A2').value = 'Total Outstanding:';
    worksheet.getCell('A2').font = { bold: true };
    worksheet.getCell('C2').value = `₹${stats.total.toLocaleString('en-IN')}`;
    worksheet.getCell('C2').font = { bold: true, color: { argb: 'FFDC3545' } };

    worksheet.mergeCells('E2:F2');
    worksheet.getCell('E2').value = 'Total Invoices:';
    worksheet.getCell('E2').font = { bold: true };
    worksheet.getCell('G2').value = stats.invoiceCount;

    worksheet.mergeCells('I2:J2');
    worksheet.getCell('I2').value = 'Total Customers:';
    worksheet.getCell('I2').font = { bold: true };
    worksheet.getCell('K2').value = stats.customerCount;

    // Add headers with light green background
    const headers = ['Invoice ID', 'Customer', 'Email', 'Phone', 'Invoice Date', 'Due Date', 'Amount', 'Paid', 'Balance', 'Days Past Due', 'Status'];
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
    outstandingData.forEach((item) => {
      const row = worksheet.addRow([
        item.invoiceId,
        item.customer,
        item.customerEmail,
        item.customerPhone,
        item.invoiceDate,
        item.dueDate,
        item.amount,
        item.paidAmount,
        item.amount - item.paidAmount,
        item.daysPastDue,
        item.status
      ]);

      // Format amount cells
      row.getCell(7).numFmt = '₹#,##0';
      row.getCell(8).numFmt = '₹#,##0';
      row.getCell(9).numFmt = '₹#,##0';
      row.getCell(9).font = { color: { argb: 'FFDC3545' } };

      // Color code status
      const statusCell = row.getCell(11);
      if (item.status === 'overdue-90') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      } else if (item.status === 'overdue-60' || item.status === 'overdue-30') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
      } else {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
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

    // Add a chart sheet with data ready for Excel charts
    const chartSheet = workbook.addWorksheet('Charts & Analysis');

    // Instructions for creating charts
    chartSheet.mergeCells('A1:D1');
    const instructionCell = chartSheet.getCell('A1');
    instructionCell.value = '📊 Chart-Ready Data: Select data ranges below and use Insert > Charts in Excel to create dynamic charts';
    instructionCell.font = { size: 12, bold: true, color: { argb: 'FF1F4E78' } };
    instructionCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    instructionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F3FF' } };
    chartSheet.getRow(1).height = 40;

    // Add aging analysis data for chart
    chartSheet.getCell('A3').value = 'AGING ANALYSIS (For Pie Chart)';
    chartSheet.getCell('A3').font = { size: 14, bold: true, color: { argb: 'FF1F4E78' } };

    chartSheet.getCell('A5').value = 'Category';
    chartSheet.getCell('B5').value = 'Amount';
    chartSheet.getCell('C5').value = 'Visual Bar';
    chartSheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    chartSheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };

    const chartData = [
      ['Current', stats.current],
      ['1-30 Days', stats.overdue30],
      ['31-60 Days', stats.overdue60],
      ['60+ Days', stats.overdue90]
    ];

    const maxAgingValue = Math.max(...chartData.map(d => d[1] as number));

    chartData.forEach((row, index) => {
      const dataRow = chartSheet.addRow(row);
      dataRow.getCell(2).numFmt = '₹#,##0';

      // Add visual bar using conditional formatting-like approach
      const percentage = ((row[1] as number) / maxAgingValue) * 100;
      const barCell = dataRow.getCell(3);
      barCell.value = percentage;

      // Color code based on aging
      if (index === 0) {
        barCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }; // Green
      } else if (index === 1) {
        barCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } }; // Yellow
      } else if (index === 2) {
        barCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }; // Light Red
      } else {
        barCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } }; // Red
      }

      barCell.numFmt = '0"%"';
      barCell.alignment = { horizontal: 'right' };
    });

    chartSheet.columns = [
      { width: 20 },
      { width: 18 },
      { width: 15 }
    ];

    // Add instruction for pie chart
    chartSheet.getCell('A11').value = '💡 Select A5:B9 and insert a Pie Chart';
    chartSheet.getCell('A11').font = { italic: true, color: { argb: 'FF0066CC' } };
    chartSheet.mergeCells('A11:C11');

    // Add Customer-wise breakdown
    chartSheet.getCell('A14').value = 'TOP CUSTOMERS BY OUTSTANDING (For Bar Chart)';
    chartSheet.getCell('A14').font = { size: 14, bold: true, color: { argb: 'FF1F4E78' } };

    chartSheet.getCell('A16').value = 'Customer';
    chartSheet.getCell('B16').value = 'Outstanding Amount';
    chartSheet.getCell('C16').value = 'Visual Bar';
    chartSheet.getRow(16).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    chartSheet.getRow(16).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };

    const topCustomers = customerOutstanding
      .sort((a: any, b: any) => b.totalOutstanding - a.totalOutstanding)
      .slice(0, 8);

    const maxCustomerValue = Math.max(...topCustomers.map((c: any) => c.totalOutstanding));

    topCustomers.forEach((customer: any) => {
      const row = chartSheet.addRow([customer.customer, customer.totalOutstanding]);
      row.getCell(2).numFmt = '₹#,##0';

      // Add visual bar
      const percentage = (customer.totalOutstanding / maxCustomerValue) * 100;
      const barCell = row.getCell(3);
      barCell.value = percentage;
      barCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      barCell.numFmt = '0"%"';
      barCell.alignment = { horizontal: 'right' };
    });

    // Add instruction for bar chart
    const lastRow = 16 + topCustomers.length + 1;
    chartSheet.getCell(`A${lastRow}`).value = `💡 Select A16:B${16 + topCustomers.length} and insert a Bar Chart`;
    chartSheet.getCell(`A${lastRow}`).font = { italic: true, color: { argb: 'FF0066CC' } };
    chartSheet.mergeCells(`A${lastRow}:C${lastRow}`);

    // Generate and download the file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `outstanding_report_${new Date().toISOString().split('T')[0]}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Outstanding report exported successfully', {
      description: 'Open the Charts sheet in Excel and insert charts from the formatted data'
    });
  };

  const handleCall = (phone: string, customerName: string) => {
    window.location.href = `tel:${phone}`;
    toast.success(`Calling ${customerName}...`);
  };

  const handleSendEmail = (email: string, customerName: string, invoiceId: string, amount: number) => {
    const subject = encodeURIComponent(`Payment Reminder: ${invoiceId}`);
    const body = encodeURIComponent(
      `Dear ${customerName},\n\n` +
      `This is a friendly reminder about the outstanding payment for invoice ${invoiceId}.\n\n` +
      `Amount Due: ₹${amount.toLocaleString()}\n\n` +
      `Please process the payment at your earliest convenience.\n\n` +
      `Best regards,\n` +
      `Your Company Name`
    );

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    toast.success(`Email reminder opened for ${customerName}`);
  };

  const handleBulkReminders = () => {
    const overdueItems = outstandingData.filter(item => item.daysPastDue > 0);

    if (overdueItems.length === 0) {
      toast.info('No overdue invoices to send reminders for');
      return;
    }

    const uniqueCustomers = new Set(overdueItems.map(item => item.customerEmail));

    toast.success(`Sending reminders to ${uniqueCustomers.size} customers (${overdueItems.length} invoices)`, {
      description: 'Email reminders will be sent shortly',
      icon: <Mail className="w-4 h-4" />,
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Outstanding</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage outstanding payments</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="text-sm">Export</span>
          </button>
          <button
            onClick={handleBulkReminders}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
          >
            <Mail className="w-4 h-4" />
            <span className="text-sm">Send Reminders</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="md:col-span-2 bg-white border-2 border-destructive rounded-lg p-6">
          <div className="flex items-start justify-between mb-2">
            <div className="text-xs text-muted-foreground">Total Outstanding</div>
            <AlertCircle className="w-5 h-5 text-destructive" />
          </div>
          <div className="text-3xl font-semibold text-destructive mb-1">
            ₹{(stats.total / 100000).toFixed(2)}L
          </div>
          <div className="text-xs text-muted-foreground">
            {stats.invoiceCount} invoices • {stats.customerCount} customers
          </div>
        </div>

        <StatCard
          label="Current"
          value={`₹${(stats.current / 1000).toFixed(0)}K`}
          color="success"
          active={statusFilter === 'current'}
          onClick={() => setStatusFilter('current')}
        />
        <StatCard
          label="1-30 Days"
          value={`₹${(stats.overdue30 / 1000).toFixed(0)}K`}
          color="warning"
          active={statusFilter === 'overdue-30'}
          onClick={() => setStatusFilter('overdue-30')}
        />
        <StatCard
          label="31-60 Days"
          value={`₹${(stats.overdue60 / 1000).toFixed(0)}K`}
          color="warning"
          active={statusFilter === 'overdue-60'}
          onClick={() => setStatusFilter('overdue-60')}
        />
        <StatCard
          label="60+ Days"
          value={`₹${(stats.overdue90 / 1000).toFixed(0)}K`}
          color="destructive"
          active={statusFilter === 'overdue-90'}
          onClick={() => setStatusFilter('overdue-90')}
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
              placeholder="Search by customer or invoice number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <div className="inline-flex border border-border rounded overflow-hidden">
              <button
                onClick={() => setViewMode('invoice')}
                className={`px-4 py-2 text-sm transition-colors ${
                  viewMode === 'invoice'
                    ? 'bg-primary text-white'
                    : 'bg-white hover:bg-muted'
                }`}
              >
                By Invoice
              </button>
              <button
                onClick={() => setViewMode('customer')}
                className={`px-4 py-2 text-sm transition-colors ${
                  viewMode === 'customer'
                    ? 'bg-primary text-white'
                    : 'bg-white hover:bg-muted'
                }`}
              >
                By Customer
              </button>
            </div>
            <button
              onClick={() => setStatusFilter('all')}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              <Filter className="w-4 h-4" />
              <span className="text-sm">All</span>
            </button>
          </div>
        </div>

        {/* Invoice View */}
        {viewMode === 'invoice' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Invoice Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Due Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Invoice Amt</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Paid</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Balance</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground">Days</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredData.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-mono font-medium text-foreground">
                      {item.invoiceId}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-foreground">{item.customer}</div>
                      <div className="text-xs text-muted-foreground">{item.customerEmail}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{item.invoiceDate}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{item.dueDate}</td>
                    <td className="px-6 py-4 text-sm font-medium text-foreground text-right">
                      ₹{item.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-success text-right">
                      {item.paidAmount > 0 ? `₹${item.paidAmount.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-destructive text-right">
                      ₹{(item.amount - item.paidAmount).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <AgingBadge status={item.status} days={item.daysPastDue} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCall(item.customerPhone, item.customer)}
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="Call Customer"
                        >
                          <Phone className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleSendEmail(
                            item.customerEmail,
                            item.customer,
                            item.invoiceId,
                            item.amount - item.paidAmount
                          )}
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="Send Reminder"
                        >
                          <Mail className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Customer View */}
        {viewMode === 'customer' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground">Invoices</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Total Outstanding</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground">Oldest Due</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customerOutstanding.map((customer, index) => (
                  <tr key={index} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-destructive" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{customer.customer}</div>
                          <div className="text-xs text-muted-foreground">{customer.customerEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-3 py-1 bg-muted rounded text-sm font-medium">
                        {customer.invoiceCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-lg font-semibold text-destructive">
                        ₹{customer.totalOutstanding.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {customer.oldestDue > 0 ? (
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium ${
                          customer.oldestDue > 60 ? 'bg-destructive/10 text-destructive' :
                          customer.oldestDue > 30 ? 'bg-warning/10 text-warning' :
                          'bg-success/10 text-success'
                        }`}>
                          <Clock className="w-3 h-3" />
                          {customer.oldestDue} days
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Current</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCall(customer.customerPhone, customer.customer)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 border border-border bg-white rounded hover:bg-muted transition-colors"
                          title="Call Customer"
                        >
                          <Phone className="w-3 h-3" />
                          <span className="text-xs">Call</span>
                        </button>
                        <button
                          onClick={() => {
                            const customerInvoices = outstandingData.filter(i => i.customer === customer.customer);
                            const invoiceList = customerInvoices.map(i => i.invoiceId).join(', ');
                            const subject = encodeURIComponent(`Payment Reminder: Multiple Invoices`);
                            const body = encodeURIComponent(
                              `Dear ${customer.customer},\n\n` +
                              `This is a friendly reminder about outstanding payments for the following invoices:\n\n` +
                              `${customerInvoices.map(inv => `- ${inv.invoiceId}: ₹${(inv.amount - inv.paidAmount).toLocaleString()}`).join('\n')}\n\n` +
                              `Total Outstanding: ₹${customer.totalOutstanding.toLocaleString()}\n\n` +
                              `Please process the payments at your earliest convenience.\n\n` +
                              `Best regards,\n` +
                              `Your Company Name`
                            );
                            window.location.href = `mailto:${customer.customerEmail}?subject=${subject}&body=${body}`;
                            toast.success(`Email reminder opened for ${customer.customer}`);
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                          title="Send Reminder"
                        >
                          <Mail className="w-3 h-3" />
                          <span className="text-xs">Email</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredData.length === 0 && (
          <div className="py-12 text-center">
            <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">No outstanding payments found</p>
          </div>
        )}
      </div>
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
  value: string;
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
      <div className={`text-xl font-semibold ${color ? colorClasses[color] : 'text-foreground'}`}>
        {value}
      </div>
    </button>
  );
}

function AgingBadge({ status, days }: { status: string; days: number }) {
  const styles = {
    'current': 'bg-success/10 text-success',
    'overdue-30': 'bg-warning/10 text-warning',
    'overdue-60': 'bg-warning/10 text-warning',
    'overdue-90': 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {days === 0 ? 'Current' : `${days} days`}
      </span>
      {days > 0 && (
        <span className="text-xs text-muted-foreground">overdue</span>
      )}
    </div>
  );
}
