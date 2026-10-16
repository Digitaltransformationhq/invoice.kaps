import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, Eye, FileText, MoreHorizontal, Pencil, Plus, ReceiptText, Search, Trash2, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { deleteQuotation, listQuotations, updateQuotationStatus, type QuotationRecord } from '../../../lib/quotations';
import { QuotationPreview } from './QuotationPreview';

const money = (value: number) => `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(Number(value || 0))}`;
const dateText = (value?: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const statusClasses: Record<string, string> = { draft: 'bg-slate-100 text-slate-700', sent: 'bg-blue-50 text-blue-700', accepted: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', expired: 'bg-amber-50 text-amber-700' };

export function QuotationList() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<QuotationRecord | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try { setRows(await listQuotations(user)); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load quotations'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [user?.company_id]);

  const filtered = useMemo(() => rows.filter(row => `${row.quotation_number} ${row.customer_name} ${row.status}`.toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const counts = useMemo(() => ({ total: rows.length, open: rows.filter(r => ['draft', 'sent'].includes(r.status)).length, accepted: rows.filter(r => r.status === 'accepted').length, value: rows.filter(r => r.status !== 'rejected').reduce((sum, r) => sum + Number(r.total_amount || 0), 0) }), [rows]);

  const setStatus = async (row: QuotationRecord, status: QuotationRecord['status']) => {
    try { const next = await updateQuotationStatus(user, row.id, status); setRows(current => current.map(item => item.id === row.id ? next : item)); toast.success(`Quotation marked ${status}`); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update status'); }
    setMenu(null);
  };
  const remove = async (row: QuotationRecord) => {
    if (!window.confirm(`Delete quotation ${row.quotation_number}?`)) return;
    try { await deleteQuotation(user, row.id); setRows(current => current.filter(item => item.id !== row.id)); toast.success('Quotation deleted'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete quotation'); }
  };

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
      <div><h1 className="text-2xl font-semibold tracking-tight">Estimates & Quotations</h1><p className="text-sm text-muted-foreground mt-1">Create polished proposals, track decisions, and turn interest into business.</p></div>
      {hasPermission('quotations', 'create') && <button onClick={() => navigate('/app/quotations/new')} className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all"><Plus className="w-4 h-4" /> New quotation</button>}
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Stat icon={FileText} label="All quotations" value={String(counts.total)} />
      <Stat icon={Clock3} label="Open" value={String(counts.open)} tone="blue" />
      <Stat icon={CheckCircle2} label="Accepted" value={String(counts.accepted)} tone="green" />
      <Stat icon={CalendarClock} label="Pipeline value" value={money(counts.value)} tone="amber" />
    </div>

    <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl overflow-visible shadow-[0_1px_2px_rgba(139,92,246,0.06)]">
      <div className="p-4 border-b border-violet-100 dark:border-violet-400/10"><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search quotation, customer or status" className="w-full h-10 rounded border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></div></div>
      {loading ? <div className="py-20 text-center text-sm text-muted-foreground">Loading quotations…</div> : filtered.length === 0 ? <div className="py-20 text-center"><div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3"><FileText className="w-6 h-6 text-muted-foreground" /></div><p className="font-medium">{query ? 'No matching quotations' : 'No quotations yet'}</p><p className="text-sm text-muted-foreground mt-1">{query ? 'Try a different search.' : 'Create your first professional estimate or quotation.'}</p></div> : <>
        <div className="hidden md:block overflow-x-auto rounded-b-xl"><table className="w-full text-sm"><thead className="bg-violet-100 dark:bg-violet-500/15"><tr><th className="text-left px-6 py-3 text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Quotation</th><th className="text-left px-6 py-3 text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Customer</th><th className="text-left px-6 py-3 text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Date</th><th className="text-left px-6 py-3 text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Valid until</th><th className="text-right px-6 py-3 text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Amount</th><th className="text-center px-6 py-3 text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Status</th><th className="w-12 px-3 py-3 text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Actions</th></tr></thead><tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">{filtered.map(row => <tr key={row.id} className="bg-violet-50/60 dark:bg-violet-500/[0.04] hover:bg-violet-100/70 dark:hover:bg-violet-500/[0.10] transition-colors"><td className="px-6 py-4 font-medium text-foreground cursor-pointer" onClick={() => setPreview(row)}>{row.quotation_number}</td><td className="px-6 py-4"><p className="text-foreground">{row.customer_name || 'Walk-in customer'}</p><p className="text-xs text-muted-foreground">{row.customer_details?.gstin || row.customer_details?.email || ''}</p></td><td className="px-6 py-4 text-muted-foreground">{dateText(row.quotation_date)}</td><td className="px-6 py-4 text-muted-foreground">{dateText(row.valid_until)}</td><td className="px-6 py-4 text-right font-medium text-foreground tabular-nums">{money(row.total_amount)}</td><td className="px-6 py-4 text-center"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusClasses[row.status]}`}>{row.status}</span></td><td className="px-3 py-4 relative"><button onClick={() => setMenu(menu === row.id ? null : row.id)} className="p-2 rounded hover:bg-muted"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>{menu === row.id && <RowMenu row={row} onPreview={() => { setPreview(row); setMenu(null); }} onEdit={() => navigate(`/app/quotations/new?id=${row.id}`)} onConvert={() => navigate(`/app/invoices/new?quotation=${row.id}`)} onStatus={status => setStatus(row, status)} onDelete={() => remove(row)} />}</td></tr>)}</tbody></table></div>
        <div className="md:hidden divide-y">{filtered.map(row => <div key={row.id} className="p-4"><div className="flex justify-between gap-3"><div onClick={() => setPreview(row)}><p className="font-semibold text-primary">{row.quotation_number}</p><p className="font-medium mt-1">{row.customer_name || 'Walk-in customer'}</p><p className="text-xs text-muted-foreground mt-1">{dateText(row.quotation_date)} · valid {dateText(row.valid_until)}</p></div><div className="text-right"><p className="font-semibold">{money(row.total_amount)}</p><span className={`inline-flex mt-2 px-2 py-1 rounded-full text-xs capitalize ${statusClasses[row.status]}`}>{row.status}</span></div></div><div className="flex gap-2 mt-4"><button onClick={() => setPreview(row)} className="flex-1 h-9 rounded border text-sm inline-flex items-center justify-center gap-2"><Eye className="w-4 h-4" /> Preview</button><button onClick={() => navigate(`/app/quotations/new?id=${row.id}`)} className="h-9 px-3 rounded border"><Pencil className="w-4 h-4" /></button><button onClick={() => remove(row)} className="h-9 px-3 rounded border text-destructive"><Trash2 className="w-4 h-4" /></button></div></div>)}</div>
      </>}
    </div>
    {preview && <QuotationPreview open onClose={() => setPreview(null)} number={preview.quotation_number} date={preview.quotation_date} validUntil={preview.valid_until || ''} customer={{ name: preview.customer_name, ...preview.customer_details }} items={preview.line_items || []} notes={preview.notes || ''} terms={preview.terms || ''} />}
  </div>;
}

function Stat({ icon: Icon, label, value, tone = 'slate' }: { icon: typeof FileText; label: string; value: string; tone?: string }) {
  const colors: Record<string, string> = { slate: 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300', blue: 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300', green: 'bg-success/10 text-success', amber: 'bg-warning/10 text-warning' };
  return <div className="bg-card border border-violet-300 dark:border-violet-400/30 rounded-xl p-5 flex items-center gap-3 shadow-[0_1px_2px_rgba(139,92,246,0.08)]"><div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[tone]}`}><Icon className="w-5 h-5" /></div><div className="min-w-0"><p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p><p className="text-[22px] font-semibold tracking-tight truncate tabular-nums">{value}</p></div></div>;
}

function RowMenu({ row, onPreview, onEdit, onConvert, onStatus, onDelete }: { row: QuotationRecord; onPreview: () => void; onEdit: () => void; onConvert: () => void; onStatus: (status: QuotationRecord['status']) => void; onDelete: () => void }) {
  return <div className="absolute right-4 top-12 z-20 w-52 bg-popover border rounded-lg shadow-lg p-1"><button onClick={onPreview} className="w-full px-3 py-2 rounded text-left text-sm hover:bg-muted flex gap-2"><Eye className="w-4 h-4" /> Preview / share</button><button onClick={onEdit} className="w-full px-3 py-2 rounded text-left text-sm hover:bg-muted flex gap-2"><Pencil className="w-4 h-4" /> Edit quotation</button><button onClick={onConvert} className="w-full px-3 py-2 rounded text-left text-sm hover:bg-muted flex gap-2 text-primary"><ReceiptText className="w-4 h-4" /> Convert to invoice</button>{row.status !== 'accepted' && <button onClick={() => onStatus('accepted')} className="w-full px-3 py-2 rounded text-left text-sm hover:bg-muted flex gap-2 text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Mark accepted</button>}{row.status !== 'rejected' && <button onClick={() => onStatus('rejected')} className="w-full px-3 py-2 rounded text-left text-sm hover:bg-muted flex gap-2"><XCircle className="w-4 h-4" /> Mark rejected</button>}<button onClick={onDelete} className="w-full px-3 py-2 rounded text-left text-sm hover:bg-muted flex gap-2 text-destructive"><Trash2 className="w-4 h-4" /> Delete</button></div>;
}
