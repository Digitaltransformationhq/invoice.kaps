import {
  formatInvoiceCurrency as formatCurrency,
  formatInvoiceDate as formatDate,
  lineAmounts,
  numberToWords,
} from '../../../../lib/invoiceDocument';
import type { InvoiceTemplateProps } from './types';
import { PAGE_CLASS } from './types';

/**
 * Compact — Classic's ruled grid squeezed so a long invoice still lands on one
 * sheet. Every statutory block is present; what changes is density: smaller
 * type, one line per item instead of a stacked name/description, and the header
 * blocks condensed into single rows.
 *
 * This matters because the PDF pipeline scales a page down to fit A4 — a
 * 40-line invoice in Classic comes out shrunken and hard to read. Starting
 * dense means the fitter has less to take away.
 */
export function Compact({ doc, copyLabel, className = '' }: InvoiceTemplateProps) {
  const { company, buyer, meta, items, totals, taxSummary, isComposition, isInterState } = doc;

  const cell = 'px-1.5 py-1 border-r border-foreground';
  const lastCell = 'px-1.5 py-1';

  return (
    <div
      className={`${PAGE_CLASS} border border-foreground text-[9px] ${className}`}
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      {/* Title row doubles as the copy label — saves a band of vertical space */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-foreground">
        <span className="text-[8px] font-semibold">{copyLabel}</span>
        <h1 className="text-[13px] font-bold tracking-wide">{doc.title}</h1>
        <span className="text-[8px]">E. &amp; O.E.</span>
      </div>

      {/* Seller + invoice meta side by side */}
      <div className="grid grid-cols-[1.25fr_1fr] border-b border-foreground">
        <div className="p-2 border-r border-foreground">
          <div className="flex gap-2 items-start">
            {company.logo && (
              <img
                src={company.logo}
                alt={`${company.name} logo`}
                className="w-14 h-14 object-contain flex-shrink-0"
              />
            )}
            <div className="min-w-0">
              <div className="font-bold text-[11px] leading-tight">{company.name}</div>
              <div className="leading-snug mt-0.5">
                {company.addressLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
                {company.phone && <span>Ph: {company.phone} </span>}
                {company.email && <span>{company.email}</span>}
                <div className="font-semibold mt-0.5">
                  GSTIN: {company.gstin}
                  {company.pan ? ` | PAN: ${company.pan}` : ''}
                </div>
                <div>State: {company.state || '-'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="p-2">
          <table className="w-full">
            <tbody>
              <tr>
                <td className="py-0.5 font-semibold">Invoice No.</td>
                <td className="py-0.5">{meta.number}</td>
                <td className="py-0.5 font-semibold pl-2">Dated</td>
                <td className="py-0.5">{formatDate(meta.date)}</td>
              </tr>
              <tr>
                <td className="py-0.5 font-semibold">Due Date</td>
                <td className="py-0.5">{meta.dueDate ? formatDate(meta.dueDate) : '-'}</td>
                <td className="py-0.5 font-semibold pl-2">Rev. Charge</td>
                <td className="py-0.5">{meta.reverseCharge ? 'YES' : 'NO'}</td>
              </tr>
              <tr>
                <td className="py-0.5 font-semibold">Place of Supply</td>
                <td className="py-0.5" colSpan={3}>{meta.placeOfSupply}</td>
              </tr>
              <tr>
                <td className="py-0.5 font-semibold">Cust. / Bill Type</td>
                <td className="py-0.5" colSpan={3}>
                  {meta.customerType || '-'} / {meta.billType || '-'}
                </td>
              </tr>
              <tr>
                <td className="py-0.5 font-semibold">PO No. / Date</td>
                <td className="py-0.5" colSpan={3}>
                  {meta.poNumber || '-'} {meta.poDate ? `/ ${formatDate(meta.poDate)}` : ''}
                </td>
              </tr>
              <tr>
                <td className="py-0.5 font-semibold">Transport</td>
                <td className="py-0.5" colSpan={3}>
                  {meta.transportMode || '-'} {meta.vehicleNo ? `/ ${meta.vehicleNo}` : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill to / Ship to */}
      <div className="grid grid-cols-2 border-b border-foreground">
        <div className="p-2 border-r border-foreground">
          <span className="font-semibold">BILL TO: </span>
          <span className="font-bold">{buyer.name}</span>
          <div className="leading-snug">
            {buyer.address}{buyer.city && buyer.city !== '-' ? `, ${buyer.city}` : ''}
            {buyer.phone && <span> | Ph: {buyer.phone}</span>}
            <div className="font-semibold">GSTIN: {buyer.gstin}</div>
          </div>
        </div>
        <div className="p-2">
          <span className="font-semibold">SHIP TO: </span>
          <span className="font-bold">{buyer.name}</span>
          <div className="leading-snug">
            {buyer.address}{buyer.city && buyer.city !== '-' ? `, ${buyer.city}` : ''}
            <div>Place of Supply: {meta.placeOfSupply}</div>
          </div>
        </div>
      </div>

      {/* Line items — one row per item, description inline after the name */}
      <table className="print-grid w-full border-b border-foreground">
        <thead>
          <tr className="border-b border-foreground bg-muted/30 font-semibold">
            <th className={`${cell} text-left w-6`}>#</th>
            <th className={`${cell} text-left`}>Description of Goods/Services</th>
            <th className={`${cell} text-left w-14`}>HSN</th>
            <th className={`${cell} text-right w-10`}>Qty</th>
            <th className={`${cell} text-left w-8`}>Unit</th>
            <th className={`${cell} text-right w-14`}>Rate</th>
            {!isComposition && (
              <>
                <th className={`${cell} text-right w-16`}>Taxable</th>
                {isInterState ? (
                  <th className={`${cell} text-right w-14`}>IGST</th>
                ) : (
                  <>
                    <th className={`${cell} text-right w-14`}>CGST</th>
                    <th className={`${cell} text-right w-14`}>SGST</th>
                  </>
                )}
              </>
            )}
            <th className={`${lastCell} text-right w-16`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const amounts = lineAmounts(item, isInterState, isComposition);
            return (
              <tr key={item.id} className="border-b border-foreground">
                <td className={cell}>{index + 1}</td>
                <td className={cell}>
                  <span className="font-semibold">{item.item || '-'}</span>
                  {item.description && <span> — {item.description}</span>}
                  {item.discount > 0 && <span> (Disc {item.discount}%)</span>}
                </td>
                <td className={cell}>{item.hsn || '-'}</td>
                <td className={`${cell} text-right`}>{item.qty.toFixed(2)}</td>
                <td className={cell}>{item.unit}</td>
                <td className={`${cell} text-right`}>{formatCurrency(item.rate)}</td>
                {!isComposition && (
                  <>
                    <td className={`${cell} text-right`}>{formatCurrency(amounts.taxable)}</td>
                    {isInterState ? (
                      <td className={`${cell} text-right`}>{formatCurrency(amounts.igst)}</td>
                    ) : (
                      <>
                        <td className={`${cell} text-right`}>{formatCurrency(amounts.cgst)}</td>
                        <td className={`${cell} text-right`}>{formatCurrency(amounts.sgst)}</td>
                      </>
                    )}
                  </>
                )}
                <td className={`${lastCell} text-right`}>{formatCurrency(amounts.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Words and totals share one band instead of stacking */}
      <div className="grid grid-cols-[1.4fr_1fr] border-b border-foreground">
        <div className="p-2 border-r border-foreground leading-snug">
          <span className="font-semibold">Amount in Words:</span> {numberToWords(totals.grandTotal)}
          {isComposition && (
            <div className="mt-1">
              Composition taxable person. Not eligible to collect tax on supplies.
            </div>
          )}
          {meta.remarks && (
            <div className="mt-1">
              <span className="font-semibold">Remarks:</span> {meta.remarks}
            </div>
          )}
        </div>
        <div>
          <table className="print-rows w-full">
            <tbody>
              {!isComposition && (
                <>
                  <tr className="border-b border-foreground">
                    <td className="px-2 py-0.5 font-semibold">Sub-Total (Taxable)</td>
                    <td className="px-2 py-0.5 text-right font-semibold">₹{formatCurrency(totals.subtotal)}</td>
                  </tr>
                  {isInterState ? (
                    <tr className="border-b border-foreground">
                      <td className="px-2 py-0.5">Add: IGST</td>
                      <td className="px-2 py-0.5 text-right">₹{formatCurrency(totals.igst)}</td>
                    </tr>
                  ) : (
                    <>
                      <tr className="border-b border-foreground">
                        <td className="px-2 py-0.5">Add: CGST</td>
                        <td className="px-2 py-0.5 text-right">₹{formatCurrency(totals.cgst)}</td>
                      </tr>
                      <tr className="border-b border-foreground">
                        <td className="px-2 py-0.5">Add: SGST</td>
                        <td className="px-2 py-0.5 text-right">₹{formatCurrency(totals.sgst)}</td>
                      </tr>
                    </>
                  )}
                </>
              )}
              <tr className="bg-muted/20">
                <td className="px-2 py-1 text-[10.5px] font-bold">GRAND TOTAL</td>
                <td className="px-2 py-1 text-right text-[10.5px] font-bold">₹{formatCurrency(totals.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* HSN/SAC bifurcation. Rules live on cells, never on the <tr> — a row
        * border is painted through the rowSpan headings when html2canvas
        * rasterises the page for the PDF. */}
      {!isComposition && taxSummary.rows.length > 0 && (
        <div className="border-b border-foreground">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/30 font-semibold">
                <th rowSpan={2} className="px-1.5 py-1 border-r border-b border-foreground text-left align-bottom">HSN/SAC</th>
                <th rowSpan={2} className="px-1.5 py-1 border-r border-b border-foreground text-right align-bottom">Taxable Value</th>
                {isInterState ? (
                  <th colSpan={2} className="px-1.5 py-1 border-r border-b border-foreground text-center">Integrated Tax</th>
                ) : (
                  <>
                    <th colSpan={2} className="px-1.5 py-1 border-r border-b border-foreground text-center">Central Tax</th>
                    <th colSpan={2} className="px-1.5 py-1 border-r border-b border-foreground text-center">State Tax</th>
                  </>
                )}
                <th rowSpan={2} className="px-1.5 py-1 border-b border-foreground text-right align-bottom">Total Tax</th>
              </tr>
              <tr className="bg-muted/30 font-semibold">
                {(isInterState ? ['Rate', 'Amount'] : ['Rate', 'Amount', 'Rate', 'Amount']).map((h, i) => (
                  <th key={i} className="px-1.5 py-1 border-r border-b border-foreground text-right">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {taxSummary.rows.map((row, index) => (
                <tr key={index} className="border-b border-foreground">
                  <td className={cell}>{row.hsn}</td>
                  <td className={`${cell} text-right`}>{formatCurrency(row.taxable)}</td>
                  {isInterState ? (
                    <>
                      <td className={`${cell} text-right`}>{row.rate}%</td>
                      <td className={`${cell} text-right`}>{formatCurrency(row.tax)}</td>
                    </>
                  ) : (
                    <>
                      <td className={`${cell} text-right`}>{row.rate / 2}%</td>
                      <td className={`${cell} text-right`}>{formatCurrency(row.tax / 2)}</td>
                      <td className={`${cell} text-right`}>{row.rate / 2}%</td>
                      <td className={`${cell} text-right`}>{formatCurrency(row.tax / 2)}</td>
                    </>
                  )}
                  <td className={`${lastCell} text-right`}>{formatCurrency(row.tax)}</td>
                </tr>
              ))}
              <tr className="border-b border-foreground bg-muted/20 font-semibold">
                <td className={`${cell} text-right`}>Total</td>
                <td className={`${cell} text-right`}>{formatCurrency(taxSummary.taxable)}</td>
                {isInterState ? (
                  <>
                    <td className={cell}></td>
                    <td className={`${cell} text-right`}>{formatCurrency(taxSummary.tax)}</td>
                  </>
                ) : (
                  <>
                    <td className={cell}></td>
                    <td className={`${cell} text-right`}>{formatCurrency(taxSummary.tax / 2)}</td>
                    <td className={cell}></td>
                    <td className={`${cell} text-right`}>{formatCurrency(taxSummary.tax / 2)}</td>
                  </>
                )}
                <td className={`${lastCell} text-right`}>{formatCurrency(taxSummary.tax)}</td>
              </tr>
            </tbody>
          </table>
          <div className="px-2 py-1 border-t border-foreground">
            <span className="font-semibold">Tax Amount (in words):</span> {numberToWords(taxSummary.tax)}
          </div>
        </div>
      )}

      {meta.terms.trim() && (
        <div className="px-2 py-1 border-b border-foreground leading-snug">
          <span className="font-semibold">Terms &amp; Conditions:</span>{' '}
          <span className="whitespace-pre-line">{meta.terms}</span>
        </div>
      )}

      {/* Bank details, declaration and signatory in one band */}
      <div className="grid grid-cols-[1fr_1fr_0.9fr]">
        <div className="p-2 border-r border-foreground leading-snug">
          <div className="font-semibold">BANK DETAILS</div>
          <div>Bank: {company.bankName || '-'}</div>
          <div>A/c: {company.bankAccountNumber || '-'}</div>
          <div>IFSC: {company.bankIfsc || '-'}</div>
          {company.bankBranch && <div>Branch: {company.bankBranch}</div>}
        </div>
        <div className="p-2 border-r border-foreground leading-snug">
          <div className="font-semibold">DECLARATION</div>
          <p>
            We declare that this invoice shows the actual price of the goods/services
            described and that all particulars are true and correct.
          </p>
        </div>
        <div className="p-2">
          <div className="text-right font-semibold">For {company.name}</div>
          <div className="relative ml-auto mt-0.5 h-16 w-full overflow-hidden">
            {company.stamp && (
              <img
                src={company.stamp}
                alt={`${company.name} stamp`}
                className="absolute left-0 top-0 z-20 max-h-16 max-w-[110px] object-contain opacity-90"
              />
            )}
            {company.esign && (
              <img
                src={company.esign}
                alt={`${company.name} signature`}
                className="absolute right-1 top-0 z-20 max-h-12 max-w-[150px] object-contain"
              />
            )}
            <div className="absolute bottom-0 right-0 z-10 border-t border-foreground inline-block min-w-[130px] px-3 pt-0.5 text-center">
              Authorised Signatory
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
