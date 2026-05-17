import { useState } from 'react';
import { Calendar, Download, FileText, TrendingUp, PieChart, BarChart3, FileSpreadsheet, Filter } from 'lucide-react';
import { GSTR1Report } from './GSTR1Report';
import { SalesReport } from './SalesReport';
import { TaxSummaryReport } from './TaxSummaryReport';

type ReportType = 'gstr1' | 'sales' | 'tax-summary' | 'revenue' | 'customer-statement' | 'item-sales';

export function ReportsDashboard() {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [dateRange, setDateRange] = useState({
    from: '2026-04-01',
    to: '2026-05-12'
  });

  const reports = [
    {
      id: 'gstr1' as ReportType,
      title: 'GSTR-1 Report',
      description: 'GST Return filing report for outward supplies',
      icon: FileSpreadsheet,
      color: 'bg-primary/10 text-primary',
      category: 'GST Compliance',
      frequency: 'Monthly'
    },
    {
      id: 'sales' as ReportType,
      title: 'Sales Report',
      description: 'Detailed sales analysis with invoices and payments',
      icon: TrendingUp,
      color: 'bg-success/10 text-success',
      category: 'Business Analytics',
      frequency: 'Daily/Monthly'
    },
    {
      id: 'tax-summary' as ReportType,
      title: 'Tax Summary',
      description: 'CGST, SGST, IGST summary and tax liability',
      icon: PieChart,
      color: 'bg-warning/10 text-warning',
      category: 'GST Compliance',
      frequency: 'Monthly/Quarterly'
    },
    {
      id: 'revenue' as ReportType,
      title: 'Revenue Analytics',
      description: 'Revenue trends, growth analysis, and forecasting',
      icon: BarChart3,
      color: 'bg-accent/10 text-accent',
      category: 'Business Analytics',
      frequency: 'Monthly/Quarterly'
    },
    {
      id: 'customer-statement' as ReportType,
      title: 'Customer Statement',
      description: 'Customer-wise transaction statement and outstanding',
      icon: FileText,
      color: 'bg-primary/10 text-primary',
      category: 'Customer Reports',
      frequency: 'On-demand'
    },
    {
      id: 'item-sales' as ReportType,
      title: 'Item Sales Report',
      description: 'Product/Service wise sales analysis',
      icon: BarChart3,
      color: 'bg-success/10 text-success',
      category: 'Business Analytics',
      frequency: 'Monthly'
    }
  ];

  const quickStats = {
    totalInvoices: 175,
    totalRevenue: 1250000,
    totalGST: 225000,
    totalReceipts: 987000,
  };

  if (selectedReport === 'gstr1') {
    return <GSTR1Report onBack={() => setSelectedReport(null)} dateRange={dateRange} />;
  }

  if (selectedReport === 'sales') {
    return <SalesReport onBack={() => setSelectedReport(null)} dateRange={dateRange} />;
  }

  if (selectedReport === 'tax-summary') {
    return <TaxSummaryReport onBack={() => setSelectedReport(null)} dateRange={dateRange} />;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reports & GSTR-1</h1>
          <p className="text-sm text-muted-foreground mt-1">Generate GST compliance and business reports</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">This Month</span>
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white border border-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-accent" />
          <h3 className="font-semibold text-foreground">Report Period</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              From Date
            </label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              To Date
            </label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-end gap-2">
            <button className="flex-1 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors">
              Apply Filter
            </button>
            <button className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Total Invoices</div>
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="text-4xl font-bold text-foreground">{quickStats.totalInvoices}</div>
          <div className="text-xs text-success mt-1">This period</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Total Revenue</div>
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <div className="text-4xl font-bold text-foreground">
            ₹{(quickStats.totalRevenue / 100000).toFixed(1)}L
          </div>
          <div className="text-xs text-success mt-1">+12.5% from last period</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Total GST</div>
            <PieChart className="w-5 h-5 text-warning" />
          </div>
          <div className="text-4xl font-bold text-foreground">
            ₹{(quickStats.totalGST / 100000).toFixed(1)}L
          </div>
          <div className="text-xs text-muted-foreground mt-1">Tax collected</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Collections</div>
            <BarChart3 className="w-5 h-5 text-accent" />
          </div>
          <div className="text-4xl font-bold text-foreground">
            ₹{(quickStats.totalReceipts / 100000).toFixed(1)}L
          </div>
          <div className="text-xs text-warning mt-1">
            ₹{((quickStats.totalRevenue - quickStats.totalReceipts) / 1000).toFixed(0)}K pending
          </div>
        </div>
      </div>

      {/* Reports Grid */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Available Reports</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <button
              key={report.id}
              onClick={() => setSelectedReport(report.id)}
              className="bg-white border border-border rounded-lg p-6 text-left hover:shadow-md transition-all hover:border-accent"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${report.color}`}>
                  <report.icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground mb-1">{report.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    {report.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-2 py-1 bg-muted rounded text-muted-foreground">
                      {report.category}
                    </span>
                    <span className="text-xs text-muted-foreground">{report.frequency}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* GST Filing Reminders */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
            <Calendar className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">GST Filing Reminder</h3>
            <p className="text-sm text-muted-foreground mb-4">
              GSTR-1 for the month of April 2026 is due on 11th May 2026. Generate your report and file on time to avoid penalties.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedReport('gstr1')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Generate GSTR-1
              </button>
              <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
                <Download className="w-4 h-4" />
                Download JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
