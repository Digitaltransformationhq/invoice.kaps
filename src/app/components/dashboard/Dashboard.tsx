import { Link } from 'react-router';
import { ArrowUpRight, ArrowDownRight, FileText, IndianRupee, Clock, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { selectForUser } from '../../../lib/auditorData';

interface DashboardInvoice {
  id: string;
  invoiceNumber: string;
  customer: string;
  amount: number;
  paidAmount: number;
  status: string;
  date: string;
  rawDate: string;
}

export function Dashboard() {
  const { user } = useAuth();
  const [recentInvoices, setRecentInvoices] = useState<DashboardInvoice[]>([]);
  const [allInvoices, setAllInvoices] = useState<DashboardInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const formatCompactCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
    return formatCurrency(value);
  };

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return value;
    return parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const mapInvoice = (invoice: any): DashboardInvoice => {
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      customer: customer?.name || 'Customer not selected',
      amount: Number(invoice.total_amount || 0),
      paidAmount: Number(invoice.paid_amount || 0),
      status: invoice.status || 'draft',
      date: formatDate(invoice.invoice_date),
      rawDate: invoice.invoice_date || '',
    };
  };

  useEffect(() => {
    const loadDashboard = async () => {
      if (!user?.company_id) {
        setRecentInvoices([]);
        setAllInvoices([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const { data, error } = await selectForUser<any[]>(user, 'dashboard', 'invoices', () =>
        supabase
          .from('invoices')
          .select('id, invoice_number, invoice_date, total_amount, paid_amount, status, customers(name)')
          .eq('company_id', user.company_id)
          .order('invoice_date', { ascending: false })
          .order('created_at', { ascending: false })
      );

      if (error) {
        toast.error(`Could not load dashboard: ${error.message}`);
        setRecentInvoices([]);
        setAllInvoices([]);
      } else {
        const mappedInvoices = (data || []).map(mapInvoice);
        setAllInvoices(mappedInvoices);
        setRecentInvoices(mappedInvoices.slice(0, 5));
      }

      setIsLoading(false);
    };

    loadDashboard();
  }, [user?.company_id]);

  const paidRevenue = allInvoices
    .filter((invoice) => invoice.status === 'paid')
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const pendingInvoices = allInvoices.filter((invoice) => !['paid', 'cancelled', 'draft'].includes(invoice.status));
  const pendingAmount = pendingInvoices.reduce((sum, invoice) => {
    return sum + Math.max(invoice.amount - invoice.paidAmount, 0);
  }, 0);
  const thisMonthInvoiceCount = allInvoices.filter((invoice) => {
    const invoiceDate = new Date(invoice.rawDate);
    const now = new Date();
    return !Number.isNaN(invoiceDate.getTime())
      && invoiceDate.getMonth() === now.getMonth()
      && invoiceDate.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-accent/80">Overview</div>
          <h1 className="mt-1 text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back — here's how your business is doing today.</p>
        </div>
        <Link
          to="/app/invoices/new"
          className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-full bg-accent text-white text-[13px] font-semibold shadow-[0_8px_24px_-8px_rgba(139,92,246,0.65)] hover:bg-accent/90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Invoice
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          title="Total Revenue"
          value={isLoading ? 'Loading...' : formatCompactCurrency(paidRevenue)}
          change="Paid invoices"
          trend="up"
          icon={<IndianRupee className="w-5 h-5" />}
          tone="violet"
        />
        <KPICard
          title="Total Invoices"
          value={isLoading ? 'Loading...' : allInvoices.length.toLocaleString('en-IN')}
          change={`${thisMonthInvoiceCount} this month`}
          trend="up"
          icon={<FileText className="w-5 h-5" />}
          tone="sky"
        />
        <KPICard
          title="Pending Amount"
          value={isLoading ? 'Loading...' : formatCompactCurrency(pendingAmount)}
          change={`${pendingInvoices.length} invoices`}
          trend="neutral"
          icon={<Clock className="w-5 h-5" />}
          tone="amber"
        />
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-foreground tracking-tight">Recent Invoices</h3>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wider uppercase bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300">Last 5</span>
        </div>
        <Link to="/app/invoices" className="text-[12.5px] font-medium text-accent hover:text-accent/80 transition-colors">
          View all →
        </Link>
      </div>

      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-violet-100 dark:bg-violet-500/15">
              <tr>
                <th className="px-5 py-2.5 text-left text-[10.5px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Invoice</th>
                <th className="px-5 py-2.5 text-left text-[10.5px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Customer</th>
                <th className="px-5 py-2.5 text-left text-[10.5px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Amount</th>
                <th className="px-5 py-2.5 text-left text-[10.5px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Loading invoices...
                  </td>
                </tr>
              )}
              {!isLoading && recentInvoices.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No invoices found. Create your first invoice to see it here.
                  </td>
                </tr>
              )}
              {!isLoading && recentInvoices.map((invoice) => (
                <tr key={invoice.id} className="bg-violet-50/60 dark:bg-violet-500/[0.04] hover:bg-violet-100/70 dark:hover:bg-violet-500/[0.10] transition-colors">
                  <td className="px-5 py-3">
                    <div className="text-[13px] font-mono font-medium text-foreground">{invoice.invoiceNumber}</div>
                    <div className="text-[11px] text-muted-foreground">{invoice.date}</div>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-foreground">{invoice.customer}</td>
                  <td className="px-5 py-3 text-[13px] font-semibold text-foreground text-left tabular-nums">
                    {formatCurrency(invoice.amount)}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={invoice.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPICard({
  title,
  value,
  change,
  trend,
  icon,
  tone
}: {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  tone: 'violet' | 'sky' | 'amber';
}) {
  const toneStyles = {
    violet: 'bg-gradient-to-br from-violet-500/15 to-violet-700/5 text-violet-600 dark:text-violet-300 ring-violet-500/20',
    sky: 'bg-gradient-to-br from-sky-500/15 to-sky-700/5 text-sky-600 dark:text-sky-300 ring-sky-500/20',
    amber: 'bg-gradient-to-br from-amber-500/15 to-amber-700/5 text-amber-600 dark:text-amber-300 ring-amber-500/20',
  };
  return (
    <div className="bg-card border border-violet-300 dark:border-violet-400/30 rounded-xl p-5 shadow-[0_1px_2px_rgba(139,92,246,0.08)] hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.25)] hover:border-violet-400 dark:hover:border-violet-400/50 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ring-1 ${toneStyles[tone]}`}>
          {icon}
        </div>
      </div>
      <div className="text-[28px] sm:text-[32px] font-semibold tracking-tight text-foreground tabular-nums">{value}</div>
      <div className={`mt-1.5 flex items-center gap-1 text-[12px] font-medium ${
        trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-warning'
      }`}>
        {trend === 'up' && <ArrowUpRight className="w-3.5 h-3.5" />}
        {trend === 'down' && <ArrowDownRight className="w-3.5 h-3.5" />}
        <span>{change}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground border-border',
    sent: 'bg-accent/10 text-accent border-accent/30',
    paid: 'bg-success/10 text-success border-success/30',
    pending: 'bg-warning/10 text-warning border-warning/30',
    overdue: 'bg-destructive/10 text-destructive border-destructive/30',
    cancelled: 'bg-muted text-muted-foreground border-border',
  };
  const style = styles[status] || styles.draft;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${style}`}>
      {status}
    </span>
  );
}
