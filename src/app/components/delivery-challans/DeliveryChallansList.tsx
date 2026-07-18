import { Link } from 'react-router';
import { Plus, Search, Filter, Eye, Trash2, X, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { DeliveryChallanPreview } from './DeliveryChallanPreview';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { deleteForUser, logAuditorAction, selectForUser } from '../../../lib/auditorData';
import { AppSelect } from '../common/AppSelect';
import { CHALLAN_PURPOSES, challanPurposeMeta, todayIso } from '../../../lib/deliveryChallans';

interface ChallanLineItem {
  id: string;
  item: string;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number;
  gst: number;
  amount: number;
  isProvisional?: boolean;
}

interface ChallanRow {
  dbId: string;
  challanNumber: string;
  purpose: string;
  purposeLabel: string;
  consigneeName: string;
  consigneeGstin: string;
  consigneeAddress: string;
  consigneeState: string;
  customerName: string;
  invoiceNumber: string;
  date: string;
  rawDate: string;
  placeOfSupply: string;
  isFinalConsignment: boolean;
  expectedReturnDate: string;
  reason: string;
  notes: string;
  transportMode: string;
  vehicleNumber: string;
  transporterName: string;
  lrNumber: string;
  ewayBillNumber: string;
  totalQty: number;
  totalAmount: number;
  status: 'draft' | 'issued' | 'cancelled';
  lineItems: ChallanLineItem[];
}

const formatChallanDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const isReturnOverdue = (row: ChallanRow) => {
  if (row.status === 'cancelled') return false;
  if (row.purpose !== 'job_work' && row.purpose !== 'approval') return false;
  if (!row.expectedReturnDate) return false;
  return row.expectedReturnDate < todayIso();
};

export function DeliveryChallansList() {
  const { user } = useAuth();
  const [challans, setChallans] = useState<ChallanRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [purposeFilter, setPurposeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewingChallan, setViewingChallan] = useState<ChallanRow | null>(null);
  const [deletingChallan, setDeletingChallan] = useState<ChallanRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadChallans = async () => {
    if (!user?.company_id) {
      setChallans([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Module = the hyphenated permission id; resource = the table branch.
    const { data, error } = await selectForUser<any[]>(user, 'delivery-challans', 'delivery_challans', () =>
      Promise.resolve(
        supabase
          .from('delivery_challans')
          .select(`
            id,
            challan_number,
            challan_date,
            purpose,
            consignee_name,
            consignee_gstin,
            consignee_address,
            consignee_state,
            place_of_supply,
            is_final_consignment,
            expected_return_date,
            reason,
            notes,
            transport_mode,
            vehicle_number,
            transporter_name,
            lr_number,
            eway_bill_number,
            total_amount,
            status,
            customers(id, name),
            invoices(id, invoice_number),
            delivery_challan_items(id, item_name, description, hsn, quantity, is_provisional_quantity, unit, rate, discount_percent, gst_rate, total_amount, sort_order)
          `)
          .eq('company_id', user.company_id)
          .order('challan_date', { ascending: false })
          .order('created_at', { ascending: false })
      )
    );

    if (error) {
      toast.error(`Could not load challans: ${error.message}`);
      setChallans([]);
    } else {
      const mapped: ChallanRow[] = (data || []).map((c: any) => {
        const customer = Array.isArray(c.customers) ? c.customers[0] : c.customers;
        const invoice = Array.isArray(c.invoices) ? c.invoices[0] : c.invoices;
        const rawItems = [...(c.delivery_challan_items || [])].sort(
          (a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0),
        );
        const items: ChallanLineItem[] = rawItems.map((it: any) => ({
          id: it.id,
          item: it.item_name || '',
          description: it.description || '',
          hsn: it.hsn || '',
          qty: Number(it.quantity || 0),
          unit: it.unit || 'Nos',
          rate: Number(it.rate || 0),
          discount: Number(it.discount_percent || 0),
          gst: Number(it.gst_rate || 0),
          amount: Number(it.total_amount || 0),
          isProvisional: Boolean(it.is_provisional_quantity),
        }));
        const totalQty = items.reduce((sum, it) => sum + it.qty, 0);
        return {
          dbId: c.id,
          challanNumber: c.challan_number || '',
          purpose: c.purpose || '',
          purposeLabel: challanPurposeMeta(c.purpose).label,
          consigneeName: c.consignee_name || '—',
          consigneeGstin: c.consignee_gstin || '',
          consigneeAddress: c.consignee_address || '',
          consigneeState: c.consignee_state || '',
          customerName: customer?.name || '',
          invoiceNumber: invoice?.invoice_number || '',
          date: formatChallanDate(c.challan_date),
          rawDate: c.challan_date || '',
          placeOfSupply: c.place_of_supply || '',
          isFinalConsignment: Boolean(c.is_final_consignment),
          expectedReturnDate: c.expected_return_date || '',
          reason: c.reason || '',
          notes: c.notes || '',
          transportMode: c.transport_mode || '',
          vehicleNumber: c.vehicle_number || '',
          transporterName: c.transporter_name || '',
          lrNumber: c.lr_number || '',
          ewayBillNumber: c.eway_bill_number || '',
          totalQty,
          totalAmount: Number(c.total_amount || 0),
          status: (c.status as 'draft' | 'issued' | 'cancelled') || 'draft',
          lineItems: items,
        };
      });
      setChallans(mapped);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadChallans();
  }, [user?.company_id]);

  const filteredChallans = challans.filter((challan) => {
    const matchesSearch =
      challan.challanNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      challan.consigneeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      challan.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPurpose = purposeFilter === 'all' || challan.purpose === purposeFilter;
    const matchesStatus = statusFilter === 'all' || challan.status === statusFilter;
    return matchesSearch && matchesPurpose && matchesStatus;
  });

  const hasActiveFilters = searchQuery !== '' || purposeFilter !== 'all' || statusFilter !== 'all';

  const stats = {
    all: challans.length,
    issued: challans.filter((c) => c.status === 'issued').length,
    draft: challans.filter((c) => c.status === 'draft').length,
    returnsDue: challans.filter(isReturnOverdue).length,
  };

  const confirmDelete = async () => {
    if (isDeleting || !deletingChallan?.dbId) return;
    setIsDeleting(true);

    const { error } = await deleteForUser(
      user,
      'delivery-challans',
      'delivery_challans',
      () =>
        Promise.resolve(
          supabase
            .from('delivery_challans')
            .delete()
            .eq('id', deletingChallan.dbId)
        ),
      { id: deletingChallan.dbId },
      deletingChallan.challanNumber,
    );

    setIsDeleting(false);

    if (error) {
      toast.error(`Could not delete challan: ${error.message}`);
      return;
    }

    await logAuditorAction(user, 'delivery-challans', 'delivery_challans', 'delete_delivery_challan', {
      challanNumber: deletingChallan.challanNumber,
    });

    setChallans((prev) => prev.filter((c) => c.dbId !== deletingChallan.dbId));
    setDeletingChallan(null);
    toast.success(`Delivery Challan ${deletingChallan.challanNumber} deleted.`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Delivery Challans</h1>
          <p className="text-sm text-muted-foreground mt-1">Move goods under Rule 55 — job work, consignments, approvals and transfers</p>
        </div>
        <Link
          to="/app/delivery-challans/new"
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all"
        >
          <Plus className="w-4 h-4" />
          New Challan
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="All Challans" value={stats.all} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <StatCard label="Issued" value={stats.issued} color="success" active={statusFilter === 'issued'} onClick={() => setStatusFilter('issued')} />
        <StatCard label="Drafts" value={stats.draft} active={statusFilter === 'draft'} onClick={() => setStatusFilter('draft')} />
        <div className="bg-card border border-violet-300 dark:border-violet-400/30 rounded-xl p-5 shadow-[0_1px_2px_rgba(139,92,246,0.08)]">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Returns Due</div>
          <div className={`text-[28px] sm:text-[32px] font-semibold tracking-tight tabular-nums ${stats.returnsDue > 0 ? 'text-warning' : 'text-foreground'}`}>
            {stats.returnsDue}
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-violet-100 dark:border-violet-400/10 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by challan number, consignee, or invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
              <Filter className="w-4 h-4 shrink-0" />
              <AppSelect
                value={purposeFilter}
                onChange={setPurposeFilter}
                options={[
                  { value: 'all', label: 'All Purposes' },
                  ...CHALLAN_PURPOSES.map((p) => ({ value: p.value, label: p.label })),
                ]}
                className="min-w-[140px] bg-transparent text-sm text-foreground"
              />
            </label>
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
              <Filter className="w-4 h-4 shrink-0" />
              <AppSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'issued', label: 'Issued' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
                className="min-w-[130px] bg-transparent text-sm text-foreground"
              />
            </label>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setPurposeFilter('all');
                  setStatusFilter('all');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 border border-violet-200 dark:border-violet-400/25 bg-card text-foreground rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
              >
                <span className="text-sm">Clear Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-violet-100 dark:bg-violet-500/15">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Challan No.</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Consignee</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Purpose</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Against Invoice</th>
                <th className="px-6 py-3 text-right text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Qty</th>
                <th className="px-6 py-3 text-right text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Value</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Loading challans...
                  </td>
                </tr>
              )}
              {!isLoading && filteredChallans.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No delivery challans found.
                  </td>
                </tr>
              )}
              {!isLoading && filteredChallans.map((challan) => (
                <tr
                  key={challan.dbId}
                  onClick={() => setViewingChallan(challan)}
                  className="bg-violet-50/60 dark:bg-violet-500/[0.04] hover:bg-violet-100/70 dark:hover:bg-violet-500/[0.10] transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-foreground font-mono">{challan.challanNumber}</div>
                    {isReturnOverdue(challan) && (
                      <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-warning/10 text-warning border border-warning/30">
                        <AlertTriangle className="w-3 h-3" />
                        Return due
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{challan.date}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{challan.consigneeName}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-200 border-violet-200 dark:border-violet-400/30">
                      {challan.purposeLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{challan.invoiceNumber || '—'}</td>
                  <td className="px-6 py-4 text-right text-sm text-foreground tabular-nums">{challan.totalQty.toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-medium tabular-nums text-foreground">
                      ₹{challan.totalAmount.toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={challan.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-start gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setViewingChallan(challan)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setDeletingChallan(challan)}
                        className="p-1.5 hover:bg-destructive/10 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-violet-100 dark:border-violet-400/15 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {filteredChallans.length} of {challans.length} challans
          </div>
        </div>
      </div>

      {/* View Challan Preview Modal */}
      {viewingChallan && (
        <DeliveryChallanPreview
          isOpen={true}
          onClose={() => setViewingChallan(null)}
          purpose={viewingChallan.purpose}
          challanNumber={viewingChallan.challanNumber}
          challanDate={viewingChallan.rawDate || viewingChallan.date}
          lineItems={viewingChallan.lineItems}
          consignee={{
            name: viewingChallan.consigneeName,
            gstin: viewingChallan.consigneeGstin,
            address: viewingChallan.consigneeAddress,
            state: viewingChallan.consigneeState,
          }}
          invoiceNumber={viewingChallan.invoiceNumber}
          placeOfSupply={viewingChallan.placeOfSupply}
          isFinalConsignment={viewingChallan.isFinalConsignment}
          expectedReturnDate={viewingChallan.expectedReturnDate}
          reason={viewingChallan.reason}
          notes={viewingChallan.notes}
          transport={{
            mode: viewingChallan.transportMode,
            vehicleNumber: viewingChallan.vehicleNumber,
            transporterName: viewingChallan.transporterName,
            lrNumber: viewingChallan.lrNumber,
            ewayBillNumber: viewingChallan.ewayBillNumber,
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingChallan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Delete Delivery Challan</h2>
              <button onClick={() => setDeletingChallan(null)} className="p-2 hover:bg-muted rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-6 h-6 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-foreground mb-2">
                    Are you sure you want to delete <span className="font-semibold">{deletingChallan.challanNumber}</span>?
                  </p>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Consignee: {deletingChallan.consigneeName}</p>
                    <p>Value: ₹{deletingChallan.totalAmount.toLocaleString('en-IN')}</p>
                    <p className="text-destructive font-medium mt-2">
                      This action cannot be undone. All items on this challan will be permanently removed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
              <button
                onClick={() => setDeletingChallan(null)}
                disabled={isDeleting}
                className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {isDeleting ? 'Deleting...' : 'Delete Challan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color?: 'success' | 'warning';
  active?: boolean;
  onClick?: () => void;
}) {
  const colorClasses = {
    success: 'text-success',
    warning: 'text-warning',
  };

  return (
    <button
      onClick={onClick}
      className={`bg-card border rounded-xl p-5 text-left transition-all shadow-[0_1px_2px_rgba(139,92,246,0.08)] hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.25)] ${
        active
          ? 'border-violet-500 dark:border-violet-400 ring-2 ring-violet-300/40 dark:ring-violet-400/25'
          : 'border-violet-300 dark:border-violet-400/30 hover:border-violet-400 dark:hover:border-violet-400/50'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{label}</div>
      <div className={`text-[28px] sm:text-[32px] font-semibold tracking-tight tabular-nums ${color ? colorClasses[color] : 'text-foreground'}`}>
        {value}
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    issued: 'bg-success/10 text-success border-success/30',
    draft: 'bg-muted text-muted-foreground border-border',
    cancelled: 'bg-muted text-muted-foreground border-border',
  };
  const badgeStyle = styles[status] || styles.draft;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${badgeStyle}`}>
      {status}
    </span>
  );
}
