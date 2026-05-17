import { useState } from 'react';
import { ArrowLeft, Download, FileSpreadsheet, TrendingUp, Calendar, Filter, Receipt, IndianRupee } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SalesReportProps {
  onBack: () => void;
  dateRange: {
    from: string;
    to: string;
  };
}

export function SalesReport({ onBack, dateRange }: SalesReportProps) {
  const [viewMode, setViewMode] = useState<'monthly' | 'daily'>('monthly');
  const [groupBy, setGroupBy] = useState<'customer' | 'item'>('customer');

  // Sample monthly sales data
  const monthlySalesData = [
    { month: 'Nov 2025', invoices: 42, revenue: 285000, gst: 51300, collections: 245000 },
    { month: 'Dec 2025', invoices: 38, revenue: 312000, gst: 56160, collections: 298000 },
    { month: 'Jan 2026', invoices: 45, revenue: 378000, gst: 68040, collections: 342000 },
    { month: 'Feb 2026', invoices: 40, revenue: 295000, gst: 53100, collections: 287000 },
    { month: 'Mar 2026', invoices: 52, revenue: 425000, gst: 76500, collections: 398000 },
    { month: 'Apr 2026', revenue: 487000, gst: 87660, invoices: 48, collections: 412000 },
  ];

  // Sample customer-wise sales
  const customerSales = [
    { customer: 'Ravi Construction Pvt Ltd', invoices: 12, revenue: 485000, gst: 87300, outstanding: 125000, paid: 360000 },
    { customer: 'Steel Traders & Co', invoices: 8, revenue: 324000, gst: 58320, outstanding: 0, paid: 324000 },
    { customer: 'Modern Builders Ltd', invoices: 15, revenue: 678000, gst: 122040, outstanding: 178000, paid: 500000 },
    { customer: 'Prime Industries', invoices: 6, revenue: 245000, gst: 44100, outstanding: 45000, paid: 200000 },
    { customer: 'Metro Constructions', invoices: 10, revenue: 398000, gst: 71640, outstanding: 98000, paid: 300000 },
  ];

  // Sample item-wise sales
  const itemSales = [
    { item: 'Welding Work (HSN: 998873)', quantity: 1250, units: 'Hours', revenue: 562500, gst: 101250, invoices: 28 },
    { item: 'Steel Pipe - 2 inch (HSN: 730411)', quantity: 850, units: 'Meters', revenue: 425000, gst: 76500, invoices: 15 },
    { item: 'Consultation Services (HSN: 998314)', quantity: 120, units: 'Hours', revenue: 360000, gst: 64800, invoices: 24 },
    { item: 'Paint Work (HSN: 998859)', quantity: 2400, units: 'Sq Ft', revenue: 288000, gst: 51840, invoices: 18 },
    { item: 'Cement Bag - 50kg (HSN: 252329)', quantity: 500, units: 'Bags', revenue: 175000, gst: 31500, invoices: 10 },
  ];

  const totalStats = {
    totalInvoices: customerSales.reduce((sum, c) => sum + c.invoices, 0),
    totalRevenue: customerSales.reduce((sum, c) => sum + c.revenue, 0),
    totalGST: customerSales.reduce((sum, c) => sum + c.gst, 0),
    totalPaid: customerSales.reduce((sum, c) => sum + c.paid, 0),
    totalOutstanding: customerSales.reduce((sum, c) => sum + c.outstanding, 0),
  };

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
            <h1 className="text-2xl font-semibold text-foreground">Sales Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detailed sales analysis from {new Date(dateRange.from).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} to {new Date(dateRange.to).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
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
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Total Invoices</div>
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div className="text-4xl font-bold text-foreground">{totalStats.totalInvoices}</div>
          <div className="text-xs text-muted-foreground mt-1">This period</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Total Revenue</div>
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <div className="text-4xl font-bold text-foreground">
            ₹{(totalStats.totalRevenue / 100000).toFixed(2)}L
          </div>
          <div className="text-xs text-success mt-1">+15.2% growth</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Total GST</div>
            <IndianRupee className="w-5 h-5 text-warning" />
          </div>
          <div className="text-4xl font-bold text-foreground">
            ₹{(totalStats.totalGST / 100000).toFixed(2)}L
          </div>
          <div className="text-xs text-muted-foreground mt-1">18% of revenue</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Collections</div>
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <div className="text-4xl font-bold text-foreground">
            ₹{(totalStats.totalPaid / 100000).toFixed(2)}L
          </div>
          <div className="text-xs text-success mt-1">
            {((totalStats.totalPaid / totalStats.totalRevenue) * 100).toFixed(1)}% collected
          </div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm text-muted-foreground">Outstanding</div>
            <IndianRupee className="w-5 h-5 text-destructive" />
          </div>
          <div className="text-4xl font-bold text-foreground">
            ₹{(totalStats.totalOutstanding / 100000).toFixed(2)}L
          </div>
          <div className="text-xs text-warning mt-1">
            {((totalStats.totalOutstanding / totalStats.totalRevenue) * 100).toFixed(1)}% pending
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-foreground">Revenue Trend</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('monthly')}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  viewMode === 'monthly'
                    ? 'bg-accent text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setViewMode('daily')}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  viewMode === 'daily'
                    ? 'bg-accent text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Daily
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlySalesData}>
              <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis key="xaxis" dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis key="yaxis" tick={{ fontSize: 12 }} />
              <Tooltip key="tooltip" />
              <Legend key="legend" />
              <Line key="revenue-line" type="monotone" dataKey="revenue" stroke="#E8693B" strokeWidth={2} name="Revenue" />
              <Line key="gst-line" type="monotone" dataKey="gst" stroke="#F59E0B" strokeWidth={2} name="GST" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Invoices & Collections */}
        <div className="bg-white border border-border rounded-lg p-6">
          <h3 className="font-semibold text-foreground mb-6">Invoices & Collections</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlySalesData}>
              <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis key="xaxis" dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis key="yaxis" tick={{ fontSize: 12 }} />
              <Tooltip key="tooltip" />
              <Legend key="legend" />
              <Bar key="invoices-bar" dataKey="invoices" fill="#1F2A4D" name="Invoices" />
              <Bar key="collections-bar" dataKey="collections" fill="#22C55E" name="Collections (₹)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Group By Toggle */}
      <div className="bg-white border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-foreground">Detailed Breakdown</h3>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground mr-2">Group by:</span>
            <button
              onClick={() => setGroupBy('customer')}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                groupBy === 'customer'
                  ? 'bg-accent text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Customer
            </button>
            <button
              onClick={() => setGroupBy('item')}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                groupBy === 'item'
                  ? 'bg-accent text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Item/Service
            </button>
          </div>
        </div>

        {/* Customer-wise Sales Table */}
        {groupBy === 'customer' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Customer Name</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Invoices</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">GST</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Paid</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {customerSales.map((customer, index) => (
                  <tr key={index} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-4">
                      <div className="font-medium text-foreground">{customer.customer}</div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-sm text-foreground">{customer.invoices}</span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="font-medium text-foreground">
                        ₹{customer.revenue.toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="text-sm text-muted-foreground">
                        ₹{customer.gst.toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="text-success font-medium">
                        ₹{customer.paid.toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      {customer.outstanding > 0 ? (
                        <span className="text-destructive font-medium">
                          ₹{customer.outstanding.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20 border-t-2 border-border font-semibold">
                  <td className="py-4 px-4 text-foreground">Total</td>
                  <td className="py-4 px-4 text-center text-foreground">{totalStats.totalInvoices}</td>
                  <td className="py-4 px-4 text-right text-foreground">
                    ₹{totalStats.totalRevenue.toLocaleString('en-IN')}
                  </td>
                  <td className="py-4 px-4 text-right text-foreground">
                    ₹{totalStats.totalGST.toLocaleString('en-IN')}
                  </td>
                  <td className="py-4 px-4 text-right text-success">
                    ₹{totalStats.totalPaid.toLocaleString('en-IN')}
                  </td>
                  <td className="py-4 px-4 text-right text-destructive">
                    ₹{totalStats.totalOutstanding.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Item-wise Sales Table */}
        {groupBy === 'item' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Item / Service</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Qty</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Units</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Invoices</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">GST</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {itemSales.map((item, index) => (
                  <tr key={index} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-4">
                      <div className="font-medium text-foreground">{item.item}</div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-sm text-foreground">{item.quantity.toLocaleString('en-IN')}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-sm text-muted-foreground">{item.units}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-sm text-foreground">{item.invoices}</span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="font-medium text-foreground">
                        ₹{item.revenue.toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="text-sm text-muted-foreground">
                        ₹{item.gst.toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="font-semibold text-foreground">
                        ₹{(item.revenue + item.gst).toLocaleString('en-IN')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20 border-t-2 border-border font-semibold">
                  <td className="py-4 px-4 text-foreground" colSpan={4}>Total</td>
                  <td className="py-4 px-4 text-right text-foreground">
                    ₹{itemSales.reduce((sum, i) => sum + i.revenue, 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-4 px-4 text-right text-foreground">
                    ₹{itemSales.reduce((sum, i) => sum + i.gst, 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-4 px-4 text-right text-foreground">
                    ₹{itemSales.reduce((sum, i) => sum + i.revenue + i.gst, 0).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
