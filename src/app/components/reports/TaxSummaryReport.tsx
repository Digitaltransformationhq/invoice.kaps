import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { selectForUser } from '../../../lib/auditorData';

interface TaxSummaryReportProps {
  onBack: () => void;
  dateRange: { from: string; to: string };
}

interface MonthTax {
  month: string;
  cgst: number;
  sgst: number;
  igst: number;
}

interface RateRow {
  rate: number;
  invoices: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface HsnRow {
  hsn: string;
  description: string;
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface Totals {
  invoices: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/* Three series, checked with the dataviz validator against both surfaces:
 * lightness band, chroma floor, CVD separation (worst adjacent ΔE 12.5 protan)
 * and contrast all pass in light AND dark, so one set serves both themes. */
const SERIES = {
  cgst: '#8b5cf6',
  sgst: '#d97706',
  igst: '#0d9488',
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

export function TaxSummaryReport({ onBack, dateRange }: TaxSummaryReportProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [months, setMonths] = useState<MonthTax[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [hsn, setHsn] = useState<HsnRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ invoices: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 });

  const periodLabel = useMemo(() => derivePeriodLabel(dateRange), [dateRange.from, dateRange.to]);

  useEffect(() => {
    if (!user?.company_id) return;

    const load = async () => {
      setIsLoading(true);

      const { data, error } = await selectForUser<any[]>(user, 'reports', 'invoices', () =>
        Promise.resolve(
          supabase
            .from('invoices')
            .select(`
              invoice_number,
              invoice_date,
              subtotal,
              total_tax,
              cgst,
              sgst,
              igst,
              invoice_items(item_name, hsn, gst_rate, taxable_amount, tax_amount)
            `)
            .eq('company_id', user.company_id)
            .gte('invoice_date', dateRange.from)
            .lte('invoice_date', dateRange.to)
            .not('status', 'in', '("draft","cancelled")')
            .order('invoice_date', { ascending: true })
        )
      );

      if (error) {
        toast.error(`Could not load tax data: ${error.message}`);
        setIsLoading(false);
        return;
      }

      const invoices = data || [];
      const monthMap = new Map<string, MonthTax & { sort: string }>();
      const rateMap = new Map<number, RateRow & { invoiceKeys: Set<string> }>();
      const hsnMap = new Map<string, HsnRow>();
      const sum: Totals = { invoices: invoices.length, taxable: 0, cgst: 0, sgst: 0, igst: 0 };

      invoices.forEach((inv: any, index: number) => {
        const invoiceKey = inv.invoice_number || `row-${index}`;
        const invoiceIgst = Number(inv.igst || 0);
        const isInterState = invoiceIgst > 0;

        sum.taxable += Number(inv.subtotal || 0);
        sum.cgst += Number(inv.cgst || 0);
        sum.sgst += Number(inv.sgst || 0);
        sum.igst += invoiceIgst;

        // ---- monthly liability ----
        const date = new Date(inv.invoice_date);
        if (!Number.isNaN(date.getTime())) {
          const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const label = date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
          const point = monthMap.get(sortKey) || { month: label, cgst: 0, sgst: 0, igst: 0, sort: sortKey };
          point.cgst += Number(inv.cgst || 0);
          point.sgst += Number(inv.sgst || 0);
          point.igst += invoiceIgst;
          monthMap.set(sortKey, point);
        }

        (inv.invoice_items || []).forEach((line: any) => {
          const gstRate = Number(line.gst_rate || 0);
          const itemTaxable = Number(line.taxable_amount || 0);
          const itemTax = Number(line.tax_amount || 0);

          // Per-line split mirrors the invoice, the same rule GSTR-1 applies, so
          // the HSN tables in the two reports reconcile.
          const itemCgst = isInterState ? 0 : itemTax / 2;
          const itemSgst = isInterState ? 0 : itemTax / 2;
          const itemIgst = isInterState ? itemTax : 0;

          // ---- rate-wise ----
          const rRow = rateMap.get(gstRate) || {
            rate: gstRate,
            invoices: 0,
            taxable: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            invoiceKeys: new Set<string>(),
          };
          rRow.taxable += itemTaxable;
          rRow.cgst += itemCgst;
          rRow.sgst += itemSgst;
          rRow.igst += itemIgst;
          rRow.invoiceKeys.add(invoiceKey);
          rateMap.set(gstRate, rRow);

          // ---- HSN-wise ----
          const hsnCode = (line.hsn || '').trim() || '—';
          const key = `${hsnCode}__${gstRate}`;
          const hRow = hsnMap.get(key) || {
            hsn: hsnCode,
            description: line.item_name || '',
            rate: gstRate,
            taxable: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
          };
          hRow.taxable += itemTaxable;
          hRow.cgst += itemCgst;
          hRow.sgst += itemSgst;
          hRow.igst += itemIgst;
          hsnMap.set(key, hRow);
        });
      });

      setMonths(
        Array.from(monthMap.values())
          .sort((a, b) => a.sort.localeCompare(b.sort))
          .map(({ sort, ...point }) => point)
      );
      setRates(
        Array.from(rateMap.values())
          .map(({ invoiceKeys, ...row }) => ({ ...row, invoices: invoiceKeys.size }))
          .sort((a, b) => a.rate - b.rate)
      );
      setHsn(Array.from(hsnMap.values()).sort((a, b) => b.taxable - a.taxable));
      setTotals(sum);
      setIsLoading(false);
    };

    load();
  }, [user?.company_id, dateRange.from, dateRange.to]);

  const totalTax = totals.cgst + totals.sgst + totals.igst;
  const effectiveRate = totals.taxable > 0 ? (totalTax / totals.taxable) * 100 : 0;

  const exportHsn = () => {
    downloadCSV(
      hsn.map((h) => ({
        'HSN/SAC': h.hsn,
        Description: h.description,
        'Rate %': h.rate,
        'Taxable Value': h.taxable.toFixed(2),
        CGST: h.cgst.toFixed(2),
        SGST: h.sgst.toFixed(2),
        IGST: h.igst.toFixed(2),
        'Total Tax': (h.cgst + h.sgst + h.igst).toFixed(2),
      })),
      `tax-summary-hsn-${dateRange.from}-to-${dateRange.to}.csv`,
      ['HSN/SAC', 'Description', 'Rate %', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax']
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
              GST Compliance
            </div>
            <h1 className="text-[22px] sm:text-[24px] font-semibold text-foreground tracking-tight leading-tight">
              Tax Summary
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Output tax on your sales • {periodLabel}
            </p>
          </div>
        </div>
        <button
          onClick={exportHsn}
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
          Loading tax data…
        </div>
      ) : totals.invoices === 0 ? (
        <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-12 text-center shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <p className="text-sm text-muted-foreground">
            No invoices in this period. Drafts and cancelled invoices carry no tax liability.
          </p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryStat label="Tax Invoices" value={String(totals.invoices)} />
            <SummaryStat label="Taxable Value" value={`₹${formatRupee(totals.taxable)}`} />
            <SummaryStat label="Total Tax" value={`₹${formatRupee(totalTax)}`} valueClass="text-violet-700 dark:text-violet-300" />
            <SummaryStat label="Effective Rate" value={`${effectiveRate.toFixed(2)}%`} hint="Tax over taxable value" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Monthly liability" subtitle="CGST, SGST and IGST stacked by month">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={months} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-violet-200 dark:text-violet-400/20" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatCompact} width={62} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: any, name: any) => [`₹${formatRupee(Number(value))}`, name]} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  {/* A 2px surface-coloured stroke keeps the stacked segments from
                      touching, so each band stays readable at small heights. */}
                  <Bar dataKey="cgst" name="CGST" stackId="tax" fill={SERIES.cgst} stroke="var(--color-card, #fff)" strokeWidth={2} maxBarSize={48} />
                  <Bar dataKey="sgst" name="SGST" stackId="tax" fill={SERIES.sgst} stroke="var(--color-card, #fff)" strokeWidth={2} maxBarSize={48} />
                  <Bar dataKey="igst" name="IGST" stackId="tax" fill={SERIES.igst} stroke="var(--color-card, #fff)" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Taxable value by rate" subtitle="Which GST slabs your sales fall into">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={rates} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-violet-200 dark:text-violet-400/20" vertical={false} />
                  <XAxis dataKey="rate" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(r: any) => `${r}%`} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatCompact} width={62} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(r: any) => `${r}% slab`}
                    formatter={(value: any) => [`₹${formatRupee(Number(value))}`, 'Taxable value']}
                  />
                  <Bar dataKey="taxable" name="Taxable value" fill={SERIES.cgst} radius={[4, 4, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Liability */}
          <div className="bg-violet-50/50 dark:bg-violet-500/[0.05] border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6">
            <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Output tax liability</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Tax charged on sales for {periodLabel}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
              <LiabilityCard label="CGST" value={totals.cgst} />
              <LiabilityCard label="SGST" value={totals.sgst} />
              <LiabilityCard label="IGST" value={totals.igst} />
              <LiabilityCard label="Total" value={totalTax} accent />
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed mt-4">
              This is output tax only. GSTR-3B is filed net of input tax credit on your
              purchases, which this app does not hold — take these figures to your purchase
              records or your CA before paying.
            </p>
          </div>

          {/* Rate-wise */}
          <TableCard title="Rate-wise summary" subtitle={`${rates.length} slab${rates.length === 1 ? '' : 's'} in use`}>
            <table className="w-full">
              <ReportTableHead headers={['Rate', 'Invoices', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax']} />
              <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
                {rates.map((row) => (
                  <tr key={row.rate} className="hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.06] transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center px-2.5 h-7 rounded-md bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[12.5px] font-semibold tabular-nums">
                        {row.rate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.invoices}</td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(row.taxable)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.cgst > 0 ? `₹${formatRupee(row.cgst)}` : '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.sgst > 0 ? `₹${formatRupee(row.sgst)}` : '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.igst > 0 ? `₹${formatRupee(row.igst)}` : '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground tabular-nums">
                      ₹{formatRupee(row.cgst + row.sgst + row.igst)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-violet-50/70 dark:bg-violet-500/[0.08] border-t border-violet-200 dark:border-violet-400/25 font-semibold">
                  <td className="px-4 py-3 text-sm text-foreground">Total</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">{totals.invoices}</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(rates.reduce((s, r) => s + r.taxable, 0))}</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(rates.reduce((s, r) => s + r.cgst, 0))}</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(rates.reduce((s, r) => s + r.sgst, 0))}</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(rates.reduce((s, r) => s + r.igst, 0))}</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                    ₹{formatRupee(rates.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </TableCard>

          {/* HSN-wise */}
          <TableCard
            title="HSN/SAC-wise summary"
            subtitle={`${hsn.length} code${hsn.length === 1 ? '' : 's'}, highest taxable value first`}
          >
            <table className="w-full">
              <ReportTableHead headers={['HSN/SAC', 'Description', 'Rate', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax']} />
              <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
                {hsn.map((row) => (
                  <tr key={`${row.hsn}-${row.rate}`} className="hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.06] transition-colors">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-foreground">{row.hsn}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.rate}%</td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(row.taxable)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.cgst > 0 ? `₹${formatRupee(row.cgst)}` : '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.sgst > 0 ? `₹${formatRupee(row.sgst)}` : '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.igst > 0 ? `₹${formatRupee(row.igst)}` : '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground tabular-nums">
                      ₹{formatRupee(row.cgst + row.sgst + row.igst)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-violet-50/70 dark:bg-violet-500/[0.08] border-t border-violet-200 dark:border-violet-400/25 font-semibold">
                  <td className="px-4 py-3 text-sm text-foreground" colSpan={3}>Total</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(hsn.reduce((s, h) => s + h.taxable, 0))}</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(hsn.reduce((s, h) => s + h.cgst, 0))}</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(hsn.reduce((s, h) => s + h.sgst, 0))}</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">₹{formatRupee(hsn.reduce((s, h) => s + h.igst, 0))}</td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                    ₹{formatRupee(hsn.reduce((s, h) => s + h.cgst + h.sgst + h.igst, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </TableCard>
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

function LiabilityCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`p-4 rounded-lg border ${
        accent
          ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-300 dark:border-violet-400/30'
          : 'bg-card border-violet-200/70 dark:border-violet-400/20'
      }`}
    >
      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{label}</div>
      <div
        className={`text-[18px] sm:text-[20px] font-semibold tracking-tight tabular-nums break-words ${
          accent ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'
        }`}
      >
        ₹{formatRupee(value)}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
      <h3 className="text-[16px] font-semibold text-foreground tracking-tight">{title}</h3>
      <p className="text-[13px] text-muted-foreground mt-0.5 mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

function TableCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
      <div className="p-5 md:p-6 border-b border-violet-100 dark:border-violet-400/15">
        <h3 className="text-[16px] font-semibold text-foreground tracking-tight">{title}</h3>
        <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
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
