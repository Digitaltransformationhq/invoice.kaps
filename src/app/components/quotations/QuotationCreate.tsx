import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, Eye, Plus, Save, Send, Trash2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { selectForUser } from '../../../lib/auditorData';
import { getQuotation, listQuotations, nextQuotationNumber, quotationAmounts, saveQuotation, type QuotationLineItem, type QuotationRecord } from '../../../lib/quotations';
import { QuotationPreview } from './QuotationPreview';

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (value: string, days: number) => {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const blankItem = (): QuotationLineItem => ({ id: crypto.randomUUID(), itemId: '', item: '', description: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, discount: 0, gst: 18 });
const field = 'w-full h-11 rounded-lg border border-violet-300 dark:border-violet-400/30 bg-input-background px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition';
const money = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Customer { id: string; name: string; gstin: string; email: string; phone: string; address: string; city: string; state: string }
interface CatalogItem { id: string; name: string; description: string; hsn: string; unit: string; rate: number; gst: number }

export function QuotationCreate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id') || undefined;
  const initialItem = useMemo(blankItem, []);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(localDate());
  const [validUntil, setValidUntil] = useState(addDays(localDate(), 30));
  const [items, setItems] = useState<QuotationLineItem[]>([initialItem]);
  const [status, setStatus] = useState<QuotationRecord['status']>('draft');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Prices are valid until the date shown above. Work will commence after written approval. Payment terms: 50% advance, balance on completion.');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState(initialItem.id);
  const selectedCustomer = customers.find(customer => customer.id === customerId);
  const totals = useMemo(() => quotationAmounts(items), [items]);

  useEffect(() => {
    if (!user?.company_id) return;
    Promise.all([
      selectForUser<any[]>(user, 'customers', 'customers', () => supabase.from('customers').select('id,name,gstin,email,phone,address,city,state').eq('company_id', user.company_id).eq('is_active', true).order('name')),
      selectForUser<any[]>(user, 'items', 'items', () => supabase.from('items').select('id,name,description,hsn,unit,selling_price,gst_rate').eq('company_id', user.company_id).eq('is_active', true).order('name')),
    ]).then(([customerResult, itemResult]) => {
      if (!customerResult.error) setCustomers((customerResult.data || []).map(c => ({ id: c.id, name: c.name || '', gstin: c.gstin || '', email: c.email || '', phone: c.phone || '', address: c.address || '', city: c.city || '', state: c.state || '' })));
      if (!itemResult.error) setCatalog((itemResult.data || []).map(i => ({ id: i.id, name: i.name || '', description: i.description || '', hsn: i.hsn || '', unit: i.unit || 'Nos', rate: Number(i.selling_price || 0), gst: Number(i.gst_rate || 0) })));
    });
  }, [user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    if (editId) {
      getQuotation(user, editId).then(q => {
        setCustomerId(q.customer_id || ''); setNumber(q.quotation_number); setDate(q.quotation_date); setValidUntil(q.valid_until || '');
        setItems(q.line_items?.length ? q.line_items : [blankItem()]); setExpandedItemId(q.line_items?.[0]?.id || '');
        setStatus(q.status); setNotes(q.notes || ''); setTerms(q.terms || '');
      }).catch(() => { toast.error('Could not load quotation'); navigate('/app/quotations'); });
    } else {
      listQuotations(user).then(rows => setNumber(nextQuotationNumber(rows))).catch(() => setNumber('QT-0001'));
    }
  }, [editId, user?.company_id]);

  const updateItem = (id: string, patch: Partial<QuotationLineItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const chooseCatalogItem = (lineId: string, itemId: string) => {
    const item = catalog.find(entry => entry.id === itemId);
    updateItem(lineId, item ? { itemId: item.id, item: item.name, description: item.description, hsn: item.hsn, unit: item.unit, rate: item.rate, gst: item.gst } : { itemId: '' });
  };
  const addLine = () => {
    const item = blankItem();
    setItems(current => [...current, item]);
    setExpandedItemId(item.id);
  };
  const customerDetails = selectedCustomer ? { name: selectedCustomer.name, gstin: selectedCustomer.gstin, email: selectedCustomer.email, phone: selectedCustomer.phone, address: selectedCustomer.address, city: selectedCustomer.city, state: selectedCustomer.state } : {};

  const submit = async (nextStatus: QuotationRecord['status']) => {
    if (!user?.company_id) return toast.error('Company profile is not ready');
    if (!number.trim()) return toast.error('Enter a quotation number');
    if (!selectedCustomer) return toast.error('Select a customer');
    if (items.some(item => !item.item.trim() || Number(item.qty) <= 0)) return toast.error('Complete every line item');
    setSaving(true);
    try {
      await saveQuotation(user, {
        company_id: user.company_id, quotation_number: number.trim(), quotation_date: date, valid_until: validUntil || null,
        customer_id: customerId, customer_name: selectedCustomer.name, customer_details: customerDetails, line_items: items,
        subtotal: totals.subtotal, total_tax: totals.tax, total_amount: totals.total, status: nextStatus,
        notes: notes.trim() || null, terms: terms.trim() || null,
      }, editId);
      toast.success(editId ? 'Quotation updated' : nextStatus === 'draft' ? 'Draft saved' : 'Quotation created');
      navigate('/app/quotations');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save quotation'); } finally { setSaving(false); }
  };

  return <div className="pb-8 bg-muted/30 min-h-screen quotation-module">
    <div className="bg-card border-b border-border px-4 md:px-8 py-4 md:py-6 sticky kaps-sticky-below-header z-10">
      <div className="flex items-center gap-4">
        <Link to="/app/quotations" className="p-2 hover:bg-muted rounded transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
        <div><h1 className="text-xl md:text-2xl font-semibold text-foreground">{editId ? 'Edit Quotation' : 'New Estimate / Quotation'}</h1><p className="text-xs md:text-sm text-muted-foreground mt-1">Create a customer-ready estimate with pricing, GST and validity</p></div>
      </div>
    </div>

    <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <SectionTitle number="1" title="Customer" />
          <FormField label="Select customer"><select className={field} value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">Type or select a customer…</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></FormField>
          <div className="min-h-[190px] mt-3.5">
            {selectedCustomer ? <div className="rounded-lg border border-violet-200 dark:border-violet-400/25 bg-violet-50/50 dark:bg-violet-500/[0.05] p-4">
              <div className="flex items-start justify-between gap-3"><p className="text-[16px] font-semibold text-foreground">{selectedCustomer.name}</p>{selectedCustomer.gstin && <span className="px-2 py-1 rounded-md bg-violet-100 dark:bg-violet-500/15 text-[11px] font-mono font-semibold text-violet-700 dark:text-violet-200">GSTIN {selectedCustomer.gstin}</span>}</div>
              <div className="mt-3.5 pt-3.5 border-t border-violet-200/70 dark:border-violet-400/15"><p className="detail-label">Address</p><p className="text-[13.5px] text-foreground">{[selectedCustomer.address, selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(', ') || 'No address saved'}</p></div>
              <div className="mt-3.5 pt-3.5 border-t border-violet-200/70 dark:border-violet-400/15 grid sm:grid-cols-2 gap-3"><div><p className="detail-label">Phone</p><p className="text-[13.5px] text-foreground">{selectedCustomer.phone || '—'}</p></div><div><p className="detail-label">Email</p><p className="text-[13.5px] text-foreground truncate">{selectedCustomer.email || '—'}</p></div></div>
            </div> : <div className="h-full min-h-[190px] rounded-lg border border-dashed border-violet-200 dark:border-violet-400/20 flex items-center justify-center text-center p-6"><div><p className="text-sm font-medium text-foreground">No customer selected</p><p className="text-xs text-muted-foreground mt-1">Choose a customer to show billing details.</p></div></div>}
          </div>
        </section>

        <section className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
          <SectionTitle number="2" title="Quotation Details" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Quotation number"><input className={field} value={number} onChange={e => setNumber(e.target.value)} /></FormField>
            <FormField label="Status"><div className={`${field} flex items-center capitalize text-violet-700 dark:text-violet-300 font-medium`}>{status}</div></FormField>
            <FormField label="Quotation date"><input type="date" className={field} value={date} onChange={e => setDate(e.target.value)} /></FormField>
            <FormField label="Valid until"><input type="date" className={field} min={date} value={validUntil} onChange={e => setValidUntil(e.target.value)} /></FormField>
          </div>
          <div className="mt-5 rounded-lg border border-violet-200 dark:border-violet-400/20 bg-violet-50/50 dark:bg-violet-500/[0.05] p-4"><p className="detail-label">Validity</p><p className="text-sm text-foreground mt-1">This quotation remains valid through the selected date. It is clearly marked as an estimate and not a tax invoice.</p></div>
        </section>
      </div>

      <section className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
        <div className="px-5 md:px-6 py-5 border-b border-violet-100 dark:border-violet-400/15"><SectionTitle number="3" title="Items & Services" compact /></div>
        <div className="hidden lg:block overflow-hidden"><table className="quotation-items-table w-full table-fixed"><colgroup><col className="w-[4%]" /><col className="w-[28%]" /><col className="w-[10%]" /><col className="w-[7%]" /><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[13%]" /><col className="w-[4%]" /></colgroup><thead className="bg-violet-100 dark:bg-violet-500/15"><tr><th className="py-3 text-center text-[10px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">#</th><th className="py-3 text-left text-[10px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Item & Description</th><th className="py-3 text-left text-[10px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">HSN/SAC</th><th className="py-3 text-left text-[10px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Qty</th><th className="py-3 text-left text-[10px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Unit</th><th className="py-3 text-left text-[10px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Rate</th><th className="py-3 text-left text-[10px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Disc. %</th><th className="py-3 text-left text-[10px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">GST %</th><th className="py-3 text-right text-[10px] font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Line Total</th><th></th></tr></thead><tbody>{items.map((item, index) => <DesktopItemRow key={item.id} item={item} index={index} itemsCount={items.length} catalog={catalog} updateItem={updateItem} chooseCatalogItem={chooseCatalogItem} remove={() => setItems(current => current.filter(entry => entry.id !== item.id))} />)}</tbody></table></div>
        <div className="lg:hidden divide-y divide-violet-100 dark:divide-violet-400/10">{items.map((item, index) => <MobileItemCard key={item.id} item={item} index={index} expanded={expandedItemId === item.id} itemsCount={items.length} catalog={catalog} toggle={() => setExpandedItemId(expandedItemId === item.id ? '' : item.id)} updateItem={updateItem} chooseCatalogItem={chooseCatalogItem} remove={() => setItems(current => current.filter(entry => entry.id !== item.id))} />)}</div>
        <div className="px-4 md:px-6 py-4 border-t border-violet-100 dark:border-violet-400/15"><button type="button" onClick={addLine} className="w-full inline-flex items-center justify-center gap-1.5 h-11 px-4 text-[13px] font-medium border border-dashed border-violet-300 dark:border-violet-400/30 bg-card text-violet-700 dark:text-violet-300 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"><Plus className="w-4 h-4" /> Add Another Item</button></div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]"><SectionTitle number="4" title="Notes & Terms" /><div className="space-y-4"><FormField label="Notes"><textarea className={`${field} h-24 py-3 resize-none`} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Project scope, exclusions or a personal note" /></FormField><FormField label="Terms & conditions"><textarea className={`${field} h-32 py-3 resize-none`} value={terms} onChange={e => setTerms(e.target.value)} /></FormField></div></section>
        <section className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)]"><SectionTitle number="5" title="Quotation Summary" /><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Taxable value</span><span className="font-medium tabular-nums">{money(totals.subtotal)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">GST</span><span className="font-medium tabular-nums">{money(totals.tax)}</span></div><div className="flex justify-between border-t border-violet-100 dark:border-violet-400/15 pt-4 text-xl font-semibold"><span>Total Estimate</span><span className="text-violet-600 dark:text-violet-300 tabular-nums">{money(totals.total)}</span></div></div><div className="mt-6 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-400/20 p-4 text-xs text-violet-800 dark:text-violet-200"><p className="font-semibold mb-1">Ready for customer review</p><p>Preview the final document before marking it as sent. You can later convert an accepted quotation directly into an invoice.</p></div></section>
      </div>

      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl p-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 shadow-[0_1px_2px_rgba(139,92,246,0.06)]"><button onClick={() => setPreview(true)} className="h-11 px-5 rounded-full border border-violet-300 dark:border-violet-400/30 bg-card text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"><Eye className="w-4 h-4" /> Preview</button><button disabled={saving} onClick={() => submit('draft')} className="h-11 px-5 rounded-full border border-violet-300 dark:border-violet-400/30 bg-card text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 disabled:opacity-50"><Save className="w-4 h-4" /> Save Draft</button><button disabled={saving} onClick={() => submit(status === 'accepted' ? 'accepted' : 'sent')} className="h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] disabled:opacity-50"><Send className="w-4 h-4" /> {saving ? 'Saving…' : editId ? 'Update Quotation' : 'Save & Mark Sent'}</button></div>
    </div>
    <QuotationPreview open={preview} onClose={() => setPreview(false)} number={number || 'DRAFT'} date={date} validUntil={validUntil} customer={customerDetails} items={items} notes={notes} terms={terms} />
  </div>;
}

function SectionTitle({ number, title, compact = false }: { number: string; title: string; compact?: boolean }) {
  return <div className={`flex items-center gap-2 ${compact ? '' : 'mb-5'}`}><div className="h-6 w-6 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">{number}</div><h3 className="text-[16px] font-semibold text-foreground tracking-tight">{title}</h3></div>;
}
function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="block text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{label}</span>{children}</label>;
}

interface ItemEditorProps { item: QuotationLineItem; index: number; itemsCount: number; catalog: CatalogItem[]; updateItem: (id: string, patch: Partial<QuotationLineItem>) => void; chooseCatalogItem: (id: string, itemId: string) => void; remove: () => void }
function CatalogSelect({ item, catalog, chooseCatalogItem }: Pick<ItemEditorProps, 'item' | 'catalog' | 'chooseCatalogItem'>) {
  return <select className={field} value={item.itemId || ''} onChange={e => chooseCatalogItem(item.id, e.target.value)}><option value="">Custom item / service</option>{catalog.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>;
}
function UnitSelect({ item, updateItem }: Pick<ItemEditorProps, 'item' | 'updateItem'>) {
  return <select className={field} value={item.unit} onChange={e => updateItem(item.id, { unit: e.target.value })}>{['Nos','JOB','Hrs','Days','Kgs','Mtr','Pcs'].map(unit => <option key={unit}>{unit}</option>)}</select>;
}
function GstSelect({ item, updateItem }: Pick<ItemEditorProps, 'item' | 'updateItem'>) {
  return <select className={field} value={item.gst} onChange={e => updateItem(item.id, { gst: Number(e.target.value) })}>{[0,5,12,18,28].map(rate => <option key={rate} value={rate}>{rate}%</option>)}</select>;
}
function DesktopItemRow({ item, index, itemsCount, catalog, updateItem, chooseCatalogItem, remove }: ItemEditorProps) {
  const total = item.qty * item.rate * (1 - item.discount / 100) * (1 + item.gst / 100);
  const taxable = item.qty * item.rate * (1 - item.discount / 100);
  const compactField = `${field} h-10 px-3 tabular-nums`;
  return <tr className="group border-t border-violet-100 dark:border-violet-400/10 align-top hover:bg-violet-50/40 dark:hover:bg-violet-500/[0.03] transition-colors">
    <td className="px-3 py-4 text-sm text-muted-foreground text-center"><span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-200 font-semibold">{index + 1}</span></td>
    <td className="px-3 py-4"><div className="space-y-2"><CatalogSelect item={item} catalog={catalog} chooseCatalogItem={chooseCatalogItem} /><input className={`${compactField} font-medium`} value={item.item} onChange={e => updateItem(item.id, { item: e.target.value })} placeholder="Enter item or service name" /><textarea rows={2} className={`${field} min-h-[64px] h-auto py-2.5 resize-none leading-5`} value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })} placeholder="Add a short description (optional)" /></div></td>
    <td className="px-3 py-4"><input className={`${compactField} font-mono`} value={item.hsn} onChange={e => updateItem(item.id, { hsn: e.target.value })} placeholder="Code" /></td>
    <td className="px-3 py-4"><input type="number" min="0.01" step="0.01" className={`${compactField} text-right`} value={item.qty} onFocus={e => e.currentTarget.select()} onChange={e => updateItem(item.id, { qty: Number(e.target.value) })} /></td>
    <td className="px-3 py-4"><UnitSelect item={item} updateItem={updateItem} /></td>
    <td className="px-3 py-4"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span><input type="number" min="0" step="0.01" className={`${compactField} pl-7 text-right`} value={item.rate} onFocus={e => e.currentTarget.select()} onChange={e => updateItem(item.id, { rate: Number(e.target.value) })} /></div></td>
    <td className="px-3 py-4"><div className="relative"><input type="number" min="0" max="100" className={`${compactField} pr-7 text-right`} value={item.discount} onFocus={e => e.currentTarget.select()} onChange={e => updateItem(item.id, { discount: Number(e.target.value) })} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span></div></td>
    <td className="px-3 py-4"><GstSelect item={item} updateItem={updateItem} /></td>
    <td className="px-3 py-4 text-right"><p className="text-base font-semibold text-foreground tabular-nums whitespace-nowrap">{money(total)}</p><p className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap">Taxable {money(taxable)}</p></td>
    <td className="px-2 py-4">{itemsCount > 1 && <button onClick={remove} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg opacity-60 hover:opacity-100 transition-opacity" title="Remove item"><Trash2 className="w-4 h-4" /></button>}</td>
  </tr>;
}
function MobileItemCard({ item, index, expanded, itemsCount, catalog, toggle, updateItem, chooseCatalogItem, remove }: ItemEditorProps & { expanded: boolean; toggle: () => void }) {
  const total = item.qty * item.rate * (1 - item.discount / 100) * (1 + item.gst / 100);
  return <div className="p-4"><div onClick={toggle} className="flex items-center justify-between cursor-pointer"><div><p className="text-sm font-semibold text-muted-foreground">Item #{index + 1}{item.item ? ` · ${item.item}` : ''}</p><p className="text-sm font-semibold text-violet-600 dark:text-violet-300 mt-1">{money(total)}</p></div><div className="flex items-center gap-1">{itemsCount > 1 && <button onClick={e => { e.stopPropagation(); remove(); }} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>}<ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} /></div></div>{expanded && <div className="space-y-4 mt-4 pt-4 border-t border-violet-100 dark:border-violet-400/10"><FormField label="Catalog item"><CatalogSelect item={item} catalog={catalog} chooseCatalogItem={chooseCatalogItem} /></FormField><FormField label="Item name"><input className={field} value={item.item} onChange={e => updateItem(item.id, { item: e.target.value })} /></FormField><FormField label="Description"><textarea rows={2} className={`${field} h-auto py-3`} value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })} /></FormField><FormField label="HSN/SAC"><input className={field} value={item.hsn} onChange={e => updateItem(item.id, { hsn: e.target.value })} /></FormField><div className="grid grid-cols-2 gap-3"><FormField label="Quantity"><input type="number" className={field} value={item.qty} onChange={e => updateItem(item.id, { qty: Number(e.target.value) })} /></FormField><FormField label="Unit"><UnitSelect item={item} updateItem={updateItem} /></FormField><FormField label="Rate"><input type="number" className={field} value={item.rate} onChange={e => updateItem(item.id, { rate: Number(e.target.value) })} /></FormField><FormField label="Discount %"><input type="number" className={field} value={item.discount} onChange={e => updateItem(item.id, { discount: Number(e.target.value) })} /></FormField></div><FormField label="GST %"><GstSelect item={item} updateItem={updateItem} /></FormField></div>}</div>;
}
