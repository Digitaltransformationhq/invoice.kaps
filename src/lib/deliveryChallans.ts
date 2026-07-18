// Delivery challans — Rule 55, CGST Rules 2017.
//
// The rule logic lives here rather than in the components so there is exactly
// one answer to "does this challan show tax?" and "does it need an invoice?".
// Getting that wrong misrepresents a non-supply as a supply on a document that
// travels with the goods and gets inspected.

export type ChallanPurpose =
  | 'lot_supply'
  | 'quantity_unknown'
  | 'job_work'
  | 'approval'
  | 'other_than_supply';

export type ChallanPurposeMeta = {
  value: ChallanPurpose;
  label: string;
  /** Shown under the picker so the user chooses by situation, not by jargon. */
  hint: string;
  rule: string;
  /**
   * Rule 55(2)(vii): tax rate and amount are shown ONLY where the transport is
   * for supply to the consignee. Everything tax-related keys off this.
   */
  isSupplyToConsignee: boolean;
  /** Rule 55(5)(a): the complete invoice precedes the first consignment. */
  requiresInvoice: boolean;
  /** Goods are expected back — job work (s.143) and approval (s.31(7)). */
  tracksReturn: boolean;
  /** Default days until that return/deadline date. */
  returnDays?: number;
  /** The label for that date, which differs in kind between the two. */
  returnLabel?: string;
  /** Rule 55(2)(v): quantity may be provisional where not known at removal. */
  provisionalQuantity: boolean;
};

export const CHALLAN_PURPOSES: ChallanPurposeMeta[] = [
  {
    value: 'job_work',
    label: 'Job work',
    hint: 'Material sent out for processing. Not a supply, so no GST on the challan.',
    rule: 'Rule 55(1)(b)',
    isSupplyToConsignee: false,
    requiresInvoice: false,
    tracksReturn: true,
    // Section 143: inputs must return within 1 year (capital goods, 3 years).
    returnDays: 365,
    returnLabel: 'Expected return date',
    provisionalQuantity: false,
  },
  {
    value: 'lot_supply',
    label: 'Consignment against an invoice',
    hint: 'Goods sent in batches, or knocked-down, against an invoice already raised. GST applies.',
    rule: 'Rule 55(5)',
    isSupplyToConsignee: true,
    requiresInvoice: true,
    tracksReturn: false,
    provisionalQuantity: false,
  },
  {
    value: 'approval',
    label: 'Sale on approval',
    hint: 'Customer may keep or return the goods. The invoice follows only if they keep them.',
    rule: 'Rule 55(1)(c), s.31(7)',
    isSupplyToConsignee: false,
    requiresInvoice: false,
    tracksReturn: true,
    // Section 31(7): the invoice is due at the time of supply OR six months from
    // removal, whichever is EARLIER. This is a legal deadline, not a reminder.
    returnDays: 182,
    returnLabel: 'Invoice deadline (6 months from removal)',
    provisionalQuantity: false,
  },
  {
    value: 'quantity_unknown',
    label: 'Quantity not known at dispatch',
    hint: 'Liquid gas and similar, where the exact quantity is only known on delivery. GST applies.',
    rule: 'Rule 55(1)(a)',
    isSupplyToConsignee: true,
    requiresInvoice: false,
    tracksReturn: false,
    provisionalQuantity: true,
  },
  {
    value: 'other_than_supply',
    label: 'Movement other than supply',
    hint: 'Branch or godown transfer, repair, exhibition, demo. Not a sale, so no GST.',
    rule: 'Rule 55(1)(c)',
    isSupplyToConsignee: false,
    requiresInvoice: false,
    tracksReturn: false,
    provisionalQuantity: false,
  },
];

export function challanPurposeMeta(purpose: string): ChallanPurposeMeta {
  return (
    CHALLAN_PURPOSES.find((p) => p.value === purpose) ??
    CHALLAN_PURPOSES.find((p) => p.value === 'job_work')!
  );
}

// The triplicate Rule 55(3) demands. Wording is consignee/consigner — not the
// buyer/supplier an invoice uses; a challan movement need not be a sale.
export const CHALLAN_COPIES = [
  'ORIGINAL FOR CONSIGNEE',
  'DUPLICATE FOR TRANSPORTER',
  'TRIPLICATE FOR CONSIGNER',
];

// Indian financial year for a date: April → March, rendered "2025-26".
export function getFinancialYear(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const startYear = date.getUTCMonth() + 1 >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Suggest the next challan number from the numbers already issued.
 *
 * Derived from the HIGHEST number in the current financial year, not the row
 * count: counting rows means deleting a challan rewinds the sequence onto a
 * number already sent out with goods (the defect just fixed on invoices, and
 * still live in credit notes and receipts).
 *
 * Because it reads the highest, a user migrating from other billing software
 * simply types their own number on the first challan — DC-2025-26-501 — and the
 * next one continues from it. No configuration needed.
 */
export function suggestChallanNumber(existingNumbers: string[], challanDate: string): string {
  const fy = getFinancialYear(challanDate);
  const prefix = `DC-${fy}-`;

  const highest = existingNumbers.reduce((max, number) => {
    if (!number?.startsWith(prefix)) return max;
    const match = /(\d+)\s*$/.exec(number);
    const value = match ? Number(match[1]) : 0;
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);

  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}

export type DispatchedMap = Record<string, number>;

/**
 * How much of each invoice line has already gone out, keyed by invoice_item_id.
 *
 * Cancelled challans release their quantity — the goods did not go.
 */
export function dispatchedByInvoiceItem(
  challans: Array<{ status?: string; delivery_challan_items?: Array<{ invoice_item_id?: string | null; quantity?: number }> }>
): DispatchedMap {
  const dispatched: DispatchedMap = {};
  for (const challan of challans) {
    if (challan.status === 'cancelled') continue;
    for (const item of challan.delivery_challan_items || []) {
      if (!item.invoice_item_id) continue;
      dispatched[item.invoice_item_id] = (dispatched[item.invoice_item_id] || 0) + (Number(item.quantity) || 0);
    }
  }
  return dispatched;
}

export function remainingQuantity(invoiceQty: number, dispatched: number): number {
  // Never negative: an over-dispatch (from a pre-existing row or a race) should
  // read as "nothing left", not as a negative that silently adds quantity back.
  return Math.max(0, Number((invoiceQty - dispatched).toFixed(3)));
}
