import {
  formatInvoiceCurrency as formatCurrency,
  formatInvoiceDate as formatDate,
  lineAmounts,
  numberToWords,
} from '../../../../lib/invoiceDocument';
import type { InvoiceTemplateProps } from './types';
import { PAGE_CLASS } from './types';

// Colours are written as literals rather than theme tokens: this page is white
// paper in every theme, and the PDF rasteriser clones it outside the app's
// styling context. Anything token-driven risks coming out the wrong shade.
const INK = '#0F172A';
const ACCENT = '#6D28D9';
const SOFT = '#F5F3FF';
const RULE = '#E4E1F2';

/**
 * Modern — the same statutory content as Classic, laid out as a designed
 * document instead of a ruled grid: an accent header band, panelled detail
 * blocks and a single emphasised total. Reads better for service businesses and
 * anyone sending invoices as PDFs rather than printing triplicate sets.
 */
export function Modern({ doc, copyLabel, className = '' }: InvoiceTemplateProps) {
  const { company, buyer, meta, items, totals, taxSummary, isComposition, isInterState } = doc;

  // Right-hand meta rows. Built as data so empty ones simply drop out rather
  // than printing "-" against a heading nobody needs.
  const metaRows: Array<[string, string]> = [
    ['Invoice No.', meta.number],
    ['Date', formatDate(meta.date)],
    ...(meta.dueDate ? ([['Due Date', formatDate(meta.dueDate)]] as Array<[string, string]>) : []),
    ['Place of Supply', meta.placeOfSupply],
    ['Reverse Charge', meta.reverseCharge ? 'YES' : 'NO'],
    ...(meta.customerType ? ([['Customer Type', meta.customerType]] as Array<[string, string]>) : []),
    ...(meta.billType ? ([['Bill Type', meta.billType]] as Array<[string, string]>) : []),
    ...(meta.poNumber
      ? ([['PO No. / Date', `${meta.poNumber}${meta.poDate ? ` / ${formatDate(meta.poDate)}` : ''}`]] as Array<[string, string]>)
      : []),
    ...(meta.transportMode || meta.vehicleNo
      ? ([['Transport', `${meta.transportMode || '-'}${meta.vehicleNo ? ` / ${meta.vehicleNo}` : ''}`]] as Array<[string, string]>)
      : []),
  ];

  return (
    <div
      className={`${PAGE_CLASS} ${className}`}
      style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: INK, border: `1px solid ${RULE}` }}
    >
      {/* Accent band: identity on the left, document name on the right */}
      <div className="px-4 py-3 flex items-start justify-between gap-4" style={{ background: ACCENT }}>
        <div className="flex items-start gap-3 min-w-0">
          {company.logo && (
            <div className="w-16 h-16 shrink-0 rounded bg-white p-1 flex items-center justify-center">
              <img src={company.logo} alt={`${company.name} logo`} className="w-full h-full object-contain" />
            </div>
          )}
          <div className="min-w-0" style={{ color: '#FFFFFF' }}>
            <div className="text-[15px] font-bold leading-tight">{company.name}</div>
            <div className="text-[10px] leading-snug mt-1" style={{ color: '#EDE9FE' }}>
              {company.addressLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
              {company.phone && <div>Phone: {company.phone}</div>}
              {company.email && <div>{company.email}</div>}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0" style={{ color: '#FFFFFF' }}>
          <div className="text-[17px] font-bold tracking-wide">{doc.title}</div>
          <div className="text-[9px] tracking-[0.14em] mt-1" style={{ color: '#DDD6FE' }}>{copyLabel}</div>
        </div>
      </div>

      {/* Statutory identifiers stay immediately under the name, not buried */}
      <div
        className="px-4 py-1 flex flex-wrap gap-x-5 gap-y-0.5 text-[10px] font-semibold"
        style={{ background: SOFT, borderBottom: `1px solid ${RULE}` }}
      >
        <span>GSTIN: {company.gstin}</span>
        {company.pan && <span>PAN: {company.pan}</span>}
        <span>State: {company.state || '-'}</span>
      </div>

      {/* Parties + invoice meta */}
      <div className="grid grid-cols-[1fr_1fr_1.1fr]" style={{ borderBottom: `1px solid ${RULE}` }}>
        <div className="p-3" style={{ borderRight: `1px solid ${RULE}` }}>
          <div className="text-[9px] font-bold tracking-[0.14em] mb-1.5" style={{ color: ACCENT }}>BILL TO</div>
          <div className="text-[10.5px] leading-relaxed">
            <div className="font-bold text-[11.5px]">{buyer.name}</div>
            <div>{buyer.address}</div>
            <div>{buyer.city}</div>
            {buyer.contact && <div>Contact: {buyer.contact}</div>}
            {buyer.phone && <div>Phone: {buyer.phone}</div>}
            {buyer.email && <div>{buyer.email}</div>}
            <div className="font-semibold mt-1">GSTIN: {buyer.gstin}</div>
          </div>
        </div>
        <div className="p-3" style={{ borderRight: `1px solid ${RULE}` }}>
          <div className="text-[9px] font-bold tracking-[0.14em] mb-1.5" style={{ color: ACCENT }}>SHIP TO</div>
          <div className="text-[10.5px] leading-relaxed">
            <div className="font-bold text-[11.5px]">{buyer.name}</div>
            <div>{buyer.address}</div>
            <div>{buyer.city}</div>
            <div className="mt-1">Place of Supply: {meta.placeOfSupply}</div>
          </div>
        </div>
        <div className="p-3">
          <table className="w-full text-[10.5px]">
            <tbody>
              {metaRows.map(([label, value]) => (
                <tr key={label}>
                  <td className="py-1 pr-2 whitespace-nowrap" style={{ color: '#64748B' }}>{label}</td>
                  <td className="py-1 text-right font-semibold">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Line items */}
      <table className="w-full text-[10.5px]" style={{ borderBottom: `1px solid ${RULE}` }}>
        <thead>
          <tr style={{ background: SOFT, color: ACCENT }}>
            <th className="p-2 text-left w-7">#</th>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-left w-16">HSN/SAC</th>
            <th className="p-2 text-right w-12">Qty</th>
            <th className="p-2 text-left w-10">Unit</th>
            <th className="p-2 text-right w-16">Rate</th>
            {!isComposition && (
              <>
                <th className="p-2 text-right w-20">Taxable</th>
                {isInterState ? (
                  <th className="p-2 text-right w-16">IGST</th>
                ) : (
                  <>
                    <th className="p-2 text-right w-16">CGST</th>
                    <th className="p-2 text-right w-16">SGST</th>
                  </>
                )}
              </>
            )}
            <th className="p-2 text-right w-20">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const amounts = lineAmounts(item, isInterState, isComposition);
            return (
              <tr key={item.id} style={{ borderTop: `1px solid ${RULE}` }}>
                <td className="p-2" style={{ color: '#64748B' }}>{index + 1}</td>
                <td className="p-2">
                  <div className="font-semibold">{item.item || '-'}</div>
                  {item.description && <div className="text-[9px] mt-0.5" style={{ color: '#64748B' }}>{item.description}</div>}
                  {item.discount > 0 && <div className="text-[9px] mt-0.5" style={{ color: '#64748B' }}>Discount: {item.discount}%</div>}
                </td>
                <td className="p-2">{item.hsn || '-'}</td>
                <td className="p-2 text-right">{item.qty.toFixed(2)}</td>
                <td className="p-2">{item.unit}</td>
                <td className="p-2 text-right">{formatCurrency(item.rate)}</td>
                {!isComposition && (
                  <>
                    <td className="p-2 text-right">{formatCurrency(amounts.taxable)}</td>
                    {isInterState ? (
                      <td className="p-2 text-right">{formatCurrency(amounts.igst)}</td>
                    ) : (
                      <>
                        <td className="p-2 text-right">{formatCurrency(amounts.cgst)}</td>
                        <td className="p-2 text-right">{formatCurrency(amounts.sgst)}</td>
                      </>
                    )}
                  </>
                )}
                <td className="p-2 text-right font-semibold">{formatCurrency(amounts.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Words on the left, money on the right */}
      <div className="grid grid-cols-[1.35fr_1fr]" style={{ borderBottom: `1px solid ${RULE}` }}>
        <div className="p-3 text-[10.5px]" style={{ borderRight: `1px solid ${RULE}` }}>
          <div className="text-[9px] font-bold tracking-[0.14em] mb-1" style={{ color: ACCENT }}>AMOUNT IN WORDS</div>
          <div className="leading-relaxed">{numberToWords(totals.grandTotal)}</div>
          {isComposition && (
            <div className="mt-2 text-[9.5px] leading-relaxed" style={{ color: '#64748B' }}>
              Composition taxable person. Not eligible to collect tax on supplies.
            </div>
          )}
          <div className="mt-2 text-[9px]" style={{ color: '#64748B' }}>E. &amp; O.E.</div>
        </div>
        <div className="p-3">
          <table className="w-full text-[10.5px]">
            <tbody>
              {!isComposition && (
                <>
                  <tr>
                    <td className="py-1">Sub-Total (Taxable)</td>
                    <td className="py-1 text-right font-semibold">₹{formatCurrency(totals.subtotal)}</td>
                  </tr>
                  {isInterState ? (
                    <tr>
                      <td className="py-1">Add: IGST</td>
                      <td className="py-1 text-right">₹{formatCurrency(totals.igst)}</td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td className="py-1">Add: CGST</td>
                        <td className="py-1 text-right">₹{formatCurrency(totals.cgst)}</td>
                      </tr>
                      <tr>
                        <td className="py-1">Add: SGST</td>
                        <td className="py-1 text-right">₹{formatCurrency(totals.sgst)}</td>
                      </tr>
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
          <div
            className="mt-2 px-3 py-2 flex items-center justify-between rounded"
            style={{ background: ACCENT, color: '#FFFFFF' }}
          >
            <span className="text-[10px] font-semibold tracking-[0.1em]">GRAND TOTAL</span>
            <span className="text-[14px] font-bold">₹{formatCurrency(totals.grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* HSN/SAC-wise bifurcation — mandatory, so it survives the restyle.
        * Rules are set on cells only: a border on the <tr> is painted straight
        * through the rowSpan headings when html2canvas rasterises the page. */}
      {!isComposition && taxSummary.rows.length > 0 && (
        <div style={{ borderBottom: `1px solid ${RULE}` }}>
          <div className="px-3 pt-2 text-[9px] font-bold tracking-[0.14em]" style={{ color: ACCENT }}>
            TAX SUMMARY
          </div>
          <table className="w-full text-[10px]">
            <thead>
              <tr style={{ background: SOFT }}>
                <th rowSpan={2} className="p-2 text-left align-bottom" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>HSN/SAC</th>
                <th rowSpan={2} className="p-2 text-right align-bottom" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>Taxable<br />Value</th>
                {isInterState ? (
                  <th colSpan={2} className="p-2 text-center" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>Integrated Tax</th>
                ) : (
                  <>
                    <th colSpan={2} className="p-2 text-center" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>Central Tax</th>
                    <th colSpan={2} className="p-2 text-center" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>State Tax</th>
                  </>
                )}
                <th rowSpan={2} className="p-2 text-right align-bottom" style={{ borderBottom: `1px solid ${RULE}` }}>Total<br />Tax</th>
              </tr>
              <tr style={{ background: SOFT }}>
                {(isInterState ? ['Rate', 'Amount'] : ['Rate', 'Amount', 'Rate', 'Amount']).map((h, i) => (
                  <th key={i} className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {taxSummary.rows.map((row, index) => (
                <tr key={index}>
                  <td className="p-2" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>{row.hsn}</td>
                  <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>{formatCurrency(row.taxable)}</td>
                  {isInterState ? (
                    <>
                      <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>{row.rate}%</td>
                      <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>{formatCurrency(row.tax)}</td>
                    </>
                  ) : (
                    <>
                      <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>{row.rate / 2}%</td>
                      <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>{formatCurrency(row.tax / 2)}</td>
                      <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>{row.rate / 2}%</td>
                      <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>{formatCurrency(row.tax / 2)}</td>
                    </>
                  )}
                  <td className="p-2 text-right" style={{ borderBottom: `1px solid ${RULE}` }}>{formatCurrency(row.tax)}</td>
                </tr>
              ))}
              <tr className="font-semibold" style={{ background: SOFT }}>
                <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}` }}>Total</td>
                <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}` }}>{formatCurrency(taxSummary.taxable)}</td>
                {isInterState ? (
                  <>
                    <td className="p-2" style={{ borderRight: `1px solid ${RULE}` }}></td>
                    <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}` }}>{formatCurrency(taxSummary.tax)}</td>
                  </>
                ) : (
                  <>
                    <td className="p-2" style={{ borderRight: `1px solid ${RULE}` }}></td>
                    <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}` }}>{formatCurrency(taxSummary.tax / 2)}</td>
                    <td className="p-2" style={{ borderRight: `1px solid ${RULE}` }}></td>
                    <td className="p-2 text-right" style={{ borderRight: `1px solid ${RULE}` }}>{formatCurrency(taxSummary.tax / 2)}</td>
                  </>
                )}
                <td className="p-2 text-right">{formatCurrency(taxSummary.tax)}</td>
              </tr>
            </tbody>
          </table>
          <div className="px-3 py-1 text-[9.5px]" style={{ borderTop: `1px solid ${RULE}`, color: '#64748B' }}>
            <span className="font-semibold">Tax Amount (in words):</span> {numberToWords(taxSummary.tax)}
          </div>
        </div>
      )}

      {(meta.remarks || meta.terms.trim()) && (
        <div className="p-3 text-[10px] leading-relaxed" style={{ borderBottom: `1px solid ${RULE}` }}>
          {meta.remarks && (
            <div className={meta.terms.trim() ? 'mb-2' : ''}>
              <span className="font-semibold">Remarks:</span> {meta.remarks}
            </div>
          )}
          {meta.terms.trim() && (
            <div>
              <div className="text-[9px] font-bold tracking-[0.14em] mb-1" style={{ color: ACCENT }}>TERMS &amp; CONDITIONS</div>
              <div className="whitespace-pre-line">{meta.terms}</div>
            </div>
          )}
        </div>
      )}

      {/* Bank details & signatory */}
      <div className="grid grid-cols-[1fr_1fr]">
        <div className="p-3 text-[10px]" style={{ borderRight: `1px solid ${RULE}` }}>
          <div className="text-[9px] font-bold tracking-[0.14em] mb-1.5" style={{ color: ACCENT }}>BANK DETAILS</div>
          <div className="leading-relaxed">
            <div>Bank: {company.bankName || '-'}</div>
            <div>A/c No.: {company.bankAccountNumber || '-'}</div>
            <div>IFSC: {company.bankIfsc || '-'}</div>
            {company.bankBranch && <div>Branch: {company.bankBranch}</div>}
            {company.bankAccountType && <div>A/c Type: {company.bankAccountType}</div>}
          </div>
          <div className="mt-2 text-[9px] leading-relaxed" style={{ color: '#64748B' }}>
            We declare that this invoice shows the actual price of the goods/services
            described and that all particulars are true and correct.
          </div>
        </div>
        <div className="p-3 text-[10px]">
          <div className="text-right font-semibold">For {company.name}</div>
          <div className="relative ml-auto mt-1 h-20 w-full max-w-[280px] overflow-hidden">
            {company.stamp && (
              <img
                src={company.stamp}
                alt={`${company.name} stamp`}
                className="absolute left-0 top-0 z-20 max-h-20 max-w-[150px] object-contain opacity-90"
              />
            )}
            {company.esign && (
              <img
                src={company.esign}
                alt={`${company.name} signature`}
                className="absolute right-3 top-0 z-20 max-h-16 max-w-[200px] object-contain"
              />
            )}
            <div
              className="absolute bottom-0 right-0 z-10 inline-block min-w-[170px] px-6 pt-1 text-center text-[9.5px]"
              style={{ borderTop: `1px solid ${INK}` }}
            >
              Authorised Signatory
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
