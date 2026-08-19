// The invoice as a printable DOCUMENT — everything a format needs to draw, and
// nothing about how it looks.
//
// Invoice formats (see `invoiceTemplates.ts`) differ in layout, density and
// accent only: GST fixes the CONTENT of a tax invoice, so the title, both
// GSTINs, place of supply, the HSN-wise bifurcation, the copy labels and the
// signatory block appear on every one of them. Deriving all of that here once
// means a new format is a pure layout file — it can never quietly disagree with
// another format about what CGST is due, because it never computes it.
//
// Kept deliberately pure (no hooks, no supabase): `InvoicePreview` fetches the
// company row and calls `buildInvoiceDocument`, and tests/other callers can too.

import { getGstinStateCode, getStateCodeByName } from './gstin';

export interface InvoiceLineItem {
  id: string;
  type?: 'product' | 'service';
  item: string;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number;
  gst: number;
  amount: number;
}

export interface InvoiceCustomer {
  id: string;
  companyName: string;
  gstin: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  state?: string;
  address: string;
}

/** The company row as `InvoicePreview` holds it, before address lines are joined. */
export interface InvoiceCompanyDetails {
  name: string;
  gstin: string;
  state: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  pinCode: string;
  pan: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankBranch: string;
  logo: string;
  esignImage: string;
  stampImage: string;
}

export interface InvoiceDocumentInput {
  lineItems: InvoiceLineItem[];
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  customer?: InvoiceCustomer | null;
  customerType?: string;
  billType?: string;
  placeOfSupply?: string;
  reverseCharge?: boolean;
  poNumber?: string;
  poDate?: string;
  vehicleNo?: string;
  transportMode?: string;
  remarks?: string;
  terms?: string;
  company: InvoiceCompanyDetails;
  /** Composition dealers issue a Bill of Supply and cannot collect tax. */
  isComposition: boolean;
  /** Seller state, resolved by the caller (company row, prop, or GSTIN). */
  companyState: string;
  /** True when place of supply differs from the seller's state → IGST. */
  isInterStateSupply: boolean;
}

export interface InvoiceTaxSummaryRow {
  hsn: string;
  rate: number;
  taxable: number;
  tax: number;
}

export interface InvoiceDocument {
  title: string;
  copies: string[];
  company: {
    name: string;
    gstin: string;
    state: string;
    email: string;
    phone: string;
    /** Address already split into printable lines (street, then city/state/pin). */
    addressLines: string[];
    pan: string;
    /** Two-digit GST state code, e.g. "24". Tally-style formats print it. */
    stateCode: string;
    logo: string;
    esign: string;
    stamp: string;
    bankName: string;
    bankAccountNumber: string;
    bankIfsc: string;
    bankBranch: string;
  };
  buyer: {
    name: string;
    address: string;
    city: string;
    state: string;
    stateCode: string;
    gstin: string;
    contact: string;
    phone: string;
    email: string;
  };
  meta: {
    number: string;
    date: string;
    dueDate?: string;
    placeOfSupply: string;
    reverseCharge: boolean;
    customerType: string;
    billType: string;
    poNumber: string;
    poDate?: string;
    vehicleNo: string;
    transportMode: string;
    remarks: string;
    terms: string;
  };
  items: InvoiceLineItem[];
  totals: {
    subtotal: number;
    totalTax: number;
    cgst: number;
    sgst: number;
    igst: number;
    grandTotal: number;
  };
  taxSummary: {
    rows: InvoiceTaxSummaryRow[];
    taxable: number;
    tax: number;
  };
  isComposition: boolean;
  isInterState: boolean;
}

/** Per-line money, derived the same way for every format. */
export interface InvoiceLineAmounts {
  base: number;
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export function lineAmounts(
  item: InvoiceLineItem,
  isInterState: boolean,
  isComposition: boolean,
): InvoiceLineAmounts {
  const base = item.qty * item.rate;
  const taxable = base - (base * item.discount) / 100;
  const tax = (taxable * item.gst) / 100;
  return {
    base,
    taxable,
    tax,
    cgst: isInterState ? 0 : tax / 2,
    sgst: isInterState ? 0 : tax / 2,
    igst: isInterState ? tax : 0,
    total: isComposition ? taxable : taxable + tax,
  };
}

export function formatInvoiceDate(value?: string): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatInvoiceCurrency(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Tally writes amounts as "INR Eleven Thousand Eight Hundred Only" rather than
 * "Rupees ... Only". Same figure, different house style.
 */
export function amountInWordsInr(num: number): string {
  return numberToWords(num).replace(/^Rupees /, 'INR ');
}

export function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  if (num === 0) return 'Zero';

  const convert = (n: number): string => {
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  };

  return 'Rupees ' + convert(Math.floor(num)) + ' Only';
}

/**
 * How many copies print, and what each is labelled. A service-only invoice has
 * nothing in transit, so it drops the transporter copy.
 */
function invoiceCopies(items: InvoiceLineItem[], billTypeFallback: string): string[] {
  const effective = billTypeFromItems(items, billTypeFallback).trim().toLowerCase();
  if (effective === 'only service') {
    return ['ORIGINAL FOR BUYER', 'DUPLICATE FOR SUPPLIER'];
  }
  return ['ORIGINAL FOR BUYER', 'DUPLICATE FOR TRANSPORTER', 'TRIPLICATE FOR SUPPLIER'];
}

/** The line items decide the bill type; the stored value is only a fallback. */
function billTypeFromItems(items: InvoiceLineItem[], fallback: string): string {
  const hasProducts = items.some((i) => i.type === 'product');
  const hasServices = items.some((i) => i.type === 'service');
  if (hasProducts && hasServices) return 'goods+service';
  if (hasProducts) return 'only goods';
  if (hasServices) return 'only service';
  return fallback || '';
}

export function buildInvoiceDocument(input: InvoiceDocumentInput): InvoiceDocument {
  const {
    lineItems,
    company,
    companyState,
    isComposition,
    isInterStateSupply: isInterState,
  } = input;

  const buyerState = input.customer?.state || '';
  const buyerCity = input.customer?.city || '-';
  const effectivePlaceOfSupply =
    input.placeOfSupply === 'Auto from customer'
      ? buyerState || buyerCity || 'Auto from customer'
      : input.placeOfSupply || buyerState || buyerCity || '-';

  const subtotal = lineItems.reduce(
    (sum, item) => sum + lineAmounts(item, isInterState, isComposition).taxable,
    0,
  );
  const totalTax = lineItems.reduce(
    (sum, item) => sum + lineAmounts(item, isInterState, isComposition).tax,
    0,
  );

  // HSN/SAC-wise bifurcation, grouped by HSN code + GST rate.
  const map = new Map<string, InvoiceTaxSummaryRow>();
  for (const item of lineItems) {
    const { taxable, tax } = lineAmounts(item, isInterState, isComposition);
    const key = `${item.hsn || '-'}|${item.gst}`;
    const existing = map.get(key);
    if (existing) {
      existing.taxable += taxable;
      existing.tax += tax;
    } else {
      map.set(key, { hsn: item.hsn || '-', rate: item.gst, taxable, tax });
    }
  }
  const rows = Array.from(map.values());

  const companyGstin = company.gstin || '-';

  return {
    title: isComposition ? 'BILL OF SUPPLY' : 'TAX INVOICE',
    copies: invoiceCopies(lineItems, input.billType || ''),
    company: {
      name: company.name || 'Your Company',
      gstin: companyGstin,
      state: companyState || '',
      email: company.email || '',
      phone: company.phone || '',
      addressLines: [
        company.address,
        [company.city, companyState, company.pinCode].filter(Boolean).join(', '),
      ].filter(Boolean),
      // Falls back to the PAN embedded in a GSTIN (chars 3–12) when not stored.
      pan: company.pan || (companyGstin.length >= 12 ? companyGstin.slice(2, 12) : ''),
      stateCode: getGstinStateCode(companyGstin) || getStateCodeByName(companyState),
      logo: company.logo || '',
      esign: company.esignImage || '',
      stamp: company.stampImage || '',
      bankName: company.bankName || '',
      bankAccountNumber: company.bankAccountNumber || '',
      bankIfsc: company.bankIfsc || '',
      bankBranch: company.bankBranch || '',
    },
    buyer: {
      name: input.customer?.companyName || 'Customer not selected',
      address: input.customer?.address || '-',
      city: buyerCity,
      state: buyerState,
      stateCode: getGstinStateCode(input.customer?.gstin) || getStateCodeByName(buyerState),
      gstin: input.customer?.gstin || '-',
      contact: input.customer?.contactName || '',
      phone: input.customer?.phone || '',
      email: input.customer?.email || '',
    },
    meta: {
      number: input.invoiceNumber || 'Auto-generated on save',
      date: input.invoiceDate,
      dueDate: input.dueDate,
      placeOfSupply: effectivePlaceOfSupply,
      reverseCharge: Boolean(input.reverseCharge),
      customerType: input.customerType || '',
      billType: billTypeFromItems(lineItems, input.billType || ''),
      poNumber: input.poNumber || '',
      poDate: input.poDate,
      vehicleNo: input.vehicleNo || '',
      transportMode: input.transportMode || '',
      remarks: input.remarks || '',
      terms: input.terms || '',
    },
    items: lineItems,
    totals: {
      subtotal,
      totalTax,
      cgst: isInterState ? 0 : totalTax / 2,
      sgst: isInterState ? 0 : totalTax / 2,
      igst: isInterState ? totalTax : 0,
      grandTotal: subtotal + (isComposition ? 0 : totalTax),
    },
    taxSummary: {
      rows,
      taxable: rows.reduce((sum, r) => sum + r.taxable, 0),
      tax: rows.reduce((sum, r) => sum + r.tax, 0),
    },
    isComposition,
    isInterState,
  };
}
