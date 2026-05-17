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
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back! Here's your business overview</p>
        </div>
        <Link
          to="/app/invoices/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          title="Total Revenue"
          value={isLoading ? 'Loading...' : formatCompactCurrency(paidRevenue)}
          change="Paid invoices"
          trend="up"
          icon={<IndianRupee className="w-5 h-5 text-accent" />}
        />
        <KPICard
          title="Total Invoices"
          value={isLoading ? 'Loading...' : allInvoices.length.toLocaleString('en-IN')}
          change={`${thisMonthInvoiceCount} this month`}
          trend="up"
          icon={<FileText className="w-5 h-5 text-accent" />}
        />
        <KPICard
          title="Pending Amount"
          value={isLoading ? 'Loading...' : formatCompactCurrency(pendingAmount)}
          change={`${pendingInvoices.length} invoices`}
          trend="neutral"
          icon={<Clock className="w-5 h-5 text-warning" />}
        />
      </div>

      <div className="bg-white border border-border rounded-lg">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="font-semibold text-foreground">Recent Invoices</h3>
          <Link to="/app/invoices" className="text-sm text-accent hover:text-accent/90">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Loading invoices...
                  </td>
                </tr>
              )}
              {!isLoading && recentInvoices.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No invoices found. Create your first invoice to see it here.
                  </td>
                </tr>
              )}
              {!isLoading && recentInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-3">
                    <div className="text-sm font-medium text-foreground">{invoice.invoiceNumber}</div>
                    <div className="text-xs text-muted-foreground">{invoice.date}</div>
                  </td>
                  <td className="px-6 py-3 text-sm text-muted-foreground">{invoice.customer}</td>
                  <td className="px-6 py-3 text-sm font-medium text-foreground text-right">
                    {formatCurrency(invoice.amount)}
                  </td>
                  <td className="px-6 py-3">
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
  icon
}: {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="w-10 h-10 bg-accent/10 rounded flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="text-4xl font-bold text-foreground mb-2">{value}</div>
      <div className={`flex items-center gap-1 text-sm ${
        trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'
      }`}>
        {trend === 'up' && <ArrowUpRight className="w-4 h-4" />}
        {trend === 'down' && <ArrowDownRight className="w-4 h-4" />}
        <span>{change}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    draft: 'bg-muted text-muted-foreground',
    sent: 'bg-accent/10 text-accent',
    paid: 'bg-success/10 text-success',
    pending: 'bg-warning/10 text-warning',
    overdue: 'bg-destructive/10 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${styles[status as keyof typeof styles] || styles.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
