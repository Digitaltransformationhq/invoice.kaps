import { Link } from 'react-router';
import { Plus, Search, Filter, Download, Eye, Edit, MoreVertical, Receipt as ReceiptIcon, Send, Trash2, CheckCircle, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { ReceiptPreview } from './ReceiptPreview';

const initialReceipts = [
  { id: 'RCP-2026-001', customer: 'TechCorp Solutions', invoice: 'INV-2026-156', date: '12 May 2026', amount: 125000, paymentMode: 'Bank Transfer', refNumber: 'UTR123456789', status: 'cleared' },
  { id: 'RCP-2026-002', customer: 'Retail Innovations', invoice: 'INV-2026-155', date: '11 May 2026', amount: 45000, paymentMode: 'Cheque', refNumber: 'CHQ789456', status: 'pending' },
  { id: 'RCP-2026-003', customer: 'Manufacturing Ltd', invoice: 'INV-2026-154', date: '10 May 2026', amount: 234000, paymentMode: 'UPI', refNumber: '123456789012', status: 'cleared' },
  { id: 'RCP-2026-004', customer: 'Services Group', invoice: 'INV-2026-153', date: '09 May 2026', amount: 67800, paymentMode: 'Cash', refNumber: '-', status: 'cleared' },
  { id: 'RCP-2026-005', customer: 'Digital Agency', invoice: 'INV-2026-152', date: '08 May 2026', amount: 156000, paymentMode: 'Bank Transfer', refNumber: 'UTR987654321', status: 'cleared' },
  { id: 'RCP-2026-006', customer: 'TechCorp Solutions', invoice: 'INV-2026-145', date: '07 May 2026', amount: 98500, paymentMode: 'Card', refNumber: 'CARD4521', status: 'cleared' },
];

export function ReceiptsList() {
  const [receipts, setReceipts] = useState(initialReceipts);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'cleared' | 'pending'>('all');
  const [viewingReceipt, setViewingReceipt] = useState<any>(null);
  const [sendingReceipt, setSendingReceipt] = useState<any>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<any>(null);
  const [markingReceipt, setMarkingReceipt] = useState<any>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState<string | null>(null);

  const filteredReceipts = receipts.filter(receipt => {
    const matchesSearch = receipt.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         receipt.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         receipt.invoice.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         receipt.refNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || receipt.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    all: receipts.length,
    cleared: receipts.filter(r => r.status === 'cleared').length,
    pending: receipts.filter(r => r.status === 'pending').length,
    totalAmount: receipts.filter(r => r.status === 'cleared').reduce((sum, r) => sum + r.amount, 0),
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Receipts</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage payment receipts</p>
        </div>
        <Link
          to="/app/receipts/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Receipt
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="All Receipts"
          value={stats.all}
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        <StatCard
          label="Cleared"
          value={stats.cleared}
          color="success"
          active={statusFilter === 'cleared'}
          onClick={() => setStatusFilter('cleared')}
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          color="warning"
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter('pending')}
        />
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="text-xs text-muted-foreground mb-1">Total Received</div>
          <div className="text-4xl font-bold text-success">
            ₹{(stats.totalAmount / 100000).toFixed(1)}L
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white border border-border rounded-lg">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by receipt number, customer, invoice, or ref number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
              <Filter className="w-4 h-4" />
              <span className="text-sm">Filter</span>
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
              <Download className="w-4 h-4" />
              <span className="text-sm">Export</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Receipt No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Payment Mode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Ref Number</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredReceipts.map((receipt) => (
                <tr key={receipt.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-success/10 rounded flex items-center justify-center flex-shrink-0">
                        <ReceiptIcon className="w-5 h-5 text-success" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{receipt.id}</div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-sm text-foreground">{receipt.customer}</td>
                  <td className="px-6 py-3 text-sm font-mono text-muted-foreground">{receipt.invoice}</td>
                  <td className="px-6 py-3 text-sm text-muted-foreground">{receipt.date}</td>
                  <td className="px-6 py-3">
                    <PaymentModeBadge mode={receipt.paymentMode} />
                  </td>
                  <td className="px-6 py-3 text-sm font-mono text-muted-foreground">{receipt.refNumber}</td>
                  <td className="px-6 py-3 text-sm font-medium text-success text-right">
                    ₹{receipt.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={receipt.status} />
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setViewingReceipt(receipt)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <Link
                        to="/app/receipts/new"
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </Link>
                      <div className="relative">
                        <button
                          onClick={() => setMoreMenuOpen(moreMenuOpen === receipt.id ? null : receipt.id)}
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="More"
                        >
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {moreMenuOpen === receipt.id && (
                          <MoreMenu
                            receipt={receipt}
                            onClose={() => setMoreMenuOpen(null)}
                            onDownload={() => {
                              alert('Download functionality would generate PDF');
                              setMoreMenuOpen(null);
                            }}
                            onSend={() => {
                              setSendingReceipt(receipt);
                              setMoreMenuOpen(null);
                            }}
                            onMarkCleared={() => {
                              setMarkingReceipt(receipt);
                              setMoreMenuOpen(null);
                            }}
                            onDelete={() => {
                              setDeletingReceipt(receipt);
                              setMoreMenuOpen(null);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {filteredReceipts.length} of {receipts.length} receipts
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors">
              Previous
            </button>
            <button className="px-3 py-1.5 bg-primary text-white rounded text-sm">1</button>
            <button className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* View Receipt Preview Modal */}
      {viewingReceipt && (
        <ReceiptPreview
          isOpen={true}
          onClose={() => setViewingReceipt(null)}
          receiptNumber={viewingReceipt.id}
          receiptDate={viewingReceipt.date}
          customer={viewingReceipt.customer}
          invoice={viewingReceipt.invoice}
          amount={viewingReceipt.amount}
          paymentMode={viewingReceipt.paymentMode}
          refNumber={viewingReceipt.refNumber}
        />
      )}

      {/* Send Receipt Modal */}
      {sendingReceipt && (
        <SendReceiptModal
          receipt={sendingReceipt}
          onClose={() => setSendingReceipt(null)}
          onSend={(email, message) => {
            alert(`Receipt ${sendingReceipt.id} sent to ${email}`);
            setSendingReceipt(null);
          }}
        />
      )}

      {/* Mark as Cleared Modal */}
      {markingReceipt && markingReceipt.status === 'pending' && (
        <MarkClearedModal
          receipt={markingReceipt}
          onClose={() => setMarkingReceipt(null)}
          onConfirm={() => {
            setReceipts(receipts.map(r => r.id === markingReceipt.id ? { ...r, status: 'cleared' } : r));
            setMarkingReceipt(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingReceipt && (
        <DeleteConfirmationModal
          receipt={deletingReceipt}
          onClose={() => setDeletingReceipt(null)}
          onConfirm={() => {
            setReceipts(receipts.filter(r => r.id !== deletingReceipt.id));
            setDeletingReceipt(null);
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  active,
  onClick
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
      className={`bg-white border-2 rounded-lg p-6 text-left transition-all hover:shadow-md ${
        active ? 'border-accent' : 'border-border'
      }`}
    >
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-4xl font-bold ${color ? colorClasses[color] : 'text-foreground'}`}>
        {value}
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    cleared: 'bg-success/10 text-success',
    pending: 'bg-warning/10 text-warning',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${styles[status as keyof typeof styles]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function PaymentModeBadge({ mode }: { mode: string }) {
  const styles: Record<string, string> = {
    'Bank Transfer': 'bg-primary/10 text-primary',
    'Cheque': 'bg-warning/10 text-warning',
    'UPI': 'bg-success/10 text-success',
    'Cash': 'bg-muted text-muted-foreground',
    'Card': 'bg-accent/10 text-accent',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${styles[mode] || 'bg-muted text-muted-foreground'}`}>
      {mode}
    </span>
  );
}

function MoreMenu({
  receipt,
  onClose,
  onDownload,
  onSend,
  onMarkCleared,
  onDelete
}: {
  receipt: any;
  onClose: () => void;
  onDownload: () => void;
  onSend: () => void;
  onMarkCleared: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-8 w-48 bg-white border border-border rounded-lg shadow-lg py-1 z-10"
    >
      <button
        onClick={onDownload}
        className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        Download PDF
      </button>
      <button
        onClick={onSend}
        className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
      >
        <Send className="w-4 h-4" />
        Send via Email
      </button>
      {receipt.status === 'pending' && (
        <button
          onClick={onMarkCleared}
          className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Mark as Cleared
        </button>
      )}
      <div className="border-t border-border my-1"></div>
      <button
        onClick={onDelete}
        className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2 text-destructive"
      >
        <Trash2 className="w-4 h-4" />
        Delete Receipt
      </button>
    </div>
  );
}

function SendReceiptModal({
  receipt,
  onClose,
  onSend
}: {
  receipt: any;
  onClose: () => void;
  onSend: (email: string, message: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(`Please find attached Receipt ${receipt.id} for payment of Invoice ${receipt.invoice}.`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(email, message);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Send Receipt</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Receipt Number
            </label>
            <input
              type="text"
              value={receipt.id}
              disabled
              className="w-full px-3 py-2 border border-input bg-muted rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Customer
            </label>
            <input
              type="text"
              value={receipt.customer}
              disabled
              className="w-full px-3 py-2 border border-input bg-muted rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Email Address <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter customer email"
              className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Message
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              <Send className="w-4 h-4" />
              Send Receipt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MarkClearedModal({
  receipt,
  onClose,
  onConfirm
}: {
  receipt: any;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Mark as Cleared</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-success" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground mb-2">
                Mark receipt <span className="font-semibold">{receipt.id}</span> as cleared?
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Customer: {receipt.customer}</p>
                <p>Payment Mode: {receipt.paymentMode}</p>
                <p>Amount: ₹{receipt.amount.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-success text-white rounded hover:bg-success/90 transition-colors"
          >
            Mark as Cleared
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmationModal({
  receipt,
  onClose,
  onConfirm
}: {
  receipt: any;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Delete Receipt</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground mb-2">
                Are you sure you want to delete <span className="font-semibold">{receipt.id}</span>?
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Customer: {receipt.customer}</p>
                <p>Invoice: {receipt.invoice}</p>
                <p>Amount: ₹{receipt.amount.toLocaleString()}</p>
                <p className="text-destructive font-medium mt-2">
                  This action cannot be undone. All data associated with this receipt will be permanently removed.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors"
          >
            Delete Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
