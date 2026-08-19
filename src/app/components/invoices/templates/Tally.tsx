import {
  amountInWordsInr,
  formatInvoiceCurrency as formatCurrency,
  lineAmounts,
} from '../../../../lib/invoiceDocument';
import type { InvoiceDocument } from '../../../../lib/invoiceDocument';
import type { InvoiceTemplateProps } from './types';
import { PAGE_CLASS } from './types';

/**
 * Tally — a faithful copy of the Tally Prime "Tax Invoice" print, the layout
 * most Indian accountants read without thinking.
 *
 * Deliberate departures from the other formats, all of them Tally's own habits:
 *  - the title sits ABOVE the ruled box, not inside it, and the box is drawn in
 *    pure black rather than the theme's ink;
 *  - the sender's block carries "State Name : X, Code : NN" — hence the state
 *    codes on the document model;
 *  - tax is charged as extra LINES in the particulars column ("Output CGST @9%")
 *    instead of a totals table, so the Amount column adds up to the invoice
 *    total on its own;
 *  - the item area is padded to a fixed height, which is why a one-line Tally
 *    invoice still rules the page down to the same point as a twenty-line one;
 *  - amounts read "INR ... Only", not "Rupees ... Only".
 *
 * Tally prints "Dated" against the invoice date, and leaves Reference No.,
 * Buyer's Order No., Mode/Terms of Payment and Terms of Delivery as ruled but
 * empty cells when there is nothing to put in them. That is not an omission —
 * the empty grid IS the format, so the cells are always drawn.
 */
export function Tally({ doc, copyLabel, className = '' }: InvoiceTemplateProps) {
  const { company, buyer, meta, items, totals, taxSummary, isComposition, isInterState } = doc;

  const box = 'border-black';
  const label = 'text-[8.5px] leading-tight';
  const value = 'text-[10px] font-bold leading-tight';

  // Tally lists tax as its own charge lines, one per rate, under the items.
  const taxLines = buildTaxLines(doc);

  // "10.00 Nos" — blank on service lines, which carry no quantity.
  const quantityOf = (qty: number, unit: string) =>
    qty > 0 ? `${qty.toFixed(2)}${unit ? ` ${unit}` : ''}` : '';

  return (
    <div className={`${PAGE_CLASS} text-black ${className}`} style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Title sits outside the box, as Tally prints it */}
      <div className="pt-3 pb-1.5 text-center">
        <h1 className="text-[13px] font-bold">{isComposition ? 'Bill of Supply' : 'Tax Invoice'}</h1>
        <div className="text-[8px] mt-0.5">({copyLabel})</div>
      </div>

      <div className={`mx-3 border ${box}`}>
        {/* ---- Header: party details left, document references right ---- */}
        <div className="flex">
          <div className={`w-[55%] border-r ${box} flex flex-col`}>
            {/* Seller */}
            <div className={`p-2 border-b ${box}`}>
              <div className="flex gap-2 items-start">
                {company.logo && (
                  <img
                    src={company.logo}
                    alt={`${company.name} logo`}
                    className="w-16 h-14 object-contain flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-[11px] font-bold leading-tight">{company.name}</div>
                  <div className="text-[8.5px] leading-snug mt-0.5">
                    {company.addressLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                    <div>GSTIN/UIN: {company.gstin}</div>
                    <div>
                      State Name : {company.state || '-'}
                      {company.stateCode ? `, Code : ${company.stateCode}` : ''}
                    </div>
                    {company.phone && <div>Contact : {company.phone}</div>}
                    {company.email && <div>E-Mail : {company.email}</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* Buyer — fills whatever height the reference grid leaves */}
            <div className="p-2 flex-1">
              <div className={label}>Buyer (Bill to)</div>
              <div className="text-[10.5px] font-bold leading-tight mt-0.5">{buyer.name}</div>
              <div className="text-[8px] leading-snug">
                <div>{buyer.address}</div>
                {buyer.city && buyer.city !== '-' && <div>{buyer.city}</div>}
              </div>
              <table className="text-[9.5px] leading-snug mt-1">
                <tbody>
                  <tr>
                    <td className="pr-1 align-top">GSTIN/UIN</td>
                    <td className="align-top">: {buyer.gstin}</td>
                  </tr>
                  {/* A GSTIN carries the PAN in characters 3–12 */}
                  {buyer.gstin.length >= 12 && (
                    <tr>
                      <td className="pr-1 align-top">PAN/IT No</td>
                      <td className="align-top">: {buyer.gstin.slice(2, 12)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="pr-1 align-top">State Name</td>
                    <td className="align-top">
                      : {buyer.state || '-'}
                      {buyer.stateCode ? `, Code : ${buyer.stateCode}` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-1 align-top">Place of Supply</td>
                    <td className="align-top">: {meta.placeOfSupply}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Reference grid. Cells are always drawn, filled or not. */}
          <div className="w-[45%] flex flex-col">
            <div className={`flex border-b ${box}`}>
              <div className={`w-1/2 p-1.5 border-r ${box}`}>
                <div className={label}>Invoice No.</div>
                <div className={value}>{meta.number}</div>
              </div>
              <div className="w-1/2 flex flex-col">
                <div className={`p-1.5 border-b ${box} flex-1`}>
                  <div className={label}>Dated</div>
                  <div className={value}>{formatTallyDate(meta.date)}</div>
                </div>
                <div className="p-1.5 flex-1 min-h-[9mm]">
                  <div className={label}>Mode/Terms of Payment</div>
                  <div className={value}>{meta.dueDate ? `Due ${formatTallyDate(meta.dueDate)}` : ''}</div>
                </div>
              </div>
            </div>

            <div className={`flex border-b ${box} min-h-[9mm]`}>
              <div className={`w-1/2 p-1.5 border-r ${box}`}>
                <div className={label}>Reference No. &amp; Date.</div>
                <div className={value}>{meta.reverseCharge ? 'Reverse Charge: YES' : ''}</div>
              </div>
              <div className="w-1/2 p-1.5">
                <div className={label}>Other References</div>
                <div className={value}>{meta.customerType}</div>
              </div>
            </div>

            <div className={`flex border-b ${box} min-h-[9mm]`}>
              <div className={`w-1/2 p-1.5 border-r ${box}`}>
                <div className={label}>Buyer&rsquo;s Order No.</div>
                <div className={value}>{meta.poNumber}</div>
              </div>
              <div className="w-1/2 p-1.5">
                <div className={label}>Dated</div>
                <div className={value}>{meta.poDate ? formatTallyDate(meta.poDate) : ''}</div>
              </div>
            </div>

            <div className="p-1.5 flex-1 min-h-[14mm]">
              <div className={label}>Terms of Delivery</div>
              <div className="text-[9px] leading-snug mt-0.5">
                {[meta.transportMode, meta.vehicleNo].filter(Boolean).join(' / ')}
              </div>
            </div>
          </div>
        </div>

        {/* ---- Particulars ---- */}
        <table className="w-full text-[9.5px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className={`border-t border-b border-r ${box} p-1 w-7 text-left align-top text-[8.5px] font-normal`}>
                Sl<br />No.
              </th>
              <th className={`border-t border-b border-r ${box} p-1 text-center font-normal`}>Particulars</th>
              <th className={`border-t border-b border-r ${box} p-1 w-16 text-center font-normal`}>HSN/SAC</th>
              <th className={`border-t border-b border-r ${box} p-1 w-20 text-center font-normal`}>Quantity</th>
              <th className={`border-t border-b border-r ${box} p-1 w-16 text-center font-normal`}>Rate</th>
              <th className={`border-t border-b border-r ${box} p-1 w-8 text-center font-normal`}>per</th>
              <th className={`border-t border-b ${box} p-1 w-24 text-center font-normal`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const amounts = lineAmounts(item, isInterState, isComposition);
              return (
                <tr key={item.id}>
                  <td className={`border-r ${box} px-1 pt-1 align-top`}>{index + 1}</td>
                  <td className={`border-r ${box} px-1 pt-1 align-top`}>
                    <div className="font-bold text-[10px]">{item.item || '-'}</div>
                    {item.description && <div className="italic text-[9px]">{item.description}</div>}
                    {item.discount > 0 && (
                      <div className="italic text-[9px]">Less : Discount @ {item.discount}%</div>
                    )}
                  </td>
                  <td className={`border-r ${box} px-1 pt-1 align-top`}>{item.hsn || ''}</td>
                  <td className={`border-r ${box} px-1 pt-1 align-top text-right`}>
                    {quantityOf(item.qty, item.unit)}
                  </td>
                  <td className={`border-r ${box} px-1 pt-1 align-top text-right`}>
                    {item.qty > 0 ? formatCurrency(item.rate) : ''}
                  </td>
                  <td className={`border-r ${box} px-1 pt-1 align-top text-right`}>
                    {item.qty > 0 ? item.unit : ''}
                  </td>
                  <td className="px-1 pt-1 align-top text-right font-bold">
                    {formatCurrency(amounts.taxable)}
                  </td>
                </tr>
              );
            })}

            {/* Tax as charge lines, right-aligned in Particulars — Tally's way */}
            {taxLines.map((line) => (
              <tr key={line.key}>
                <td className={`border-r ${box} px-1`}></td>
                <td className={`border-r ${box} px-1 pt-1 text-right font-bold`}>{line.label}</td>
                <td className={`border-r ${box} px-1`}></td>
                <td className={`border-r ${box} px-1`}></td>
                <td className={`border-r ${box} px-1 pt-1 text-right`}>{line.rate}</td>
                <td className={`border-r ${box} px-1 pt-1 text-right italic`}>%</td>
                <td className="px-1 pt-1 text-right font-bold">{formatCurrency(line.amount)}</td>
              </tr>
            ))}

            {/* Tally pads the particulars block to a fixed depth, so a short
              * invoice rules down to the same point as a long one. */}
            <tr>
              <td className={`border-r ${box}`} style={{ height: '38mm' }}></td>
              <td className={`border-r ${box}`}></td>
              <td className={`border-r ${box}`}></td>
              <td className={`border-r ${box}`}></td>
              <td className={`border-r ${box}`}></td>
              <td className={`border-r ${box}`}></td>
              <td></td>
            </tr>

            <tr>
              <td className={`border-t border-r ${box} px-1 py-0.5`}></td>
              <td className={`border-t border-r ${box} px-1 py-0.5 text-right font-bold`}>Total</td>
              <td className={`border-t border-r ${box} px-1 py-0.5`}></td>
              <td className={`border-t border-r ${box} px-1 py-0.5 text-right`}>{totalQuantity(doc)}</td>
              <td className={`border-t border-r ${box} px-1 py-0.5`}></td>
              <td className={`border-t border-r ${box} px-1 py-0.5`}></td>
              <td className={`border-t ${box} px-1 py-0.5 text-right text-[11px] font-bold`}>
                ₹ {formatCurrency(totals.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ---- Amount in words ---- */}
        <div className={`border-t ${box} px-2 py-0.5`}>
          <div className="flex items-baseline justify-between">
            <span className="text-[8.5px]">Amount Chargeable (in words)</span>
            <span className="text-[8.5px] italic">E. &amp; O.E</span>
          </div>
          <div className="text-[10px] font-bold">{amountInWordsInr(totals.grandTotal)}</div>
        </div>

        {/* ---- HSN/SAC bifurcation ----
          * Rules are set on cells, never on the <tr>: a row border is painted
          * straight through the rowSpan headings when html2canvas rasterises
          * the page for the PDF. */}
        {!isComposition && taxSummary.rows.length > 0 && (
          <table className={`w-full text-[9.5px] border-t ${box}`} style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th rowSpan={2} className={`border-b border-r ${box} p-1 text-center font-normal`}>HSN/SAC</th>
                <th className={`border-b border-r ${box} p-1 w-24 text-center font-normal`}>Taxable</th>
                {isInterState ? (
                  <th colSpan={2} className={`border-b border-r ${box} p-1 text-center font-normal`}>IGST</th>
                ) : (
                  <>
                    <th colSpan={2} className={`border-b border-r ${box} p-1 text-center font-normal`}>CGST</th>
                    <th colSpan={2} className={`border-b border-r ${box} p-1 text-center font-normal`}>SGST/UTGST</th>
                  </>
                )}
                <th className={`border-b ${box} p-1 w-24 text-center font-normal`}>Total</th>
              </tr>
              <tr>
                <th className={`border-b border-r ${box} p-1 text-center font-normal`}>Value</th>
                <th className={`border-b border-r ${box} p-1 w-12 text-center font-normal`}>Rate</th>
                <th className={`border-b border-r ${box} p-1 w-20 text-center font-normal`}>Amount</th>
                {!isInterState && (
                  <>
                    <th className={`border-b border-r ${box} p-1 w-12 text-center font-normal`}>Rate</th>
                    <th className={`border-b border-r ${box} p-1 w-20 text-center font-normal`}>Amount</th>
                  </>
                )}
                <th className={`border-b ${box} p-1 text-center font-normal`}>Tax Amount</th>
              </tr>
            </thead>
            <tbody>
              {taxSummary.rows.map((row, index) => (
                <tr key={index}>
                  <td className={`border-r ${box} px-1`}>{row.hsn}</td>
                  <td className={`border-r ${box} px-1 text-right`}>{formatCurrency(row.taxable)}</td>
                  {isInterState ? (
                    <>
                      <td className={`border-r ${box} px-1 text-right`}>{row.rate}%</td>
                      <td className={`border-r ${box} px-1 text-right`}>{formatCurrency(row.tax)}</td>
                    </>
                  ) : (
                    <>
                      <td className={`border-r ${box} px-1 text-right`}>{row.rate / 2}%</td>
                      <td className={`border-r ${box} px-1 text-right`}>{formatCurrency(row.tax / 2)}</td>
                      <td className={`border-r ${box} px-1 text-right`}>{row.rate / 2}%</td>
                      <td className={`border-r ${box} px-1 text-right`}>{formatCurrency(row.tax / 2)}</td>
                    </>
                  )}
                  <td className="px-1 text-right">{formatCurrency(row.tax)}</td>
                </tr>
              ))}
              <tr>
                <td className={`border-t border-r ${box} px-1 text-right font-bold`}>Total</td>
                <td className={`border-t border-r ${box} px-1 text-right font-bold`}>
                  {formatCurrency(taxSummary.taxable)}
                </td>
                {isInterState ? (
                  <>
                    <td className={`border-t border-r ${box} px-1`}></td>
                    <td className={`border-t border-r ${box} px-1 text-right font-bold`}>
                      {formatCurrency(taxSummary.tax)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className={`border-t border-r ${box} px-1`}></td>
                    <td className={`border-t border-r ${box} px-1 text-right font-bold`}>
                      {formatCurrency(taxSummary.tax / 2)}
                    </td>
                    <td className={`border-t border-r ${box} px-1`}></td>
                    <td className={`border-t border-r ${box} px-1 text-right font-bold`}>
                      {formatCurrency(taxSummary.tax / 2)}
                    </td>
                  </>
                )}
                <td className={`border-t ${box} px-1 text-right font-bold`}>{formatCurrency(taxSummary.tax)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {!isComposition && taxSummary.rows.length > 0 && (
          <div className={`border-t ${box} px-2 py-1 text-[9.5px]`}>
            Tax Amount (in words) :{' '}
            <span className="font-bold">{amountInWordsInr(taxSummary.tax)}</span>
          </div>
        )}

        {isComposition && (
          <div className={`border-t ${box} px-2 py-1 text-[9px] italic`}>
            Composition taxable person, not eligible to collect tax on supplies.
          </div>
        )}

        {/* ---- Remarks (left) and bank details + signatory (right) ---- */}
        <div className={`flex border-t ${box}`}>
          <div className="w-1/2 p-2 text-[9.5px]">
            {meta.remarks && (
              <>
                <div className="italic">Remarks:</div>
                <div>{meta.remarks}</div>
              </>
            )}
            {meta.terms.trim() && (
              <div className={meta.remarks ? 'mt-2' : ''}>
                <div className="italic">Terms &amp; Conditions:</div>
                <div className="whitespace-pre-line leading-snug">{meta.terms}</div>
              </div>
            )}
          </div>
          <div className="w-1/2 flex flex-col">
            <div className="p-2 text-[9.5px]">
              <div>Company&rsquo;s Bank Details</div>
              <table className="mt-0.5">
                <tbody>
                  <tr>
                    <td className="pr-1 align-top">Bank Name</td>
                    <td className="align-top">: <span className="font-bold">{company.bankName || '-'}</span></td>
                  </tr>
                  <tr>
                    <td className="pr-1 align-top">A/c No.</td>
                    <td className="align-top">: <span className="font-bold">{company.bankAccountNumber || '-'}</span></td>
                  </tr>
                  {company.bankAccountType && (
                    <tr>
                      <td className="pr-1 align-top">A/c Type</td>
                      <td className="align-top">: <span className="font-bold">{company.bankAccountType}</span></td>
                    </tr>
                  )}
                  <tr>
                    <td className="pr-1 align-top">Branch &amp; IFS Code</td>
                    <td className="align-top">
                      : <span className="font-bold">
                        {[company.bankBranch, company.bankIfsc].filter(Boolean).join(' & ') || '-'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={`mt-auto border-t border-l ${box} p-1.5 text-[9.5px]`}>
              <div className="text-right font-bold">for {company.name}</div>
              <div className="relative h-14">
                {company.stamp && (
                  <img
                    src={company.stamp}
                    alt={`${company.name} stamp`}
                    className="absolute left-0 top-0 max-h-14 max-w-[110px] object-contain opacity-90"
                  />
                )}
                {company.esign && (
                  <img
                    src={company.esign}
                    alt={`${company.name} signature`}
                    className="absolute right-0 top-0 max-h-12 max-w-[160px] object-contain"
                  />
                )}
              </div>
              <div className="text-right">Authorised Signatory</div>
            </div>
          </div>
        </div>
      </div>

      <div className="py-2 text-center text-[9px]">This is a Computer Generated Invoice</div>
    </div>
  );
}

/** Tally's date style: 3-Aug-26. */
function formatTallyDate(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const month = parsed.toLocaleDateString('en-GB', { month: 'short' });
  return `${parsed.getDate()}-${month}-${String(parsed.getFullYear()).slice(-2)}`;
}

interface TaxLine {
  key: string;
  label: string;
  rate: number;
  amount: number;
}

/**
 * The "Output CGST @9%" charge lines. Tally raises one per tax head per rate,
 * so a mixed-rate invoice shows several — grouping by rate is what makes the
 * Amount column foot to the invoice total.
 */
function buildTaxLines(doc: InvoiceDocument): TaxLine[] {
  if (doc.isComposition) return [];

  const byRate = new Map<number, number>();
  for (const item of doc.items) {
    if (!item.gst) continue;
    const { tax } = lineAmounts(item, doc.isInterState, doc.isComposition);
    byRate.set(item.gst, (byRate.get(item.gst) || 0) + tax);
  }

  const lines: TaxLine[] = [];
  for (const [gstRate, tax] of Array.from(byRate.entries()).sort((a, b) => a[0] - b[0])) {
    if (doc.isInterState) {
      lines.push({ key: `igst-${gstRate}`, label: `Output IGST @${gstRate}%`, rate: gstRate, amount: tax });
    } else {
      const half = gstRate / 2;
      lines.push({ key: `cgst-${gstRate}`, label: `Output CGST @${half}%`, rate: half, amount: tax / 2 });
      lines.push({ key: `sgst-${gstRate}`, label: `Output SGST @${half}%`, rate: half, amount: tax / 2 });
    }
  }
  return lines;
}

/** Tally foots the Quantity column only when the invoice actually has quantities. */
function totalQuantity(doc: InvoiceDocument): string {
  const total = doc.items.reduce((sum, item) => sum + (item.qty > 0 ? item.qty : 0), 0);
  if (total <= 0) return '';
  const units = new Set(doc.items.filter((i) => i.qty > 0 && i.unit).map((i) => i.unit));
  return `${total.toFixed(2)}${units.size === 1 ? ` ${Array.from(units)[0]}` : ''}`;
}
