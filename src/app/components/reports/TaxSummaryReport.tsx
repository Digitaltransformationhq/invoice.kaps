import { ArrowLeft, Download, FileSpreadsheet, PieChart as PieChartIcon, TrendingUp, IndianRupee, Receipt } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TaxSummaryReportProps {
  onBack: () => void;
  dateRange: {
    from: string;
    to: string;
  };
}

export function TaxSummaryReport({ onBack, dateRange }: TaxSummaryReportProps) {
  // Tax breakdown data
  const taxBreakdown = [
    { name: 'CGST', value: 94500, color: '#1F2A4D' },
    { name: 'SGST', value: 94500, color: '#E8693B' },
    { name: 'IGST', value: 36000, color: '#F59E0B' },
  ];

  // Monthly tax liability
  const monthlyTaxData = [
    { month: 'Nov 2025', cgst: 22950, sgst: 22950, igst: 5400, total: 51300 },
    { month: 'Dec 2025', cgst: 25272, sgst: 25272, igst: 5616, total: 56160 },
    { month: 'Jan 2026', cgst: 30618, sgst: 30618, igst: 6804, total: 68040 },
    { month: 'Feb 2026', cgst: 23895, sgst: 23895, igst: 5310, total: 53100 },
    { month: 'Mar 2026', cgst: 34425, sgst: 34425, igst: 7650, total: 76500 },
    { month: 'Apr 2026', cgst: 39447, sgst: 39447, igst: 8766, total: 87660 },
  ];

  // HSN-wise tax summary
  const hsnTaxSummary = [
    { hsn: '998873', description: 'Welding Work Services', taxable: 562500, cgst: 50625, sgst: 50625, igst: 0, rate: 18, total: 101250 },
    { hsn: '730411', description: 'Steel Pipes and Tubes', taxable: 425000, cgst: 38250, sgst: 38250, igst: 0, rate: 18, total: 76500 },
    { hsn: '998314', description: 'Consultation Services', taxable: 360000, cgst: 0, sgst: 0, igst: 64800, rate: 18, total: 64800 },
    { hsn: '998859', description: 'Painting Services', taxable: 288000, cgst: 25920, sgst: 25920, igst: 0, rate: 18, total: 51840 },
    { hsn: '252329', description: 'Portland Cement', taxable: 175000, cgst: 15750, sgst: 15750, igst: 0, rate: 18, total: 31500 },
  ];

  // Tax rate-wise summary
  const taxRateSummary = [
    { rate: '5%', invoices: 8, taxable: 245000, tax: 12250 },
    { rate: '12%', invoices: 15, taxable: 385000, tax: 46200 },
    { rate: '18%', invoices: 28, taxable: 1810000, tax: 325800 },
    { rate: '28%', invoices: 0, taxable: 0, tax: 0 },
  ];

  const totalTax = taxBreakdown.reduce((sum, item) => sum + item.value, 0);
  const totalTaxable = hsnTaxSummary.reduce((sum, item) => sum + item.taxable, 0);
  const totalInvoices = taxRateSummary.reduce((sum, item) => sum + item.invoices, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Tax Summary Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              GST liability and analysis from {new Date(dateRange.from).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} to {new Date(dateRange.to).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
            <Download className="w-4 h-4" />
            Download PDF
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Total Tax Collected</div>
            <IndianRupee className="w-5 h-5 text-primary" />
          </div>
          <div className="text-4xl font-bold text-foreground">
            ₹{(totalTax / 100000).toFixed(2)}L
          </div>
          <div className="text-xs text-muted-foreground mt-1">This period</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Taxable Value</div>
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <div className="text-4xl font-bold text-foreground">
            ₹{(totalTaxable / 100000).toFixed(2)}L
          </div>
          <div className="text-xs text-success mt-1">Revenue base</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Tax Invoices</div>
            <Receipt className="w-5 h-5 text-accent" />
          </div>
          <div className="text-4xl font-bold text-foreground">{totalInvoices}</div>
          <div className="text-xs text-muted-foreground mt-1">Total count</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Effective Rate</div>
            <PieChartIcon className="w-5 h-5 text-warning" />
          </div>
          <div className="text-4xl font-bold text-foreground">
            {((totalTax / totalTaxable) * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">Average tax rate</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tax Distribution Pie Chart */}
        <div className="bg-white border border-border rounded-lg p-6">
          <h3 className="font-semibold text-foreground mb-6">Tax Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                key="tax-distribution-pie"
                data={taxBreakdown}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
              >
                {taxBreakdown.map((entry, index) => (
                  <Cell key={`tax-breakdown-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip key="tooltip" />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-4 mt-6">
            {taxBreakdown.map((item) => (
              <div key={item.name} className="text-center">
                <div className="text-xs text-muted-foreground mb-1">{item.name}</div>
                <div className="font-semibold text-foreground">
                  ₹{(item.value / 1000).toFixed(1)}K
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Tax Trend */}
        <div className="bg-white border border-border rounded-lg p-6">
          <h3 className="font-semibold text-foreground mb-6">Monthly Tax Liability</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyTaxData}>
              <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis key="xaxis" dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis key="yaxis" tick={{ fontSize: 12 }} />
              <Tooltip key="tooltip" />
              <Legend key="legend" />
              <Bar key="cgst-bar" dataKey="cgst" stackId="a" fill="#1F2A4D" name="CGST" />
              <Bar key="sgst-bar" dataKey="sgst" stackId="a" fill="#E8693B" name="SGST" />
              <Bar key="igst-bar" dataKey="igst" stackId="a" fill="#F59E0B" name="IGST" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tax Rate-wise Summary */}
      <div className="bg-white border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-6">Tax Rate-wise Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Tax Rate</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Invoices</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Taxable Value</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Tax Amount</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {taxRateSummary.map((rate, index) => (
                <tr key={index} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-4">
                    <span className="inline-flex items-center justify-center w-12 h-8 rounded bg-primary/10 text-primary font-semibold text-sm">
                      {rate.rate}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className="text-sm text-foreground">{rate.invoices}</span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="font-medium text-foreground">
                      ₹{rate.taxable.toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="text-warning font-medium">
                      ₹{rate.tax.toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="font-semibold text-foreground">
                      ₹{(rate.taxable + rate.tax).toLocaleString('en-IN')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20 border-t-2 border-border font-semibold">
                <td className="py-4 px-4 text-foreground">Total</td>
                <td className="py-4 px-4 text-center text-foreground">
                  {taxRateSummary.reduce((sum, r) => sum + r.invoices, 0)}
                </td>
                <td className="py-4 px-4 text-right text-foreground">
                  ₹{taxRateSummary.reduce((sum, r) => sum + r.taxable, 0).toLocaleString('en-IN')}
                </td>
                <td className="py-4 px-4 text-right text-warning">
                  ₹{taxRateSummary.reduce((sum, r) => sum + r.tax, 0).toLocaleString('en-IN')}
                </td>
                <td className="py-4 px-4 text-right text-foreground">
                  ₹{taxRateSummary.reduce((sum, r) => sum + r.taxable + r.tax, 0).toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* HSN-wise Tax Summary */}
      <div className="bg-white border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-6">HSN/SAC-wise Tax Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">HSN/SAC</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Description</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Rate</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Taxable</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">CGST</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">SGST</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">IGST</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {hsnTaxSummary.map((hsn, index) => (
                <tr key={index} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-4">
                    <span className="font-mono font-medium text-foreground">{hsn.hsn}</span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-sm text-foreground">{hsn.description}</span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className="text-sm text-muted-foreground">{hsn.rate}%</span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="font-medium text-foreground">
                      ₹{hsn.taxable.toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="text-sm text-foreground">
                      {hsn.cgst > 0 ? `₹${hsn.cgst.toLocaleString('en-IN')}` : '-'}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="text-sm text-foreground">
                      {hsn.sgst > 0 ? `₹${hsn.sgst.toLocaleString('en-IN')}` : '-'}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="text-sm text-foreground">
                      {hsn.igst > 0 ? `₹${hsn.igst.toLocaleString('en-IN')}` : '-'}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="font-semibold text-warning">
                      ₹{hsn.total.toLocaleString('en-IN')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20 border-t-2 border-border font-semibold">
                <td className="py-4 px-4 text-foreground" colSpan={3}>Total</td>
                <td className="py-4 px-4 text-right text-foreground">
                  ₹{hsnTaxSummary.reduce((sum, h) => sum + h.taxable, 0).toLocaleString('en-IN')}
                </td>
                <td className="py-4 px-4 text-right text-foreground">
                  ₹{hsnTaxSummary.reduce((sum, h) => sum + h.cgst, 0).toLocaleString('en-IN')}
                </td>
                <td className="py-4 px-4 text-right text-foreground">
                  ₹{hsnTaxSummary.reduce((sum, h) => sum + h.sgst, 0).toLocaleString('en-IN')}
                </td>
                <td className="py-4 px-4 text-right text-foreground">
                  ₹{hsnTaxSummary.reduce((sum, h) => sum + h.igst, 0).toLocaleString('en-IN')}
                </td>
                <td className="py-4 px-4 text-right text-warning">
                  ₹{hsnTaxSummary.reduce((sum, h) => sum + h.total, 0).toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Tax Liability Summary */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-6">Tax Liability Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white rounded">
              <span className="text-sm text-muted-foreground">Total Taxable Value</span>
              <span className="font-semibold text-foreground">₹{totalTaxable.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-white rounded">
              <span className="text-sm text-muted-foreground">CGST @ 9%</span>
              <span className="font-semibold text-primary">₹{taxBreakdown.find(t => t.name === 'CGST')?.value.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-white rounded">
              <span className="text-sm text-muted-foreground">SGST @ 9%</span>
              <span className="font-semibold text-accent">₹{taxBreakdown.find(t => t.name === 'SGST')?.value.toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white rounded">
              <span className="text-sm text-muted-foreground">IGST @ 18%</span>
              <span className="font-semibold text-warning">₹{taxBreakdown.find(t => t.name === 'IGST')?.value.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-warning/10 rounded border-2 border-warning">
              <span className="font-medium text-foreground">Total Tax Liability</span>
              <span className="text-xl font-bold text-warning">₹{totalTax.toLocaleString('en-IN')}</span>
            </div>
            <div className="p-4 bg-success/10 rounded border border-success/20">
              <div className="text-xs text-success font-medium mb-1">Payment Status</div>
              <div className="text-sm text-foreground">Ready for GSTR-3B filing</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
