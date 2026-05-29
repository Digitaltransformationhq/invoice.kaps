import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, CheckCircle, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { selectForUser } from '../../../lib/auditorData';

interface GSTR1ReportProps {
  onBack: () => void;
  dateRange: { from: string; to: string };
}

interface B2BRow {
  gstin: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceValue: number;
  taxableValue: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface B2CLRow {
  invoiceNo: string;
  invoiceDate: string;
  state: string;
  invoiceValue: number;
  taxableValue: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface HSNRow {
  hsnCode: string;
  description: string;
  uqc: string;
  totalQuantity: number;
  taxableValue: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface GSTR1Summary {
  totalInvoices: number;
  totalTaxableValue: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalTax: number;
  totalInvoiceValue: number;
}

const formatDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatRupee = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const derivePeriodLabel = (range: { from: string; to: string }) => {
  if (!range.from || !range.to) return '—';
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return `${range.from} → ${range.to}`;
  }
  // Same calendar month?
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
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');

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

export function GSTR1Report({ onBack, dateRange }: GSTR1ReportProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [companyDetails, setCompanyDetails] = useState({
    gstin: user?.company_gstin || '-',
    legalName: user?.company_name || 'Your Company',
    tradeName: user?.company_name || 'Your Company',
  });
  const [b2b, setB2b] = useState<B2BRow[]>([]);
  const [b2cl, setB2cl] = useState<B2CLRow[]>([]);
  const [hsn, setHsn] = useState<HSNRow[]>([]);
  const [summary, setSummary] = useState<GSTR1Summary>({
    totalInvoices: 0,
    totalTaxableValue: 0,
    totalCGST: 0,
    totalSGST: 0,
    totalIGST: 0,
    totalTax: 0,
    totalInvoiceValue: 0,
  });

  useEffect(() => {
    if (!user?.company_id) return;

    const load = async () => {
      setIsLoading(true);

      const [companyRes, invoicesRes] = await Promise.all([
        Promise.resolve(
          supabase
            .from('companies')
            .select('company_name, gstin, trade_name')
            .eq('id', user.company_id)
            .maybeSingle()
        ),
        selectForUser<any[]>(user, 'reports', 'invoices', () =>
          Promise.resolve(
            supabase
              .from('invoices')
              .select(`
                id,
                invoice_number,
                invoice_date,
                subtotal,
                total_tax,
                cgst,
                sgst,
                igst,
                total_amount,
                status,
                customers(gstin, name, state),
                invoice_items(item_name, hsn, quantity, unit, rate, gst_rate, taxable_amount, tax_amount)
              `)
              .eq('company_id', user.company_id)
              .gte('invoice_date', dateRange.from)
              .lte('invoice_date', dateRange.to)
              .not('status', 'in', '("draft","cancelled")')
              .order('invoice_date', { ascending: true })
          ),
        ),
      ]);

      const companyData: any = companyRes.data;
      if (companyData) {
        setCompanyDetails({
          gstin: companyData.gstin || user.company_gstin || '-',
          legalName: companyData.company_name || user.company_name || 'Your Company',
          tradeName: companyData.trade_name || companyData.company_name || user.company_name || 'Your Company',
        });
      }

      if (invoicesRes.error) {
        toast.error(`Could not load invoices: ${invoicesRes.error.message}`);
        setIsLoading(false);
        return;
      }

      const invoices = invoicesRes.data || [];

      const newB2b: B2BRow[] = [];
      const newB2cl: B2CLRow[] = [];
      const hsnAggregate = new Map<string, HSNRow>();
      const sum: GSTR1Summary = {
        totalInvoices: invoices.length,
        totalTaxableValue: 0,
        totalCGST: 0,
        totalSGST: 0,
        totalIGST: 0,
        totalTax: 0,
        totalInvoiceValue: 0,
      };

      invoices.forEach((inv: any) => {
        const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
        const items = inv.invoice_items || [];

        const taxableValue = Number(inv.subtotal || 0);
        const cgst = Number(inv.cgst || 0);
        const sgst = Number(inv.sgst || 0);
        const igst = Number(inv.igst || 0);
        const tax = Number(inv.total_tax || cgst + sgst + igst);
        const invoiceValue = Number(inv.total_amount || taxableValue + tax);

        // Effective rate = (tax / taxable) × 100, rounded to one decimal — used for the table.
        const rate = taxableValue > 0 ? Math.round((tax / taxableValue) * 1000) / 10 : 0;

        sum.totalTaxableValue += taxableValue;
        sum.totalCGST += cgst;
        sum.totalSGST += sgst;
        sum.totalIGST += igst;
        sum.totalTax += tax;
        sum.totalInvoiceValue += invoiceValue;

        const buyerGstin = (customer?.gstin || '').trim();
        const buyerState = customer?.state || '';

        if (buyerGstin) {
          // B2B
          newB2b.push({
            gstin: buyerGstin,
            invoiceNo: inv.invoice_number,
            invoiceDate: formatDate(inv.invoice_date),
            invoiceValue,
            taxableValue,
            rate,
            cgst,
            sgst,
            igst,
          });
        } else if (invoiceValue > 250000 && igst > 0) {
          // B2C Large (inter-state, >2.5L)
          newB2cl.push({
            invoiceNo: inv.invoice_number,
            invoiceDate: formatDate(inv.invoice_date),
            state: buyerState,
            invoiceValue,
            taxableValue,
            rate,
            cgst,
            sgst,
            igst,
          });
        }
        // Otherwise: B2C small — folds into the HSN summary, no per-invoice row needed.

        // HSN aggregation
        items.forEach((it: any) => {
          const hsnCode = (it.hsn || '').trim() || '—';
          const gstRate = Number(it.gst_rate || 0);
          const key = `${hsnCode}__${gstRate}`;
          const existing = hsnAggregate.get(key);
          const itemTaxable = Number(it.taxable_amount || 0);
          const itemTax = Number(it.tax_amount || 0);
          const itemQty = Number(it.quantity || 0);

          // Per-line CGST/SGST/IGST split mirrors the invoice
          const itemCgst = igst > 0 ? 0 : itemTax / 2;
          const itemSgst = igst > 0 ? 0 : itemTax / 2;
          const itemIgst = igst > 0 ? itemTax : 0;

          if (existing) {
            existing.totalQuantity += itemQty;
            existing.taxableValue += itemTaxable;
            existing.cgst += itemCgst;
            existing.sgst += itemSgst;
            existing.igst += itemIgst;
          } else {
            hsnAggregate.set(key, {
              hsnCode,
              description: it.item_name || '',
              uqc: it.unit || '—',
              totalQuantity: itemQty,
              taxableValue: itemTaxable,
              rate: gstRate,
              cgst: itemCgst,
              sgst: itemSgst,
              igst: itemIgst,
            });
          }
        });
      });

      setB2b(newB2b);
      setB2cl(newB2cl);
      setHsn(Array.from(hsnAggregate.values()).sort((a, b) => b.taxableValue - a.taxableValue));
      setSummary(sum);
      setIsLoading(false);
    };

    load();
  }, [user?.company_id, dateRange.from, dateRange.to]);

  const periodLabel = useMemo(() => derivePeriodLabel(dateRange), [dateRange.from, dateRange.to]);
  const periodSlug = periodLabel.replace(/[^A-Za-z0-9]+/g, '_');

  const downloadB2BCSV = () => {
    downloadCSV(
      b2b.map((r) => ({
        GSTIN: r.gstin,
        Invoice_No: r.invoiceNo,
        Invoice_Date: r.invoiceDate,
        Invoice_Value: r.invoiceValue.toFixed(2),
        Taxable_Value: r.taxableValue.toFixed(2),
        Rate: r.rate,
        CGST: r.cgst.toFixed(2),
        SGST: r.sgst.toFixed(2),
        IGST: r.igst.toFixed(2),
      })),
      `GSTR1_B2B_${periodSlug}.csv`,
      ['GSTIN', 'Invoice_No', 'Invoice_Date', 'Invoice_Value', 'Taxable_Value', 'Rate', 'CGST', 'SGST', 'IGST'],
    );
  };

  const downloadB2CLCSV = () => {
    downloadCSV(
      b2cl.map((r) => ({
        Invoice_No: r.invoiceNo,
        Invoice_Date: r.invoiceDate,
        State: r.state,
        Invoice_Value: r.invoiceValue.toFixed(2),
        Taxable_Value: r.taxableValue.toFixed(2),
        Rate: r.rate,
        CGST: r.cgst.toFixed(2),
        SGST: r.sgst.toFixed(2),
        IGST: r.igst.toFixed(2),
      })),
      `GSTR1_B2CL_${periodSlug}.csv`,
      ['Invoice_No', 'Invoice_Date', 'State', 'Invoice_Value', 'Taxable_Value', 'Rate', 'CGST', 'SGST', 'IGST'],
    );
  };

  const downloadHSNCSV = () => {
    downloadCSV(
      hsn.map((r) => ({
        HSN_Code: r.hsnCode,
        Description: r.description,
        UQC: r.uqc,
        Total_Quantity: r.totalQuantity,
        Taxable_Value: r.taxableValue.toFixed(2),
        Rate: r.rate,
        CGST: r.cgst.toFixed(2),
        SGST: r.sgst.toFixed(2),
        IGST: r.igst.toFixed(2),
      })),
      `GSTR1_HSN_Summary_${periodSlug}.csv`,
      ['HSN_Code', 'Description', 'UQC', 'Total_Quantity', 'Taxable_Value', 'Rate', 'CGST', 'SGST', 'IGST'],
    );
  };

  const downloadAllCSV = () => {
    if (b2b.length === 0 && b2cl.length === 0 && hsn.length === 0) {
      toast.error('Nothing to export — no invoices in this period.');
      return;
    }
    if (b2b.length > 0) downloadB2BCSV();
    if (b2cl.length > 0) setTimeout(() => downloadB2CLCSV(), 120);
    if (hsn.length > 0) setTimeout(() => downloadHSNCSV(), 240);
  };

  const downloadJSON = () => {
    const payload = {
      gstin: companyDetails.gstin,
      fp: periodSlug, // filing period
      gt: summary.totalInvoiceValue,
      cur_gt: summary.totalTaxableValue,
      b2b,
      b2cl,
      hsn,
      summary,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GSTR1_${periodSlug}.json`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('GSTR-1 JSON downloaded.');
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
              GSTR-1 Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              GST return for outward supplies • {periodLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={downloadAllCSV}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 h-10 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded-lg text-[13px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-60"
          >
            <FileText className="w-4 h-4" />
            Download All CSV
          </button>
          <button
            onClick={downloadJSON}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 h-10 bg-violet-500 text-white rounded-lg text-[13px] font-semibold shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)] hover:bg-violet-600 transition-colors disabled:opacity-60"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Download JSON
          </button>
        </div>
      </div>

      {/* GSTIN Details */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">GSTIN</div>
            <div className="font-semibold font-mono text-foreground tracking-tight">{companyDetails.gstin || '—'}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Legal Name</div>
            <div className="font-semibold text-foreground tracking-tight">{companyDetails.legalName}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Trade Name</div>
            <div className="font-semibold text-foreground tracking-tight">{companyDetails.tradeName}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Return Period</div>
            <div className="font-semibold text-foreground tracking-tight">{periodLabel}</div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryStat label="Total Invoices" value={isLoading ? '—' : String(summary.totalInvoices)} />
        <SummaryStat label="Taxable Value" value={isLoading ? '—' : `₹${(summary.totalTaxableValue / 100000).toFixed(2)}L`} />
        <SummaryStat label="Total Tax" value={isLoading ? '—' : `₹${(summary.totalTax / 100000).toFixed(2)}L`} valueClass="text-warning" />
        <SummaryStat label="Invoice Value" value={isLoading ? '—' : `₹${(summary.totalInvoiceValue / 100000).toFixed(2)}L`} valueClass="text-success" />
      </div>

      {/* B2B Supplies */}
      <SectionCard
        title="4A, 4B, 4C — B2B Supplies"
        subtitle="Business-to-Business taxable outward supplies (recipient with GSTIN)"
        recordsLabel={`${b2b.length} Records`}
        onDownloadCsv={downloadB2BCSV}
        isLoading={isLoading}
      >
        {b2b.length === 0 ? (
          <EmptyRow text={isLoading ? 'Loading…' : 'No B2B invoices in this period.'} />
        ) : (
          <table className="w-full">
            <ReportTableHead headers={['GSTIN of Recipient', 'Invoice No.', 'Date', 'Invoice Value', 'Taxable Value', 'Rate', 'CGST', 'SGST', 'IGST']} />
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {b2b.map((item, index) => (
                <tr key={index} className="bg-violet-50/40 dark:bg-violet-500/[0.03] hover:bg-violet-100/60 dark:hover:bg-violet-500/[0.08] transition-colors">
                  <td className="px-4 py-3 text-sm font-mono">{item.gstin}</td>
                  <td className="px-4 py-3 text-sm font-mono">{item.invoiceNo}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{item.invoiceDate}</td>
                  <td className="px-4 py-3 text-sm text-left font-medium tabular-nums">₹{formatRupee(item.invoiceValue)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">₹{formatRupee(item.taxableValue)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">{item.rate}%</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">₹{formatRupee(item.cgst)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">₹{formatRupee(item.sgst)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">{item.igst > 0 ? `₹${formatRupee(item.igst)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* B2CL */}
      <SectionCard
        title="5A, 5B — B2C Large (>₹2.5L, Inter-State)"
        subtitle="B2C invoices above ₹2.5 lakhs to unregistered customers in other states"
        recordsLabel={`${b2cl.length} Records`}
        onDownloadCsv={downloadB2CLCSV}
        isLoading={isLoading}
      >
        {b2cl.length === 0 ? (
          <EmptyRow text={isLoading ? 'Loading…' : 'No B2C Large invoices in this period.'} />
        ) : (
          <table className="w-full">
            <ReportTableHead headers={['Invoice No.', 'Date', 'State', 'Invoice Value', 'Taxable Value', 'Rate', 'CGST', 'SGST', 'IGST']} />
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {b2cl.map((item, index) => (
                <tr key={index} className="bg-violet-50/40 dark:bg-violet-500/[0.03] hover:bg-violet-100/60 dark:hover:bg-violet-500/[0.08] transition-colors">
                  <td className="px-4 py-3 text-sm font-mono">{item.invoiceNo}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{item.invoiceDate}</td>
                  <td className="px-4 py-3 text-sm">{item.state || '—'}</td>
                  <td className="px-4 py-3 text-sm text-left font-medium tabular-nums">₹{formatRupee(item.invoiceValue)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">₹{formatRupee(item.taxableValue)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">{item.rate}%</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">₹{formatRupee(item.cgst)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">₹{formatRupee(item.sgst)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">{item.igst > 0 ? `₹${formatRupee(item.igst)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* HSN Summary */}
      <SectionCard
        title="12 — HSN Summary of Outward Supplies"
        subtitle="HSN-wise summary of all outward supplies"
        recordsLabel={`${hsn.length} HSN Codes`}
        onDownloadCsv={downloadHSNCSV}
        isLoading={isLoading}
      >
        {hsn.length === 0 ? (
          <EmptyRow text={isLoading ? 'Loading…' : 'No HSN data in this period.'} />
        ) : (
          <table className="w-full">
            <ReportTableHead headers={['HSN Code', 'Description', 'UQC', 'Total Qty', 'Taxable Value', 'Rate', 'CGST', 'SGST', 'IGST']} />
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {hsn.map((item, index) => (
                <tr key={index} className="bg-violet-50/40 dark:bg-violet-500/[0.03] hover:bg-violet-100/60 dark:hover:bg-violet-500/[0.08] transition-colors">
                  <td className="px-4 py-3 text-sm font-mono font-medium">{item.hsnCode}</td>
                  <td className="px-4 py-3 text-sm">{item.description}</td>
                  <td className="px-4 py-3 text-sm">{item.uqc}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">{item.totalQuantity}</td>
                  <td className="px-4 py-3 text-sm text-left font-medium tabular-nums">₹{formatRupee(item.taxableValue)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">{item.rate}%</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">₹{formatRupee(item.cgst)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">₹{formatRupee(item.sgst)}</td>
                  <td className="px-4 py-3 text-sm text-left tabular-nums">{item.igst > 0 ? `₹${formatRupee(item.igst)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Tax Liability Summary */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
        <h3 className="text-[16px] font-semibold text-foreground tracking-tight mb-5">Tax Liability Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <LiabilityCard label="CGST" value={summary.totalCGST} />
          <LiabilityCard label="SGST" value={summary.totalSGST} />
          <LiabilityCard label="IGST" value={summary.totalIGST} />
          <LiabilityCard label="Total Tax" value={summary.totalTax} accent />
        </div>
      </div>

      {/* Filing Instructions */}
      <div className="bg-violet-50/50 dark:bg-violet-500/[0.05] border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6">
        <h3 className="text-[16px] font-semibold text-foreground tracking-tight mb-3">Filing Instructions</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
            <span>Download the JSON file and upload it to the GST Portal.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
            <span>Verify all invoice details (GSTIN, taxable values, tax split) before filing.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
            <span>File GSTR-1 by the 11th of the next month to avoid late fees.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
            <span>Keep a copy of the filed return for your records.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  recordsLabel,
  onDownloadCsv,
  isLoading,
  children,
}: {
  title: string;
  subtitle: string;
  recordsLabel: string;
  onDownloadCsv: () => void;
  isLoading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
      <div className="p-5 md:p-6 border-b border-violet-100 dark:border-violet-400/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold text-foreground tracking-tight">{title}</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onDownloadCsv}
            className="inline-flex items-center gap-2 px-3 h-9 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded-lg text-[12.5px] font-medium hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Download CSV
          </button>
          <span className="inline-flex items-center gap-1 px-3 h-7 bg-success/10 text-success rounded-md text-[12px] font-semibold">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            {recordsLabel}
          </span>
        </div>
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
          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300 whitespace-nowrap">
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>
  );
}

function SummaryStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.08)]">
      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{label}</div>
      <div className={`text-[28px] sm:text-[32px] font-semibold tracking-tight tabular-nums ${valueClass || 'text-foreground'}`}>
        {value}
      </div>
    </div>
  );
}

function LiabilityCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`p-4 rounded-lg border ${accent ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-300 dark:border-violet-400/30' : 'bg-violet-50/40 dark:bg-violet-500/[0.05] border-violet-200/70 dark:border-violet-400/20'}`}>
      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{label}</div>
      <div className={`text-[22px] sm:text-[26px] font-semibold tracking-tight tabular-nums ${accent ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'}`}>
        ₹{formatRupee(value)}
      </div>
    </div>
  );
}
