import { supabase } from './supabase';

export interface QuotationLineItem {
  id: string;
  itemId?: string;
  item: string;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number;
  gst: number;
}

export interface QuotationRecord {
  id: string;
  company_id: string;
  quotation_number: string;
  quotation_date: string;
  valid_until: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_details: Record<string, string>;
  line_items: QuotationLineItem[];
  subtotal: number;
  total_tax: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  notes: string | null;
  terms: string | null;
  created_at: string;
  updated_at: string;
}

type AppUser = { id: string; role: 'owner' | 'auditor'; company_id?: string } | null | undefined;

async function auditorRequest<T>(user: AppUser, action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc('quotation_auditor_request', {
    p_auditor_id: user?.id,
    p_action: action,
    p_payload: payload,
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Quotation request failed');
  return data.data as T;
}

export async function listQuotations(user: AppUser): Promise<QuotationRecord[]> {
  if (user?.role === 'auditor') return auditorRequest<QuotationRecord[]>(user, 'select');
  const { data, error } = await supabase
    .from('quotations')
    .select('*')
    .eq('company_id', user?.company_id)
    .order('quotation_date', { ascending: false });
  if (error) throw error;
  return (data || []) as QuotationRecord[];
}

export async function getQuotation(user: AppUser, id: string): Promise<QuotationRecord> {
  if (user?.role === 'auditor') return auditorRequest<QuotationRecord>(user, 'get', { id });
  const { data, error } = await supabase
    .from('quotations')
    .select('*')
    .eq('company_id', user?.company_id)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as QuotationRecord;
}

export async function saveQuotation(
  user: AppUser,
  record: Omit<QuotationRecord, 'id' | 'created_at' | 'updated_at'>,
  id?: string,
): Promise<QuotationRecord> {
  if (user?.role === 'auditor') {
    return auditorRequest<QuotationRecord>(user, id ? 'update' : 'insert', { id, record });
  }
  const query = id
    ? supabase.from('quotations').update(record).eq('id', id).eq('company_id', user?.company_id)
    : supabase.from('quotations').insert(record);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data as QuotationRecord;
}

export async function updateQuotationStatus(user: AppUser, id: string, status: QuotationRecord['status']) {
  if (user?.role === 'auditor') return auditorRequest<QuotationRecord>(user, 'status', { id, status });
  const { data, error } = await supabase
    .from('quotations')
    .update({ status })
    .eq('id', id)
    .eq('company_id', user?.company_id)
    .select('*')
    .single();
  if (error) throw error;
  return data as QuotationRecord;
}

export async function deleteQuotation(user: AppUser, id: string) {
  if (user?.role === 'auditor') return auditorRequest<null>(user, 'delete', { id });
  const { error } = await supabase.from('quotations').delete().eq('id', id).eq('company_id', user?.company_id);
  if (error) throw error;
}

export function quotationAmounts(items: QuotationLineItem[]) {
  return items.reduce((sum, item) => {
    const base = Number(item.qty || 0) * Number(item.rate || 0);
    const taxable = base - (base * Number(item.discount || 0)) / 100;
    const tax = taxable * Number(item.gst || 0) / 100;
    return { subtotal: sum.subtotal + taxable, tax: sum.tax + tax, total: sum.total + taxable + tax };
  }, { subtotal: 0, tax: 0, total: 0 });
}

export function nextQuotationNumber(rows: Pick<QuotationRecord, 'quotation_number'>[]) {
  const highest = rows.reduce((max, row) => {
    const match = /(\d+)\s*$/.exec(row.quotation_number || '');
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  return `QT-${String(highest + 1).padStart(4, '0')}`;
}
