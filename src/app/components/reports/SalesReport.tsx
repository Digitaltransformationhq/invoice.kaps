import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { selectForUser } from '../../../lib/auditorData';

interface SalesReportProps {
  onBack: () => void;
  dateRange: { from: string; to: string };
}

interface MonthPoint {
  month: string;
  revenue: number;
  collections: number;
  invoices: number;
}

interface CustomerRow {
  customer: string;
  invoices: number;
  revenue: number;
  gst: number;
  paid: number;
  outstanding: number;
}

interface ItemRow {
  item: string;
  hsn: string;
  quantity: number;
  unit: string;
  invoices: number;
  revenue: number;
  gst: number;
}

interface Totals {
  invoices: number;
  revenue: number;
  gst: number;
  paid: number;
  outstanding: number;
}

/* Two series, validated against both surfaces with the dataviz palette checker:
 * lightness band, chroma floor, CVD separation (ΔE 32.9 protan) and contrast all
 * pass in light AND dark, so one pair serves both themes. Violet is the app
 * accent; amber is far enough away in hue to survive colour-blind viewing. */
const SERIES = {
  revenue: '#8b5cf6',
  collections: '#d97706',
};

const formatRupee = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatCompact = (value: number) => {
  if (Math.abs(value) >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const derivePeriodLabel = (range: { from: string; to: string }) => {
  if (!range.from || !range.to) return '—';
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return `${range.from} → ${range.to}`;
  }
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  return `${formatDate(range.from)} – ${formatDate(range.to)}`;
};

const downloadCSV = (rows: Record<string, any>[], filename: string, headers: string[]) => {
  if (rows.length === 0) {
    toast.error('No rows to export.');
    return;
  }
  const escape = (v: any) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export function SalesReport({ onBack, dateRange }: SalesReportProps) {
  const { user } = useAuth();
  const [groupBy, setGroupBy] = useState<'customer' | 'item'>('customer');
  const [isLoading, setIsLoading] = useState(true);

  const [months, setMonths] = useState<MonthPoint[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ invoices: 0, revenue: 0, gst: 0, paid: 0, outstanding: 0 });

  const periodLabel = useMemo(() => derivePeriodLabel(dateRange), [dateRange.from, dateRange.to]);

  useEffect(() => {
    if (!user?.company_id) return;

    const load = async () => {
      setIsLoading(true);

      // Drafts and cancellations are not sales — the same exclusion GSTR-1 uses,
      // so the two reports agree on what counts.
      const { data, error } = await selectForUser<any[]>(user, 'reports', 'invoices', () =>
        Promise.resolve(
          supabase
            .from('invoices')
            .select(`
              invoice_number,
              invoice_date,
              subtotal,
              total_tax,
              total_amount,
              paid_amount,
              customers(name),
              invoice_items(item_name, hsn, quantity, unit, taxable_amount, tax_amount)
            `)
            .eq('company_id', user.company_id)
            .gte('invoice_date', dateRange.from)
            .lte('invoice_date', dateRange.to)
            .not('status', 'in', '("draft","cancelled")')
            .order('invoice_date', { ascending: true })
        )
      );

      if (error) {
        toast.error(`Could not load sales: ${error.message}`);
        setIsLoading(false);
        return;
      }

      const invoices = data || [];
      const monthMap = new Map<string, MonthPoint & { sort: string }>();
      const customerMap = new Map<string, CustomerRow>();
      const itemMap = new Map<string, ItemRow & { invoiceKeys: Set<string> }>();
      const sum: Totals = { invoices: invoices.length, revenue: 0, gst: 0, paid: 0, outstanding: 0 };

      invoices.forEach((inv: any, index: number) => {
        const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
        const customerName = customer?.name || 'Unnamed customer';
        const invoiceKey = inv.invoice_number || `row-${index}`;

        const revenue = Number(inv.subtotal || 0);
        const gst = Number(inv.total_tax || 0);
        const total = Number(inv.total_amount || revenue + gst);
        const paid = Number(inv.paid_amount || 0);
        const outstanding = Math.max(0, total - paid);

        sum.revenue += revenue;
        sum.gst += gst;
        sum.paid += paid;
        sum.outstanding += outstanding;

        // ---- monthly trend ----
        const date = new Date(inv.invoice_date);
        if (!Number.isNaN(date.getTime())) {
          const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const label = date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
          const point = monthMap.get(sortKey) || { month: label, revenue: 0, collections: 0, invoices: 0, sort: sortKey };
          point.revenue += revenue;
          point.collections += paid;
          point.invoices += 1;
          monthMap.set(sortKey, point);
        }

        // ---- customer-wise ----
        const cRow = customerMap.get(customerName) || {
          customer: customerName,
          invoices: 0,
          revenue: 0,
          gst: 0,
          paid: 0,
          outstanding: 0,
        };
        cRow.invoices += 1;
        cRow.revenue += revenue;
        cRow.gst += gst;
        cRow.paid += paid;
        cRow.outstanding += outstanding;
        customerMap.set(customerName, cRow);

        // ---- item-wise ----
        (inv.invoice_items || []).forEach((line: any) => {
          const name = line.item_name || 'Unnamed item';
          const key = `${name}|${line.hsn || ''}`;
          const iRow = itemMap.get(key) || {
            item: name,
            hsn: line.hsn || '—',
            quantity: 0,
            unit: line.unit || '',
            invoices: 0,
            revenue: 0,
            gst: 0,
            invoiceKeys: new Set<string>(),
          };
          iRow.quantity += Number(line.quantity || 0);
          iRow.revenue += Number(line.taxable_amount || 0);
          iRow.gst += Number(line.tax_amount || 0);
          if (!iRow.unit && line.unit) iRow.unit = line.unit;
          iRow.invoiceKeys.add(invoiceKey);
          itemMap.set(key, iRow);
        });
      });

      setMonths(
        Array.from(monthMap.values())
          .sort((a, b) => a.sort.localeCompare(b.sort))
          .map(({ sort, ...point }) => point)
      );
      setCustomers(Array.from(customerMap.values()).sort((a, b) => b.revenue - a.revenue));
      setItems(
        Array.from(itemMap.values())
          .map(({ invoiceKeys, ...row }) => ({ ...row, invoices: invoiceKeys.size }))
          .sort((a, b) => b.revenue - a.revenue)
      );
      setTotals(sum);
      setIsLoading(false);
    };

    load();
  }, [user?.company_id, dateRange.from, dateRange.to]);

  const collectedPct = totals.revenue + totals.gst > 0
    ? (totals.paid / (totals.revenue + totals.gst)) * 100
    : 0;

  const exportBreakdown = () => {
    if (groupBy === 'customer') {
      downloadCSV(
        customers.map((c) => ({
          Customer: c.customer,
          Invoices: c.invoices,
          'Taxable Value': c.revenue.toFixed(2),
          GST: c.gst.toFixed(2),
          Received: c.paid.toFixed(2),
          Outstanding: c.outstanding.toFixed(2),
        })),
        `sales-by-customer-${dateRange.from}-to-${dateRange.to}.csv`,
        ['Customer', 'Invoices', 'Taxable Value', 'GST', 'Received', 'Outstanding']
      );
      return;
    }
    downloadCSV(
      items.map((i) => ({
        Item: i.item,
        HSN: i.hsn,
        Quantity: i.quantity,
        Unit: i.unit,
        Invoices: i.invoices,
        'Taxable Value': i.revenue.toFixed(2),
        GST: i.gst.toFixed(2),
        Total: (i.revenue + i.gst).toFixed(2),
      })),
      `sales-by-item-${dateRange.from}-to-${dateRange.to}.csv`,
      ['Item', 'HSN', 'Quantity', 'Unit', 'Invoices', 'Taxable Value', 'GST', 'Total']
    );
  };

  const tooltipStyle = {
    borderRadius: 10,
    border: '1px solid rgba(139,92,246,0.3)',
    background: 'var(--color-card, #fff)',
    fontSize: 12,
    boxShadow: '0 8px 24px -12px rgba(139,92,246,0.45)',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={onBack}
            className="p-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300">
              Business Analytics
            </div>
            <h1 className="text-[22px] sm:text-[24px] font-semibold text-foreground tracking-tight leading-tight">
              Sales Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sales, collections and dues • {periodLabel}
            </p>
          </div>
        </div>
        <button
          onClick={exportBreakdown}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 h-10 bg-violet-500 text-white rounded-lg text-[13px] font-semibold shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)] hover:bg-violet-600 transition-colors disabled:opacity-60"
        >
          <FileText className="w-4 h-4" />
          Download CSV
        </button>
      </div>

      {isLoading ? (
        <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-12 flex items-center justify-center gap-3 text-sm text-muted-foreground shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading sales…
        </div>
      ) : totals.invoices === 0 ? (
        <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-12 text-center shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <p className="text-sm text-muted-foreground">
            No invoices in this period. Drafts and cancelled invoices are not counted as sales.
          </p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryStat label="Invoices" value={String(totals.invoices)} />
            <SummaryStat label="Taxable Value" value={`₹${formatRupee(totals.revenue)}`} />
            <SummaryStat label="GST" value={`₹${formatRupee(totals.gst)}`} />
            <SummaryStat
              label="Received"
              value={`₹${formatRupee(totals.paid)}`}
              hint={`${collectedPct.toFixed(1)}% of billed`}
              valueClass="text-success"
            />
            <SummaryStat
              label="Outstanding"
              value={`₹${formatRupee(totals.outstanding)}`}
              valueClass={totals.outstanding > 0 ? 'text-destructive' : undefined}
            />
          </div>

          {/* Charts — revenue and collections share the rupee axis; invoice count
              gets its own chart rather than a second scale on the same one. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Billed vs received" subtitle="Taxable value against payments recorded, by month">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={months} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-violet-200 dark:text-violet-400/20" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatCompact} width={62} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: any, name: any) => [`₹${formatRupee(Number(value))}`, name]}
                  />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Billed"
                    stroke={SERIES.revenue}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="collections"
                    name="Received"
                    stroke={SERIES.collections}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Invoices issued" subtitle="Count per month">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={months} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-violet-200 dark:text-violet-400/20" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => [value, 'Invoices']} />
                  <Bar dataKey="invoices" name="Invoices" fill={SERIES.revenue} radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Breakdown */}
          <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
            <div className="p-5 md:p-6 border-b border-violet-100 dark:border-violet-400/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Detailed breakdown</h3>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {groupBy === 'customer'
                    ? `${customers.length} customer${customers.length === 1 ? '' : 's'}, highest billed first`
                    : `${items.length} item${items.length === 1 ? '' : 's'}, highest billed first`}
                </p>
              </div>
              <div className="inline-flex p-1 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-400/25">
                {(['customer', 'item'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setGroupBy(mode)}
                    className={`px-3 h-8 rounded-md text-[12.5px] font-medium transition-colors ${
                      groupBy === mode
                        ? 'bg-violet-500 text-white shadow-[0_2px_8px_-3px_rgba(139,92,246,0.6)]'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {mode === 'customer' ? 'By customer' : 'By item'}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              {groupBy === 'customer' ? (
                <table className="w-full">
                  <ReportTableHead headers={['Customer', 'Invoices', 'Taxable Value', 'GST', 'Received', 'Outstanding']} />
                  <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
                    {customers.map((row) => (
                      <tr key={row.customer} className="hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.06] transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{row.customer}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.invoices}</td>
                        <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(row.revenue)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">₹{formatRupee(row.gst)}</td>
                        <td className="px-4 py-3 text-sm text-success tabular-nums">₹{formatRupee(row.paid)}</td>
                        <td className={`px-4 py-3 text-sm tabular-nums ${row.outstanding > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          {row.outstanding > 0 ? `₹${formatRupee(row.outstanding)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-violet-50/70 dark:bg-violet-500/[0.08] border-t border-violet-200 dark:border-violet-400/25 font-semibold">
                      <td className="px-4 py-3 text-sm text-foreground">Total</td>
                      <td className="px-4 py-3 text-sm text-foreground tabular-nums">{totals.invoices}</td>
                      <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(totals.revenue)}</td>
                      <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(totals.gst)}</td>
                      <td className="px-4 py-3 text-sm text-success tabular-nums">₹{formatRupee(totals.paid)}</td>
                      <td className="px-4 py-3 text-sm text-destructive tabular-nums">₹{formatRupee(totals.outstanding)}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <table className="w-full">
                  <ReportTableHead headers={['Item / Service', 'HSN', 'Qty', 'Unit', 'Invoices', 'Taxable Value', 'GST', 'Total']} />
                  <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
                    {items.map((row) => (
                      <tr key={`${row.item}-${row.hsn}`} className="hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.06] transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{row.item}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{row.hsn}</td>
                        <td className="px-4 py-3 text-sm text-foreground tabular-nums">{row.quantity.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{row.unit || '—'}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.invoices}</td>
                        <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(row.revenue)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">₹{formatRupee(row.gst)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground tabular-nums">₹{formatRupee(row.revenue + row.gst)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-violet-50/70 dark:bg-violet-500/[0.08] border-t border-violet-200 dark:border-violet-400/25 font-semibold">
                      <td className="px-4 py-3 text-sm text-foreground" colSpan={5}>Total</td>
                      <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                        ₹{formatRupee(items.reduce((s, i) => s + i.revenue, 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                        ₹{formatRupee(items.reduce((s, i) => s + i.gst, 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                        ₹{formatRupee(items.reduce((s, i) => s + i.revenue + i.gst, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 shadow-[0_1px_2px_rgba(139,92,246,0.08)]">
      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{label}</div>
      <div className={`text-[20px] sm:text-[22px] font-semibold tracking-tight tabular-nums break-words ${valueClass || 'text-foreground'}`}>
        {value}
      </div>
      {hint && <div className="text-[11.5px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
      <h3 className="text-[16px] font-semibold text-foreground tracking-tight">{title}</h3>
      <p className="text-[13px] text-muted-foreground mt-0.5 mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

function ReportTableHead({ headers }: { headers: string[] }) {
  return (
    <thead className="bg-violet-100 dark:bg-violet-500/15">
      <tr>
        {headers.map((h) => (
          <th
            key={h}
            className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 whitespace-nowrap"
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}
