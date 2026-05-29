import { useEffect, useMemo, useState } from 'react';
import { Calendar, Download, FileText, TrendingUp, PieChart, BarChart3, FileSpreadsheet, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { GSTR1Report } from './GSTR1Report';
import { SalesReport } from './SalesReport';
import { TaxSummaryReport } from './TaxSummaryReport';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { selectForUser } from '../../../lib/auditorData';

type ReportType = 'gstr1' | 'sales' | 'tax-summary' | 'revenue' | 'customer-statement' | 'item-sales';

const todayIso = () => new Date().toISOString().split('T')[0];
const startOfFinancialYearIso = () => {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
};

export function ReportsDashboard() {
  const { user } = useAuth();
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [dateRange, setDateRange] = useState({
    from: startOfFinancialYearIso(),
    to: todayIso(),
  });
  const [appliedRange, setAppliedRange] = useState(dateRange);
  const [isLoading, setIsLoading] = useState(true);
  const [quickStats, setQuickStats] = useState({
    totalInvoices: 0,
    totalRevenue: 0,
    totalGST: 0,
    totalReceipts: 0,
  });

  useEffect(() => {
    if (!user?.company_id) return;

    const load = async () => {
      setIsLoading(true);
      const [invoicesRes, receiptsRes] = await Promise.all([
        selectForUser<any[]>(user, 'reports', 'invoices', () =>
          Promise.resolve(
            supabase
              .from('invoices')
              .select('id, total_amount, total_tax, status, invoice_date')
              .eq('company_id', user.company_id)
              .gte('invoice_date', appliedRange.from)
              .lte('invoice_date', appliedRange.to)
          ),
        ),
        selectForUser<any[]>(user, 'reports', 'receipts', () =>
          Promise.resolve(
            supabase
              .from('receipts')
              .select('id, amount, status, receipt_date')
              .eq('company_id', user.company_id)
              .eq('status', 'cleared')
              .gte('receipt_date', appliedRange.from)
              .lte('receipt_date', appliedRange.to)
          ),
        ),
      ]);

      const invoices = invoicesRes.data || [];
      const receipts = receiptsRes.data || [];

      setQuickStats({
        totalInvoices: invoices.filter((i: any) => i.status !== 'draft' && i.status !== 'cancelled').length,
        totalRevenue: invoices
          .filter((i: any) => i.status !== 'draft' && i.status !== 'cancelled')
          .reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0),
        totalGST: invoices
          .filter((i: any) => i.status !== 'draft' && i.status !== 'cancelled')
          .reduce((s: number, i: any) => s + Number(i.total_tax || 0), 0),
        totalReceipts: receipts.reduce((s: number, r: any) => s + Number(r.amount || 0), 0),
      });

      if (invoicesRes.error) toast.error(`Could not load invoice totals: ${invoicesRes.error.message}`);
      setIsLoading(false);
    };

    load();
  }, [user?.company_id, appliedRange.from, appliedRange.to]);

  const reports = useMemo(() => [
    {
      id: 'gstr1' as ReportType,
      title: 'GSTR-1 Report',
      description: 'GST Return filing report for outward supplies',
      icon: FileSpreadsheet,
      color: 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300',
      category: 'GST Compliance',
      frequency: 'Monthly',
      available: true,
    },
    {
      id: 'sales' as ReportType,
      title: 'Sales Report',
      description: 'Detailed sales analysis with invoices and payments',
      icon: TrendingUp,
      color: 'bg-success/10 text-success',
      category: 'Business Analytics',
      frequency: 'Daily/Monthly',
      available: true,
    },
    {
      id: 'tax-summary' as ReportType,
      title: 'Tax Summary',
      description: 'CGST, SGST, IGST summary and tax liability',
      icon: PieChart,
      color: 'bg-warning/10 text-warning',
      category: 'GST Compliance',
      frequency: 'Monthly/Quarterly',
      available: true,
    },
    {
      id: 'revenue' as ReportType,
      title: 'Revenue Analytics',
      description: 'Revenue trends, growth analysis, and forecasting',
      icon: BarChart3,
      color: 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300',
      category: 'Business Analytics',
      frequency: 'Monthly/Quarterly',
      available: false,
    },
    {
      id: 'customer-statement' as ReportType,
      title: 'Customer Statement',
      description: 'Customer-wise transaction statement and outstanding',
      icon: FileText,
      color: 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300',
      category: 'Customer Reports',
      frequency: 'On-demand',
      available: false,
    },
    {
      id: 'item-sales' as ReportType,
      title: 'Item Sales Report',
      description: 'Product/Service wise sales analysis',
      icon: BarChart3,
      color: 'bg-success/10 text-success',
      category: 'Business Analytics',
      frequency: 'Monthly',
      available: false,
    },
  ], []);

  if (selectedReport === 'gstr1') {
    return <GSTR1Report onBack={() => setSelectedReport(null)} dateRange={appliedRange} />;
  }
  if (selectedReport === 'sales') {
    return <SalesReport onBack={() => setSelectedReport(null)} dateRange={appliedRange} />;
  }
  if (selectedReport === 'tax-summary') {
    return <TaxSummaryReport onBack={() => setSelectedReport(null)} dateRange={appliedRange} />;
  }

  const presetThisMonth = () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const to = todayIso();
    setDateRange({ from, to });
    setAppliedRange({ from, to });
  };

  const formatLakh = (value: number) => `${(value / 100000).toFixed(2)}`;
  const collectionsPending = Math.max(0, quickStats.totalRevenue - quickStats.totalReceipts);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300">
            Reporting Suite
          </div>
          <h1 className="text-[22px] sm:text-[24px] font-semibold text-foreground tracking-tight leading-tight">
            Reports &amp; GSTR-1
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Generate GST compliance and business reports from your live data.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={presetThisMonth}
            className="inline-flex items-center gap-2 px-4 h-10 border border-violet-200 dark:border-violet-400/25 bg-card rounded-lg text-[13px] font-medium text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            This Month
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-6 w-6 rounded-full bg-violet-500 text-white flex items-center justify-center">
            <Filter className="w-3.5 h-3.5" strokeWidth={2.5} />
          </div>
          <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Report Period</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">From Date</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
            />
          </div>
          <div>
            <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">To Date</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              className="w-full px-3.5 h-11 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={() => setAppliedRange(dateRange)}
              className="flex-1 px-4 h-11 bg-violet-500 text-white rounded-lg text-[13px] font-semibold shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)] hover:bg-violet-600 transition-colors"
            >
              Apply Filter
            </button>
            <button
              onClick={() => {
                const reset = { from: startOfFinancialYearIso(), to: todayIso() };
                setDateRange(reset);
                setAppliedRange(reset);
              }}
              className="px-4 h-11 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded-lg text-[13px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Invoices"
          value={isLoading ? '—' : String(quickStats.totalInvoices)}
          icon={FileText}
          iconClass="text-violet-600 dark:text-violet-300"
          footer="In selected period"
        />
        <StatCard
          label="Total Revenue"
          value={isLoading ? '—' : `₹${formatLakh(quickStats.totalRevenue)}L`}
          icon={TrendingUp}
          iconClass="text-success"
          footer="Issued invoices total"
        />
        <StatCard
          label="Total GST"
          value={isLoading ? '—' : `₹${formatLakh(quickStats.totalGST)}L`}
          icon={PieChart}
          iconClass="text-warning"
          footer="Tax collected"
        />
        <StatCard
          label="Collections"
          value={isLoading ? '—' : `₹${formatLakh(quickStats.totalReceipts)}L`}
          icon={BarChart3}
          iconClass="text-violet-600 dark:text-violet-300"
          footer={isLoading ? ' ' : collectionsPending > 0 ? `₹${(collectionsPending / 1000).toFixed(0)}K pending` : 'Fully collected'}
          footerClass={collectionsPending > 0 ? 'text-warning' : 'text-success'}
        />
      </div>

      {/* Reports Grid */}
      <div>
        <h2 className="text-[16px] font-semibold text-foreground mb-4 tracking-tight">Available Reports</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => {
            const disabled = !report.available;
            return (
              <button
                key={report.id}
                onClick={() => {
                  if (disabled) {
                    toast.info(`${report.title} is coming soon — we're wiring it up.`);
                    return;
                  }
                  setSelectedReport(report.id);
                }}
                disabled={disabled}
                className={`bg-card border rounded-xl p-5 md:p-6 text-left transition-all shadow-[0_1px_2px_rgba(139,92,246,0.06)] ${
                  disabled
                    ? 'border-violet-200/60 dark:border-violet-400/15 opacity-65 cursor-not-allowed'
                    : 'border-violet-200 dark:border-violet-400/25 hover:border-violet-400 dark:hover:border-violet-400/55 hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.25)]'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${report.color}`}>
                    <report.icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground tracking-tight">{report.title}</h3>
                      {disabled && (
                        <span className="shrink-0 px-2 py-0.5 rounded-md bg-muted text-[9.5px] font-bold tracking-wider uppercase text-muted-foreground">
                          Soon
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-relaxed mt-1 mb-3">
                      {report.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] px-2 py-1 rounded-md bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-400/20 text-violet-700 dark:text-violet-300 font-semibold uppercase tracking-wider">
                        {report.category}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{report.frequency}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* GST Filing Reminder */}
      <div className="bg-violet-50/60 dark:bg-violet-500/[0.06] border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="w-12 h-12 bg-violet-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground tracking-tight mb-1">GST Filing Reminder</h3>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              GSTR-1 is due on the 11th of the following month for monthly filers. Generate the report from your live invoices and download the JSON to upload to the GST Portal.
            </p>
            <div className="flex flex-row items-stretch gap-2 sm:gap-3 sm:flex-wrap">
              <button
                onClick={() => setSelectedReport('gstr1')}
                className="inline-flex items-center justify-center gap-2 px-4 h-10 bg-violet-500 text-white rounded-lg text-[13px] font-semibold shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)] hover:bg-violet-600 transition-colors whitespace-nowrap flex-1 sm:flex-initial"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Generate GSTR-1
              </button>
              <button
                onClick={() => toast.info('Generate the GSTR-1 report first, then use the Download JSON button there.')}
                className="inline-flex items-center justify-center gap-2 px-4 h-10 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded-lg text-[13px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors whitespace-nowrap flex-1 sm:flex-initial"
              >
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

function StatCard({
  label,
  value,
  icon: Icon,
  iconClass,
  footer,
  footerClass,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  footer?: string;
  footerClass?: string;
}) {
  return (
    <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.08)]">
      <div className="flex items-start justify-between mb-3">
        <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
        <Icon className={`w-5 h-5 ${iconClass || 'text-violet-600'}`} />
      </div>
      <div className="text-[28px] sm:text-[32px] font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </div>
      {footer && (
        <div className={`text-[11px] mt-1 ${footerClass || 'text-muted-foreground'}`}>{footer}</div>
      )}
    </div>
  );
}
