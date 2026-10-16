import { useEffect, useRef, useState } from 'react';
import { Download, Mail, MessageCircle, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { generateInvoicePdfBlob, printPdfBlob, sharePdf } from '../../../lib/invoicePdf';
import { quotationAmounts, type QuotationLineItem } from '../../../lib/quotations';

interface CustomerDetails { name?: string; gstin?: string; email?: string; phone?: string; address?: string; city?: string; state?: string }

interface Props {
  open: boolean;
  onClose: () => void;
  number: string;
  date: string;
  validUntil: string;
  customer: CustomerDetails;
  items: QuotationLineItem[];
  notes?: string;
  terms?: string;
}

const money = (value: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const dateText = (value?: string) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function QuotationPreview({ open, onClose, number, date, validUntil, customer, items, notes, terms }: Props) {
  const { user } = useAuth();
  const pageRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState({ name: user?.company_name || 'Your Company', gstin: user?.company_gstin || '', email: user?.email || '', phone: '', address: '', city: '', state: '', pin: '', logo: '' });
  const totals = quotationAmounts(items);

  useEffect(() => {
    if (!open || !user?.company_id) return;
    supabase.from('companies')
      .select('company_name,gstin,email,phone,address,city,state,pin_code,company_logo')
      .eq('id', user.company_id).single()
      .then(({ data }) => data && setCompany({
        name: data.company_name || 'Your Company', gstin: data.gstin || '', email: data.email || '', phone: data.phone || '',
        address: data.address || '', city: data.city || '', state: data.state || '', pin: data.pin_code || '', logo: data.company_logo || '',
      }));
  }, [open, user?.company_id]);

  if (!open) return null;

  const buildPdf = async () => {
    if (!pageRef.current) throw new Error('Preview is not ready');
    return generateInvoicePdfBlob([pageRef.current]);
  };
  const perform = async (fn: (blob: Blob) => Promise<unknown> | unknown) => {
    if (busy) return;
    setBusy(true);
    try { await fn(await buildPdf()); } catch { toast.error('Could not prepare the quotation PDF.'); } finally { setBusy(false); }
  };
  const fileName = `${number || 'quotation'}.pdf`.replace(/[^\w.-]+/g, '-');
  const message = `Quotation ${number} from ${company.name} for Rs. ${money(totals.total)}. Valid until ${dateText(validUntil)}.`;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex flex-col" role="dialog" aria-modal="true" aria-label="Quotation preview">
      <div className="h-16 bg-background border-b flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div><p className="font-semibold">Quotation Preview</p><p className="text-xs text-muted-foreground">{number}</p></div>
        <div className="flex items-center gap-2">
          <button disabled={busy} onClick={() => perform(async blob => { const result = await sharePdf(blob, fileName, message, `Quotation ${number}`); if (result === 'downloaded') toast.success('Quotation downloaded'); })} className="hidden sm:inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"><MessageCircle className="w-4 h-4" /> Share</button>
          <button disabled={busy} onClick={() => perform(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000); })} className="h-9 w-9 inline-flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50" title="Download PDF"><Download className="w-4 h-4" /></button>
          <button disabled={busy} onClick={() => perform(printPdfBlob)} className="h-9 w-9 inline-flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50" title="Print"><Printer className="w-4 h-4" /></button>
          <button onClick={() => { const subject = encodeURIComponent(`Quotation ${number}`); const body = encodeURIComponent(message); window.location.href = `mailto:${customer.email || ''}?subject=${subject}&body=${body}`; }} className="h-9 w-9 inline-flex items-center justify-center rounded-md border hover:bg-muted" title="Email"><Mail className="w-4 h-4" /></button>
          <button onClick={onClose} className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 sm:p-8 bg-slate-200">
        <div ref={pageRef} className="invoice-print-page quotation-document bg-white mx-auto max-w-[210mm] min-h-[270mm] text-slate-800 shadow-xl p-8 sm:p-12">
          <div className="flex justify-between gap-8 border-b-4 border-slate-900 pb-7">
            <div className="flex gap-4">
              {company.logo && <img src={company.logo} alt="Company logo" className="w-16 h-16 object-contain" />}
              <div><h1 className="text-2xl font-bold text-slate-950">{company.name}</h1><p className="text-sm text-slate-500 mt-1 max-w-sm">{[company.address, company.city, company.state, company.pin].filter(Boolean).join(', ')}</p><p className="text-sm text-slate-500">{[company.phone, company.email].filter(Boolean).join(' · ')}</p>{company.gstin && <p className="text-sm font-medium mt-1">GSTIN: {company.gstin}</p>}</div>
            </div>
            <div className="text-right"><p className="text-xs font-bold tracking-[0.25em] text-emerald-700">ESTIMATE</p><h2 className="text-4xl font-light tracking-tight text-slate-950">QUOTATION</h2><p className="text-sm font-semibold mt-2">#{number}</p></div>
          </div>

          <div className="grid grid-cols-2 gap-8 py-8">
            <div><p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mb-2">Prepared for</p><p className="text-lg font-bold text-slate-950">{customer.name || 'Customer'}</p><p className="text-sm text-slate-600">{[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}</p>{customer.gstin && <p className="text-sm text-slate-600">GSTIN: {customer.gstin}</p>}<p className="text-sm text-slate-600">{[customer.phone, customer.email].filter(Boolean).join(' · ')}</p></div>
            <div className="grid grid-cols-2 gap-4 text-right"><div><p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">Quotation date</p><p className="font-semibold mt-1">{dateText(date)}</p></div><div><p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">Valid until</p><p className="font-semibold mt-1 text-emerald-700">{dateText(validUntil)}</p></div></div>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-slate-900 text-white"><th className="text-left p-3 w-10">#</th><th className="text-left p-3">Item & description</th><th className="text-right p-3">Qty</th><th className="text-right p-3">Rate</th><th className="text-right p-3">GST</th><th className="text-right p-3">Amount</th></tr></thead>
            <tbody>{items.map((item, index) => {
              const base = item.qty * item.rate; const taxable = base - base * item.discount / 100; const total = taxable * (1 + item.gst / 100);
              return <tr key={item.id} className="border-b border-slate-200 align-top"><td className="p-3 text-slate-400">{index + 1}</td><td className="p-3"><p className="font-semibold text-slate-900">{item.item}</p>{item.description && <p className="text-xs text-slate-500 mt-1">{item.description}</p>}{item.hsn && <p className="text-[11px] text-slate-400 mt-1">HSN/SAC {item.hsn}</p>}</td><td className="p-3 text-right">{item.qty} {item.unit}</td><td className="p-3 text-right">₹{money(item.rate)}</td><td className="p-3 text-right">{item.gst}%</td><td className="p-3 text-right font-semibold">₹{money(total)}</td></tr>;
            })}</tbody>
          </table>

          <div className="grid grid-cols-2 gap-10 mt-8">
            <div>{notes && <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Notes</p><p className="text-sm whitespace-pre-wrap">{notes}</p></div>}{terms && <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Terms & conditions</p><p className="text-xs text-slate-600 whitespace-pre-wrap">{terms}</p></div>}</div>
            <div className="space-y-2"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>₹{money(totals.subtotal)}</span></div><div className="flex justify-between"><span className="text-slate-500">GST</span><span>₹{money(totals.tax)}</span></div><div className="flex justify-between border-t-2 border-slate-900 pt-3 mt-3 text-xl font-bold"><span>Total</span><span>₹{money(totals.total)}</span></div><p className="text-[11px] text-slate-400 text-right">Prices are subject to the terms stated in this quotation.</p></div>
          </div>
          <div className="mt-16 pt-5 border-t text-center text-xs text-slate-400">Thank you for the opportunity to serve you. This quotation is not a tax invoice.</div>
        </div>
      </div>
    </div>
  );
}
