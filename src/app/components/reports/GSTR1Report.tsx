import { ArrowLeft, Download, FileSpreadsheet, CheckCircle, FileText } from 'lucide-react';

interface GSTR1ReportProps {
  onBack: () => void;
  dateRange: { from: string; to: string };
}

export function GSTR1Report({ onBack, dateRange }: GSTR1ReportProps) {
  // CSV Download Helper Functions
  const downloadCSV = (data: any[], filename: string, headers: string[]) => {
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header] ?? '';
        // Escape quotes and wrap in quotes if contains comma
        const stringValue = String(value);
        return stringValue.includes(',') ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadB2BCSV = () => {
    const csvData = gstr1Data.b2b.map(item => ({
      'GSTIN': item.gstin,
      'Invoice_No': item.invoiceNo,
      'Invoice_Date': item.invoiceDate,
      'Invoice_Value': item.invoiceValue,
      'Taxable_Value': item.taxableValue,
      'Rate': item.rate,
      'CGST': item.cgst,
      'SGST': item.sgst,
      'IGST': item.igst
    }));
    downloadCSV(csvData, `GSTR1_B2B_${gstr1Data.period.replace(' ', '_')}.csv`,
      ['GSTIN', 'Invoice_No', 'Invoice_Date', 'Invoice_Value', 'Taxable_Value', 'Rate', 'CGST', 'SGST', 'IGST']);
  };

  const downloadB2CLCSV = () => {
    const csvData = gstr1Data.b2cl.map(item => ({
      'Invoice_No': item.invoiceNo,
      'Invoice_Date': item.invoiceDate,
      'State': item.state,
      'Invoice_Value': item.invoiceValue,
      'Taxable_Value': item.taxableValue,
      'Rate': item.rate,
      'CGST': item.cgst,
      'SGST': item.sgst
    }));
    downloadCSV(csvData, `GSTR1_B2CL_${gstr1Data.period.replace(' ', '_')}.csv`,
      ['Invoice_No', 'Invoice_Date', 'State', 'Invoice_Value', 'Taxable_Value', 'Rate', 'CGST', 'SGST']);
  };

  const downloadHSNCSV = () => {
    const csvData = gstr1Data.hsn.map(item => ({
      'HSN_Code': item.hsnCode,
      'Description': item.description,
      'UQC': item.uqc,
      'Total_Quantity': item.totalQuantity,
      'Taxable_Value': item.taxableValue,
      'Rate': item.rate,
      'CGST': item.cgst,
      'SGST': item.sgst
    }));
    downloadCSV(csvData, `GSTR1_HSN_Summary_${gstr1Data.period.replace(' ', '_')}.csv`,
      ['HSN_Code', 'Description', 'UQC', 'Total_Quantity', 'Taxable_Value', 'Rate', 'CGST', 'SGST']);
  };

  const downloadAllCSV = () => {
    // Download all three CSVs
    downloadB2BCSV();
    setTimeout(() => downloadB2CLCSV(), 100);
    setTimeout(() => downloadHSNCSV(), 200);
  };
  // Sample GSTR-1 data
  const gstr1Data = {
    gstin: '27AAAAA0000A1Z5',
    legalName: 'My Company Pvt Ltd',
    tradeName: 'GSTInvoice Pro',
    period: 'April 2026',

    // B2B Supplies
    b2b: [
      { gstin: '24AAECB4538R1Z9', invoiceNo: 'INV-2026-156', invoiceDate: '12 May 2026', invoiceValue: 125000, taxableValue: 105932, cgst: 9534, sgst: 9534, igst: 0, rate: 18 },
      { gstin: '29BBBBB1111B2Y4', invoiceNo: 'INV-2026-155', invoiceDate: '11 May 2026', invoiceValue: 89500, taxableValue: 75847, cgst: 6827, sgst: 6827, igst: 0, rate: 18 },
      { gstin: '24CCCCC2222C3X3', invoiceNo: 'INV-2026-154', invoiceDate: '10 May 2026', invoiceValue: 234000, taxableValue: 198305, cgst: 17847, sgst: 17847, igst: 0, rate: 18 },
    ],

    // B2C (Large) - Invoice value > 2.5 Lakhs
    b2cl: [
      { invoiceNo: 'INV-2026-153', invoiceDate: '08 May 2026', invoiceValue: 280000, taxableValue: 237288, cgst: 21356, sgst: 21356, igst: 0, rate: 18, state: 'Gujarat' },
    ],

    // HSN Summary
    hsn: [
      { hsnCode: '998873', description: 'Welding Work', uqc: 'JOB', totalQuantity: 15, taxableValue: 450000, cgst: 40500, sgst: 40500, igst: 0, rate: 18 },
      { hsnCode: '998314', description: 'Consultation Services', uqc: 'HRS', totalQuantity: 120, taxableValue: 300000, cgst: 27000, sgst: 27000, igst: 0, rate: 18 },
      { hsnCode: '730411', description: 'Steel Pipes', uqc: 'MTR', totalQuantity: 500, taxableValue: 225000, cgst: 20250, sgst: 20250, igst: 0, rate: 18 },
    ],

    // Tax Summary
    summary: {
      totalInvoices: 175,
      totalTaxableValue: 1050000,
      totalCGST: 94500,
      totalSGST: 94500,
      totalIGST: 0,
      totalTax: 189000,
      totalInvoiceValue: 1239000,
    }
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
            <h1 className="text-2xl font-semibold text-foreground">GSTR-1 Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              GST Return for outward supplies - {gstr1Data.period}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadAllCSV}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span className="text-sm">Download All CSV</span>
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
            <Download className="w-4 h-4" />
            <span className="text-sm">Download Excel</span>
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="text-sm">Download JSON</span>
          </button>
        </div>
      </div>

      {/* GSTIN Details */}
      <div className="bg-white border border-border rounded-lg p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-muted-foreground mb-1">GSTIN</div>
            <div className="font-semibold font-mono">{gstr1Data.gstin}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Legal Name</div>
            <div className="font-semibold">{gstr1Data.legalName}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Trade Name</div>
            <div className="font-semibold">{gstr1Data.tradeName}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Return Period</div>
            <div className="font-semibold">{gstr1Data.period}</div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="text-sm text-muted-foreground mb-2">Total Invoices</div>
          <div className="text-4xl font-bold text-foreground">{gstr1Data.summary.totalInvoices}</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="text-sm text-muted-foreground mb-2">Taxable Value</div>
          <div className="text-4xl font-bold text-foreground">
            ₹{(gstr1Data.summary.totalTaxableValue / 100000).toFixed(1)}L
          </div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="text-sm text-muted-foreground mb-2">Total Tax</div>
          <div className="text-4xl font-bold text-warning">
            ₹{(gstr1Data.summary.totalTax / 100000).toFixed(1)}L
          </div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="text-sm text-muted-foreground mb-2">Invoice Value</div>
          <div className="text-4xl font-bold text-success">
            ₹{(gstr1Data.summary.totalInvoiceValue / 100000).toFixed(1)}L
          </div>
        </div>
      </div>

      {/* B2B Supplies (Table 4A, 4B, 4C, 6B, 6C) */}
      <div className="bg-white border border-border rounded-lg">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">4A, 4B, 4C - B2B Supplies</h3>
            <p className="text-sm text-muted-foreground mt-1">Business to Business - Taxable outward supplies</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadB2BCSV}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-border bg-white rounded hover:bg-muted transition-colors text-sm"
            >
              <FileText className="w-4 h-4" />
              Download CSV
            </button>
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-success/10 text-success rounded text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              {gstr1Data.b2b.length} Records
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">GSTIN of Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Invoice No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Invoice Value</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Taxable Value</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Rate</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">CGST</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">SGST</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">IGST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {gstr1Data.b2b.map((item, index) => (
                <tr key={index} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm font-mono">{item.gstin}</td>
                  <td className="px-4 py-3 text-sm font-mono">{item.invoiceNo}</td>
                  <td className="px-4 py-3 text-sm">{item.invoiceDate}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">₹{item.invoiceValue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">₹{item.taxableValue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-center">{item.rate}%</td>
                  <td className="px-4 py-3 text-sm text-right">₹{item.cgst.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">₹{item.sgst.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">{item.igst > 0 ? `₹${item.igst.toLocaleString()}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* B2C Large (Table 5A, 5B) */}
      <div className="bg-white border border-border rounded-lg">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">5A, 5B - B2C Large (&gt;2.5L)</h3>
            <p className="text-sm text-muted-foreground mt-1">Business to Consumer - Invoice value above 2.5 Lakhs</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadB2CLCSV}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-border bg-white rounded hover:bg-muted transition-colors text-sm"
            >
              <FileText className="w-4 h-4" />
              Download CSV
            </button>
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-success/10 text-success rounded text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              {gstr1Data.b2cl.length} Records
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Invoice No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">State</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Invoice Value</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Taxable Value</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Rate</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">CGST</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">SGST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {gstr1Data.b2cl.map((item, index) => (
                <tr key={index} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm font-mono">{item.invoiceNo}</td>
                  <td className="px-4 py-3 text-sm">{item.invoiceDate}</td>
                  <td className="px-4 py-3 text-sm">{item.state}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">₹{item.invoiceValue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">₹{item.taxableValue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-center">{item.rate}%</td>
                  <td className="px-4 py-3 text-sm text-right">₹{item.cgst.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">₹{item.sgst.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* HSN Summary (Table 12) */}
      <div className="bg-white border border-border rounded-lg">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">12 - HSN Summary of Outward Supplies</h3>
            <p className="text-sm text-muted-foreground mt-1">HSN-wise summary of all outward supplies</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadHSNCSV}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-border bg-white rounded hover:bg-muted transition-colors text-sm"
            >
              <FileText className="w-4 h-4" />
              Download CSV
            </button>
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-success/10 text-success rounded text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              {gstr1Data.hsn.length} HSN Codes
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">HSN Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">UQC</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Total Qty</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Taxable Value</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Rate</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">CGST</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">SGST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {gstr1Data.hsn.map((item, index) => (
                <tr key={index} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm font-mono font-medium">{item.hsnCode}</td>
                  <td className="px-4 py-3 text-sm">{item.description}</td>
                  <td className="px-4 py-3 text-sm text-center">{item.uqc}</td>
                  <td className="px-4 py-3 text-sm text-right">{item.totalQuantity}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">₹{item.taxableValue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-center">{item.rate}%</td>
                  <td className="px-4 py-3 text-sm text-right">₹{item.cgst.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">₹{item.sgst.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tax Liability Summary */}
      <div className="bg-white border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">Tax Liability Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 bg-muted/30 rounded">
            <div className="text-sm text-muted-foreground mb-2">CGST Liability</div>
            <div className="text-4xl font-bold text-foreground">
              ₹{gstr1Data.summary.totalCGST.toLocaleString()}
            </div>
          </div>
          <div className="p-4 bg-muted/30 rounded">
            <div className="text-sm text-muted-foreground mb-2">SGST Liability</div>
            <div className="text-4xl font-bold text-foreground">
              ₹{gstr1Data.summary.totalSGST.toLocaleString()}
            </div>
          </div>
          <div className="p-4 bg-primary/10 rounded">
            <div className="text-sm text-muted-foreground mb-2">Total Tax Liability</div>
            <div className="text-4xl font-bold text-primary">
              ₹{gstr1Data.summary.totalTax.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Filing Instructions */}
      <div className="bg-warning/10 border border-warning/20 rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-3">Filing Instructions</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
            <span>Download the JSON file and upload it to the GST Portal</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
            <span>Verify all invoice details before filing</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
            <span>File GSTR-1 by 11th of next month to avoid late fees</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
            <span>Keep a copy of the filed return for your records</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
