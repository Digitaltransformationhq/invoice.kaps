import {
  formatInvoiceCurrency as formatCurrency,
  formatInvoiceDate as formatDate,
  lineAmounts,
  numberToWords,
} from '../../../../lib/invoiceDocument';
import type { InvoiceTemplateProps } from './types';
import { PAGE_CLASS } from './types';

/**
 * Classic GST — the fully-ruled grid this app has always printed. Every block is
 * boxed and every column separated, which is what most Indian accountants and
 * transporters expect to see. It is the safe default: nothing here changed when
 * formats became switchable.
 */
export function ClassicGst({ doc, copyLabel, className = '' }: InvoiceTemplateProps) {
  const { company, buyer, meta, items, totals, taxSummary, isComposition, isInterState } = doc;

  return (
    <div
      className={`${PAGE_CLASS} border border-foreground ${className}`}
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      {/* Header */}
      <div className="text-right px-4 pt-2 text-xs">
        <div className="font-semibold">{copyLabel}</div>
      </div>

      <div className="text-center py-2 border-b border-foreground">
        <h1 className="text-xl font-bold">{doc.title}</h1>
      </div>

      {/* Company & Invoice Details */}
      <div className="grid grid-cols-2 border-b border-foreground">
        <div className="p-4 border-r border-foreground">
          <div className="flex gap-4 items-start">
            <div className={`w-28 h-28 flex items-center justify-center flex-shrink-0 ${company.logo ? '' : 'bg-primary/10 border border-border rounded'}`}>
              {company.logo ? (
                <img src={company.logo} alt={`${company.name} logo`} className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">LOGO</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-sm mb-1">{company.name}</h2>
              <div className="text-xs leading-relaxed">
                {company.addressLines.length > 0 ? (
                  company.addressLines.map((line) => <div key={line}>{line}</div>)
                ) : (
                  <div>Registered address: -</div>
                )}
                {company.phone && <div>Phone: {company.phone}</div>}
                <div>Email: {company.email || '-'}</div>
                <div className="font-semibold mt-1">GSTIN: {company.gstin}</div>
                {company.pan && <div>PAN: {company.pan}</div>}
                <div>State: {company.state || '-'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="p-4">
          <table className="w-full text-xs">
            <tbody>
              <tr>
                <td className="py-1 font-semibold">INVOICE NO.</td>
                <td className="py-1">{meta.number}</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold">DATED</td>
                <td className="py-1">{formatDate(meta.date)}</td>
              </tr>
              {meta.dueDate && (
                <tr>
                  <td className="py-1 font-semibold">DUE DATE</td>
                  <td className="py-1">{formatDate(meta.dueDate)}</td>
                </tr>
              )}
              <tr>
                <td className="py-1 font-semibold">PLACE OF SUPPLY</td>
                <td className="py-1">{meta.placeOfSupply}</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold">REVERSE CHARGE</td>
                <td className="py-1">{meta.reverseCharge ? 'YES' : 'NO'}</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold">CUSTOMER TYPE</td>
                <td className="py-1">{meta.customerType || '-'}</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold">BILL TYPE</td>
                <td className="py-1">{meta.billType || '-'}</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold">PO NO. / DATE</td>
                <td className="py-1">{meta.poNumber || '-'} {meta.poDate ? `/ ${formatDate(meta.poDate)}` : ''}</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold">TRANSPORT</td>
                <td className="py-1">{meta.transportMode || '-'} {meta.vehicleNo ? `/ ${meta.vehicleNo}` : ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill To & Ship To */}
      <div className="grid grid-cols-2 border-b border-foreground">
        <div className="p-4 border-r border-foreground">
          <div className="text-xs font-semibold mb-2">BILL TO</div>
          <div className="text-xs leading-relaxed">
            <div className="font-bold">{buyer.name}</div>
            <div>Address:- {buyer.address}</div>
            <div>{buyer.city}</div>
            {buyer.contact && <div>Contact: {buyer.contact}</div>}
            {buyer.phone && <div>Phone: {buyer.phone}</div>}
            {buyer.email && <div>Email: {buyer.email}</div>}
            <div className="mt-1">Place of Supply: {meta.placeOfSupply}</div>
            <div className="font-semibold">GSTIN: {buyer.gstin}</div>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-semibold mb-2">SHIP TO</div>
          <div className="text-xs leading-relaxed">
            <div className="font-bold">{buyer.name}</div>
            <div>Address:- {buyer.address}</div>
            <div>{buyer.city}</div>
            <div className="mt-1">Place of Supply: {meta.placeOfSupply}</div>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <table className="print-grid w-full text-xs border-b border-foreground">
        <thead>
          <tr className="border-b border-foreground bg-muted/30">
            <th className="p-2 text-left border-r border-foreground w-8">Sr.</th>
            <th className="p-2 text-left border-r border-foreground">Description of Goods/Services</th>
            <th className="p-2 text-left border-r border-foreground w-20">HSN/SAC</th>
            <th className="p-2 text-right border-r border-foreground w-12">Qty</th>
            <th className="p-2 text-left border-r border-foreground w-12">Unit</th>
            <th className="p-2 text-right border-r border-foreground w-20">Rate</th>
            {!isComposition && (
              <>
                <th className="p-2 text-right border-r border-foreground w-24">Taxable</th>
                {isInterState ? (
                  <th className="p-2 text-right border-r border-foreground w-20">IGST</th>
                ) : (
                  <>
                    <th className="p-2 text-right border-r border-foreground w-20">CGST</th>
                    <th className="p-2 text-right border-r border-foreground w-20">SGST</th>
                  </>
                )}
              </>
            )}
            <th className="p-2 text-right w-24">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const amounts = lineAmounts(item, isInterState, isComposition);

            return (
              <tr key={item.id} className="border-b border-foreground">
                <td className="p-2 border-r border-foreground">{index + 1}</td>
                <td className="p-2 border-r border-foreground">
                  <div className="font-semibold">{item.item || '-'}</div>
                  {item.description && <div className="text-[10px] mt-1">{item.description}</div>}
                  {item.discount > 0 && <div className="text-[10px] mt-1">Discount: {item.discount}%</div>}
                </td>
                <td className="p-2 border-r border-foreground">{item.hsn || '-'}</td>
                <td className="p-2 text-right border-r border-foreground">{item.qty.toFixed(2)}</td>
                <td className="p-2 border-r border-foreground">{item.unit}</td>
                <td className="p-2 text-right border-r border-foreground">{formatCurrency(item.rate)}</td>
                {!isComposition && (
                  <>
                    <td className="p-2 text-right border-r border-foreground">{formatCurrency(amounts.taxable)}</td>
                    {isInterState ? (
                      <td className="p-2 text-right border-r border-foreground">{formatCurrency(amounts.igst)}</td>
                    ) : (
                      <>
                        <td className="p-2 text-right border-r border-foreground">{formatCurrency(amounts.cgst)}</td>
                        <td className="p-2 text-right border-r border-foreground">{formatCurrency(amounts.sgst)}</td>
                      </>
                    )}
                  </>
                )}
                <td className="p-2 text-right">{formatCurrency(amounts.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="border-b border-foreground">
        <table className="print-rows w-full text-xs">
          <tbody>
            {!isComposition && (
              <>
                <tr className="border-b border-foreground">
                  <td className="p-2 font-semibold">Sub-Total (Taxable)</td>
                  <td className="p-2 text-right font-semibold">₹{formatCurrency(totals.subtotal)}</td>
                </tr>
                {isInterState ? (
                  <tr className="border-b border-foreground">
                    <td className="p-2">Add: IGST</td>
                    <td className="p-2 text-right">₹{formatCurrency(totals.igst)}</td>
                  </tr>
                ) : (
                  <>
                    <tr className="border-b border-foreground">
                      <td className="p-2">Add: CGST</td>
                      <td className="p-2 text-right">₹{formatCurrency(totals.cgst)}</td>
                    </tr>
                    <tr className="border-b border-foreground">
                      <td className="p-2">Add: SGST</td>
                      <td className="p-2 text-right">₹{formatCurrency(totals.sgst)}</td>
                    </tr>
                  </>
                )}
              </>
            )}
            <tr className="border-b border-foreground bg-muted/20">
              <td className="p-2 font-bold">GRAND TOTAL</td>
              <td className="p-2 text-right font-bold">₹{formatCurrency(totals.grandTotal)}</td>
            </tr>
            {isComposition && (
              <>
                <tr className="border-b border-foreground">
                  <td className="p-2 font-semibold" colSpan={2}>Tax Amount (in words) : NIL</td>
                </tr>
                <tr className="border-b border-foreground">
                  <td className="p-2 font-semibold" colSpan={2}>Composition taxable person. Not eligible to collect tax on supplies.</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Amount in Words */}
      <div className="border-b border-foreground p-3 text-xs">
        <span className="font-semibold">Invoice Amount in Words:</span> {numberToWords(totals.grandTotal)}
        <div className="text-right mt-2">E. &amp; O.E.</div>
      </div>

      {/* HSN/SAC-wise Tax Bifurcation (regular / non-composition only) */}
      {!isComposition && taxSummary.rows.length > 0 && (
        <div className="border-b border-foreground">
          <table className="w-full text-xs">
            {/* Every rule here is owned by a cell, never by the <tr>. A row
                border would be painted straight through the rowSpan={2}
                headings when html2canvas rasterises this for the PDF, which
                is what struck a line across "Taxable" and "Total". */}
            <thead>
              <tr className="bg-muted/30">
                <th rowSpan={2} className="p-2 border-r border-b border-foreground text-left align-bottom">HSN/SAC</th>
                <th rowSpan={2} className="p-2 border-r border-b border-foreground text-right align-bottom">Taxable<br />Value</th>
                {isInterState ? (
                  <th colSpan={2} className="p-2 border-r border-b border-foreground text-center">Integrated Tax</th>
                ) : (
                  <>
                    <th colSpan={2} className="p-2 border-r border-b border-foreground text-center">Central Tax</th>
                    <th colSpan={2} className="p-2 border-r border-b border-foreground text-center">State Tax</th>
                  </>
                )}
                <th rowSpan={2} className="p-2 border-b border-foreground text-right align-bottom">Total<br />Tax Amount</th>
              </tr>
              <tr className="bg-muted/30">
                {isInterState ? (
                  <>
                    <th className="p-2 border-r border-b border-foreground text-right">Rate</th>
                    <th className="p-2 border-r border-b border-foreground text-right">Amount</th>
                  </>
                ) : (
                  <>
                    <th className="p-2 border-r border-b border-foreground text-right">Rate</th>
                    <th className="p-2 border-r border-b border-foreground text-right">Amount</th>
                    <th className="p-2 border-r border-b border-foreground text-right">Rate</th>
                    <th className="p-2 border-r border-b border-foreground text-right">Amount</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {taxSummary.rows.map((row, index) => (
                <tr key={index} className="border-b border-foreground">
                  <td className="p-2 border-r border-foreground">{row.hsn}</td>
                  <td className="p-2 border-r border-foreground text-right">{formatCurrency(row.taxable)}</td>
                  {isInterState ? (
                    <>
                      <td className="p-2 border-r border-foreground text-right">{row.rate}%</td>
                      <td className="p-2 border-r border-foreground text-right">{formatCurrency(row.tax)}</td>
                    </>
                  ) : (
                    <>
                      <td className="p-2 border-r border-foreground text-right">{row.rate / 2}%</td>
                      <td className="p-2 border-r border-foreground text-right">{formatCurrency(row.tax / 2)}</td>
                      <td className="p-2 border-r border-foreground text-right">{row.rate / 2}%</td>
                      <td className="p-2 border-r border-foreground text-right">{formatCurrency(row.tax / 2)}</td>
                    </>
                  )}
                  <td className="p-2 text-right">{formatCurrency(row.tax)}</td>
                </tr>
              ))}
              <tr className="border-b border-foreground bg-muted/20 font-semibold">
                <td className="p-2 border-r border-foreground text-right">Total</td>
                <td className="p-2 border-r border-foreground text-right">{formatCurrency(taxSummary.taxable)}</td>
                {isInterState ? (
                  <>
                    <td className="p-2 border-r border-foreground"></td>
                    <td className="p-2 border-r border-foreground text-right">{formatCurrency(taxSummary.tax)}</td>
                  </>
                ) : (
                  <>
                    <td className="p-2 border-r border-foreground"></td>
                    <td className="p-2 border-r border-foreground text-right">{formatCurrency(taxSummary.tax / 2)}</td>
                    <td className="p-2 border-r border-foreground"></td>
                    <td className="p-2 border-r border-foreground text-right">{formatCurrency(taxSummary.tax / 2)}</td>
                  </>
                )}
                <td className="p-2 text-right">{formatCurrency(taxSummary.tax)}</td>
              </tr>
            </tbody>
          </table>
          <div className="p-2 border-t border-foreground text-xs">
            <span className="font-semibold">Tax Amount (in words) :</span> {numberToWords(taxSummary.tax)}
          </div>
        </div>
      )}

      {meta.remarks && (
        <div className="border-b border-foreground p-3 text-xs">
          <span className="font-semibold">Remarks / Narration:</span> {meta.remarks}
        </div>
      )}

      {/* The terms this invoice was issued under, copied onto it at
        * creation. Invoices predating the column have none and simply
        * print no block, exactly as before. `whitespace-pre-line` keeps
        * the line breaks the user typed. */}
      {meta.terms.trim() && (
        <div className="border-b border-foreground p-3 text-xs">
          <div className="font-semibold mb-1">TERMS &amp; CONDITIONS</div>
          <div className="leading-relaxed whitespace-pre-line">{meta.terms}</div>
        </div>
      )}

      {/* Bank Details & Declaration */}
      <div className="grid grid-cols-2">
        <div className="p-4 border-r border-foreground text-xs">
          <div className="font-semibold mb-2">BANK DETAILS</div>
          <div className="leading-relaxed">
            <div>Bank: {company.bankName || '-'}</div>
            <div>A/c No.: {company.bankAccountNumber || '-'}</div>
            <div>IFSC: {company.bankIfsc || '-'}</div>
            {company.bankBranch && <div>Branch: {company.bankBranch}</div>}
          </div>
        </div>
        <div className="p-4 text-xs">
          <div className="font-semibold mb-2">DECLARATION</div>
          <p className="leading-relaxed mb-8">
            We declare that this invoice shows the actual price of the goods/services described
            and that all particulars are true and correct.
          </p>
          <div className="mt-6 text-right">
            <div className="relative ml-auto h-24 w-full max-w-[300px] overflow-hidden">
              <div className="relative z-10 pr-1">For {company.name}</div>
              {company.stamp && (
                <img
                  src={company.stamp}
                  alt={`${company.name} stamp`}
                  className="absolute left-0 -top-2 z-20 max-h-24 max-w-[180px] object-contain opacity-90"
                />
              )}
              {company.esign && (
                <img
                  src={company.esign}
                  alt={`${company.name} signature`}
                  className="absolute right-4 top-1 z-20 max-h-20 max-w-[230px] object-contain"
                />
              )}
              <div className="absolute bottom-0 right-0 z-10 border-t border-foreground inline-block min-w-[184px] px-8 pt-1 text-center">Authorised Signatory</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
