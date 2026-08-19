import {
  formatInvoiceCurrency as formatCurrency,
  lineAmounts,
  numberToWords,
} from '../../../../lib/invoiceDocument';
import type { InvoiceTemplateProps } from './types';
import { PAGE_CLASS_ROLL } from './types';

/**
 * Retail Receipt — the 80mm thermal till roll an electronics or department
 * store hands you at the counter.
 *
 * This is the one format that is not a sheet of paper. It prints on continuous
 * roll stock, so the PDF page grows to whatever the content measures rather
 * than being fitted to A4 — see `ROLL_80MM_PAPER` in `invoicePdf.ts`, which is
 * what the registry hands the PDF pipeline for this format.
 *
 * Everything is single-column and centred-or-full-width, because 80mm minus
 * margins leaves about 72mm: there is no room for the side-by-side party blocks
 * the sheet formats use. Amounts stay in a monospace face so the rupee columns
 * line up the way a printed till roll does.
 *
 * It still carries what a tax invoice must: both GSTINs, place of supply, the
 * HSN-wise tax summary and the amount in words. A counter receipt is a tax
 * invoice — being small does not exempt it.
 */
export function ThermalRoll({ doc, copyLabel, className = '' }: InvoiceTemplateProps) {
  const { company, buyer, meta, items, totals, taxSummary, isComposition, isInterState } = doc;

  const rule = <div className="border-t border-dashed border-black my-1" />;
  const hasBuyer = buyer.name !== 'Customer not selected';

  return (
    <div
      className={`${PAGE_CLASS_ROLL} text-black px-2 py-3 text-[9px] leading-tight ${className}`}
      style={{ fontFamily: "'Courier New', Courier, monospace" }}
    >
      {/* ---- Store identity ---- */}
      <div className="text-center">
        {company.logo && (
          <img
            src={company.logo}
            alt={`${company.name} logo`}
            className="mx-auto mb-1 max-h-12 max-w-[40mm] object-contain"
          />
        )}
        <div className="text-[12px] font-bold leading-tight">{company.name}</div>
        {company.addressLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
        {company.phone && <div>Ph: {company.phone}</div>}
        {company.email && <div className="break-all">{company.email}</div>}
        <div className="font-bold mt-0.5">GSTIN: {company.gstin}</div>
        {company.state && (
          <div>
            State: {company.state}
            {company.stateCode ? ` (${company.stateCode})` : ''}
          </div>
        )}
      </div>

      {rule}

      <div className="text-center text-[11px] font-bold tracking-wide">
        {isComposition ? 'BILL OF SUPPLY' : 'TAX INVOICE'}
      </div>
      <div className="text-center text-[8px]">{copyLabel}</div>

      {rule}

      {/* ---- Bill reference ---- */}
      <Row label="Bill No" value={meta.number} />
      <Row label="Date" value={formatReceiptDate(meta.date)} />
      {meta.dueDate && <Row label="Due" value={formatReceiptDate(meta.dueDate)} />}
      <Row label="Supply" value={meta.placeOfSupply} />
      {meta.reverseCharge && <Row label="Rev. Charge" value="YES" />}

      {hasBuyer && (
        <>
          {rule}
          <div className="font-bold">CUSTOMER</div>
          <div>{buyer.name}</div>
          {buyer.address && buyer.address !== '-' && <div>{buyer.address}</div>}
          {buyer.city && buyer.city !== '-' && <div>{buyer.city}</div>}
          {buyer.phone && <div>Ph: {buyer.phone}</div>}
          {buyer.gstin && buyer.gstin !== '-' && <div>GSTIN: {buyer.gstin}</div>}
        </>
      )}

      {rule}

      {/* ---- Items. Name on its own line, the maths beneath it — a 72mm
        * column cannot hold a name and five figures side by side. ---- */}
      <div className="flex justify-between font-bold">
        <span>ITEM</span>
        <span>AMOUNT</span>
      </div>
      <div className="border-t border-black mt-0.5 mb-1" />

      {items.map((item, index) => {
        const amounts = lineAmounts(item, isInterState, isComposition);
        return (
          <div key={item.id} className="mb-1">
            <div className="font-bold">
              {index + 1}. {item.item || '-'}
            </div>
            {item.description && <div className="pl-3 text-[8px]">{item.description}</div>}
            <div className="flex justify-between pl-3">
              <span>
                {item.qty.toFixed(2)}
                {item.unit ? ` ${item.unit}` : ''} x {formatCurrency(item.rate)}
              </span>
              <span>{formatCurrency(amounts.base)}</span>
            </div>
            {item.discount > 0 && (
              <div className="flex justify-between pl-3">
                <span>Disc {item.discount}%</span>
                <span>-{formatCurrency(amounts.base - amounts.taxable)}</span>
              </div>
            )}
            <div className="flex justify-between pl-3 text-[8px]">
              <span>
                HSN {item.hsn || '-'}
                {!isComposition && item.gst ? ` | GST ${item.gst}%` : ''}
              </span>
              <span className="font-bold">{formatCurrency(amounts.total)}</span>
            </div>
          </div>
        );
      })}

      <div className="border-t border-black my-1" />

      {/* ---- Money ---- */}
      <Row label={`Sub-total (${items.length} item${items.length === 1 ? '' : 's'})`} value={formatCurrency(totals.subtotal)} />
      {!isComposition && (
        isInterState ? (
          <Row label="IGST" value={formatCurrency(totals.igst)} />
        ) : (
          <>
            <Row label="CGST" value={formatCurrency(totals.cgst)} />
            <Row label="SGST" value={formatCurrency(totals.sgst)} />
          </>
        )
      )}

      <div className="border-t border-black my-1" />
      <div className="flex justify-between text-[13px] font-bold">
        <span>TOTAL</span>
        <span>{formatCurrency(totals.grandTotal)}</span>
      </div>
      <div className="border-t border-black my-1" />

      <div className="text-[8px]">{numberToWords(totals.grandTotal)}</div>

      {/* ---- HSN-wise tax summary. Required on a tax invoice, so it prints
        * here too — stacked per HSN rather than as a wide table. ---- */}
      {!isComposition && taxSummary.rows.length > 0 && (
        <>
          {rule}
          <div className="font-bold text-[8px]">TAX SUMMARY</div>
          <div className="flex justify-between text-[8px] font-bold">
            <span>HSN</span>
            <span>TAXABLE</span>
            <span>TAX</span>
          </div>
          {taxSummary.rows.map((row, index) => (
            <div key={index} className="flex justify-between text-[8px]">
              <span>
                {row.hsn} @{row.rate}%
              </span>
              <span>{formatCurrency(row.taxable)}</span>
              <span>{formatCurrency(row.tax)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[8px] font-bold">
            <span>Total</span>
            <span>{formatCurrency(taxSummary.taxable)}</span>
            <span>{formatCurrency(taxSummary.tax)}</span>
          </div>
        </>
      )}

      {isComposition && (
        <>
          {rule}
          <div className="text-[8px]">
            Composition taxable person, not eligible to collect tax on supplies.
          </div>
        </>
      )}

      {/* ---- Bank, remarks, terms ---- */}
      {company.bankName && (
        <>
          {rule}
          <div className="text-[8px]">
            <div className="font-bold">BANK</div>
            <div>{company.bankName}</div>
            {company.bankAccountNumber && <div>A/c: {company.bankAccountNumber}</div>}
            {company.bankIfsc && <div>IFSC: {company.bankIfsc}</div>}
          </div>
        </>
      )}

      {meta.remarks && (
        <>
          {rule}
          <div className="text-[8px]">{meta.remarks}</div>
        </>
      )}

      {meta.terms.trim() && (
        <>
          {rule}
          <div className="text-[8px] whitespace-pre-line leading-snug">{meta.terms}</div>
        </>
      )}

      {rule}

      {/* ---- Sign-off ---- */}
      <div className="text-center">
        {company.esign && (
          <img
            src={company.esign}
            alt={`${company.name} signature`}
            className="mx-auto max-h-10 max-w-[40mm] object-contain"
          />
        )}
        <div className="text-[8px]">for {company.name}</div>
        <div className="text-[10px] font-bold mt-2">THANK YOU — VISIT AGAIN!</div>
        <div className="text-[7.5px] mt-1">This is a computer generated invoice.</div>
      </div>
    </div>
  );
}

/** Label left, figure right — the only layout a 72mm column allows. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="whitespace-nowrap">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

/** Counter receipts print short dates: 03/08/26. */
function formatReceiptDate(value?: string): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${String(parsed.getFullYear()).slice(-2)}`;
}
